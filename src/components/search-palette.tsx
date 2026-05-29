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
import { Search, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Per-entity display attributes, keyed by the **canonical** (underscore)
 * entityType — apply `normalizeEntityType()` to `hit.entityType` before
 * indexing into this map.
 *
 * `dotBg` is the Tailwind class for the leading 1.5px status dot — kept
 * separate from text colour so the row stays readable without colouring
 * the body text.
 */
const ENTITY_DISPLAY: Record<string, { label: string; dotBg: string }> = {
    ioc:           { label: 'Indicators',    dotBg: 'bg-sky-400'     },
    vulnerability: { label: 'Vulnerabilities', dotBg: 'bg-rose-400'  },
    threat_actor:  { label: 'Threat actors', dotBg: 'bg-amber-400'   },
    pulse:         { label: 'Pulses',        dotBg: 'bg-emerald-400' },
};

/**
 * Filter chips shown above the input. `wire` is the value sent to the
 * backend's `?type=` filter — matches the indexed `entityType` (note: the
 * backend uses a hyphen for `threat-actor` even though we use underscore
 * canonically; `searchTypeWire()` in api.ts handles this on outbound).
 */
const TYPE_FILTERS = [
    { key: 'all',           label: 'All',     wire: undefined          },
    { key: 'ioc',           label: 'IOCs',    wire: 'ioc'              },
    { key: 'vulnerability', label: 'CVEs',    wire: 'vulnerability'    },
    { key: 'threat_actor',  label: 'Actors',  wire: 'threat_actor'     },
] as const;

type FilterKey = (typeof TYPE_FILTERS)[number]['key'];

/**
 * Section order in the results pane — actors first because when the user
 * types something like "lazarus" or "apt29" they almost certainly want the
 * actor rather than the 200 IOCs attached to it. CVEs next because the
 * query shape (e.g. "CVE-2024-") is unambiguous. IOCs last and densest.
 */
const SECTION_ORDER: string[] = ['threat_actor', 'vulnerability', 'ioc', 'pulse'];

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

    // Pre-fill from the hero pill (or any caller dispatching this event).
    // Payload: { q?: string, mode?: 'text' | 'semantic' }.
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

    // Reset focus when the user changes the query shape, search mode, or
    // type filter — we do this in the change handlers (not in an effect)
    // because setState-in-effect cascades into an extra render, and the
    // lint rule `react-hooks/set-state-in-effect` rightly flags it.
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

    // Focus the input when opening — slight delay so the dialog's mount
    // animation doesn't steal focus back.
    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    const trimmed = q.trim();
    const enabled = trimmed.length >= 2;
    const wireType = TYPE_FILTERS.find(f => f.key === typeFilter)?.wire;

    const { data, isLoading } = useSWR(
        enabled ? ['palette', mode, trimmed, wireType ?? 'all'] : null,
        async () => {
            // Time the round-trip client-side so we can show a "Xms" hint
            // in the footer (GreyNoise-style) regardless of which backend
            // path served the query.
            const t0 = performance.now();
            const items = mode === 'semantic'
                ? (await search.vector({ q: trimmed, k: 12, type: wireType })).items
                : (await search.unified({ q: trimmed, pageSize: 12, type: wireType })).items;
            return { items, ms: Math.round(performance.now() - t0) };
        },
        { dedupingInterval: 300, keepPreviousData: true },
    );

    // Stabilize the items reference so downstream useMemo deps don't churn
    // every render when SWR returns the same data with a fresh array literal.
    const items: SearchHit[] = useMemo(() => data?.items ?? [], [data?.items]);

    // Bucket hits by normalized entityType so we can render section headers,
    // then flatten in section order for keyboard navigation.
    const grouped = useMemo(() => {
        const buckets: Record<string, SearchHit[]> = {};
        for (const hit of items) {
            const k = normalizeEntityType(hit.entityType);
            (buckets[k] ??= []).push(hit);
        }
        const ordered: Array<{ key: string; hits: SearchHit[] }> = [];
        for (const key of SECTION_ORDER) {
            if (buckets[key]?.length) ordered.push({ key, hits: buckets[key] });
        }
        // Anything we didn't anticipate (future entity types) lands at the
        // bottom rather than getting silently dropped.
        for (const [key, hits] of Object.entries(buckets)) {
            if (!SECTION_ORDER.includes(key)) ordered.push({ key, hits });
        }
        return ordered;
    }, [items]);

    // Pre-compute global flat index per hit so render stays declarative.
    const sections = useMemo(() => {
        let i = 0;
        return grouped.map(({ key, hits }) => ({
            key,
            hits: hits.map(hit => ({ hit, idx: i++ })),
        }));
    }, [grouped]);

    const flat = useMemo(() => grouped.flatMap(g => g.hits), [grouped]);

    const select = (hit: SearchHit) => {
        setOpen(false);
        setQ('');
        router.push(hitHref(hit));
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocused(f => Math.min(flat.length - 1, f + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocused(f => Math.max(0, f - 1));
        } else if (e.key === 'Enter') {
            if (flat[focused]) {
                e.preventDefault();
                select(flat[focused]);
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            onModeToggle();
        }
    };

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
                            : 'Search IOCs, CVEs, actors — try "lazarus", "CVE-2024-", or an IP'}
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
                    {!enabled ? (
                        <div className="px-4 py-6 text-center space-y-2">
                            <p className="text-xs text-muted-foreground">
                                Type at least two characters to search.
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Try <span className="font-mono text-foreground">lazarus</span>,{' '}
                                <span className="font-mono text-foreground">CVE-2024-</span>,{' '}
                                or an IP. Press <kbd className="font-mono">Tab</kbd> for semantic mode.
                            </p>
                        </div>
                    ) : isLoading && items.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            <Loader2 className="size-4 mx-auto animate-spin mb-2" />
                            Searching…
                        </div>
                    ) : items.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                            No matches. Try a different phrase, change the filter, or toggle search mode.
                        </p>
                    ) : (
                        <div>
                            {sections.map(({ key, hits }) => {
                                const display = ENTITY_DISPLAY[key] ?? { label: key, dotBg: 'bg-muted-foreground' };
                                return (
                                    <section key={key}>
                                        <header className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                            <span className={cn('inline-block size-1 rounded-full', display.dotBg)} />
                                            <span>{display.label}</span>
                                            <span className="opacity-50 tabular-nums">· {hits.length}</span>
                                        </header>
                                        <ul>
                                            {hits.map(({ hit, idx }) => {
                                                const isFocused = idx === focused;
                                                return (
                                                    <li key={`${hit.entityType}:${hit.id}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => select(hit)}
                                                            onMouseEnter={() => setFocused(idx)}
                                                            className={cn(
                                                                'w-full grid grid-cols-[1fr_auto] gap-3 items-center text-left px-3 py-2 pl-6',
                                                                isFocused ? 'bg-accent' : 'hover:bg-accent/50',
                                                            )}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="text-sm truncate font-mono">{hitLabel(hit)}</div>
                                                                {hit.description && (
                                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                                        {hit.description}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {hit.type && key === 'ioc' && (
                                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                                                        {hit.type}
                                                                    </span>
                                                                )}
                                                                {hit.severity && (
                                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                                                        {hit.severity}
                                                                    </span>
                                                                )}
                                                                {hit._score != null && (
                                                                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                                                                        {hit._score.toFixed(2)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer — keyboard hints on the left, query stats + close on the right */}
                <div className="px-3 py-2 border-t flex items-center justify-between text-[10px] text-muted-foreground gap-3 flex-wrap">
                    <div className="flex gap-3 shrink-0">
                        <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                        <span><kbd className="font-mono">↵</kbd> open</span>
                        <span><kbd className="font-mono">Tab</kbd> mode</span>
                    </div>
                    <div className="flex gap-3 shrink-0">
                        {enabled && data && (
                            <span className="tabular-nums">
                                {flat.length} result{flat.length === 1 ? '' : 's'} · {data.ms}ms
                            </span>
                        )}
                        <span><kbd className="font-mono">Esc</kbd> close</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
