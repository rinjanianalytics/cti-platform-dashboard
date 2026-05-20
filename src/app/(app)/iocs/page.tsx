'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { iocs, type IOC } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TYPE_FILTERS = [
    { value: 'all', label: 'All types' },
    { value: 'ip', label: 'IP' },
    { value: 'domain', label: 'Domain' },
    { value: 'url', label: 'URL' },
    { value: 'hash-md5', label: 'MD5' },
    { value: 'hash-sha1', label: 'SHA-1' },
    { value: 'hash-sha256', label: 'SHA-256' },
    { value: 'email', label: 'Email' },
    { value: 'hostname', label: 'Hostname' },
];

const SEVERITY_FILTERS = [
    { value: 'all', label: 'Any severity' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'info', label: 'Info' },
];

const SEVERITY_TONE: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    info: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

function relTime(d: string | null | undefined): string {
    if (!d) return '—';
    const t = Date.parse(d);
    if (isNaN(t)) return '—';
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d`;
}

export default function IOCsPage() {
    const [q, setQ] = useState('');
    const [type, setType] = useState('all');
    const [severity, setSeverity] = useState('all');
    const [createOpen, setCreateOpen] = useState(false);

    const { data, isLoading, mutate } = useSWR(
        ['iocs', q, type, severity],
        () => iocs.list({
            pageSize: 50,
            q: q || undefined,
            type: type === 'all' ? undefined : type,
            severity: severity === 'all' ? undefined : severity,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Indicators</h1>
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
                <div className="relative flex-1 min-w-[240px] max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by value, type, or source…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button
                            onClick={() => setQ('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <Select value={type} onValueChange={(v) => setType(v ?? 'all')}>
                    <SelectTrigger className="w-[140px] h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TYPE_FILTERS.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={severity} onValueChange={(v) => setSeverity(v ?? 'all')}>
                    <SelectTrigger className="w-[140px] h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SEVERITY_FILTERS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="w-[80px]">Type</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead className="w-[120px]">Source</TableHead>
                            <TableHead className="w-[110px]">Severity</TableHead>
                            <TableHead className="w-[70px] text-right">Conf.</TableHead>
                            <TableHead className="w-[80px] text-right">Seen</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell>
                                </TableRow>
                            ))
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                                    No indicators match the current filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((ioc) => <IOCRow key={ioc.id} ioc={ioc} />)
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

// =============================================================================
function IOCRow({ ioc }: { ioc: IOC }) {
    const router = useRouter();
    return (
        <TableRow
            className="cursor-pointer hover:bg-accent/40"
            onClick={() => router.push(`/iocs/${ioc.id}`)}
        >
            <TableCell className="text-xs text-muted-foreground uppercase tracking-wider">{ioc.type}</TableCell>
            <TableCell className="font-mono text-sm truncate max-w-[480px]">{ioc.value}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{ioc.source}</TableCell>
            <TableCell>
                {ioc.severity ? (
                    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', SEVERITY_TONE[ioc.severity] ?? '')}>
                        {ioc.severity}
                    </Badge>
                ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                )}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {ioc.confidence != null ? `${ioc.confidence}%` : '—'}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {relTime(ioc.lastSeen)}
            </TableCell>
        </TableRow>
    );
}

// =============================================================================
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
