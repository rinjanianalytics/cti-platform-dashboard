'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { platform } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame, AlertCircle, CheckCircle2, MinusCircle } from 'lucide-react';
import { cn, severityTone, relTime } from '@/lib/utils';

const fmt = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('en-US');

export default function OverviewPage() {
    const { data: stats } = useSWR('overview:stats', () => platform.stats());
    const { data: health } = useSWR('overview:health', () => platform.health());
    const { data: coverage } = useSWR('overview:mitre', () => platform.mitreCoverage());
    const { data: actors } = useSWR('overview:actors', () => platform.activeActors(6));
    const { data: landscape } = useSWR('overview:landscape', () => platform.landscape());
    const { data: tags } = useSWR('overview:trending', () => platform.trendingTags());
    const { data: feeds } = useSWR('overview:feeds', () => platform.feedMonitoring());

    const healthList = Object.entries(health?.services ?? {});
    const upCount = healthList.filter(([, v]) =>
        ['healthy', 'up', 'connected', 'green', 'online'].includes((v?.status ?? '').toLowerCase()),
    ).length;
    const allUp = healthList.length > 0 && upCount === healthList.length;

    const counts = stats?.counts;
    const tactics = coverage?.tactics ?? [];
    const maxTacticCount = tactics.reduce((m, t) => Math.max(m, t.techniqueCount), 1);

    const iocTypes = landscape?.iocTypeDistribution ?? [];
    const maxTypeCount = iocTypes.reduce((m, t) => Math.max(m, t.count), 1);

    const sevDist = landscape?.severityDistribution ?? [];
    const sevTotal = sevDist.reduce((s, x) => s + x.count, 0);

    const topSources = landscape?.topSources ?? [];
    const maxSourceCount = topSources.reduce((m, s) => Math.max(m, s.count), 1);

    const feedList = feeds?.feeds ?? [];

    return (
        <div className="space-y-4">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Threat overview</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Live snapshot · {landscape?.period ?? '7d'} window
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn('inline-block size-1.5 rounded-full', allUp ? 'bg-emerald-500' : 'bg-amber-500')} />
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                        {healthList.length === 0 ? 'connecting' : `${upCount}/${healthList.length} services healthy`}
                    </span>
                </div>
            </div>

            {/* ── KPI strip — compact, single row ────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-md overflow-hidden border">
                <KpiCell label="Indicators" value={fmt(counts?.iocs)} href="/iocs"
                    sub={landscape ? `${fmt(landscape.iocs.high)} high · ${fmt(landscape.iocs.critical)} crit` : undefined} />
                <KpiCell label="Vulnerabilities" value={fmt(counts?.vulnerabilities)} href="/vulnerabilities"
                    sub={landscape ? `${fmt(landscape.vulnerabilities.high)} high · ${fmt(landscape.vulnerabilities.critical)} crit` : undefined} />
                <KpiCell label="Threat actors" value={fmt(counts?.threatActors)} href="/actors"
                    sub={actors ? `${actors.actors.length} active this week` : undefined} />
                <KpiCell label="Active feeds" value={fmt(feedList.length || counts?.pulses)} href="/feeds"
                    sub={feedList.length > 0 ? `${feedList.filter(f => f.health === 'healthy').length} healthy` : undefined} />
            </div>

            {/* ── Row 1: Type + Severity distribution ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Indicator type distribution" subtitle={landscape ? `${fmt(landscape.iocs.total)} total` : undefined}>
                    {iocTypes.length === 0 ? (
                        <SkeletonRows />
                    ) : (
                        <div className="space-y-1.5 motion-enter">
                            {iocTypes.map(t => (
                                <BarRow
                                    key={t.type}
                                    label={t.type}
                                    count={t.count}
                                    max={maxTypeCount}
                                    href={`/iocs?type=${encodeURIComponent(t.type)}`}
                                />
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Severity distribution" subtitle={sevTotal ? `${fmt(sevTotal)} indicators` : undefined}>
                    {sevDist.length === 0 ? (
                        <SkeletonRows />
                    ) : (
                        <div className="space-y-1.5 motion-enter">
                            {sevDist
                                .slice()
                                .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
                                .map(s => (
                                    <BarRow
                                        key={s.severity ?? 'unscored'}
                                        label={s.severity ?? 'unscored'}
                                        count={s.count}
                                        max={sevTotal}
                                        href={`/iocs?severity=${encodeURIComponent(s.severity ?? '')}`}
                                        tone={severityTone(s.severity)}
                                    />
                                ))}
                        </div>
                    )}
                </Panel>
            </div>

            {/* ── Row 2: ATT&CK / Tags / Actor watchlist (3-up) ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Panel title="ATT&CK coverage" subtitle={coverage ? `${tactics.length} tactics · ${coverage.totalTechniques} techniques` : undefined}>
                    {!coverage ? (
                        <SkeletonRows count={8} />
                    ) : (
                        <div className="space-y-1.5 motion-enter">
                            {tactics.slice(0, 8).map(t => (
                                <div key={t.mitreId} className="grid grid-cols-[42px_1fr_28px] sm:grid-cols-[44px_1fr_60px_28px] gap-2 items-center text-[12px]">
                                    <span className="font-mono text-[10px] text-muted-foreground">{t.mitreId}</span>
                                    <span className="truncate">{t.name}</span>
                                    {/* Desktop-only inline bar; mobile drops it to keep the
                                        name readable in the tight column. */}
                                    <div className="hidden sm:block h-1 rounded-full bg-muted overflow-hidden">
                                        <div className="h-full bg-foreground/70" style={{ width: `${(t.techniqueCount / maxTacticCount) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground tabular-nums text-right">{t.techniqueCount}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Trending tags" subtitle={tags ? `${tags.length} tags` : undefined}>
                    {!tags ? (
                        <SkeletonRows count={8} />
                    ) : tags.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tags surfaced yet.</p>
                    ) : (
                        <div className="space-y-1 motion-enter">
                            {tags.slice(0, 8).map(t => (
                                <Link
                                    key={t.tag}
                                    href={`/iocs?q=${encodeURIComponent(t.tag)}`}
                                    className="flex items-center justify-between gap-2 px-1 py-1 -mx-1 rounded hover:bg-accent/50 transition-colors"
                                >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        {t.hot && <Flame className="size-3 text-brand shrink-0" />}
                                        <span className="text-[12px] truncate font-mono">{t.tag}</span>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{fmt(t.count)}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Threat actor watchlist" subtitle={actors ? `${actors.actors.length} updated recently` : undefined}>
                    {!actors ? (
                        <SkeletonRows count={6} />
                    ) : actors.actors.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No active actors.</p>
                    ) : (
                        <div className="divide-y motion-enter -mx-3">
                            {actors.actors.slice(0, 6).map(a => (
                                <Link
                                    key={a.id}
                                    href={`/actors/${a.id}`}
                                    className="grid grid-cols-[1fr_42px_72px] gap-2 items-center px-3 py-1.5 hover:bg-accent/50 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <div className="text-[12px] font-medium truncate">{a.name}</div>
                                        {a.aliases.length > 0 && (
                                            <div className="text-[10px] text-muted-foreground truncate">
                                                aka {a.aliases.slice(0, 2).join(' · ')}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                        {a.country ? a.country.slice(0, 3).toUpperCase() : '—'}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] capitalize justify-self-end">
                                        {a.sophistication ?? '—'}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            {/* ── Row 3: Sources + Feed health (2-up wide) ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <Panel title="Top sources" className="lg:col-span-2" subtitle="By indicator volume">
                    {topSources.length === 0 ? (
                        <SkeletonRows count={4} />
                    ) : (
                        <div className="space-y-1.5 motion-enter">
                            {topSources.slice(0, 6).map(s => (
                                <BarRow
                                    key={s.source}
                                    label={s.source}
                                    count={s.count}
                                    max={maxSourceCount}
                                    href={`/iocs?source=${encodeURIComponent(s.source)}`}
                                    barTone="bg-blue-500/70"
                                />
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Feed health" subtitle={feedList.length ? `${feedList.length} ingesting sources` : undefined} className="lg:col-span-3">
                    {feedList.length === 0 ? (
                        <SkeletonRows count={6} />
                    ) : (
                        <div className="divide-y motion-enter -mx-3 max-h-[260px] overflow-y-auto">
                            {feedList.map(f => <FeedRow key={f.feed} feed={f} />)}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function Panel({
    title, subtitle, children, className,
}: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
    return (
        <Card className={cn('overflow-hidden', className)}>
            <CardHeader className="pb-2 pt-3 px-3 flex-row items-baseline justify-between">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {title}
                </CardTitle>
                {subtitle && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{subtitle}</span>
                )}
            </CardHeader>
            <CardContent className="pt-1 pb-3 px-3">{children}</CardContent>
        </Card>
    );
}

function KpiCell({
    label, value, href, sub,
}: { label: string; value: string; href: string; sub?: string }) {
    return (
        <Link href={href} className="bg-card hover:bg-accent/30 transition-colors px-4 py-3 block">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {label}
            </p>
            <p key={value} className="text-2xl font-semibold tracking-tight tabular-nums mt-1 motion-enter">{value}</p>
            {sub && (
                <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{sub}</p>
            )}
        </Link>
    );
}

function BarRow({
    label, count, max, href, tone, barTone,
}: { label: string; count: number; max: number; href?: string; tone?: string; barTone?: string }) {
    const pct = max > 0 ? (count / max) * 100 : 0;
    const body = (
        <div className="grid grid-cols-[80px_1fr_44px] sm:grid-cols-[110px_1fr_56px] gap-2 sm:gap-3 items-center text-[12px]">
            <span className={cn('font-mono text-[11px] truncate uppercase tracking-wide', tone)}>{label}</span>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                    className={cn('h-full transition-all', barTone ?? 'bg-foreground/70')}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums text-right">{count.toLocaleString()}</span>
        </div>
    );
    return href ? (
        <Link href={href} className="block px-1 -mx-1 py-0.5 rounded hover:bg-accent/50 transition-colors">
            {body}
        </Link>
    ) : <div className="px-1 -mx-1 py-0.5">{body}</div>;
}

function FeedRow({ feed: f }: { feed: { feed: string; health: string; status: string; lastSync: string | null; itemsProcessed: number; successRate: number } }) {
    const HealthIcon = f.health === 'healthy' ? CheckCircle2 : f.health === 'error' ? AlertCircle : MinusCircle;
    const tone =
        f.health === 'healthy' ? 'text-emerald-500'
        : f.health === 'error' ? 'text-red-500'
        : 'text-amber-500';
    return (
        <div className="grid grid-cols-[16px_1fr_70px_64px] gap-3 items-center px-3 py-1.5 text-[12px]">
            <HealthIcon className={cn('size-3.5 shrink-0', tone)} />
            <span className="font-mono truncate text-[11px]">{f.feed}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums text-right">
                {f.itemsProcessed > 0 ? `${f.itemsProcessed.toLocaleString()} new` : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums text-right">
                {f.lastSync ? relTime(f.lastSync) : '—'}
            </span>
        </div>
    );
}

function SkeletonRows({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-1.5">
            {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-5" />)}
        </div>
    );
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info', 'unscored', null] as const;
function sevRank(s: string | null): number {
    const idx = SEVERITY_ORDER.indexOf(s as typeof SEVERITY_ORDER[number]);
    return idx === -1 ? 99 : SEVERITY_ORDER.length - idx;
}
