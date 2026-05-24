'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { actors, type ThreatActor } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Search, X, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { relTime } from '@/lib/utils';

const SOPHISTICATION = ['none', 'minimal', 'intermediate', 'advanced', 'expert', 'innovator', 'strategic'] as const;
const RESOURCE_LEVELS = ['individual', 'club', 'contest', 'team', 'organization', 'government'] as const;
const MOTIVATIONS = [
    'accidental', 'coercion', 'dominance', 'ideology', 'notoriety',
    'organizational-gain', 'personal-gain', 'personal-satisfaction', 'revenge', 'unpredictable',
] as const;

const SOPH_TONE: Record<string, string> = {
    strategic: 'bg-red-500/15 text-red-400 border-red-500/30',
    innovator: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
    expert: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    advanced: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    intermediate: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    minimal: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    none: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

// Resource level → tone. State-sponsored / org-scale actors are amber/red;
// individuals and amateur groups stay muted.
const RESOURCE_TONE: Record<string, string> = {
    government: 'bg-red-500/15 text-red-400 border-red-500/30',
    organization: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    team: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    contest: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    club: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    individual: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const PAGE_SIZE = 25;

export default function ActorsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

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

    const columns: ColumnDef<ThreatActor>[] = [
        {
            id: 'name',
            header: 'Name',
            accessor: a => a.name,
            sortable: true,
            cell: a => (
                <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    {a.description && (
                        <div className="text-[11px] text-muted-foreground truncate max-w-105">
                            {a.description}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: 'aliases',
            header: 'Aliases',
            width: 'w-50',
            accessor: a => a.aliases?.join(', '),
            cell: a => {
                const aliases = a.aliases ?? [];
                return <span className="text-xs text-muted-foreground truncate block max-w-50">{aliases.length > 0 ? aliases.slice(0, 3).join(' · ') : '—'}</span>;
            },
        },
        {
            id: 'sophistication',
            header: 'Sophistication',
            width: 'w-32',
            accessor: a => a.sophistication,
            sortable: true,
            cell: a => a.sophistication
                ? <Badge variant="outline" className={`font-mono text-[10px] uppercase ${SOPH_TONE[a.sophistication] ?? ''}`}>{a.sophistication}</Badge>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            id: 'motivation',
            header: 'Motivation',
            width: 'w-40',
            accessor: a => a.primaryMotivation,
            sortable: true,
            cell: a => <span className="text-xs text-muted-foreground capitalize">{a.primaryMotivation ? a.primaryMotivation.replace(/-/g, ' ') : '—'}</span>,
        },
        {
            id: 'resourceLevel',
            header: 'Resource',
            width: 'w-30',
            accessor: a => a.resourceLevel,
            sortable: true,
            cell: a => a.resourceLevel
                ? <Badge variant="outline" className={`font-mono text-[10px] uppercase ${RESOURCE_TONE[a.resourceLevel] ?? ''}`}>{a.resourceLevel}</Badge>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            id: 'updated',
            header: 'Updated',
            width: 'w-22',
            align: 'right',
            accessor: a => a.updatedAt ? Date.parse(a.updatedAt) : null,
            sortable: true,
            cell: a => <span className="text-xs text-muted-foreground tabular-nums">{relTime(a.updatedAt)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Threat actors</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
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
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setPage(1); }}
                        placeholder="Search by name or description…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button
                            onClick={() => { setQ(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

            <DataTable
                columns={columns}
                data={items}
                rowKey={a => a.id}
                isLoading={isLoading}
                onRowClick={a => router.push(`/actors/${encodeURIComponent(a.id)}`)}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                density="compact"
                emptyState={
                    <EmptyState
                        icon={Users}
                        title="No actors tracked"
                        description="No threat actors match the current filter set. Add one manually, or wait for STIX-bundle ingest to populate."
                        action={{ label: 'New actor', onClick: () => setCreateOpen(true) }}
                    />
                }
            />
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
