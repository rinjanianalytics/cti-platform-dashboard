'use client';

/**
 * Indicators — Command Center refit (Phase 2).
 *
 * URL is the source of truth for filters (q, type, severity, source, page)
 * so deep links from the overview (e.g. /iocs?severity=critical) and
 * shareable links Just Work. Local state mirrors the URL and pushes back
 * on every change via router.replace.
 *
 * Per-row click opens the entity drawer (overlay) instead of routing to
 * /iocs/[id]. The detail page is still reachable directly for shareable
 * URLs, but the drawer is the default in-flow interaction.
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { iocs, type IOC } from '@/lib/api';
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
import { Combobox } from '@/components/ui/combobox';
import {
    Plus, Search, X, Eye, GitFork, Download, Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';
import { Sev, normalizeSeverity, type Severity } from '@/components/cc/sev';
import { Tags } from '@/components/cc/tags';
import { ConfBar } from '@/components/cc/conf-bar';
import { BulkActionBar } from '@/components/cc/bulk-action-bar';
import { useEntityDrawer } from '@/components/cc/entity-drawer';

const TYPE_FILTERS = [
    { value: 'all',    label: 'All types' },
    { value: 'ip',     label: 'IP' },
    { value: 'domain', label: 'Domain' },
    { value: 'url',    label: 'URL' },
    { value: 'hash',   label: 'Hash (MD5 / SHA-1 / SHA-256)' },
    { value: 'email',  label: 'Email' },
    { value: 'cve',    label: 'CVE' },
];

const SEVERITY_FILTERS = [
    { value: 'all', label: 'Any severity' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'info', label: 'Info' },
];

const PAGE_SIZE = 25;

export default function IOCsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();
    const drawer = useEntityDrawer();

    // URL-mirrored filter state.
    const [q, setQ] = useState(() => initialParams.get('q') ?? '');
    const [type, setType] = useState(() => initialParams.get('type') ?? 'all');
    const [severity, setSeverity] = useState(() => initialParams.get('severity') ?? 'all');
    const [source, setSource] = useState(() => initialParams.get('source') ?? '');
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const [createOpen, setCreateOpen] = useState(false);

    // Row selection — IDs only; the bulk bar reads count from selectedIds.size.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Sync state → URL. Skip the param when it's at its default so the URL
    // stays clean (`?severity=critical` not `?severity=critical&type=all&page=1`).
    useEffect(() => {
        const next = new URLSearchParams();
        if (q) next.set('q', q);
        if (type !== 'all') next.set('type', type);
        if (severity !== 'all') next.set('severity', severity);
        if (source) next.set('source', source);
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        const target = qs ? `${pathname}?${qs}` : pathname;
        router.replace(target, { scroll: false });
    }, [q, type, severity, source, page, pathname, router]);

    const { data, isLoading, mutate } = useSWR(
        ['iocs', q, type, severity, source, page],
        () => iocs.list({
            page,
            pageSize: PAGE_SIZE,
            q: q || undefined,
            type: type === 'all' ? undefined : type,
            severity: severity === 'all' ? undefined : severity,
            source: source || undefined,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const columns: CcColumn<IOC>[] = [
        {
            id: 'type',
            header: 'Type',
            width: 'w-20',
            sortable: true,
            cell: r => <span className="font-mono text-[11px] uppercase tracking-wider text-text-3">{r.type}</span>,
        },
        {
            id: 'value',
            header: 'Value',
            sortable: true,
            cell: r => (
                <span className="font-mono text-[13px] truncate block max-w-[46ch]">{r.value}</span>
            ),
        },
        {
            id: 'source',
            header: 'Source',
            width: 'w-28',
            sortable: true,
            cell: r => <span className="font-mono text-[12px] text-text-3">{r.source}</span>,
        },
        {
            id: 'severity',
            header: 'Severity',
            width: 'w-24',
            sortable: true,
            cell: r => r.severity
                ? <Sev level={normalizeSeverity(r.severity)} short />
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'confidence',
            header: 'Conf.',
            width: 'w-24',
            align: 'right',
            sortable: true,
            cell: r => r.confidence != null
                ? <ConfBar value={r.confidence} />
                : <span className="text-text-4 text-[11px]">—</span>,
        },
        {
            id: 'tags',
            header: 'Tags',
            width: 'w-56',
            cell: r => <Tags items={r.tags ?? []} max={2} />,
        },
        {
            id: 'lastSeen',
            header: 'Seen',
            width: 'w-20',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11px] text-text-3 font-mono tnum">{relTime(r.lastSeen)}</span>,
        },
    ];

    const sevTint = (r: IOC): Severity | null =>
        r.severity ? normalizeSeverity(r.severity) : null;

    /* ── Bulk actions ──────────────────────────────────────────────── */
    const clearSelection = () => setSelectedIds(new Set());

    const exportSelection = () => {
        // CSV of the selected IOCs — done client-side from the page's current
        // dataset because the API doesn't expose a bulk-fetch-by-ids endpoint
        // (a Phase 3 backend item). For now you can only export what's on the
        // current page, which mirrors what the user sees.
        const rows = items.filter(r => selectedIds.has(r.id));
        if (rows.length === 0) { toast.error('Selection is empty on this page'); return; }
        const csv = [
            ['type', 'value', 'source', 'severity', 'confidence', 'tags', 'first_seen', 'last_seen'].join(','),
            ...rows.map(r => [
                r.type, JSON.stringify(r.value), r.source, r.severity ?? '',
                r.confidence ?? '',
                JSON.stringify((r.tags ?? []).join(' ')),
                r.firstSeen ?? '', r.lastSeen ?? '',
            ].join(',')),
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iocs-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${rows.length} indicators`);
    };

    const watchSelection = async () => {
        // Same stand-in as the drawer's Watch action — mark each as
        // `suspicious` via the verdict endpoint until a real watchlist
        // exists. Async, but we toast a single success at the end so the
        // user gets one notification, not N.
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => iocs.setVerdict(id, 'suspicious', 'Bulk watch')));
            toast.success(`Watching ${ids.length} indicators`);
            await mutate();
            clearSelection();
        } catch (e) {
            toast.error((e as Error).message || 'Bulk watch failed');
        }
    };

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Indicators</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} indicators across all sources`}
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" /> New indicator
                </Button>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <CreateIOCDialog
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
                        placeholder="Search by value, type, or source…"
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
                <Combobox
                    options={TYPE_FILTERS}
                    value={type}
                    onValueChange={(v) => { setType(v ?? 'all'); setPage(1); }}
                    placeholder="All types"
                    searchPlaceholder="Filter types…"
                    triggerWidth="w-40"
                />
                <Select value={severity} onValueChange={(v) => { setSeverity(v ?? 'all'); setPage(1); }}>
                    <SelectTrigger className="w-35 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SEVERITY_FILTERS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {source && (
                    <span className={cn(
                        'h-9 px-3 inline-flex items-center gap-2 rounded-md border border-line-soft bg-bg-1',
                        'font-mono text-[11px] uppercase tracking-wider text-text-2',
                    )}>
                        source: {source}
                        <button
                            type="button"
                            onClick={() => { setSource(''); setPage(1); }}
                            aria-label={`Clear source filter: ${source}`}
                            className="text-text-3 hover:text-text"
                        >
                            <X className="size-3" />
                        </button>
                    </span>
                )}
            </div>

            {/* Table — flex-1 so it owns the remaining vertical space and the
                sticky header + pager work as intended. */}
            <div className="flex-1 min-h-0">
                <CcDataTable
                    columns={columns}
                    data={items}
                    rowKey={r => r.id}
                    isLoading={isLoading}
                    onRowClick={r => drawer.open({ type: 'ioc', id: r.id })}
                    sevtintFn={sevTint}
                    selection={{ selectedIds, onChange: setSelectedIds }}
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                />
            </div>

            {/* Bulk action bar — floats above the page when ≥1 selected. */}
            <BulkActionBar
                count={selectedIds.size}
                onClear={clearSelection}
                actions={[
                    {
                        id: 'watch', label: 'Watch',
                        icon: <Eye className="size-3.5" />,
                        onClick: watchSelection,
                    },
                    {
                        id: 'pivot', label: 'Pivot',
                        icon: <GitFork className="size-3.5" />,
                        onClick: () => {
                            const first = items.find(r => selectedIds.has(r.id));
                            if (first) window.location.assign(`/graph?seed=${encodeURIComponent(first.value)}`);
                        },
                    },
                    {
                        id: 'export', label: 'Export',
                        icon: <Download className="size-3.5" />,
                        onClick: exportSelection,
                    },
                    {
                        id: 'playbook', label: 'Playbook',
                        icon: <Workflow className="size-3.5" />,
                        primary: true,
                        onClick: () => toast.info('Playbook builder lands in Phase 3.'),
                    },
                ]}
            />
        </div>
    );
}

