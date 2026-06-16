'use client';

/**
 * Telco — the 5G/telco entity layer (B1): network elements, signaling
 * interfaces, fraud schemes. The signaling-and-fraud substrate the Hunt agent
 * traverses (fraud scheme → signaling interface → cashout wallet).
 */

import { useState } from 'react';
import useSWR from 'swr';
import { telco } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function Filter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="max-w-md" />;
}

function NetworkElements() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['ne', q], () => telco.networkElements(q || undefined));
    return (
        <div className="space-y-3">
            <Filter value={q} onChange={setQ} placeholder="Filter network elements…" />
            {isLoading && <Skeleton className="h-48 w-full" />}
            {data && (
                <Card><CardContent className="p-0"><Table>
                    <TableHeader><TableRow>
                        <TableHead className="w-56">Ref</TableHead><TableHead>Name</TableHead>
                        <TableHead className="w-28">Type</TableHead><TableHead className="w-28">Segment</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {data.map((r) => (
                            <TableRow key={r.refId}>
                                <TableCell className="font-mono text-xs wrap-break-word">{r.refId}</TableCell>
                                <TableCell className="wrap-break-word">{r.name}</TableCell>
                                <TableCell><Badge variant="secondary">{r.elementType}</Badge></TableCell>
                                <TableCell className="text-xs text-muted-foreground">{r.architectureSegment || '—'}</TableCell>
                            </TableRow>
                        ))}
                        {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No network elements.</TableCell></TableRow>}
                    </TableBody>
                </Table></CardContent></Card>
            )}
        </div>
    );
}

function SignalingInterfaces() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['si', q], () => telco.signalingInterfaces(q || undefined));
    return (
        <div className="space-y-3">
            <Filter value={q} onChange={setQ} placeholder="Filter signaling interfaces…" />
            {isLoading && <Skeleton className="h-48 w-full" />}
            {data && (
                <Card><CardContent className="p-0"><Table>
                    <TableHeader><TableRow>
                        <TableHead className="w-56">Ref</TableHead><TableHead>Name</TableHead>
                        <TableHead className="w-28">Protocol</TableHead><TableHead className="w-32">Reference pt</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {data.map((r) => (
                            <TableRow key={r.refId}>
                                <TableCell className="font-mono text-xs wrap-break-word">{r.refId}</TableCell>
                                <TableCell className="wrap-break-word">{r.name}</TableCell>
                                <TableCell><Badge variant="secondary">{r.protocol}</Badge></TableCell>
                                <TableCell className="text-xs text-muted-foreground">{r.referencePoint || '—'}</TableCell>
                            </TableRow>
                        ))}
                        {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No signaling interfaces.</TableCell></TableRow>}
                    </TableBody>
                </Table></CardContent></Card>
            )}
        </div>
    );
}

function FraudSchemes() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['fs', q], () => telco.fraudSchemes(q || undefined));
    return (
        <div className="space-y-3">
            <Filter value={q} onChange={setQ} placeholder="Filter fraud schemes…" />
            {isLoading && <Skeleton className="h-48 w-full" />}
            {data && (
                <Card><CardContent className="p-0"><Table>
                    <TableHeader><TableRow>
                        <TableHead className="w-48">Ref</TableHead><TableHead>Name</TableHead>
                        <TableHead className="w-28">Type</TableHead><TableHead className="w-40">GSMA FS</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {data.map((r) => (
                            <TableRow key={r.refId}>
                                <TableCell className="font-mono text-xs wrap-break-word">{r.refId}</TableCell>
                                <TableCell className="wrap-break-word">{r.name}</TableCell>
                                <TableCell><Badge variant="secondary">{r.schemeType}</Badge></TableCell>
                                <TableCell className="space-x-1">
                                    {(r.gsmaFsCategories ?? []).map((g) => <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>)}
                                    {(r.gsmaFsCategories ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                            </TableRow>
                        ))}
                        {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No fraud schemes.</TableCell></TableRow>}
                    </TableBody>
                </Table></CardContent></Card>
            )}
        </div>
    );
}

export default function TelcoPage() {
    return (
        <div className="min-w-0 space-y-6">
            <div>
                <h1 className="text-xl font-semibold">Telco</h1>
                <p className="text-sm text-muted-foreground">
                    The 5G/telco entity layer — network elements, signaling interfaces, and fraud schemes the Hunt agent traverses.
                </p>
            </div>
            <Tabs defaultValue="fraud">
                <TabsList>
                    <TabsTrigger value="fraud">Fraud schemes</TabsTrigger>
                    <TabsTrigger value="signaling">Signaling</TabsTrigger>
                    <TabsTrigger value="elements">Network elements</TabsTrigger>
                </TabsList>
                <TabsContent value="fraud" className="mt-4"><FraudSchemes /></TabsContent>
                <TabsContent value="signaling" className="mt-4"><SignalingInterfaces /></TabsContent>
                <TabsContent value="elements" className="mt-4"><NetworkElements /></TabsContent>
            </Tabs>
        </div>
    );
}
