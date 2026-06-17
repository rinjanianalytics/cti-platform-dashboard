'use client';

/**
 * On-chain — wallets + live Arkham attribution (AA.6, "follow the money").
 *
 * The crypto-cashout layer of the platform: confidence-weighted wallet
 * attribution + an on-demand Arkham lookup. Attribution is always a CLAIM —
 * shown with its confidence + source, never asserted as fact.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { onchain, type ArkhamAttribution } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

function confTone(c: number): 'default' | 'secondary' | 'outline' {
    if (c >= 75) return 'default';
    if (c >= 40) return 'secondary';
    return 'outline';
}

const ENTITY_FILTERS = [
    { key: '', label: 'All' },
    { key: 'sanctioned', label: 'Sanctioned' },
    { key: 'scam', label: 'Scam' },
    { key: 'exchange', label: 'Exchange' },
] as const;

export default function OnChainPage() {
    const [q, setQ] = useState('');
    const [etype, setEtype] = useState<string>('');
    const { data: wallets, isLoading } = useSWR(['wallets', q, etype], () =>
        onchain.wallets({ q: q || undefined, entityType: etype || undefined }));

    const [addr, setAddr] = useState('');
    const [looking, setLooking] = useState(false);
    const [attr, setAttr] = useState<ArkhamAttribution | null>(null);

    async function lookup() {
        const a = addr.trim();
        if (!a) return;
        setLooking(true);
        setAttr(null);
        try {
            setAttr(await onchain.lookup(a));
        } catch (e) {
            toast.error(`Arkham lookup failed: ${(e as Error).message}`);
        } finally {
            setLooking(false);
        }
    }

    return (
        <div className="min-w-0 space-y-6">
            <div>
                <h1 className="text-xl font-semibold">On-chain</h1>
                <p className="text-sm text-muted-foreground">
                    Crypto-cashout attribution — confidence-weighted, never asserted as fact. Sanctioned (OFAC) and scam (ScamSniffer) wallets ingest automatically; look up any address live on Arkham.
                </p>
            </div>

            {/* Arkham lookup */}
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Arkham lookup</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <Input
                            value={addr}
                            onChange={(e) => setAddr(e.target.value)}
                            placeholder="0x… address"
                            className="max-w-md font-mono text-xs"
                            onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
                        />
                        <Button onClick={lookup} disabled={looking || !addr.trim()}>{looking ? 'Looking…' : 'Look up'}</Button>
                    </div>
                    {attr && (
                        <div className="rounded border p-3 text-sm">
                            {attr.unattributed ? (
                                <span className="text-muted-foreground">No Arkham attribution for this address.</span>
                            ) : (
                                <div className="space-y-1">
                                    <div className="font-medium">{attr.entityName || attr.label}</div>
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        {attr.entityType && <Badge variant="outline">{attr.entityType}</Badge>}
                                        {attr.service && <span>service: {attr.service}</span>}
                                        {attr.label && <span>label: {attr.label}</span>}
                                        {attr.isContract && <Badge variant="secondary">contract</Badge>}
                                    </div>
                                    <p className="text-xs text-muted-foreground">Attribution from Arkham — assign a confidence before recording it as a wallet (the agent proposes; an analyst commits).</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Wallets */}
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter wallets (label)…" className="max-w-md" />
                    <div className="flex gap-1">
                        {ENTITY_FILTERS.map((f) => (
                            <Button
                                key={f.key}
                                size="sm"
                                variant={etype === f.key ? 'default' : 'outline'}
                                onClick={() => setEtype(f.key)}
                            >
                                {f.label}
                            </Button>
                        ))}
                    </div>
                </div>
                {isLoading && <Skeleton className="h-48 w-full" />}
                {wallets && (
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-44">Address</TableHead>
                                        <TableHead>Attribution</TableHead>
                                        <TableHead className="w-28">Type</TableHead>
                                        <TableHead className="w-28">Confidence</TableHead>
                                        <TableHead className="w-24">Source</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {wallets.map((w) => (
                                        <TableRow key={w.refId}>
                                            <TableCell className="font-mono text-xs wrap-break-word">{w.chain}:{w.address}</TableCell>
                                            <TableCell className="wrap-break-word">{w.entityLabel || <span className="text-muted-foreground">—</span>}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{w.entityType || '—'}</TableCell>
                                            <TableCell><Badge variant={confTone(w.confidence)}>{w.confidence}%</Badge></TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{w.attributionSource || '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                    {wallets.length === 0 && (
                                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No wallets yet — look one up above, or let the Hunt agent propose one.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
                {wallets && <p className="text-xs text-muted-foreground">{wallets.length} wallet{wallets.length === 1 ? '' : 's'}</p>}
            </div>
        </div>
    );
}
