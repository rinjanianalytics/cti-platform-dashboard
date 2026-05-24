'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
    admin,
    type ActivityThroughput,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Download, Sparkles, Database, Network, Bell, RefreshCw, ChevronRight,
} from 'lucide-react';
import { cn, relTime } from '@/lib/utils';

/**
 * Pipeline visualization — the CTI ingestion DAG, read-only.
 *
 *   Ingest → Enrich → Index → Graph → Notify
 *
 * Each stage aggregates one or more BullMQ queues and shows live status:
 * how many jobs have flowed through, last activity, error rate. The data
 * sources are the activity stream throughput endpoint and the queue stats
 * endpoint we already serve — this view is pure presentation.
 *
 * Read-only by design. To control a stage, use /admin/queues, /admin/jobs,
 * or /admin/schedules. This page answers "is the pipeline healthy?" — not
 * "let me edit the pipeline".
 */

interface PipelineStage {
    key: string;
    label: string;
    blurb: string;
    icon: React.ComponentType<{ className?: string }>;
    /** BullMQ queues that contribute to this stage's metrics. */
    queues: string[];
    /** Where to dive in for control. */
    href: string;
}

const STAGES: PipelineStage[] = [
    {
        key: 'ingest',
        label: 'Ingest',
        blurb: 'Pull from open-source feeds',
        icon: Download,
        queues: ['feed-sync'],
        href: '/admin/queues/feed-sync',
    },
    {
        key: 'enrich',
        label: 'Enrich',
        blurb: 'CVSS (OSV → NVD), VirusTotal, LLM',
        icon: Sparkles,
        queues: ['cve-enrichment', 'ioc-enrichment', 'ai-analysis'],
        href: '/admin/jobs',
    },
    {
        key: 'index',
        label: 'Index',
        blurb: 'Search index + vector embed',
        icon: Database,
        queues: ['web-search'],
        href: '/admin/queues',
    },
    {
        key: 'graph',
        label: 'Graph',
        blurb: 'Neo4j relationships',
        icon: Network,
        queues: ['neo4j-sync'],
        href: '/admin/queues/neo4j-sync',
    },
    {
        key: 'notify',
        label: 'Notify',
        blurb: 'Alerts + in-app notifications',
        icon: Bell,
        queues: ['notifications', 'alerts'],
        href: '/admin/queues/notifications',
    },
];

interface StageMetrics {
    total: number;
    completed: number;
    failed: number;
    active: number;
    lastAt: string | null;
    failureRate: number;
}

type StageStatus = 'idle' | 'running' | 'healthy' | 'degraded' | 'erroring';

function aggregateStage(stage: PipelineStage, throughput: ActivityThroughput[]): StageMetrics {
    const matching = throughput.filter(t => stage.queues.includes(t.queue));
    const completed = matching.reduce((s, t) => s + t.byKind.completed, 0);
    const failed = matching.reduce((s, t) => s + t.byKind.failed, 0);
    const active = matching.reduce((s, t) => s + t.byKind.active, 0);
    const total = completed + failed + active;
    const lastAt = matching.reduce<string | null>((latest, t) => {
        if (!t.lastAt) return latest;
        if (!latest || t.lastAt > latest) return t.lastAt;
        return latest;
    }, null);
    const failureRate = total > 0 ? failed / total : 0;
    return { total, completed, failed, active, lastAt, failureRate };
}

function stageStatus(m: StageMetrics): StageStatus {
    if (m.active > 0) return 'running';
    if (m.total === 0) return 'idle';
    if (m.failureRate >= 0.5) return 'erroring';
    if (m.failureRate >= 0.1) return 'degraded';
    return 'healthy';
}

