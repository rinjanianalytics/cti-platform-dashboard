'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { iocs } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ShieldOff, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn, severityTone, relTime } from '@/lib/utils';
import { SimilarPanel } from '@/components/similar-panel';
import { EntityDescription } from '@/components/entity-description';

const VERDICTS = ['malicious', 'suspicious', 'benign', 'unknown'] as const;

export default function IOCDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data, isLoading, mutate } = useSWR(['ioc', id], () => iocs.get(id));

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="py-16 text-center">
                <p className="text-sm text-muted-foreground">Indicator not found.</p>
                <Link href="/iocs" className="text-sm underline mt-2 inline-block">Back to indicators</Link>
            </div>
        );
    }

    const ioc = data;
    // Dedupe — multiple feeds can attach the same tag (e.g. "elf" from
    // both URLhaus and MalwareBazaar). Without dedup, the .map below
    // throws React's duplicate-key warning and renders extra badges.
    const tags = Array.from(new Set(ioc.tags ?? []));

    return (
        <div className="space-y-6">
            <div>
                <Link href="/iocs" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-3.5" /> Indicators
                </Link>
                <div className="flex items-start justify-between gap-4 mt-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{ioc.type}</span>
                            {ioc.severity && (
                                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', severityTone(ioc.severity))}>
                                    {ioc.severity}
                                </Badge>
                            )}
                        </div>
                        <h1 className="text-3xl font-mono mt-1 break-all">{ioc.value}</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            From <span className="font-medium text-foreground">{ioc.source}</span>
                            {ioc.firstSeen && <> · first seen {relTime(ioc.firstSeen)}</>}
                            {ioc.lastSeen && <> · last seen {relTime(ioc.lastSeen)}</>}
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <VerdictPicker id={ioc.id} onChanged={() => mutate()} />
                        <RevokeButton id={ioc.id} onChanged={() => mutate()} />
                        <ExpireButton id={ioc.id} onChanged={() => mutate()} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Context</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {ioc.description && (
                            <EntityDescription text={ioc.description} className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap" />
                        )}
                        <FieldRow label="Threat type" value={ioc.threatType ?? '—'} />
                        <FieldRow label="Confidence" value={ioc.confidence != null ? `${ioc.confidence}%` : '—'} />
                        <FieldRow
                            label="Tags"
                            value={
                                tags.length === 0 ? '—' : (
                                    <div className="flex flex-wrap gap-1">
                                        {tags.map(t => (
                                            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                                        ))}
                                    </div>
                                )
                            }
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Timeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <FieldRow label="First seen" value={ioc.firstSeen ? new Date(ioc.firstSeen).toLocaleString() : '—'} />
                        <FieldRow label="Last seen" value={ioc.lastSeen ? new Date(ioc.lastSeen).toLocaleString() : '—'} />
                        <FieldRow label="Created" value={ioc.createdAt ? new Date(ioc.createdAt).toLocaleString() : '—'} />
                        <FieldRow label="Updated" value={ioc.updatedAt ? new Date(ioc.updatedAt).toLocaleString() : '—'} />
                    </CardContent>
                </Card>
            </div>

            <SimilarPanel docId={ioc.id} type="ioc" />

            {ioc.rawData && Object.keys(ioc.rawData).length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Raw data</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded-md p-3 overflow-auto max-h-96">
                            {JSON.stringify(ioc.rawData, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="text-sm">{value}</div>
        </div>
    );
}

function VerdictPicker({ id, onChanged }: { id: string; onChanged: () => void }) {
    const [busy, setBusy] = useState(false);
    const handle = async (v: string | null) => {
        if (!v) return;
        setBusy(true);
        try {
            await iocs.setVerdict(id, v as typeof VERDICTS[number]);
            toast.success(`Verdict set: ${v}`);
            onChanged();
        } catch (err) {
            toast.error('Verdict update failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };
    return (
        <Select onValueChange={handle} disabled={busy}>
            <SelectTrigger className="w-35 h-9 text-xs">
                <SelectValue placeholder="Set verdict" />
            </SelectTrigger>
            <SelectContent>
                {VERDICTS.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function RevokeButton({ id, onChanged }: { id: string; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!reason.trim()) return;
        setBusy(true);
        try {
            await iocs.revoke(id, reason.trim());
            toast.success('Indicator revoked');
            setOpen(false);
            setReason('');
            onChanged();
        } catch (err) {
            toast.error('Revoke failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300" onClick={() => setOpen(true)}>
                <ShieldOff className="size-3.5" /> Revoke
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Revoke indicator</DialogTitle>
                    <DialogDescription>
                        Marks the IOC as no longer active. Provide a reason for the audit trail.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="revoke-reason">Reason</Label>
                    <Textarea id="revoke-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="False positive, expired campaign, etc." />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || !reason.trim()} variant="destructive">
                        {busy ? 'Revoking…' : 'Revoke'}
                    </Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        </>
    );
}

function ExpireButton({ id, onChanged }: { id: string; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [validUntil, setValidUntil] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!validUntil) return;
        setBusy(true);
        try {
            await iocs.expire(id, new Date(validUntil).toISOString());
            toast.success('Expiration set');
            setOpen(false);
            setValidUntil('');
            onChanged();
        } catch (err) {
            toast.error('Expire failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <Clock className="size-3.5" /> Expire
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Set expiration</DialogTitle>
                    <DialogDescription>
                        The indicator stays in the database but is treated as expired after this date.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="expire-date">Valid until</Label>
                    <input
                        id="expire-date"
                        type="datetime-local"
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || !validUntil}>
                        {busy ? 'Saving…' : 'Set expiry'}
                    </Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        </>
    );
}
