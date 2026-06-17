'use client';

/**
 * AI incidents — the AI-threat-landscape vertical (AI Incident Database feed).
 *
 * Real-world AI harm/failure incidents from incidentdatabase.ai: the live
 * "what's actually going wrong with deployed AI" signal that complements the
 * static MITRE ATLAS technique taxonomy on /frameworks. Stats header carries
 * the "incidents over time" trend + the top alleged developers (movers); the
 * table is the browsable corpus.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { aiIncidents, type AiIncident } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function Timeline() {
    const { data, isLoading } = useSWR('ai:stats', () => aiIncidents.stats(24));
    if (isLoading) return <Skeleton className="h-40 w-full" />;
    if (!data) return null;
    const max = Math.max(1, ...data.timeline.map((t) => t.count));
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Incidents over time</CardTitle>
                    <p className="text-xs text-muted-foreground">{data.total} total · monthly, last 24 months</p>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-0.5 h-28">
                        {data.timeline.map((t) => (
                            <div key={t.month} className="flex-1 min-w-0 group relative" title={`${t.month}: ${t.count}`}>
                                <div
                                    className="bg-brand rounded-sm transition-opacity group-hover:opacity-80"
                                    style={{ height: `${Math.max(4, (t.count / max) * 100)}%` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>{data.timeline[0]?.month}</span>
                        <span>{data.timeline[data.timeline.length - 1]?.month}</span>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Top alleged developers</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                    {data.topDevelopers.slice(0, 8).map((d) => (
                        <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate wrap-break-word">{d.name}</span>
                            <Badge variant="secondary" className="shrink-0">{d.count}</Badge>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

function fmtList(xs: string[], n = 2): string {
    if (xs.length === 0) return '—';
    return xs.slice(0, n).join(', ') + (xs.length > n ? ` +${xs.length - n}` : '');
}

export default function AiIncidentsPage() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['ai:list', q], () => aiIncidents.list({ q: q || undefined, limit: 200 }));

    return (
        <div className="min-w-0 space-y-6">
            <div>
                <h1 className="text-xl font-semibold">AI incidents</h1>
                <p className="text-sm text-muted-foreground">
                    Real-world AI harm/failure incidents from the AI Incident Database — the live AI-threat-landscape signal alongside the MITRE ATLAS taxonomy.
                </p>
            </div>

            <Timeline />

            <div className="space-y-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter incidents by title…" className="max-w-md" />
                {isLoading && <Skeleton className="h-64 w-full" />}
                {data && (
                    <Card><CardContent className="p-0"><Table>
                        <TableHeader><TableRow>
                            <TableHead className="w-20">ID</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead className="w-28">Date</TableHead>
                            <TableHead className="w-44">Developers</TableHead>
                            <TableHead className="w-16">Reports</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {data.map((r: AiIncident) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-mono text-xs">
                                        <a href={r.url ?? '#'} target="_blank" rel="noreferrer" className="text-brand hover:underline">#{r.incidentId}</a>
                                    </TableCell>
                                    <TableCell className="wrap-break-word">{r.title}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{r.incidentDate || '—'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground wrap-break-word">{fmtList(r.developers)}</TableCell>
                                    <TableCell><Badge variant="outline">{r.reportCount}</Badge></TableCell>
                                </TableRow>
                            ))}
                            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No incidents.</TableCell></TableRow>}
                        </TableBody>
                    </Table></CardContent></Card>
                )}
                {data && <p className="text-xs text-muted-foreground">{data.length} incident{data.length === 1 ? '' : 's'} shown</p>}
            </div>
        </div>
    );
}
