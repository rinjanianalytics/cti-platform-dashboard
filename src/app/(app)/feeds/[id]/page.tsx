'use client';

import { use } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { pulses } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { relTime } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { SimilarPanel } from '@/components/similar-panel';
import { EntityDescription } from '@/components/entity-description';

const TLP_TONE: Record<string, string> = {
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'amber+strict': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    white: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    clear: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function FeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const decoded = decodeURIComponent(id);
    const { data, isLoading } = useSWR(['pulse', decoded], () => pulses.get(decoded));

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
                <p className="text-sm text-muted-foreground">Feed not found.</p>
                <Link href="/feeds" className="text-sm underline mt-2 inline-block">Back to feeds</Link>
            </div>
        );
    }

    const pulse = data;
    const tags = pulse.tags ?? [];
    const countries = pulse.targetedCountries ?? [];
    const industries = pulse.industries ?? [];
    const relatedIOCs = pulse.relatedIOCs ?? [];
    const tlp = pulse.tlp?.toLowerCase();

    return (
        <div className="space-y-6">
            <div>
                <Link href="/feeds" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-3.5" /> Feeds
                </Link>
                <div className="mt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-3xl font-semibold tracking-tight">{pulse.name}</h1>
                        {tlp && (
                            <Badge variant="outline" className={`font-mono text-[10px] uppercase ${TLP_TONE[tlp] ?? ''}`}>
                                {tlp}
                            </Badge>
                        )}
                    </div>
                    {pulse.author && (
                        <p className="text-xs text-muted-foreground mt-1">
                            by <span className="font-medium text-foreground">{pulse.author}</span>
                            {pulse.otxModified && <> · updated {relTime(pulse.otxModified)}</>}
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EntityDescription text={pulse.description} emptyText="No description." />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Targeting</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <FieldRow label="IOCs" value={
                            <span className="font-mono tabular-nums">
                                {pulse.indicatorCount?.toLocaleString() ?? relatedIOCs.length.toLocaleString()}
                            </span>
                        } />
                        <FieldRow label="Tags" value={
                            tags.length === 0 ? '—' : (
                                <div className="flex flex-wrap gap-1">
                                    {tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                                </div>
                            )
                        } />
                        <FieldRow label="Industries" value={
                            industries.length === 0 ? '—' : industries.join(', ')
                        } />
                        <FieldRow label="Countries" value={
                            countries.length === 0 ? '—' : countries.join(', ')
                        } />
                        <FieldRow label="Created" value={pulse.otxCreated ? new Date(pulse.otxCreated).toLocaleDateString() : '—'} />
                    </CardContent>
                </Card>
            </div>

            <SimilarPanel docId={pulse.id} type="pulse" />

            {relatedIOCs.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Linked indicators ({relatedIOCs.length.toLocaleString()})</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="w-20">Type</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="w-28">Severity</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {relatedIOCs.slice(0, 100).map(ioc => <IocRow key={ioc.id} ioc={ioc} />)}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function IocRow({ ioc }: { ioc: { id: string; type: string; value: string; severity: string | null } }) {
    const router = useRouter();
    return (
        <TableRow
            className="cursor-pointer hover:bg-accent/40"
            onClick={() => router.push(`/iocs/${ioc.id}`)}
        >
            <TableCell className="text-xs text-muted-foreground uppercase tracking-wider">{ioc.type}</TableCell>
            <TableCell className="font-mono text-sm truncate max-w-120">{ioc.value}</TableCell>
            <TableCell>
                {ioc.severity ? (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">{ioc.severity}</Badge>
                ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                )}
            </TableCell>
        </TableRow>
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
