'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { iocs, type IOC } from '@/lib/api';
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
import { Combobox } from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Search, X, Radar } from 'lucide-react';
import { toast } from 'sonner';
import { cn, severityTone, relTime } from '@/lib/utils';

// Values must match the canonical IOC type buckets the API filters on.
// (All hash algorithms live under `hash`; differentiation is in the value
// itself / patternType. Hostnames are stored as `domain`.)
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

    // URL is the source of truth for filters so deep-links from the Overview
    // (e.g. /iocs?severity=critical) and shareable links Just Work. Local
    // state mirrors the URL and pushes back on every change via router.replace.
    const [q, setQ] = useState(() => initialParams.get('q') ?? '');
    const [type, setType] = useState(() => initialParams.get('type') ?? 'all');
    const [severity, setSeverity] = useState(() => initialParams.get('severity') ?? 'all');
    const [source, setSource] = useState(() => initialParams.get('source') ?? '');
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const [createOpen, setCreateOpen] = useState(false);

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
        // Avoid history spam: replace, don't push.
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


    const columns: ColumnDef<IOC>[] = [
        {
            id: 'type',
            header: 'Type',
            width: 'w-20',
            accessor: r => r.type,
            sortable: true,
            cell: r => <span className="text-xs text-muted-foreground uppercase tracking-wider">{r.type}</span>,
        },
        {
            id: 'value',
            header: 'Value',
            accessor: r => r.value,
            sortable: true,
            cell: r => <span className="font-mono text-sm truncate block max-w-120">{r.value}</span>,
        },
        {
            id: 'source',
            header: 'Source',
            width: 'w-30',
            accessor: r => r.source,
            sortable: true,
            cell: r => <span className="text-xs text-muted-foreground">{r.source}</span>,
        },
        {
            id: 'severity',
            header: 'Severity',
            width: 'w-28',
            accessor: r => r.severity,
            sortable: true,
            cell: r => r.severity
                ? <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', severityTone(r.severity))}>{r.severity}</Badge>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            id: 'confidence',
            header: 'Conf.',
            width: 'w-18',
            align: 'right',
            accessor: r => r.confidence,
            sortable: true,
            cell: r => <span className="text-xs text-muted-foreground tabular-nums">{r.confidence != null ? `${r.confidence}%` : '—'}</span>,
        },
        {
            id: 'tags',
            header: 'Tags',
            width: 'w-56',
            accessor: r => r.tags?.join(', '),
            cell: r => {
                const tags = r.tags ?? [];
                if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                    <span className="inline-flex items-center gap-1 max-w-56 overflow-hidden">
                        {tags.slice(0, 2).map(t => (
                            <Badge key={t} variant="outline" className="text-[10px] font-mono shrink-0">{t}</Badge>
                        ))}
                        {tags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground shrink-0">+{tags.length - 2}</span>
                        )}
                    </span>
                );
            },
        },
        {
            id: 'lastSeen',
            header: 'Seen',
            width: 'w-20',
            align: 'right',
            accessor: r => r.lastSeen ? Date.parse(r.lastSeen) : null,
            sortable: true,
            cell: r => <span className="text-xs text-muted-foreground tabular-nums">{relTime(r.lastSeen)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Indicators</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
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
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setPage(1); }}
                        placeholder="Search by value, type, or source…"
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

                {/* Source filter as a dismissible chip — set by deep links from
                    the Overview's "Top sources" panel; no static UI control for
                    it because the source list grows with feed configuration. */}
                {source && (
                    <Badge
                        variant="outline"
                        className="h-9 px-3 gap-2 font-mono text-[11px] uppercase tracking-wider"
                    >
                        source: {source}
                        <button
                            type="button"
                            onClick={() => { setSource(''); setPage(1); }}
                            aria-label={`Clear source filter: ${source}`}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3" />
                        </button>
                    </Badge>
                )}
            </div>

            <DataTable
                columns={columns}
                data={items}
                rowKey={r => r.id}
                isLoading={isLoading}
                onRowClick={r => router.push(`/iocs/${r.id}`)}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                density="compact"
                emptyState={
                    <EmptyState
                        icon={Radar}
                        title="No indicators in scope"
                        description="No IOCs match the current filter set. Loosen the type, severity, or search query — or record one manually."
                        action={{ label: 'New indicator', onClick: () => setCreateOpen(true) }}
                    />
                }
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
