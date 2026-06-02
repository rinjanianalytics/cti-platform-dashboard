'use client';

/**
 * Threat actors — Command Center refit (Phase 2).
 *
 * Per the design spec:
 *   - Name column carries the actor name (sans 600) + one-line description
 *     underneath (text-3, ellipsis)
 *   - Aliases column is mono, truncated
 *   - Sophistication is a sev-style pill (strategic → crit, advanced/
 *     expert → high, intermediate → med, minimal → low, else → info).
 *     Reuses the Sev component instead of growing a bespoke colour map.
 *   - Resource is an uppercase chip
 *   - Confidence column = score bar + label; the value is either the
 *     STIX string enum ("low" | "medium" | "high") or a 0-100 number
 *     depending on whether the actor came from a STIX feed or LLM
 *     enrichment. `confidenceToNumber` normalises both shapes to drive
 *     the bar width, `formatConfidence` formats the label. An "Activity"
 *     score (recency-weighted incident count) is a Phase 3 item; until
 *     then this column at least tells the analyst how reliable the
 *     record is.
 *
 * Row click → actor drawer.
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { actors, type ThreatActor } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn, relTime, confidenceToNumber, formatConfidence } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';
import { Sev, type Severity } from '@/components/cc/sev';
import { useEntityDrawer } from '@/components/cc/entity-drawer';

const SOPHISTICATION = ['none', 'minimal', 'intermediate', 'advanced', 'expert', 'innovator', 'strategic'] as const;
const RESOURCE_LEVELS = ['individual', 'club', 'contest', 'team', 'organization', 'government'] as const;
const MOTIVATIONS = [
    'accidental', 'coercion', 'dominance', 'ideology', 'notoriety',
    'organizational-gain', 'personal-gain', 'personal-satisfaction', 'revenge', 'unpredictable',
] as const;

function sophisticationToSev(raw: string | null | undefined): Severity {
    const s = (raw ?? '').toLowerCase();
    if (s === 'strategic') return 'crit';
    if (s === 'advanced' || s === 'expert' || s === 'innovator') return 'high';
    if (s === 'intermediate') return 'med';
    if (s === 'minimal') return 'low';
    return 'info';
}

const PAGE_SIZE = 25;

export default function ActorsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();
    const drawer = useEntityDrawer();

    const [q, setQ] = useState(() => initialParams.get('q') ?? '');
    const [sophistication, setSophistication] = useState(() => initialParams.get('sophistication') ?? 'all');
    const [motivation, setMotivation] = useState(() => initialParams.get('motivation') ?? 'all');
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const [createOpen, setCreateOpen] = useState(false);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [bulkEnriching, setBulkEnriching] = useState(false);

    useEffect(() => {
        const next = new URLSearchParams();
        if (q) next.set('q', q);
        if (sophistication !== 'all') next.set('sophistication', sophistication);
        if (motivation !== 'all') next.set('motivation', motivation);
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [q, sophistication, motivation, page, pathname, router]);

    const { data, isLoading, mutate } = useSWR(
        ['actors', q, sophistication, motivation, page],
        () => actors.list({
            page,
            pageSize: PAGE_SIZE,
            q: q || undefined,
            sophistication: sophistication === 'all' ? undefined : sophistication,
            motivation: motivation === 'all' ? undefined : motivation,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const onBulkEnrich = async () => {
        if (!confirm('Enrich up to 50 actors with missing fields via Gemini? This may take a few minutes.')) return;
        setBulkEnriching(true);
        try {
            const r = await actors.enrichBulk({ limit: 50 });
            const msg = `Enriched ${r.enriched} of ${r.considered}, skipped ${r.skipped}, ${r.errors.length} errors`;
            toast.success('Bulk enrichment finished', { description: msg });
            await mutate();
        } catch (err) {
            toast.error('Bulk enrichment failed', { description: (err as Error).message });
        } finally {
            setBulkEnriching(false);
        }
    };

    const maxConfidence = items.reduce((m, a) => Math.max(m, confidenceToNumber(a.confidence)), 1);

    const columns: CcColumn<ThreatActor>[] = [
        {
            id: 'name',
            header: 'Name',
            sortable: true,
            cell: a => (
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{a.name}</div>
                    {a.description && (
                        <div className="text-[11px] text-text-3 truncate max-w-[60ch]">{a.description}</div>
                    )}
                </div>
            ),
        },
        {
            id: 'aliases',
            header: 'Aliases',
            width: 'w-52',
            cell: a => {
                const aliases = a.aliases ?? [];
                return (
                    <span className="font-mono text-[11.5px] text-text-3 truncate block max-w-52">
                        {aliases.length > 0 ? aliases.slice(0, 3).join(' · ') : '—'}
                    </span>
                );
            },
        },
        {
            id: 'sophistication',
            header: 'Sophistication',
            width: 'w-32',
            sortable: true,
            cell: a => a.sophistication
                ? <Sev level={sophisticationToSev(a.sophistication)} short />
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'motivation',
            header: 'Motivation',
            width: 'w-40',
            sortable: true,
            cell: a => (
                <span className="text-[12px] text-text-2 capitalize">
                    {a.primaryMotivation ? a.primaryMotivation.replace(/-/g, ' ') : '—'}
                </span>
            ),
        },
        {
            id: 'resourceLevel',
            header: 'Resource',
            width: 'w-28',
            sortable: true,
            cell: a => a.resourceLevel
                ? <span className="chip uppercase text-text-3">{a.resourceLevel}</span>
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'confidence',
            header: 'Confidence',
            width: 'w-36',
            align: 'right',
            sortable: true,
            cell: a => {
                const v = confidenceToNumber(a.confidence);
                if (v === 0) return <span className="text-text-4 text-[11px]">—</span>;
                const hot = v > 70;
                const label = formatConfidence(a.confidence);
                return (
                    <span className="inline-flex items-center gap-2 justify-end">
                        <span className="w-22.5 h-1.5 bg-bg-3 rounded-full overflow-hidden">
                            <span
                                className={cn('block h-full rounded-full', hot ? 'bg-sev-high' : 'bg-brand')}
                                style={{ width: `${(v / maxConfidence) * 100}%` }}
                            />
                        </span>
                        <span className="font-mono text-[11.5px] tnum text-text-2 w-12 text-right">{label}</span>
                    </span>
                );
            },
        },
        {
            id: 'lastSeen',
            header: 'Last seen',
            width: 'w-22',
            align: 'right',
            sortable: true,
            cell: a => {
                const ts = a.lastSeen ?? a.stixModified ?? a.firstSeen;
                return <span className="text-[11.5px] text-text-3 font-mono tnum">{relTime(ts)}</span>;
            },
        },
    ];

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Threat actors</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} tracked groups and individuals`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onBulkEnrich}
                            disabled={bulkEnriching}
                        >
                            <Sparkles className="size-4" />
                            {bulkEnriching ? 'Enriching…' : 'AI enrich missing'}
                        </Button>
                    )}
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="size-4" /> New actor
                    </Button>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <CreateActorDialog
                        onCreated={() => { setCreateOpen(false); mutate(); }}
                    />
                </Dialog>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-3" />
                    <Input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setPage(1); }}
                        placeholder="Search by name or description…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button
                            onClick={() => { setQ(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <Select value={sophistication} onValueChange={(v) => { setSophistication(v ?? 'all'); setPage(1); }}>
                    <SelectTrigger className="w-40 h-9">
                        <SelectValue placeholder="Sophistication" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any sophistication</SelectItem>
                        {SOPHISTICATION.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={motivation} onValueChange={(v) => { setMotivation(v ?? 'all'); setPage(1); }}>
                    <SelectTrigger className="w-45 h-9">
                        <SelectValue placeholder="Motivation" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any motivation</SelectItem>
                        {MOTIVATIONS.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex-1 min-h-0">
                <CcDataTable
                    columns={columns}
                    data={items}
                    rowKey={a => a.id}
                    isLoading={isLoading}
                    onRowClick={a => drawer.open({ type: 'actor', id: a.id })}
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                    emptyState={
                        <div className="py-4 text-[12.5px] text-text-3">
                            No actors match the current filter set. Add one manually, or wait for STIX-bundle ingest.
                        </div>
                    }
                />
            </div>
        </div>
    );
}

function CreateActorDialog({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [aliases, setAliases] = useState('');
    const [sophistication, setSophistication] = useState('');
    const [resourceLevel, setResourceLevel] = useState('');
    const [primaryMotivation, setPrimaryMotivation] = useState('');
    const [tags, setTags] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setName(''); setDescription(''); setAliases(''); setSophistication('');
        setResourceLevel(''); setPrimaryMotivation(''); setTags('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        const body: Parameters<typeof actors.create>[0] = { name: name.trim() };
        if (description.trim()) body.description = description.trim();
        const aliasArr = aliases.split(',').map(t => t.trim()).filter(Boolean);
        if (aliasArr.length) body.aliases = aliasArr;
        if (sophistication) body.sophistication = sophistication;
        if (resourceLevel) body.resourceLevel = resourceLevel;
        if (primaryMotivation) body.primaryMotivation = primaryMotivation;
        const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tagArr.length) body.tags = tagArr;

        try {
            const created = await actors.create(body);
            toast.success('Threat actor created', { description: created.name });
            reset();
            onCreated();
        } catch (err) {
            toast.error('Create failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogContent className="max-w-lg">
            <DialogHeader>
                <DialogTitle>New threat actor</DialogTitle>
                <DialogDescription>
                    Manually catalogue an actor. STIX threat-actor objects are also ingested automatically from configured feeds.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="actor-name">Name</Label>
                    <Input id="actor-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                        placeholder="APT41 / Lazarus Group / Scattered Spider" />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="actor-desc">Description</Label>
                    <Textarea id="actor-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="Short profile, targeting, known TTPs." />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="actor-aliases">Aliases (comma-separated)</Label>
                    <Input id="actor-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)}
                        placeholder="Wicked Panda, Bronze Atlas" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="actor-soph">Sophistication</Label>
                        <Select value={sophistication} onValueChange={(v) => setSophistication(v ?? '')}>
                            <SelectTrigger id="actor-soph"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                                {SOPHISTICATION.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="actor-resource">Resource level</Label>
                        <Select value={resourceLevel} onValueChange={(v) => setResourceLevel(v ?? '')}>
                            <SelectTrigger id="actor-resource"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                                {RESOURCE_LEVELS.map(r => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="actor-motiv">Motivation</Label>
                        <Select value={primaryMotivation} onValueChange={(v) => setPrimaryMotivation(v ?? '')}>
                            <SelectTrigger id="actor-motiv"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                                {MOTIVATIONS.map(m => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="actor-tags">Tags (comma-separated)</Label>
                    <Input id="actor-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ransomware, china-nexus" />
                </div>

                <DialogFooter>
                    <Button type="submit" disabled={busy || !name.trim()}>
                        {busy ? 'Creating…' : 'Create actor'}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
