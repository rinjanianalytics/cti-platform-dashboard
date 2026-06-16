'use client';

/**
 * Frameworks — MITRE FiGHT (5G/telco) + ATLAS (AI), the differentiator beside ATT&CK.
 *
 * Browse the two threat matrices that set the platform apart from generic
 * ATT&CK-sourced tools. Full-bleed, single column (per the layout rules); the
 * agent's Hunt page reasons over these in the graph — this is the catalog view.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { fight, atlas } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CoverageHeatmap, type CoverageCell } from '@/components/cc/coverage-heatmap';
import { Grid as GridIcon } from 'lucide-react';

function statusTone(s: string | null): 'default' | 'secondary' | 'outline' {
    const v = (s ?? '').toLowerCase();
    if (v.includes('observed') || v.includes('demonstrated')) return 'default';
    if (v.includes('poc') || v.includes('feasible')) return 'secondary';
    return 'outline'; // theoretical / unknown
}

function FightTab() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['fight-techniques', q], () => fight.techniques({ q: q || undefined }));
    const { data: matrix } = useSWR('fight-matrix', () => fight.matrix());
    const cells: CoverageCell[] = (matrix?.tactics ?? []).map((t) => ({
        id: t.mitreId, name: t.name,
        count: (matrix?.techniques ?? []).filter((x) => (x.tacticIds ?? []).includes(t.mitreId)).length,
    }));
    return (
        <div className="space-y-3">
            <CoverageHeatmap title="FiGHT coverage · 5G" sub={`${cells.length} tactics · ${(matrix?.techniques ?? []).length} techniques`} icon={<GridIcon className="size-4" />} cells={cells} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter 5G techniques (name, FGT id, BLUF)…" className="max-w-md" />
            {isLoading && <Skeleton className="h-64 w-full" />}
            {data && (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-28">FiGHT ID</TableHead>
                                    <TableHead>Technique</TableHead>
                                    <TableHead className="w-32">Segment</TableHead>
                                    <TableHead className="w-28">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((t) => (
                                    <TableRow key={t.fightId}>
                                        <TableCell className="font-mono text-xs">{t.fightId}</TableCell>
                                        <TableCell className="wrap-break-word">{t.name}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{t.architectureSegment || '—'}</TableCell>
                                        <TableCell><Badge variant={statusTone(t.status)}>{t.status || 'unknown'}</Badge></TableCell>
                                    </TableRow>
                                ))}
                                {data.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No techniques — run the FiGHT ingest (POST /v1/ops/frameworks/sync).</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
            {data && <p className="text-xs text-muted-foreground">{data.length} technique{data.length === 1 ? '' : 's'}</p>}
        </div>
    );
}

function AtlasTab() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['atlas-techniques', q], () => atlas.techniques({ q: q || undefined }));
    const { data: matrix } = useSWR('atlas-matrix', () => atlas.matrix());
    const cells: CoverageCell[] = (matrix?.tactics ?? []).map((t) => ({
        id: t.atlasId, name: t.name,
        count: (matrix?.techniques ?? []).filter((x) => (x.tacticIds ?? []).includes(t.atlasId)).length,
    }));
    return (
        <div className="space-y-3">
            <CoverageHeatmap title="ATLAS coverage · AI" sub={`${cells.length} tactics · ${(matrix?.techniques ?? []).length} techniques`} icon={<GridIcon className="size-4" />} cells={cells} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter AI techniques (name, AML id)…" className="max-w-md" />
            {isLoading && <Skeleton className="h-64 w-full" />}
            {data && (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-36">ATLAS ID</TableHead>
                                    <TableHead>Technique</TableHead>
                                    <TableHead className="w-32">ATT&amp;CK ref</TableHead>
                                    <TableHead className="w-32">Maturity</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((t) => (
                                    <TableRow key={t.atlasId}>
                                        <TableCell className="font-mono text-xs">{t.atlasId}</TableCell>
                                        <TableCell className="wrap-break-word">{t.name}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{t.attackReferenceId || '—'}</TableCell>
                                        <TableCell><Badge variant={statusTone(t.maturity)}>{t.maturity || 'unknown'}</Badge></TableCell>
                                    </TableRow>
                                ))}
                                {data.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No techniques — run the ATLAS ingest (POST /v1/ops/frameworks/sync).</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
            {data && <p className="text-xs text-muted-foreground">{data.length} technique{data.length === 1 ? '' : 's'}</p>}
        </div>
    );
}

export default function FrameworksPage() {
    return (
        <div className="min-w-0 space-y-6">
            <div>
                <h1 className="text-xl font-semibold">Frameworks</h1>
                <p className="text-sm text-muted-foreground">
                    MITRE FiGHT (5G/telco) and ATLAS (AI) — the threat matrices beside ATT&amp;CK. The Hunt agent reasons over these in the graph.
                </p>
            </div>
            <Tabs defaultValue="fight">
                <TabsList>
                    <TabsTrigger value="fight">FiGHT · 5G</TabsTrigger>
                    <TabsTrigger value="atlas">ATLAS · AI</TabsTrigger>
                </TabsList>
                <TabsContent value="fight" className="mt-4"><FightTab /></TabsContent>
                <TabsContent value="atlas" className="mt-4"><AtlasTab /></TabsContent>
            </Tabs>
        </div>
    );
}
