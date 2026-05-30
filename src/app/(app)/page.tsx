'use client';

/**
 * Command — the triage-first overview screen.
 *
 * Layout (Command Center spec):
 *   1. Page head    — h1 "Threat Command" + live status + window segmented + feed health chip
 *   2. KPI strip    — Indicators / Vulnerabilities / Threat actors / Active feeds, each with sparkline
 *   3. Row 2 (3-col): Priority triage (spans 2) + Severity distribution
 *   4. Row 3 (3-col): Indicator types + ATT&CK coverage heatmap + Trending tags
 *   5. Row 4 (2-col): Actor watchlist + Latest intel pulses
 *
 * Data sources:
 *   - platform.stats / landscape / sparklines / mitreCoverage
 *   - platform.activeActors / trendingTags / feedMonitoring
 *   - iocs.list (priority triage placeholder — top critical IOCs as
 *     stand-in for the real events stream; flagged for Phase 2)
 *   - pulses.list (latest intel)
 */

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import {
    platform, iocs, pulses as pulsesApi,
} from '@/lib/api';
import {
    Bolt, ShieldAlert, Crosshair, Grid as GridIcon, Flame, Zap,
    ArrowUp, ArrowDown, ChevronRight,
} from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { Sparkline, type SparklineTone } from '@/components/sparkline';
import { Sev, normalizeSeverity, SEV_RANK, type Severity } from '@/components/cc/sev';
import { StatusDot } from '@/components/cc/status-dot';
import { PanelHead } from '@/components/cc/panel-head';
import { Segmented } from '@/components/cc/segmented';

const fmt = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('en-US');

type WindowKey = '24H' | '7D' | '30D';

const WINDOW_OPTIONS = [
    { value: '24H', label: '24H' },
    { value: '7D',  label: '7D'  },
    { value: '30D', label: '30D' },
] as const;

const SEV_BAR_BG: Record<Severity, string> = {
    crit: 'bg-sev-crit',
    high: 'bg-sev-high',
    med:  'bg-sev-med',
    low:  'bg-sev-low',
    info: 'bg-sev-info',
};

