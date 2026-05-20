'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { platform } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const fmt = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('en-US');

export default function OverviewPage() {
    const { data: stats, isLoading: statsLoading } = useSWR('overview:stats', () => platform.stats());
    const { data: health } = useSWR('overview:health', () => platform.health());
    const { data: coverage } = useSWR('overview:mitre', () => platform.mitreCoverage());
    const { data: actors } = useSWR('overview:actors', () => platform.activeActors(6));

    const healthList = Object.entries(health?.services ?? {});
    const upCount = healthList.filter(([, v]) =>
        ['healthy', 'up', 'connected', 'green', 'online'].includes((v?.status ?? '').toLowerCase()),
    ).length;
    const allUp = healthList.length > 0 && upCount === healthList.length;

    const counts = stats?.counts;
    const tactics = coverage?.tactics ?? [];
    const maxCount = tactics.reduce((m, t) => Math.max(m, t.techniqueCount), 1);

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Threat overview</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Indicators, vulnerabilities, threat actor activity and ATT&amp;CK coverage from your sources.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`inline-block size-1.5 rounded-full ${allUp ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {healthList.length === 0 ? 'connecting' : `${upCount}/${healthList.length} services healthy`}
                    </span>
                </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Indicators" value={fmt(counts?.iocs)} href="/iocs" loading={statsLoading} />
                <KpiCard label="Vulnerabilities" value={fmt(counts?.vulnerabilities)} href="/vulnerabilities" loading={statsLoading} />
                <KpiCard label="Threat actors" value={fmt(counts?.threatActors)} href="/actors" loading={statsLoading} />
                <KpiCard label="Active feeds" value={fmt(counts?.pulses)} href="/feeds" loading={statsLoading} />
            </div>

            {/* MITRE coverage + actor watchlist */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">ATT&CK coverage</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!coverage ? (
                            <div className="space-y-2">
                                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5" />)}
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {tactics.slice(0, 8).map(t => (
                                    <div key={t.mitreId} className="flex items-center gap-3 text-sm">
                                        <span className="text-xs font-mono text-muted-foreground w-14 shrink-0">
                                            {t.mitreId}
                                        </span>
                                        <span className="flex-1 truncate">{t.name}</span>
                                        <div className="w-20 h-1 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full bg-primary"
                                                 style={{ width: `${(t.techniqueCount / maxCount) * 100}%` }} />
                                        </div>
                                        <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                                            {t.techniqueCount}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Threat actor watchlist</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        {!actors ? (
                            <div className="space-y-2 px-6">
                                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
                            </div>
                        ) : actors.actors.length === 0 ? (
                            <p className="text-sm text-muted-foreground px-6">No active actors.</p>
                        ) : (
                            <div className="divide-y">
                                {actors.actors.slice(0, 6).map(a => (
                                    <Link
                                        key={a.id}
                                        href={`/actors/${a.id}`}
                                        className="grid grid-cols-[1fr_60px_100px] gap-3 items-center px-6 py-2.5 hover:bg-accent transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">{a.name}</div>
                                            {a.aliases.length > 0 && (
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                    aka {a.aliases.slice(0, 2).join(' · ')}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-xs font-mono text-muted-foreground">
                                            {a.country ? a.country.slice(0, 3).toUpperCase() : '—'}
                                        </span>
                                        <Badge variant="outline" className="text-[10px] capitalize w-fit justify-self-end">
                                            {a.sophistication ?? '—'}
                                        </Badge>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function KpiCard({
    label, value, href, loading,
}: { label: string; value: string; href: string; loading?: boolean }) {
    const body = (
        <Card className="hover:border-foreground/20 transition-colors h-full">
            <CardContent className="py-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    {label}
                </p>
                {loading ? (
                    <Skeleton className="h-8 w-24" />
                ) : (
                    <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
                )}
            </CardContent>
        </Card>
    );
    return <Link href={href} className="block">{body}</Link>;
}
