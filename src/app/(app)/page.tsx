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
    platform, iocs, watch, actors as actorsApi, pulses as pulsesApi,
    type ThreatActor,
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

/**
 * Map the window switcher to a `days` count for the API.
 * `24H` resolves to 2 days so deltaPct still has a previous bucket to
 * compare against — a 1-day series would have nothing to diff. The
 * sparkline trims the partial-day bucket via `trimPartialDay()` before
 * rendering, so the visible window matches the user's selection.
 */
const WINDOW_DAYS: Record<WindowKey, number> = {
    '24H': 2,
    '7D':  7,
    '30D': 30,
};

/** The landscape endpoint takes a string `period` rather than a `days` int. */
const WINDOW_PERIOD: Record<WindowKey, '24h' | '7d' | '30d'> = {
    '24H': '24h',
    '7D':  '7d',
    '30D': '30d',
};

/**
 * Direct CSS variable refs for the severity bars, used in place of the
 * `bg-sev-*` Tailwind utilities. Reason: the panel's track colour
 * (`--bg-3`) is only defined inside `.dark`, and Tailwind 4's
 * `@theme inline` aliasing of `--color-bg-3: var(--bg-3)` can land an
 * empty utility when the alias is evaluated outside the `.dark`
 * cascade. The fills then render invisibly. Inline CSS-var refs
 * resolve at runtime via the document cascade so the colours always
 * land regardless of build-time tokenisation.
 */
const SEV_BAR_VAR: Record<Severity, string> = {
    crit: 'var(--sev-crit)',
    high: 'var(--sev-high)',
    med:  'var(--sev-med)',
    low:  'var(--sev-low)',
    info: 'var(--sev-info)',
};