export default function CommandPage() {
    const [windowSel, setWindowSel] = useState<WindowKey>('7D');

    const { data: stats }     = useSWR('cc:stats',     () => platform.stats());
    const { data: landscape } = useSWR('cc:landscape', () => platform.landscape());
    const { data: sparks }    = useSWR('cc:sparks',    () => platform.sparklines(7), { refreshInterval: 60_000 });
    const { data: coverage }  = useSWR('cc:mitre',     () => platform.mitreCoverage());
    const { data: actors }    = useSWR('cc:actors',    () => platform.activeActors(6));
    const { data: trending }  = useSWR('cc:trending',  () => platform.trendingTags());
    const { data: feeds }     = useSWR('cc:feeds',     () => platform.feedMonitoring());
    const { data: pulses }    = useSWR('cc:pulses',    () => pulsesApi.list({ pageSize: 5 }));
    const { data: triage }    = useSWR('cc:triage',    () => iocs.list({ severity: 'critical', pageSize: 5 }));

    const feedList = feeds?.feeds ?? [];
    const feedHealthy   = feedList.filter(f => f.health === 'healthy').length;
    const feedDegraded  = feedList.filter(f => f.health === 'warning').length;
    const feedDown      = feedList.filter(f => f.health === 'error').length;
    const feedHealthDot = feedDown ? 'down' : feedDegraded ? 'warn' : 'ok';
    const feedHealthLabel =
        feedDown      ? `${feedHealthy}/${feedList.length} up · ${feedDown} down`
      : feedDegraded  ? `${feedHealthy}/${feedList.length} up · ${feedDegraded} degraded`
                      : `${feedHealthy} feeds healthy`;

    return (
        <div className="space-y-3 motion-enter">
            {/* ── Page head ────────────────────────────────────────────── */}
            <header className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h-page">Threat Command</h1>
                    <div className="sub flex items-center gap-1.5 mt-1">
                        <StatusDot status="ok" live />
                        Live snapshot · rolling {windowSel === '24H' ? '24-hour' : windowSel === '30D' ? '30-day' : '7-day'} window
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Segmented<WindowKey>
                        options={WINDOW_OPTIONS}
                        value={windowSel}
                        onChange={setWindowSel}
                    />
                    {feedList.length > 0 && (
                        <Link
                            href="/feeds"
                            className="flex items-center gap-2 px-2.5 h-7 rounded-md border border-line-soft bg-bg-1 hover:bg-bg-2 transition-colors text-[11px]"
                            title="Feed health"
                        >
                            <StatusDot status={feedHealthDot} />
                            <span className="text-text-2 tabular-nums">{feedHealthLabel}</span>
                        </Link>
                    )}
                </div>
            </header>

            {/* ── KPI strip ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile
                    href="/iocs"
                    eyebrow="Indicators"
                    value={stats?.counts.iocs}
                    sparkData={sparks?.iocs}
                    sparkTone="brand"
                    delta={deltaPct(sparks?.iocs)}
                    sub={landscape
                        ? `${fmt(landscape.iocs.high)} high · ${fmt(landscape.iocs.critical)} crit`
                        : undefined}
                />
                <KpiTile
                    href="/vulnerabilities"
                    eyebrow="Vulnerabilities"
                    value={stats?.counts.vulnerabilities}
                    sparkData={sparks?.vulnerabilities}
                    sparkTone="sev-high"
                    delta={deltaPct(sparks?.vulnerabilities)}
                    sub={landscape
                        ? `${fmt(landscape.vulnerabilities.high)} high · ${fmt(landscape.vulnerabilities.critical)} crit`
                        : undefined}
                />
                <KpiTile
                    href="/actors"
                    eyebrow="Threat actors"
                    value={stats?.counts.threatActors}
                    sparkData={sparks?.threatActors}
                    sparkTone="sev-info"
                    delta={deltaPct(sparks?.threatActors)}
                    sub={actors ? `${actors.actors.length} active this week` : undefined}
                />
                <KpiTile
                    href="/feeds"
                    eyebrow="Active feeds"
                    value={feedList.length || undefined}
                    sparkData={sparks?.feedSyncs}
                    sparkTone="ok"
                    delta={deltaPct(sparks?.feedSyncs)}
                    sub={feedList.length > 0 ? `${feedHealthy} healthy` : undefined}
                />
            </div>

            {/* ── Row 2: Triage + Severity ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2">
                    <TriagePanel triage={triage?.items ?? []} />
                </div>
                <SeverityPanel landscape={landscape ?? null} />
            </div>

            {/* ── Row 3: Types · ATT&CK · Trending ─────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.15fr_1fr] gap-3">
                <IndicatorTypesPanel
                    types={landscape?.iocTypeDistribution ?? []}
                    total={landscape?.iocs.total ?? 0}
                />
                <AttackHeatmap tactics={coverage?.tactics ?? []} />
                <TrendingTagsPanel tags={trending ?? []} />
            </div>

            {/* ── Row 4: Watchlist + Latest pulses ─────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ActorWatchlistPanel actors={actors?.actors ?? []} />
                <LatestPulsesPanel pulses={pulses?.items ?? []} />
            </div>
        </div>
    );
}

/* ============================================================================
   KPI tile — eyebrow, delta chip, big number, sparkline, sub line.
   ========================================================================= */

function KpiTile({
    href, eyebrow, value, sparkData, sparkTone, delta, sub,
}: {
    href: string;
    eyebrow: string;
    value: number | null | undefined;
    sparkData?: number[];
    sparkTone: SparklineTone;
    delta: { sign: 'up' | 'down' | 'flat'; pct: number } | null;
    sub?: string;
}) {
    return (
        <Link
            href={href}
            className="panel panel-pad flex flex-col gap-2 hover:bg-bg-2 transition-colors"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="eyebrow">{eyebrow}</span>
                {delta && delta.sign !== 'flat' && (
                    <span
                        className={cn(
                            'inline-flex items-center gap-0.5 font-mono text-[10.5px] tnum px-1.5 py-0.5 rounded',
                            delta.sign === 'up'
                                ? 'text-ok bg-[oklch(from_var(--ok)_l_c_h_/_0.12)]'
                                : 'text-sev-high bg-sev-high-soft',
                        )}
                    >
                        {delta.sign === 'up' ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
                        {delta.pct.toFixed(1)}%
                    </span>
                )}
            </div>
            <div className="flex items-end justify-between gap-3 min-w-0">
                <div className="font-mono text-[28px] leading-none font-semibold tnum truncate">
                    {fmt(value ?? null)}
                </div>
                {sparkData && (
                    <Sparkline data={sparkData} tone={sparkTone} variant="gradient" width={78} height={30} />
                )}
            </div>
            {sub && <div className="text-[12px] text-text-3 truncate">{sub}</div>}
        </Link>
    );
}

/** Naive delta as (last bucket vs avg of preceding) for the KPI chip. */
function deltaPct(series: number[] | undefined): { sign: 'up' | 'down' | 'flat'; pct: number } | null {
    if (!series || series.length < 2) return null;
    const last = series[series.length - 1];
    const priorSlice = series.slice(0, -1);
    const priorAvg = priorSlice.reduce((s, x) => s + x, 0) / Math.max(priorSlice.length, 1);
    if (priorAvg === 0 && last === 0) return { sign: 'flat', pct: 0 };
    if (priorAvg === 0) return { sign: 'up', pct: 100 };
    const pct = ((last - priorAvg) / priorAvg) * 100;
    if (Math.abs(pct) < 0.5) return { sign: 'flat', pct: 0 };
    return { sign: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

/* ============================================================================
   Priority triage — items needing an analyst decision now.
   Phase 1 uses critical IOCs as a stand-in; real events/alerts stream
   wiring lands in Phase 3 (per the design brief).
   ========================================================================= */

type TriageIoc = Awaited<ReturnType<typeof iocs.list>>['items'][number];

function TriagePanel({ triage }: { triage: TriageIoc[] }) {
    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<Bolt className="size-4" />}
                title="Priority triage"
                sub={`${triage.length} items need an analyst decision`}
                right={
                    <Link href="/iocs?severity=critical" className="text-[12px] text-text-3 hover:text-text inline-flex items-center gap-0.5">
                        View queue <ChevronRight className="size-3" />
                    </Link>
                }
            />
            <div className="mt-3 -mx-2">
                {triage.length === 0 ? (
                    <div className="px-2 py-6 text-center text-[12.5px] text-text-3">
                        <StatusDot status="ok" className="mr-2" />
                        Nothing critical right now. Queue clears as analysts assign verdicts.
                    </div>
                ) : (
                    <ul>
                        {triage.map(item => {
                            const sev = normalizeSeverity(item.severity);
                            const dot = sev === 'crit' ? 'down' : sev === 'high' ? 'warn' : 'idle';
                            return (
                                <li key={item.id} className="triage-row group">
                                    <Link
                                        href={`/iocs/${item.id}`}
                                        className="grid grid-cols-[16px_1fr_auto_auto] items-center gap-3 px-2 py-2 rounded hover:bg-bg-2 transition-colors"
                                    >
                                        <StatusDot status={dot} />
                                        <div className="min-w-0">
                                            <div className="font-mono text-[13px] truncate">{item.value}</div>
                                            <div className="text-[11px] text-text-3 flex items-center gap-2 mt-0.5">
                                                <span className="uppercase tracking-wider">{item.type}</span>
                                                <span>·</span>
                                                <span>{item.source}</span>
                                                {item.threatType && <>
                                                    <span>·</span>
                                                    <span className="truncate">{item.threatType}</span>
                                                </>}
                                            </div>
                                        </div>
                                        <Sev level={sev} short />
                                        <span className="text-[11px] text-text-4 font-mono tnum">
                                            {relTime(item.lastSeen ?? item.firstSeen ?? item.createdAt ?? '')}
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ============================================================================
   Severity distribution — spectrum bar + per-severity rows.
   ========================================================================= */

function SeverityPanel({ landscape }: { landscape: Awaited<ReturnType<typeof platform.landscape>> | null }) {
    const dist = landscape?.severityDistribution ?? [];
    const buckets = dist
        .filter(d => d.severity != null)
        .map(d => ({ sev: normalizeSeverity(d.severity), count: d.count }))
        .sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev]);

    const total = buckets.reduce((s, b) => s + b.count, 0);
    const max   = buckets.reduce((m, b) => Math.max(m, b.count), 1);

    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<ShieldAlert className="size-4" />}
                title="Severity distribution"
                sub={`${fmt(total)} active indicators`}
            />
            {/* Stacked spectrum bar */}
            {total > 0 && (
                <div className="mt-3 flex h-2 w-full overflow-hidden rounded">
                    {buckets.map(b => (
                        <div
                            key={b.sev}
                            className={SEV_BAR_BG[b.sev]}
                            style={{ width: `${(b.count / total) * 100}%` }}
                            title={`${b.sev}: ${b.count}`}
                        />
                    ))}
                </div>
            )}
            {/* Per-severity rows */}
            <ul className="mt-3 space-y-1.5">
                {buckets.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No severity data yet.</li>
                ) : buckets.map(b => (
                    <li key={b.sev} className="grid grid-cols-[74px_1fr_auto] items-center gap-2">
                        <Sev level={b.sev} />
                        <div className="h-1.5 bg-bg-3 rounded-full overflow-hidden">
                            <div
                                className={cn('h-full rounded-full', SEV_BAR_BG[b.sev])}
                                style={{ width: `${(b.count / max) * 100}%` }}
                            />
                        </div>
                        <span className="font-mono text-[12px] tnum text-text-2 w-[60px] text-right">
                            {fmt(b.count)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ============================================================================
   Indicator types — horizontal bars with brand gradient.
   ========================================================================= */

function IndicatorTypesPanel({
    types, total,
}: {
    types: Array<{ type: string; count: number }>;
    total: number;
}) {
    const top = types.slice(0, 9);
    const max = top.reduce((m, t) => Math.max(m, t.count), 1);
    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<Crosshair className="size-4" />}
                title="Indicator types"
                sub={total ? `${fmt(total)} indicators` : undefined}
            />
            <ul className="mt-3 space-y-1.5">
                {top.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No data.</li>
                ) : top.map((t, i) => {
                    const opacity = 1 - (i * 0.08);
                    return (
                        <li key={t.type} className="grid grid-cols-[96px_1fr_auto] items-center gap-2">
                            <span className="font-mono text-[11px] uppercase tracking-wider text-text-3 truncate">{t.type}</span>
                            <div className="h-1.5 bg-bg-3 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${(t.count / max) * 100}%`,
                                        background: `linear-gradient(90deg, var(--brand-dim), var(--brand))`,
                                        opacity: Math.max(0.4, opacity),
                                    }}
                                />
                            </div>
                            <span className="font-mono text-[12px] tnum text-text-2 w-[58px] text-right">
                                {fmt(t.count)}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* ============================================================================
   ATT&CK coverage heatmap — 3-col grid of tactic cells.
   Cell background = accent at alpha 0.12 + ratio*0.85.
   When ratio >= 0.5 we switch text to dark ink for contrast on the bright fill.
   ========================================================================= */

function AttackHeatmap({
    tactics,
}: {
    tactics: Array<{ mitreId: string; name: string; shortName: string; techniqueCount: number }>;
}) {
    const max = tactics.reduce((m, t) => Math.max(m, t.techniqueCount), 1);
    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<GridIcon className="size-4" />}
                title="ATT&CK coverage"
                sub={`${tactics.length} tactics tracked`}
            />
            <div className="mt-3 grid grid-cols-3 gap-1.5">
                {tactics.length === 0 ? (
                    <div className="col-span-3 text-[12.5px] text-text-3">No coverage data.</div>
                ) : tactics.map(t => {
                    const ratio = t.techniqueCount / max;
                    const alpha = 0.12 + ratio * 0.85;
                    const dark  = ratio >= 0.5;
                    return (
                        <div
                            key={t.mitreId}
                            className="rounded p-2 min-w-0"
                            style={{
                                background: `oklch(from var(--brand) l c h / ${alpha})`,
                                color: dark ? '#0b0e14' : 'var(--text)',
                            }}
                        >
                            <div
                                className="font-mono text-[9.5px] tracking-wider"
                                style={{ color: dark ? 'rgba(11,14,20,.62)' : 'var(--text-3)' }}
                            >
                                {t.mitreId}
                            </div>
                            <div className="text-[11.5px] truncate font-medium">{t.name}</div>
                            <div className="text-[16px] font-mono tnum leading-tight mt-0.5">{t.techniqueCount}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ============================================================================
   Trending tags — name + count, hot flag → flame chip.
   The design calls for a per-tag velocity delta (e.g. "+52%"); the
   backend's `trendingTags()` returns `{ tag, count, hot }` without a
   delta number, so we surface the `hot` boolean as a flame chip
   instead. A real delta is a Phase 3 backend item.
   ========================================================================= */

function TrendingTagsPanel({
    tags,
}: {
    tags: Array<{ tag: string; count: number; hot: boolean }>;
}) {
    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<Zap className="size-4" />}
                title="Trending tags"
                sub={`${tags.length} this window`}
            />
            <ul className="mt-3 space-y-1.5">
                {tags.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No tags trending.</li>
                ) : tags.slice(0, 8).map(t => (
                    <li key={t.tag} className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-mono text-[12.5px] truncate">{t.tag}</span>
                        <span className="flex items-center gap-2 shrink-0">
                            {t.hot && (
                                <span className="text-sev-high inline-flex items-center" title="Hot">
                                    <Flame className="size-3" />
                                </span>
                            )}
                            <span className="font-mono text-[12px] tnum text-text-2">{fmt(t.count)}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ============================================================================
   Actor watchlist — top 6 actors by activity score.
   Score bar = sev-high if score > 70 else brand.
   ========================================================================= */

type ActiveActor = Awaited<ReturnType<typeof platform.activeActors>>['actors'][number];

function ActorWatchlistPanel({ actors }: { actors: ActiveActor[] }) {
    const max = actors.reduce((m, a) => Math.max(m, a.score), 1);
    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<Bolt className="size-4" />}
                title="Actor watchlist"
                sub={`${actors.length} active actors`}
                right={
                    <Link href="/actors" className="text-[12px] text-text-3 hover:text-text inline-flex items-center gap-0.5">
                        All actors <ChevronRight className="size-3" />
                    </Link>
                }
            />
            <ul className="mt-3 space-y-2">
                {actors.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No active actors this window.</li>
                ) : actors.map(a => {
                    const hot = a.score > 70;
                    return (
                        <li key={a.id}>
                            <Link
                                href={`/actors/${encodeURIComponent(a.id)}`}
                                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1 hover:text-text transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="text-[13px] font-medium truncate">{a.name}</div>
                                    <div className="text-[11px] text-text-3 truncate">
                                        {[a.primaryMotivation, a.sophistication].filter(Boolean).join(' · ') || '—'}
                                    </div>
                                </div>
                                <div className="w-[120px] h-1.5 bg-bg-3 rounded-full overflow-hidden">
                                    <div
                                        className={cn('h-full rounded-full', hot ? 'bg-sev-high' : 'bg-brand')}
                                        style={{ width: `${(a.score / max) * 100}%` }}
                                    />
                                </div>
                                <span className="font-mono text-[12px] tnum text-text-2 w-[36px] text-right">
                                    {a.score.toFixed(0)}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* ============================================================================
   Latest intel pulses — 5 most recent.
   ========================================================================= */

type PulseRow = Awaited<ReturnType<typeof pulsesApi.list>>['items'][number];

function LatestPulsesPanel({ pulses }: { pulses: PulseRow[] }) {
    return (
        <div className="panel panel-pad">
            <PanelHead
                title="Latest intel pulses"
                sub={`${pulses.length} most recent`}
                right={
                    <Link href="/feeds" className="text-[12px] text-text-3 hover:text-text inline-flex items-center gap-0.5">
                        All feeds <ChevronRight className="size-3" />
                    </Link>
                }
            />
            <ul className="mt-3 space-y-2">
                {pulses.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No pulses yet.</li>
                ) : pulses.map(p => (
                    <li key={p.id}>
                        <Link
                            href={`/feeds/${encodeURIComponent(p.id)}`}
                            className="grid grid-cols-[8px_1fr_auto] items-start gap-3 py-1 hover:text-text transition-colors"
                        >
                            <StatusDot status="ok" className="mt-1.5" />
                            <div className="min-w-0">
                                <div className="text-[13px] truncate font-medium">{p.name}</div>
                                <div className="text-[11px] text-text-3 truncate">
                                    {[p.author, p.indicatorCount != null ? `${p.indicatorCount} IOCs` : null]
                                        .filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            <span className="text-[11px] text-text-4 font-mono tnum shrink-0">
                                {relTime(p.otxModified ?? p.updatedAt ?? p.createdAt ?? '')}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
