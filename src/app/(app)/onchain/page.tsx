'use client';

/**
 * On-chain — wallets + free multi-source attribution (AA.6, "follow the money").
 *
 * The crypto-cashout layer of the platform: confidence-weighted wallet
 * attribution + an on-demand lookup that aggregates FREE sources (our DB:
 * OFAC/ScamSniffer/DefiLlama · Blockscout · DefiLlama · optional MistTrack).
 * Attribution is always a CLAIM — shown with its source(s), never asserted as
 * fact. No paid Arkham dependency.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { onchain, type OnchainAttribution } from '@/lib/api';
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
    const [attr, setAttr] = useState<OnchainAttribution | null>(null);

    async function lookup() {
        const a = addr.trim();
        if (!a) return;
        setLooking(true);
        setAttr(null);
        try {
            setAttr(await onchain.lookup(a));
        } catch (e) {
            toast.error(`Lookup failed: ${(e as Error).message}`);
        } finally {
            setLooking(false);
        }
    }

    return (
        <div className="min-w-0 space-y-6">
            <div>
                <h1 className="text-xl font-semibold">On-chain</h1>
                <p className="text-sm text-muted-foreground">
                    Crypto-cashout attribution — confidence-weighted, never asserted as fact. Sanctioned (OFAC), scam (ScamSniffer) and DeFi-protocol (DefiLlama) wallets ingest automatically; look up any address across free sources.
                </p>
            </div>

            {/* On-chain lookup (free multi-source) */}
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">On-chain lookup</CardTitle></CardHeader>
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
                                <span className="text-muted-foreground">No attribution found across free sources for this address.</span>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium">{attr.entityName || attr.label}</span>
                                        {attr.entityType && <Badge variant="outline">{attr.entityType}</Badge>}
                                        {attr.isContract && <Badge variant="secondary">contract</Badge>}
                                        {attr.confidence != null && <Badge variant={confTone(attr.confidence)}>{attr.confidence}%</Badge>}
                                        {attr.riskLevel && (
                                            <Badge variant={attr.riskScore != null && attr.riskScore >= 60 ? 'destructive' : 'secondary'}>
                                                risk: {attr.riskLevel}{attr.riskScore != null ? ` (${attr.riskScore})` : ''}
                                            </Badge>
                                        )}
                                    </div>
                                    {attr.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {attr.tags.slice(0, 12).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                                        <span>sources:</span>
                                        {attr.sources.map((s, i) => (
                                            <span key={`${s.source}:${i}`} className="rounded bg-muted px-1.5 py-0.5">
                                                {s.source}{s.label ? ` · ${s.label}` : ''}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">Aggregated from free sources — each label rides with its provenance. Assign a confidence before recording it as a wallet (the agent proposes; an analyst commits).</p>
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
