'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
    search, hitHref, hitLabel, normalizeEntityType,
    type SearchHit,
} from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
    Search, Sparkles, Loader2,
    LayoutDashboard, Database, Radar, Shield, Users, Network, ServerCog, BookOpen,
    Workflow, CalendarClock, UsersRound, ScrollText, Bell, RefreshCcw, Sliders,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Per-entity display attributes, keyed by the **canonical** (underscore)
 * entityType — apply `normalizeEntityType()` to `hit.entityType` before
 * indexing into this map.
 */
const ENTITY_DISPLAY: Record<string, { label: string; dotBg: string }> = {
    ioc:           { label: 'Indicators',      dotBg: 'bg-sky-400'     },
    vulnerability: { label: 'Vulnerabilities', dotBg: 'bg-rose-400'    },
    threat_actor:  { label: 'Threat actors',   dotBg: 'bg-amber-400'   },
    pulse:         { label: 'Pulses',          dotBg: 'bg-emerald-400' },
};

/** Type filter chips above the input — scopes the backend query. */
const TYPE_FILTERS = [
    { key: 'all',           label: 'All',     wire: undefined          },
    { key: 'ioc',           label: 'IOCs',    wire: 'ioc'              },
    { key: 'vulnerability', label: 'CVEs',    wire: 'vulnerability'    },
    { key: 'threat_actor',  label: 'Actors',  wire: 'threat_actor'     },
] as const;

type FilterKey = (typeof TYPE_FILTERS)[number]['key'];

/** Section order in the entity results pane (actors first — see `lazarus`-style queries). */
const SECTION_ORDER: string[] = ['threat_actor', 'vulnerability', 'ioc', 'pulse'];

/**
 * Jump-to-screen navigation results. Mirrors the sidebar's nav groups so
 * "audit" / "schedule" / "feed" / etc. all surface their screen at the top
 * of the palette before any entity matches load. Empty query = top 5 shown
 * unfiltered.
 */
interface NavRowItem {
    href: string;
    label: string;
    group: string;        // sidebar group eyebrow ("Monitor", "Investigate", …)
    icon: LucideIcon;
    /** Keywords for fuzzy matching (e.g. "ioc" matches Indicators). */
    keywords?: string[];
}

const NAV_ITEMS: NavRowItem[] = [
    { href: '/',                    label: 'Command',        group: 'Monitor',     icon: LayoutDashboard, keywords: ['overview', 'dashboard', 'triage', 'home'] },
    { href: '/feeds',               label: 'Feeds',          group: 'Monitor',     icon: Database },
    { href: '/iocs',                label: 'Indicators',     group: 'Investigate', icon: Radar,      keywords: ['ioc', 'iocs'] },
    { href: '/vulnerabilities',     label: 'Vulnerabilities',group: 'Investigate', icon: Shield,     keywords: ['cve', 'cves', 'vuln', 'kev'] },
    { href: '/actors',              label: 'Threat actors',  group: 'Investigate', icon: Users,      keywords: ['actor', 'apt', 'group'] },
    { href: '/graph',               label: 'Graph',          group: 'Investigate', icon: Network,    keywords: ['neo4j', 'explore', 'pivot'] },
    { href: '/admin/services',      label: 'Services',       group: 'Operate',     icon: ServerCog,  keywords: ['health', 'queues', 'workers'] },
    { href: '/admin/runbook',       label: 'Runbook',        group: 'Operate',     icon: BookOpen },
    { href: '/playbooks',           label: 'Playbooks',      group: 'Operate',     icon: Workflow,   keywords: ['automation'] },
    { href: '/admin/feeds',         label: 'Feed config',    group: 'Admin',       icon: Database },
    { href: '/admin/schedules',     label: 'Schedules',      group: 'Admin',       icon: CalendarClock, keywords: ['cron'] },
    { href: '/admin/users',         label: 'Users',          group: 'Admin',       icon: UsersRound },
    { href: '/admin/audit',         label: 'Audit log',      group: 'Admin',       icon: ScrollText, keywords: ['audit', 'log'] },
];

/** Quick actions — dispatch a custom event or open a panel; never persist data. */
interface ActionRowItem {
    id: string;
    label: string;
    icon: LucideIcon;
    keywords?: string[];
    run: (ctx: { router: ReturnType<typeof useRouter> }) => void;
}

