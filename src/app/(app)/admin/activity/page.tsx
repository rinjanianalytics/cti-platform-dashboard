'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
    admin,
    type ActivityEvent,
    type ActivityKind,
    type ActivityThroughput,
    type ActivityFailureGroup,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Activity, AlertTriangle, Pause, Play, RefreshCw } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { PageHeader } from '@/components/admin/page-header';
import { StatusBadge } from '@/lib/tone';

const MAX_EVENTS = 250;

const KIND_TONE: Record<ActivityKind, string> = {
    active:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    failed:    'bg-red-500/15 text-red-400 border-red-500/30',
    progress:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const KIND_DOT: Record<ActivityKind, string> = {
    active:    'bg-blue-500',
    completed: 'bg-emerald-500',
    failed:    'bg-red-500',
    progress:  'bg-amber-500',
};

/**
 * Live job activity dashboard.
 *
 * Subscribes to /admin/activity/stream via EventSource for live events,
 * also polls /admin/activity/throughput for the per-queue counter cards.
 * The "Pause stream" button lets analysts freeze the feed while inspecting
 * a specific event.
 */
export default function AdminActivityPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const allowed = user?.role === 'admin' || user?.role === 'auditor';
    useEffect(() => {
        if (!authLoading && user && !allowed) router.replace('/');
    }, [user, authLoading, allowed, router]);

    const [paused, setPaused] = useState(false);
    const [queueFilter, setQueueFilter] = useState<string>('all');
    const [events, setEvents] = useState<ActivityEvent[]>([]);

    const { data: throughput, mutate: refetchThroughput } = useSWR(
        allowed ? 'admin:activity:throughput' : null,
        () => admin.activityThroughput(),
        { refreshInterval: 10_000, revalidateOnFocus: false },
    );

    const { data: failures, mutate: refetchFailures } = useSWR(
        allowed ? 'admin:activity:failures' : null,
        () => admin.activityFailures(),
        { refreshInterval: 15_000, revalidateOnFocus: false },
    );

    // Use a ref so the EventSource callback doesn't see stale state.
    const pausedRef = useRef(paused);
    useEffect(() => { pausedRef.current = paused; }, [paused]);

    // Set up the SSE subscription once. Reconnects automatically on drop.
    useEffect(() => {
        if (!allowed) return;
        const url = admin.activityStreamUrl();
        const es = new EventSource(url);

        es.addEventListener('activity', (e) => {
            if (pausedRef.current) return;
            try {
                const evt = JSON.parse((e as MessageEvent).data) as ActivityEvent;
                setEvents((prev) => {
                    // De-dup by seq just in case (SSE redelivery on reconnect).
                    if (prev.length && prev[0].seq === evt.seq) return prev;
                    const next = [evt, ...prev];
                    return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
                });
                // Refresh derived stats on a slight delay (server has its own buffer).
                refetchThroughput();
                // Failures only need re-fetching when a new failure arrives.
                if (evt.kind === 'failed') refetchFailures();
            } catch {
                /* malformed payload — drop */
            }
        });

        es.addEventListener('connected', () => { /* hello */ });

        return () => { es.close(); };
    }, [allowed, refetchThroughput, refetchFailures]);

    const queues: ActivityThroughput[] = throughput?.queues ?? [];
    const filteredEvents = useMemo(() => {
        if (queueFilter === 'all') return events;
        return events.filter(e => e.queue === queueFilter);
    }, [events, queueFilter]);

    if (!user || !allowed) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin or auditor role required.</div>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Activity"
                description={<>
                    Live job event stream · {events.length.toLocaleString()} buffered
                    {paused && <span className="ml-2 text-amber-400">· paused</span>}
                </>}
                actions={<>
                    <Select value={queueFilter} onValueChange={(v) => setQueueFilter(v ?? 'all')}>
                        <SelectTrigger className="w-44 h-9">
                            <SelectValue placeholder="All queues" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All queues</SelectItem>
                            {queues.map(q => (
                                <SelectItem key={q.queue} value={q.queue}>{q.queue}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        variant={paused ? 'default' : 'outline'}
                        onClick={() => setPaused(p => !p)}
                    >
                        {paused
                            ? <><Play className="size-3.5" /> Resume</>
                            : <><Pause className="size-3.5" /> Pause</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEvents([])} title="Clear local buffer">
                        <RefreshCw className="size-3.5" />
                    </Button>
                </>}
            />

            {/* Throughput strip — per-queue counters over the server's ring buffer */}
            {queues.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-border rounded-md overflow-hidden border">
                    {queues.map(q => (
                        <ThroughputCell key={q.queue} stats={q} active={queueFilter === q.queue}
                            onClick={() => setQueueFilter(queueFilter === q.queue ? 'all' : q.queue)} />
                    ))}
                </div>
            )}

            {/* Failure groups — only shown when there are any. Collapses
                "same error, different details" so a rate-limit storm shows
                as a single row instead of 50. */}
            {failures && failures.groups.length > 0 && (
                <FailurePanel
                    groups={failures.groups}
                    onSignatureFilter={() => setQueueFilter('all')}
                />
            )}

            {/* Live event log */}
            {filteredEvents.length === 0 ? (
                <EmptyState
                    icon={Activity}
                    title="No events yet"
                    description={paused
                        ? 'Stream paused. Resume to watch new events arrive.'
                        : 'Waiting for the next job to fire. Trigger one via /admin/jobs to see the stream light up.'}
                />
            ) : (
                <Card>
                    <CardContent className="p-0 max-h-160 overflow-y-auto">
                        <ul className="divide-y">
                            {filteredEvents.map(evt => (
                                <li key={`${evt.seq}-${evt.queue}-${evt.jobId}`}>
                                    <EventRow event={evt} />
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ThroughputCell({
    stats, active, onClick,
}: { stats: ActivityThroughput; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'bg-card hover:bg-accent/30 transition-colors px-3 py-2.5 text-left',
                active && 'bg-accent/40',
            )}
        >
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">
                {stats.queue}
            </div>
            <div className="text-lg font-semibold tabular-nums mt-0.5">
                {stats.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                <span className="text-emerald-400">{stats.byKind.completed}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className={stats.byKind.failed > 0 ? 'text-red-400' : 'text-muted-foreground/60'}>
                    {stats.byKind.failed}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-blue-400">{stats.byKind.active}</span>
            </div>
        </button>
    );
}

/**
 * Compact panel that groups failures by normalised signature so a
 * rate-limit storm appears as one row, not 50. Only renders when there
 * are failures in the server's ring buffer — invisible during quiet
 * operation, becomes the eye-magnet when something's wrong.
 */
function FailurePanel({
    groups,
    onSignatureFilter,
}: {
    groups: ActivityFailureGroup[];
    /** Reserved hook for future "filter the log to this group" affordance. */
    onSignatureFilter: () => void;
}) {
    const totalFailed = groups.reduce((s, g) => s + g.count, 0);
    const [expanded, setExpanded] = useState<string | null>(null);

    return (
        <Card className="border-l-2 border-l-red-500/50">
            <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="size-4 text-red-400" />
                    <span className="text-sm font-medium">Recent failures</span>
                    <StatusBadge kind="failed">
                        {totalFailed} total · {groups.length} group{groups.length === 1 ? '' : 's'}
                    </StatusBadge>
                </div>
                <ul className="space-y-1">
                    {groups.slice(0, 8).map(g => (
                        <li key={g.signature}>
                            <button
                                type="button"
                                onClick={() => {
                                    setExpanded(expanded === g.signature ? null : g.signature);
                                    onSignatureFilter();
                                }}
                                className="w-full text-left rounded-md hover:bg-accent/40 transition-colors px-2 py-1.5"
                            >
                                <div className="flex items-start gap-3 text-xs">
                                    <span className="font-mono tabular-nums shrink-0 text-red-400 min-w-7 text-right">
                                        {g.count}×
                                    </span>
                                    <span className="font-mono text-[11px] flex-1 truncate" title={g.sample}>
                                        {g.signature || '(no error message)'}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                                        {relTime(g.lastSeen)}
                                    </span>
                                </div>
                                {expanded === g.signature && (
                                    <div className="mt-1.5 pl-9 space-y-1">
                                        <div className="text-[10px] text-muted-foreground/70 flex items-center gap-2 flex-wrap">
                                            <span>queues:</span>
                                            {g.queues.map(q => (
                                                <span key={q} className="font-mono">{q}</span>
                                            ))}
                                            <span className="opacity-50">·</span>
                                            <span>first seen {relTime(g.firstSeen)}</span>
                                        </div>
                                        <pre className="text-[11px] font-mono text-red-300/90 bg-red-500/5 border border-red-500/15 rounded-md px-2 py-1.5 whitespace-pre-wrap break-all">
                                            {g.sample}
                                        </pre>
                                    </div>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
                {groups.length > 8 && (
                    <div className="text-[10px] text-muted-foreground/70 mt-1.5 pl-2">
                        +{groups.length - 8} more group(s) not shown
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function EventRow({ event: e }: { event: ActivityEvent }) {
    return (
        <div className="grid grid-cols-[auto_120px_1fr_auto] gap-3 items-center px-3 py-2 text-xs">
            <span aria-hidden className={cn('size-1.5 rounded-full shrink-0', KIND_DOT[e.kind])} />
            <span className="font-mono text-[11px] text-muted-foreground truncate">
                {e.queue}
            </span>
            <span className="min-w-0 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', KIND_TONE[e.kind])}>
                    {e.kind}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground truncate" title={e.jobId}>
                    #{e.jobId}
                </span>
                {e.error && (
                    <span className="text-red-400/80 text-[11px] truncate" title={e.error}>
                        {e.error}
                    </span>
                )}
                {e.kind === 'progress' && e.progress !== undefined && (
                    <span className="text-amber-400/80 text-[11px] font-mono">
                        {typeof e.progress === 'number'
                            ? `${e.progress}%`
                            : JSON.stringify(e.progress).slice(0, 60)}
                    </span>
                )}
            </span>
            <span className="text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                {relTime(e.ts)}
            </span>
        </div>
    );
}