/* -------------------------------------------------------------------------- */
function CreateIOCDialog({ onCreated }: { onCreated: () => void }) {
    const [type, setType] = useState('domain');
    const [value, setValue] = useState('');
    const [source, setSource] = useState('manual');
    const [severity, setSeverity] = useState('');
    const [confidence, setConfidence] = useState('');
    const [tags, setTags] = useState('');
    const [threatType, setThreatType] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setValue(''); setSeverity(''); setConfidence(''); setTags(''); setThreatType(''); setNotes('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        const body: Parameters<typeof iocs.create>[0] = {
            type, value: value.trim(), source: source.trim() || 'manual',
        };
        if (severity) body.severity = severity;
        const c = Number(confidence);
        if (confidence && !isNaN(c) && c >= 0 && c <= 100) body.confidence = c;
        const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tagArr.length) body.tags = tagArr;
        if (threatType.trim()) body.threatType = threatType.trim();
        if (notes.trim()) body.notes = notes.trim();

        try {
            const created = await iocs.create(body);
            toast.success('Indicator created', { description: created.value });
            reset();
            onCreated();
        } catch (err) {
            toast.error('Create failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle>New indicator</DialogTitle>
                <DialogDescription>
                    Manually record a single IOC. Bulk ingest still goes through the STIX import path.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="type">Type</Label>
                        <Select value={type} onValueChange={(v) => setType(v ?? 'all')}>
                            <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ip">ip</SelectItem>
                                <SelectItem value="ipv6">ipv6</SelectItem>
                                <SelectItem value="domain">domain</SelectItem>
                                <SelectItem value="hostname">hostname</SelectItem>
                                <SelectItem value="url">url</SelectItem>
                                <SelectItem value="hash-md5">hash-md5</SelectItem>
                                <SelectItem value="hash-sha1">hash-sha1</SelectItem>
                                <SelectItem value="hash-sha256">hash-sha256</SelectItem>
                                <SelectItem value="email">email</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="source">Source</Label>
                        <Input id="source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="value">Value</Label>
                    <Input id="value" value={value} onChange={(e) => setValue(e.target.value)}
                        placeholder="evil.example.com / 9b3a…c821 / 1.2.3.4" autoFocus />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="severity">Severity</Label>
                        <Select value={severity} onValueChange={(v) => setSeverity(v ?? 'all')}>
                            <SelectTrigger id="severity"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="critical">critical</SelectItem>
                                <SelectItem value="high">high</SelectItem>
                                <SelectItem value="medium">medium</SelectItem>
                                <SelectItem value="low">low</SelectItem>
                                <SelectItem value="info">info</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="confidence">Confidence</Label>
                        <Input id="confidence" type="number" min={0} max={100}
                            value={confidence} onChange={(e) => setConfidence(e.target.value)} placeholder="0–100" />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="threat-type">Threat type</Label>
                    <Input id="threat-type" value={threatType} onChange={(e) => setThreatType(e.target.value)}
                        placeholder="phishing / c2 / ransomware" />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                    <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tag1, tag2" />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Stored in raw_data.notes" />
                </div>

                <DialogFooter>
                    <Button type="submit" disabled={busy || !value.trim()}>
                        {busy ? 'Creating…' : 'Create indicator'}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