const STATUS_TONE: Record<StageStatus, { dot: string; badge: string; border: string; label: string }> = {
    idle:      { dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground border-border', border: 'border-border', label: 'idle' },
    running:   { dot: 'bg-blue-500 animate-pulse', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', border: 'border-blue-500/40', label: 'running' },
    healthy:   { dot: 'bg-brand', badge: 'bg-brand/15 text-brand border-brand/30', border: 'border-brand/30', label: 'healthy' },
    degraded:  { dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', border: 'border-amber-500/40', label: 'degraded' },
    erroring:  { dot: 'bg-red-500 animate-pulse', badge: 'bg-red-500/15 text-red-400 border-red-500/30', border: 'border-red-500/50', label: 'erroring' },
};

export default function AdminPipelinePage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const allowed = user?.role === 'admin' || user?.role === 'auditor';
    useEffect(() => {
        if (!authLoading && user && !allowed) router.replace('/');
    }, [user, authLoading, allowed, router]);

    const { data: throughput, mutate, isLoading } = useSWR(
        allowed ? 'admin:pipeline:throughput' : null,
        () => admin.activityThroughput(),
        { refreshInterval: 5_000, revalidateOnFocus: false },
    );

    const stages = useMemo(() => {
        const t = throughput?.queues ?? [];
        return STAGES.map(s => {
            const metrics = aggregateStage(s, t);
            return { stage: s, metrics, status: stageStatus(metrics) };
        });
    }, [throughput]);

    if (!user || !allowed) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin or auditor role required.</div>;
    }

    const overallActive = stages.reduce((s, x) => s + x.metrics.active, 0);
    const overallFailing = stages.filter(x => x.status === 'erroring' || x.status === 'degraded').length;

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Read-only view of the CTI ingestion DAG.{' '}
                        {isLoading
                            ? 'Loading…'
                            : overallActive > 0
                                ? `${overallActive} job${overallActive === 1 ? '' : 's'} running.`
                                : overallFailing > 0
                                    ? `${overallFailing} stage${overallFailing === 1 ? '' : 's'} need attention.`
                                    : 'All stages healthy.'}
                    </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => mutate()}>
                    <RefreshCw className="size-3.5" /> Refresh
                </Button>
            </div>

            {/* Horizontal pipeline — flex layout with explicit arrow separators.
                On narrow screens it stacks vertically so the arrows rotate down
                visually via CSS. */}
            <div className="flex flex-col lg:flex-row gap-3 lg:items-stretch">
                {stages.map((s, i) => (
                    <div key={s.stage.key} className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:flex-1">
                        <StageCard
                            stage={s.stage}
                            metrics={s.metrics}
                            status={s.status}
                        />
                        {i < stages.length - 1 && (
                            <StageArrow status={stages[i + 1].status} />
                        )}
                    </div>
                ))}
            </div>

            {/* Drill-in table for the analyst who wants to act on what they see */}
            <Card>
                <CardContent className="py-4 px-4">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
                        Per-stage queues
                    </div>
                    <div className="space-y-1.5">
                        {stages.map(s => (
                            <div key={s.stage.key} className="grid grid-cols-[120px_1fr_auto] gap-3 items-center text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span
                                        aria-hidden
                                        className={cn('size-1.5 rounded-full shrink-0', STATUS_TONE[s.status].dot)}
                                    />
                                    <span className="font-medium truncate">{s.stage.label}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 min-w-0">
                                    {s.stage.queues.map(q => (
                                        <Link
                                            key={q}
                                            href={`/admin/queues/${encodeURIComponent(q)}`}
                                            className="font-mono text-[11px] text-muted-foreground hover:text-foreground rounded px-1.5 py-0.5 hover:bg-accent/50 transition-colors"
                                        >
                                            {q}
                                        </Link>
                                    ))}
                                </div>
                                <span className="text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                                    {s.metrics.lastAt ? `last ${relTime(s.metrics.lastAt)}` : 'no events'}
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <p className="text-[11px] text-muted-foreground/70 italic">
                Metrics aggregate the recent activity buffer (~200 events).
                For control — pause, retry, run-now — open the specific
                queue or visit <Link href="/admin/jobs" className="underline">jobs</Link> /{' '}
                <Link href="/admin/schedules" className="underline">schedules</Link>.
            </p>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function StageCard({
    stage, metrics, status,
}: {
    stage: PipelineStage;
    metrics: StageMetrics;
    status: StageStatus;
}) {
    const tone = STATUS_TONE[status];
    const Icon = stage.icon;
    return (
        <Link
            href={stage.href}
            className={cn(
                'flex-1 min-w-0 group',
                'block rounded-lg border bg-card p-4',
                'transition-all hover:shadow-lg hover:shadow-black/20',
                tone.border,
            )}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    <span className="font-mono text-sm uppercase tracking-wide truncate">{stage.label}</span>
                </div>
                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', tone.badge)}>
                    <span aria-hidden className={cn('size-1.5 rounded-full mr-1', tone.dot)} />
                    {tone.label}
                </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">{stage.blurb}</p>
            <div className="grid grid-cols-3 gap-1 text-center">
                <Counter label="done"    value={metrics.completed} tone="emerald" />
                <Counter label="active"  value={metrics.active}    tone={metrics.active > 0 ? 'blue' : 'mute'} />
                <Counter label="failed"  value={metrics.failed}    tone={metrics.failed > 0 ? 'red' : 'mute'} />
            </div>
            <div className="mt-3 text-[10px] text-muted-foreground/60 flex items-center justify-between tabular-nums">
                <span>{stage.queues.length} queue{stage.queues.length === 1 ? '' : 's'}</span>
                <ChevronRight className="size-3 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
        </Link>
    );
}

function Counter({
    label, value, tone,
}: {
    label: string;
    value: number;
    tone: 'emerald' | 'blue' | 'red' | 'mute';
}) {
    const colour = {
        emerald: value > 0 ? 'text-emerald-400' : 'text-muted-foreground/60',
        blue:    value > 0 ? 'text-blue-400'    : 'text-muted-foreground/60',
        red:     value > 0 ? 'text-red-400'     : 'text-muted-foreground/60',
        mute:    'text-muted-foreground/60',
    }[tone];
    return (
        <div>
            <div className={cn('font-mono text-sm font-semibold tabular-nums', colour)}>
                {value.toLocaleString()}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
        </div>
    );
}

/**
 * Connector arrow between two stage cards. Horizontal on lg+, vertical
 * (rotated chevron) on mobile. Colour-shifts to match the downstream stage's
 * status so the eye follows the flow toward trouble.
 */
function StageArrow({ status }: { status: StageStatus }) {
    const tone = STATUS_TONE[status];
    return (
        <div className="flex items-center justify-center lg:w-4 shrink-0 py-1 lg:py-0">
            <ChevronRight
                aria-hidden
                className={cn(
                    'size-4 rotate-90 lg:rotate-0 transition-colors',
                    tone.dot.replace('bg-', 'text-').replace(' animate-pulse', ''),
                )}
            />
        </div>
    );
}