const ACTIONS: ActionRowItem[] = [
    {
        id: 'refresh-feeds',
        label: 'Refresh feeds',
        icon: RefreshCcw,
        keywords: ['sync', 'pull', 'reload'],
        run: () => window.dispatchEvent(new CustomEvent('rinjani:refresh-feeds')),
    },
    {
        id: 'open-notifications',
        label: 'Open notifications',
        icon: Bell,
        keywords: ['alerts', 'inbox'],
        run: ({ router }) => router.push('/notifications'),
    },
    {
        id: 'open-tweaks',
        label: 'Open tweaks (accent + density)',
        icon: Sliders,
        keywords: ['theme', 'compact', 'comfort', 'colour', 'color'],
        run: () => window.dispatchEvent(new CustomEvent('rinjani:open-tweaks')),
    },
];

export function SearchPalette() {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'text' | 'semantic'>('text');
    const [q, setQ] = useState('');
    const [typeFilter, setTypeFilter] = useState<FilterKey>('all');
    const [focused, setFocused] = useState(0);
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    // Global keyboard shortcut: Cmd/Ctrl+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // External open events (hero pill, command actions, etc.)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ q?: string; mode?: 'text' | 'semantic' }>).detail;
            if (detail?.mode) setMode(detail.mode);
            if (detail?.q !== undefined) setQ(detail.q);
            setOpen(true);
        };
        window.addEventListener('rinjani:open-search', handler);
        return () => window.removeEventListener('rinjani:open-search', handler);
    }, []);

    // Reset focus when shape of results changes — done in event handlers,
    // not in an effect, to avoid the react-hooks/set-state-in-effect lint.
    const onQueryChange = (next: string) => {
        if (next !== q) setFocused(0);
        setQ(next);
    };
    const onModeToggle = () => {
        setFocused(0);
        setMode(m => m === 'text' ? 'semantic' : 'text');
    };
    const onTypeFilter = (key: FilterKey) => {
        setFocused(0);
        setTypeFilter(key);
    };

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    const trimmed = q.trim();
    const qLower = trimmed.toLowerCase();
    const enabled = trimmed.length >= 2;
    const wireType = TYPE_FILTERS.find(f => f.key === typeFilter)?.wire;

    // Entity search — only fires when query is ≥2 chars.
    const { data, isLoading } = useSWR(
        enabled ? ['palette', mode, trimmed, wireType ?? 'all'] : null,
        async () => {
            const t0 = performance.now();
            const items = mode === 'semantic'
                ? (await search.vector({ q: trimmed, k: 12, type: wireType })).items
                : (await search.unified({ q: trimmed, pageSize: 12, type: wireType })).items;
            return { items, ms: Math.round(performance.now() - t0) };
        },
        { dedupingInterval: 300, keepPreviousData: true },
    );

    const entityItems: SearchHit[] = useMemo(() => data?.items ?? [], [data?.items]);

    // Nav + Actions matching — substring on label + keywords.
    const navMatches = useMemo(() => {
        if (qLower === '') return NAV_ITEMS.slice(0, 5);  // empty: top 5 as a quick-jump default
        return NAV_ITEMS.filter(n =>
            n.label.toLowerCase().includes(qLower)
            || (n.keywords ?? []).some(k => k.includes(qLower)),
        ).slice(0, 6);
    }, [qLower]);

    const actionMatches = useMemo(() => {
        if (qLower === '') return [];   // hide actions until user types — keeps the empty state clean
        return ACTIONS.filter(a =>
            a.label.toLowerCase().includes(qLower)
            || (a.keywords ?? []).some(k => k.includes(qLower)),
        );
    }, [qLower]);

    // Entity results bucketed by normalized entityType.
    const entityGrouped = useMemo(() => {
        const buckets: Record<string, SearchHit[]> = {};
        for (const hit of entityItems) {
            const k = normalizeEntityType(hit.entityType);
            (buckets[k] ??= []).push(hit);
        }
        const ordered: Array<{ key: string; hits: SearchHit[] }> = [];
        for (const key of SECTION_ORDER) {
            if (buckets[key]?.length) ordered.push({ key, hits: buckets[key] });
        }
        for (const [key, hits] of Object.entries(buckets)) {
            if (!SECTION_ORDER.includes(key)) ordered.push({ key, hits });
        }
        return ordered;
    }, [entityItems]);

    // Discriminated union representing one render row in the palette.
    type Row =
        | { kind: 'nav';    item: NavRowItem }
        | { kind: 'entity'; hit: SearchHit; entityKey: string }
        | { kind: 'action'; item: ActionRowItem };

    // Flat row array (used for keyboard nav). Order: Navigation → Entities → Actions.
    const flatRows: Row[] = useMemo(() => {
        const rows: Row[] = [];
        for (const item of navMatches) rows.push({ kind: 'nav', item });
        for (const sec of entityGrouped) {
            for (const hit of sec.hits) rows.push({ kind: 'entity', hit, entityKey: sec.key });
        }
        for (const item of actionMatches) rows.push({ kind: 'action', item });
        return rows;
    }, [navMatches, entityGrouped, actionMatches]);

    // Look up the global flat index per row so render stays declarative.
    const rowIndices = useMemo(() => {
        const map = new Map<Row, number>();
        flatRows.forEach((r, i) => map.set(r, i));
        return map;
    }, [flatRows]);

    const runRow = (row: Row) => {
        setOpen(false);
        setQ('');
        if (row.kind === 'nav')    router.push(row.item.href);
        if (row.kind === 'entity') router.push(hitHref(row.hit));
        if (row.kind === 'action') row.item.run({ router });
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocused(f => Math.min(flatRows.length - 1, f + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocused(f => Math.max(0, f - 1));
        } else if (e.key === 'Enter') {
            if (flatRows[focused]) {
                e.preventDefault();
                runRow(flatRows[focused]);
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            onModeToggle();
        }
    };

    const showEntityLoading = enabled && isLoading && entityItems.length === 0;
    const showEntityEmpty = enabled && !isLoading && entityItems.length === 0;
    const totalRows = flatRows.length;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-2xl p-0 gap-0 sm:max-w-2xl">
                <DialogTitle className="sr-only">Search</DialogTitle>

                {/* Input row */}
                <div className="flex items-center gap-2 px-3 py-2 border-b">
                    {mode === 'semantic'
                        ? <Sparkles className="size-4 text-muted-foreground" />
                        : <Search className="size-4 text-muted-foreground" />
                    }
                    <Input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => onQueryChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={mode === 'semantic'
                            ? 'Describe a threat in natural language…'
                            : 'Search anything — screens, IOCs, CVEs, actors, actions'}
                        className="border-0 shadow-none focus-visible:ring-0 px-0 h-9"
                    />
                    <button
                        onClick={onModeToggle}
                        className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border"
                        title="Toggle between text and semantic search (Tab)"
                    >
                        {mode === 'semantic' ? 'semantic' : 'text'}
                    </button>
                </div>

                {/* Type filter chips */}
                <div className="flex items-center gap-1 px-3 py-1.5 border-b overflow-x-auto">
                    {TYPE_FILTERS.map(f => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => onTypeFilter(f.key)}
                            className={cn(
                                'shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border transition-colors',
                                typeFilter === f.key
                                    ? 'bg-accent text-foreground border-foreground/30'
                                    : 'text-muted-foreground hover:text-foreground border-transparent hover:border-foreground/20',
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Results */}
                <div className="max-h-105 overflow-y-auto">
                    {/* Navigation — always when there are matches OR when query is empty */}
                    {navMatches.length > 0 && (
                        <PaletteSection title="Navigation" count={navMatches.length}>
                            {navMatches.map(item => {
                                const row: Row = { kind: 'nav', item };
                                const idx = rowIndices.get(row) ?? 0;
                                const Icon = item.icon;
                                return (
                                    <PaletteRowButton
                                        key={`nav:${item.href}`}
                                        focused={idx === focused}
                                        onClick={() => runRow(row)}
                                        onMouseEnter={() => setFocused(idx)}
                                    >
                                        <Icon className="size-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-sm flex-1 truncate">{item.label}</span>
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                                            {item.group}
                                        </span>
                                    </PaletteRowButton>
                                );
                            })}
                        </PaletteSection>
                    )}

                    {/* Entity results (only with ≥2 chars) */}
                    {showEntityLoading && (
                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            <Loader2 className="size-4 mx-auto animate-spin mb-2" />
                            Searching…
                        </div>
                    )}
                    {entityGrouped.map(({ key, hits }) => {
                        const display = ENTITY_DISPLAY[key] ?? { label: key, dotBg: 'bg-muted-foreground' };
                        return (
                            <PaletteSection
                                key={key}
                                title={display.label}
                                count={hits.length}
                                dot={display.dotBg}
                            >
                                {hits.map(hit => {
                                    const row: Row = { kind: 'entity', hit, entityKey: key };
                                    const idx = rowIndices.get(row) ?? 0;
                                    return (
                                        <PaletteRowButton
                                            key={`ent:${hit.entityType}:${hit.id}`}
                                            focused={idx === focused}
                                            onClick={() => runRow(row)}
                                            onMouseEnter={() => setFocused(idx)}
                                            indented
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm truncate font-mono">{hitLabel(hit)}</div>
                                                {hit.description && (
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {hit.description}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {hit.type && key === 'ioc' && (
                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{hit.type}</span>
                                                )}
                                                {hit.severity && (
                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{hit.severity}</span>
                                                )}
                                                {hit._score != null && (
                                                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{hit._score.toFixed(2)}</span>
                                                )}
                                            </div>
                                        </PaletteRowButton>
                                    );
                                })}
                            </PaletteSection>
                        );
                    })}

                    {/* Actions — only when typing */}
                    {actionMatches.length > 0 && (
                        <PaletteSection title="Actions" count={actionMatches.length}>
                            {actionMatches.map(item => {
                                const row: Row = { kind: 'action', item };
                                const idx = rowIndices.get(row) ?? 0;
                                const Icon = item.icon;
                                return (
                                    <PaletteRowButton
                                        key={`act:${item.id}`}
                                        focused={idx === focused}
                                        onClick={() => runRow(row)}
                                        onMouseEnter={() => setFocused(idx)}
                                    >
                                        <Icon className="size-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-sm flex-1 truncate">{item.label}</span>
                                    </PaletteRowButton>
                                );
                            })}
                        </PaletteSection>
                    )}

                    {/* Empty state — only when query has no matches anywhere */}
                    {totalRows === 0 && enabled && !isLoading && (
                        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                            No matches. Try a different phrase, change the filter, or toggle search mode.
                        </p>
                    )}
                    {totalRows === 0 && !enabled && (
                        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                            Start typing — or use ↑↓ to jump to a screen above.
                        </p>
                    )}
                    {showEntityEmpty && totalRows > 0 && (
                        <p className="text-[11px] text-muted-foreground px-4 py-2 text-center">
                            No entity matches. Adjust the filter or try semantic mode (Tab).
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-3 py-2 border-t flex items-center justify-between text-[10px] text-muted-foreground gap-3 flex-wrap">
                    <div className="flex gap-3 shrink-0">
                        <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                        <span><kbd className="font-mono">↵</kbd> open</span>
                        <span><kbd className="font-mono">Tab</kbd> mode</span>
                    </div>
                    <div className="flex gap-3 shrink-0">
                        {enabled && data && (
                            <span className="tabular-nums">
                                {entityItems.length} match{entityItems.length === 1 ? '' : 'es'} · {data.ms}ms
                            </span>
                        )}
                        <span><kbd className="font-mono">Esc</kbd> close</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function PaletteSection({
    title, count, dot, children,
}: {
    title: string;
    count: number;
    dot?: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <header className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                {dot && <span className={cn('inline-block size-1 rounded-full', dot)} />}
                <span>{title}</span>
                <span className="opacity-50 tabular-nums">· {count}</span>
            </header>
            <ul>{children}</ul>
        </section>
    );
}

function PaletteRowButton({
    focused, onClick, onMouseEnter, indented, children,
}: {
    focused: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
    indented?: boolean;
    children: React.ReactNode;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={onMouseEnter}
                className={cn(
                    'w-full flex items-center gap-3 text-left px-3 py-2',
                    indented ? 'pl-6' : 'pl-3',
                    focused ? 'bg-accent' : 'hover:bg-accent/50',
                )}
            >
                {children}
            </button>
        </li>
    );
}