export default function CommandPage() {
    const [windowSel, setWindowSel] = useState<WindowKey>('7D');
    const windowDays = WINDOW_DAYS[windowSel];
    const windowPeriod = WINDOW_PERIOD[windowSel];

    // Every windowed SWR key includes `windowDays` so SWR refetches
    // when the switcher fires. Each tile then either reads from the
    // window-scoped response field (windowCounts / total / etc.) or
    // recomputes derivatives (deltaPct(sparks.X)) automatically.
    const { data: stats }     = useSWR(
        ['cc:stats', windowDays] as const,
        ([, days]) => platform.stats({ days }),
    );
    const { data: landscape } = useSWR(
        ['cc:landscape', windowPeriod] as const,
        ([, period]) => platform.landscape({ period }),
    );
    const { data: sparks }    = useSWR(
        ['cc:sparks', windowDays] as const,
        ([, days]) => platform.sparklines(days),
        { refreshInterval: 60_000 },
    );
    const { data: coverage }  = useSWR('cc:mitre',     () => platform.mitreCoverage());
    const { data: actors }    = useSWR(
        ['cc:actors', windowDays] as const,
        ([, days]) => platform.activeActors(6, days),
    );
    const { data: trending }  = useSWR(
        ['cc:trending', windowDays] as const,
        ([, days]) => platform.trendingTags({ days }),
    );
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

            {/* ── KPI strip ──────────────────────────────────────────────
                Tile values prefer `windowCounts` (arrivals in the selected
                window) over `counts` (total-of-record) so they read as
                "new this week / this 24h" — matching the rolling-window
                label above. `windowCounts` is only present when the
                backend includes it (older API revs fall back to totals
                gracefully). */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile
                    href="/iocs"
                    eyebrow="Indicators"
                    value={stats?.windowCounts?.iocs ?? stats?.counts.iocs}
                    sparkData={trimPartialDay(sparks?.iocs)}
                    sparkTone="brand"
                    delta={deltaPct(sparks?.iocs)}
                    sub={landscape
                        ? `${fmt(landscape.iocs.high)} high · ${fmt(landscape.iocs.critical)} crit`
                        : undefined}
                />
                <KpiTile
                    href="/vulnerabilities"
                    eyebrow="Vulnerabilities"
                    value={stats?.windowCounts?.vulnerabilities ?? stats?.counts.vulnerabilities}
                    sparkData={trimPartialDay(sparks?.vulnerabilities)}
                    sparkTone="sev-high"
                    delta={deltaPct(sparks?.vulnerabilities)}
                    sub={landscape
                        ? `${fmt(landscape.vulnerabilities.high)} high · ${fmt(landscape.vulnerabilities.critical)} crit`
                        : undefined}
                />
                <KpiTile
                    href="/actors"
                    eyebrow="Threat actors"
                    value={stats?.windowCounts?.threatActors ?? stats?.counts.threatActors}
                    sparkData={trimPartialDay(sparks?.threatActors)}
                    sparkTone="sev-info"
                    delta={deltaPct(sparks?.threatActors)}
                    // `actors.total` is the count of actors with
                    // last_seen within the user's selected window
                    // (`?days=N` on /v1/actors/active — cti-platform-api
                    // PR #21). The sub-line label tracks the window so
                    // "active this week / today / this month" matches
                    // what the user picked. `actors.actors.length` is
                    // the top-N watchlist (capped at limit=6) and would
                    // lie if read here.
                    sub={actors
                        ? `${actors.total ?? actors.actors.length} active ${windowSel === '24H' ? 'today' : windowSel === '30D' ? 'this month' : 'this week'}`
                        : undefined}
                />
                <KpiTile
                    href="/feeds"
                    eyebrow="Active feeds"
                    value={feedList.length || undefined}
                    sparkData={trimPartialDay(sparks?.feedSyncs)}
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
                <ActorWatchlistPanel activeActors={actors?.actors ?? []} />
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
    // Padding matches the design's asymmetric 15/16/13 (slightly tighter at the
    // bottom so the sub line sits closer to the number).
    return (
        <Link
            href={href}
            className="panel flex flex-col hover:bg-bg-2 transition-colors px-4 pt-[15px] pb-[13px]"
        >
            <div className="flex items-start justify-between gap-2">
                <span className="eyebrow">{eyebrow}</span>
                {delta && delta.sign !== 'flat' && (
                    <span
                        className={cn(
                            // Per the design: 11px mono, no background tint —
                            // just the coloured glyph + percent. The arrow is
                            // 11px stroke-2.4 (we approximate with size-2.5).
                            'inline-flex items-center gap-0.5 font-mono text-[11px] tnum',
                            delta.sign === 'up' ? 'text-ok' : 'text-sev-high',
                        )}
                    >
                        {delta.sign === 'up' ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
                        {delta.pct.toFixed(1)}%
                    </span>
                )}
            </div>
            <div className="flex items-end justify-between gap-2.5 min-w-0 mt-2">
                <div className="font-mono text-[28px] leading-none font-semibold tnum tracking-[-0.02em] truncate">
                    {fmt(value ?? null)}
                </div>
                {sparkData && (
                    <Sparkline data={sparkData} tone={sparkTone} variant="gradient" width={78} height={30} />
                )}
            </div>
            {sub && <div className="text-[11.5px] text-text-2 truncate mt-2.5">{sub}</div>}
        </Link>
    );
}

/**
 * Day-over-baseline delta for the KPI chip.
 *
 * `platform.sparklines(7)` returns 7 daily buckets where the LAST one is
 * today — which is partial until 23:59 UTC. Comparing a partial day's
 * count to the average of complete prior days produces alarming
 * downward deltas at every refresh ("−70% indicators!") that don't
 * reflect any real change.
 *
 * The fix: use the **last full day** (penultimate bucket) as "now" and
 * average the days before that as the baseline. Today's incomplete
 * bucket is ignored — it shows up in the Severity / triage panels via
 * live counts, but it shouldn't define the trend.
 */
function deltaPct(series: number[] | undefined): { sign: 'up' | 'down' | 'flat'; pct: number } | null {
    if (!series || series.length < 3) return null;
    const recent      = series[series.length - 2];   // yesterday (last complete day)
    const priorSlice  = series.slice(0, -2);         // days before yesterday
    if (priorSlice.length === 0) return null;
    const priorAvg = priorSlice.reduce((s, x) => s + x, 0) / priorSlice.length;
    if (priorAvg === 0 && recent === 0) return { sign: 'flat', pct: 0 };
    if (priorAvg === 0) return { sign: 'up', pct: 100 };
    const pct = ((recent - priorAvg) / priorAvg) * 100;
    if (Math.abs(pct) < 0.5) return { sign: 'flat', pct: 0 };
    return { sign: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

/**
 * Drop the last (partial-day) bucket from a sparkline series. Same
 * rationale as deltaPct — the partial day creates a misleading V-dip
 * at the end of every sparkline.
 */
function trimPartialDay(series: number[] | undefined): number[] | undefined {
    if (!series || series.length < 2) return series;
    return series.slice(0, -1);
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
                        {triage.map((item, i) => {
                            const sev = normalizeSeverity(item.severity);
                            const dot = sev === 'crit' ? 'down' : sev === 'high' ? 'warn' : 'idle';
                            return (
                                <li
                                    key={item.id}
                                    className="triage-row group"
                                    style={i > 0 ? { borderTop: '1px solid var(--line-soft)' } : undefined}
                                >
                                    <Link
                                        href={`/iocs/${item.id}`}
                                        // Two-zone layout:
                                        //   LEFT  — status dot + value/meta
                                        //   RIGHT — sev pill + timestamp, both
                                        //           pushed to the panel's right
                                        //           edge so the empty space
                                        //           sits BETWEEN the two zones,
                                        //           not floating in the middle.
                                        //
                                        // `ml-auto` lives on the sev pill (the
                                        // first right-zone element) so the
                                        // sev/time pair clusters together at
                                        // the right with their natural gap,
                                        // instead of orphaning the time at the
                                        // far edge.
                                        className="flex items-center gap-3 px-2 py-2 rounded hover:bg-bg-2 transition-colors"
                                    >
                                        <StatusDot status={dot} />
                                        <div className="min-w-0 max-w-md">
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
                                        <Sev level={sev} short className="shrink-0 ml-auto" />
                                        <span className="text-[11px] text-text-4 font-mono tnum shrink-0 w-8 text-right">
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
            {/* Stacked spectrum — 8px tall per spec. Track + segment colours
                use inline `var(--bg-3)` / `var(--sev-*)` rather than
                Tailwind utilities because `--bg-3` is only defined in
                `.dark` and Tailwind 4's `@theme inline` resolution of
                cascade-defined variables can leave the utility empty.
                Inline refs resolve through the document cascade
                guaranteeing the bar lands. Height bumped to 10px so the
                spectrum reads as a bar rather than a hairline on this
                narrow column. */}
            {total > 0 && (
                <div
                    className="mt-3 flex w-full overflow-hidden rounded-[5px]"
                    style={{ marginBottom: 18, height: 10, background: 'var(--bg-3)' }}
                >
                    {buckets.map(b => (
                        <div
                            key={b.sev}
                            style={{
                                width: `${(b.count / total) * 100}%`,
                                background: SEV_BAR_VAR[b.sev],
                            }}
                            title={`${b.sev}: ${b.count}`}
                        />
                    ))}
                </div>
            )}
            {/* Per-severity rows — design uses 12px gap, 13px row spacing,
                count text 12.5px in --text colour. Row bar bumped to 8px
                (was 6px) so each row's relative weight reads from across
                the room — at 6px on a narrow panel the bars vanished into
                the background.

                Minimum bar width is 4% (was 1.5%) so the tiny low-severity
                bucket still registers visually instead of becoming a sliver
                lost in the bg-3 track. */}
            <ul style={{ rowGap: 13 }} className="flex flex-col">
                {buckets.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No severity data yet.</li>
                ) : buckets.map(b => (
                    <li key={b.sev} className="grid grid-cols-[74px_1fr_auto] items-center gap-3">
                        <Sev level={b.sev} className="inline-flex justify-center w-full" />
                        <div
                            className="rounded"
                            style={{ height: 10, background: 'var(--bg-3)' }}
                        >
                            <div
                                className="h-full rounded"
                                style={{
                                    width: `${Math.max((b.count / max) * 100, 4)}%`,
                                    background: SEV_BAR_VAR[b.sev],
                                }}
                            />
                        </div>
                        <span className="font-mono text-[12.5px] tnum text-text w-14 text-right">
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
            <ul className="mt-3 space-y-2.25">
                {top.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No data.</li>
                ) : top.map((t, i) => {
                    // Opacity ramp from the design: `0.55 + 0.45 * (1 - i/n)`.
                    // Top row is fully bright; tail rows dim to ~0.55. Reads as
                    // a heatmap of dominance across the type distribution.
                    const opacity = 0.55 + 0.45 * (1 - i / top.length);
                    return (
                        <li key={t.type} className="grid grid-cols-[96px_1fr_auto] items-center gap-2.5">
                            <span className="font-mono text-[11px] uppercase tracking-wider text-text-2 truncate">{t.type}</span>
                            <div
                                className="rounded"
                                style={{ height: 8, background: 'var(--bg-3)' }}
                            >
                                <div
                                    className="h-full rounded"
                                    style={{
                                        width: `${Math.max((t.count / max) * 100, 1)}%`,
                                        background: `linear-gradient(90deg, var(--brand-dim), var(--brand))`,
                                        opacity,
                                    }}
                                />
                            </div>
                            <span className="font-mono text-[12px] tnum text-text-2 w-12.5 text-right">
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
            <div className="mt-3 grid grid-cols-3 gap-1.75">
                {tactics.length === 0 ? (
                    <div className="col-span-3 text-[12.5px] text-text-3">No coverage data.</div>
                ) : tactics.map(t => {
                    const ratio = t.techniqueCount / max;
                    const alpha = 0.12 + ratio * 0.85;
                    const dark  = ratio >= 0.5;
                    return (
                        <div
                            key={t.mitreId}
                            // Design uses 9px/10px asymmetric padding + border
                            // + .r-sm radius. The dark-ink switch fires above
                            // ratio 0.5; weight bumps to 600 on the name when
                            // dark for extra contrast against the brand fill.
                            className="rounded-md border border-line-soft px-2.5 py-2.25 min-w-0"
                            style={{
                                background: `oklch(from var(--brand) l c h / ${alpha})`,
                                color: dark ? '#0b0e14' : 'var(--text)',
                            }}
                        >
                            <div
                                className="font-mono text-[9.5px] tracking-wider mb-0.75"
                                style={{ color: dark ? 'rgba(11,14,20,.62)' : 'var(--text-3)' }}
                            >
                                {t.mitreId}
                            </div>
                            <div
                                className={cn(
                                    'text-[11.5px] truncate mb-1.25',
                                    dark ? 'font-semibold' : 'font-normal',
                                )}
                            >
                                {t.name}
                            </div>
                            <div className="text-[16px] font-mono font-semibold tnum leading-tight">{t.techniqueCount}</div>
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
            <ul className="mt-3">
                {tags.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">No tags trending.</li>
                ) : tags.slice(0, 8).map((t, i) => (
                    <li
                        key={t.tag}
                        className={cn(
                            // Design uses a per-row 7px vertical padding +
                            // 1px line-soft separator between rows. Mirrors
                            // the data-row rhythm in the Severity panel.
                            'flex items-center gap-2.5 min-w-0 py-1.75',
                            i > 0 && 'border-t border-line-soft',
                        )}
                    >
                        <span className="font-mono text-[12.5px] truncate flex-1 text-text-2">{t.tag}</span>
                        {t.hot && (
                            <span className="text-sev-high inline-flex items-center shrink-0" title="Hot">
                                <Flame className="size-3" />
                            </span>
                        )}
                        <span className="font-mono text-[12px] tnum text-text-3 shrink-0">{fmt(t.count)}</span>
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

/**
 * "Watchlist" semantics: show the user's pinned actors (via /v1/watch).
 * If they haven't pinned any, fall back to the top active actors as a
 * suggestion list with a hint that says "pin from any actor's drawer
 * to populate this panel".
 *
 * Watched actors don't carry the `score`/`breakdown` shape — that's
 * specific to /v1/actors/active. For the score bar we use `confidence`
 * (0-100) as a stand-in; it's not the same signal but it's the best
 * proxy on the ThreatActor row itself. Replace with a real "watched
 * actor activity" backend field if/when one ships.
 */
function ActorWatchlistPanel({ activeActors }: { activeActors: ActiveActor[] }) {
    // Pinned actor ids (cheap, no JOIN to threat_actors).
    const { data: watchData } = useSWR(
        'cc:watch:actors',
        () => watch.list({ type: 'actor', limit: 6 }),
        { revalidateOnFocus: false },
    );
    const watchedIds = watchData?.items.map(w => w.entityId) ?? [];

    // Hydrate pinned actors by fetching each row. N+1 in theory but
    // the watchlist is bounded (limit: 6) and the panel polls
    // infrequently, so the cost is negligible. Promise.allSettled so
    // a single deleted/merged actor doesn't fail the whole render.
    const { data: hydratedWatched } = useSWR(
        watchedIds.length > 0 ? ['cc:watch:actors:hydrated', watchedIds.join(',')] : null,
        async () => {
            const settled = await Promise.allSettled(
                watchedIds.map(id => actorsApi.get(id)),
            );
            return settled
                .filter((r): r is PromiseFulfilledResult<ThreatActor> => r.status === 'fulfilled')
                .map(r => r.value);
        },
        { revalidateOnFocus: false },
    );

    const isWatchedMode = (hydratedWatched?.length ?? 0) > 0;
    const list = isWatchedMode
        ? hydratedWatched!.map(a => {
              // `confidence` comes off a Postgres `numeric` column, which
              // Drizzle serialises as a STRING by default (preserves
              // precision but trips `.toFixed()` calls downstream). The
              // TypeScript type says `number | null`; the runtime value
              // doesn't. Coerce explicitly with NaN guards so a malformed
              // value (empty string, null, etc.) falls back to 50 instead
              // of rendering "NaN".
              const raw = a.confidence;
              const num = raw == null
                  ? null
                  : typeof raw === 'number'
                      ? raw
                      : Number(raw);
              const score = num != null && Number.isFinite(num) ? num : 50;
              return {
                  id: a.id,
                  name: a.name,
                  primaryMotivation: a.primaryMotivation,
                  sophistication: a.sophistication,
                  // Confidence is a 0-100 proxy for "activity score" on
                  // watched actors — the activeActors composite score
                  // isn't available on ThreatActor rows.
                  score,
              };
          })
        : activeActors;

    const max = list.reduce((m, a) => Math.max(m, a.score), 1);

    const subText = isWatchedMode
        ? `${list.length} pinned`
        : activeActors.length > 0
            ? `${activeActors.length} active actors · nothing pinned yet`
            : 'nothing pinned yet';

    return (
        <div className="panel panel-pad">
            <PanelHead
                icon={<Bolt className="size-4" />}
                title="Actor watchlist"
                sub={subText}
                right={
                    <Link href="/actors" className="text-[12px] text-text-3 hover:text-text inline-flex items-center gap-0.5">
                        All actors <ChevronRight className="size-3" />
                    </Link>
                }
            />
            <ul className="mt-3">
                {list.length === 0 ? (
                    <li className="text-[12.5px] text-text-3">
                        No pinned actors yet — click <span className="text-text-2">Watch</span> on any actor&apos;s detail page to populate this panel.
                    </li>
                ) : list.map((a, i) => {
                    const hot = a.score > 70;
                    return (
                        <li
                            key={a.id}
                            className={cn(i > 0 && 'border-t border-line-soft')}
                        >
                            <Link
                                href={`/actors/${encodeURIComponent(a.id)}`}
                                // Per the design: 8px vertical padding, 11px gap,
                                // 52×5 score bar, 24px right-aligned numeric.
                                // The compact bar reads as a meter, not a chart.
                                className="grid grid-cols-[1fr_13ch_6ch] items-center gap-2.75 py-2 hover:text-text transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                                    <div className="text-[11px] text-text-3 truncate">
                                        {[a.primaryMotivation, a.sophistication].filter(Boolean).join(' · ') || '—'}
                                    </div>
                                </div>
                                <div
                                    className="rounded-sm w-13"
                                    style={{ height: 5, background: 'var(--bg-3)' }}
                                >
                                    <div
                                        className="h-full rounded-sm"
                                        style={{
                                            width: `${(a.score / max) * 100}%`,
                                            background: hot ? 'var(--sev-high)' : 'var(--brand)',
                                        }}
                                    />
                                </div>
                                <span className="font-mono text-[12px] tnum text-text-2 text-right">
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
