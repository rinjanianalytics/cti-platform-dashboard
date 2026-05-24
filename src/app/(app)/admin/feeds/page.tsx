'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
    admin,
    type FeedScheduleEntry,
    type FeedSyncRun,
    type IntervalPreset,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import {
    Database, Play, Loader2, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock,
} from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { toast } from 'sonner';

const REFRESH_MS = 30_000;
const HISTORY_LIMIT = 20;

const PRESET_LABELS: Record<IntervalPreset, string> = {
    '15m':    'Every 15 minutes',
    '30m':    'Every 30 minutes',
    '1h':     'Every hour',
    '4h':     'Every 4 hours',
    '6h':     'Every 6 hours',
    'daily':  'Daily',
    'weekly': 'Weekly',
};

/** Convert a cron pattern to a short human label, matching the schedules page. */
function describeCron(cron: string | null): string {
    if (!cron) return 'disabled';
    const known: Record<string, string> = {
        '*/15 * * * *': 'every 15 minutes',
        '*/30 * * * *': 'every 30 minutes',
        '0 * * * *':    'every hour',
        '0 */4 * * *':  'every 4 hours',
        '0 */6 * * *':  'every 6 hours',
        '0 2 * * *':    'daily at 02:00',
        '0 4 * * 0':    'weekly · Sunday 04:00',
    };
    if (known[cron]) return known[cron];
    if (/^\d+ \*\/(\d+) \* \* \*$/.test(cron)) {
        const [, , hours] = cron.match(/^\d+ \*\/(\d+) \* \* \*$/) ?? [];
        return `every ${hours} hours`;
    }
    return cron;
}

/**
 * Feeds Management — feed-centric view of the schedule registry.
 *
 * Shows each upstream feed source (OTX, CISA, NVD, …) with its enable
 * state, current schedule, last-run summary, and an expandable history
 * panel showing the last 20 sync runs. Reuses /admin/schedules' update
 * + run-now endpoints, so feed control here is a thin wrapper.
 *
 * Deliberately separate from `/admin/schedules` because feeds are
 * special: analysts care about freshness and items ingested, not just
 * "did it run". The schedules page is correct for system maintenance
 * jobs; this page is the right surface for upstream feed health.
 */
export default function AdminFeedsPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const allowed = user?.role === 'admin' || user?.role === 'auditor';
    useEffect(() => {
        if (!authLoading && user && !allowed) router.replace('/');
    }, [user, authLoading, allowed, router]);

    const { data, isLoading, mutate } = useSWR(
        allowed ? 'admin:feeds' : null,
        () => admin.listFeeds(),
        { refreshInterval: REFRESH_MS, revalidateOnFocus: false },
    );

    const feeds = data?.feeds ?? [];
    const enabledCount = feeds.filter(f => f.enabled).length;
    const erroringCount = feeds.filter(f => f.lastRun && f.lastRun.status === 'failed').length;
    const ingestedRecent = feeds.reduce((sum, f) => sum + (f.lastRun?.itemsIngested ?? 0), 0);

    if (!user || !allowed) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin or auditor role required.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Feeds</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                        {isLoading
                            ? 'Loading…'
                            : `${enabledCount}/${feeds.length} active · ${ingestedRecent.toLocaleString()} items in last runs${erroringCount > 0 ? ` · ${erroringCount} failing` : ''}`}
                    </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => mutate()}>
                    <RefreshCw className="size-3.5" /> Refresh
                </Button>
            </div>

            {isLoading && (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading feeds…</CardContent></Card>
            )}

            {!isLoading && feeds.length === 0 && (
                <EmptyState
                    icon={Database}
                    title="No feeds configured"
                    description="Feed schedules live in apps/api/src/queues/scheduler.ts. Check the JOB_REGISTRY."
                />
            )}

            {!isLoading && feeds.length > 0 && (
                <div className="space-y-2">
                    {feeds.map(feed => (
                        <FeedRow key={feed.key} feed={feed} onChanged={() => mutate()} />
                    ))}
                </div>
            )}

            <p className="text-[11px] text-muted-foreground/70 italic mt-6">
                Auth keys live in <span className="font-mono">.env</span> for the
                worker process. A UI-driven credentials editor is a separate slice —
                see the docs/ARCHITECTURE.md follow-up notes.
            </p>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function FeedRow({
    feed, onChanged,
}: { feed: FeedScheduleEntry; onChanged: () => void }) {
    const [busy, setBusy] = useState(false);
    const [running, setRunning] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const update = async (patch: { enabled?: boolean; intervalPreset?: IntervalPreset | null }) => {
        setBusy(true);
        try {
            const r = await admin.updateSchedule(feed.key, patch);
            const status = r.reconciled.status;
            toast.success(
                status === 'enabled'
                    ? `${feed.source} · ${describeCron(r.reconciled.cron ?? null)}`
                    : `${feed.source} disabled`,
            );
            onChanged();
        } catch (err) {
            toast.error('Save failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const runNow = async () => {
        setRunning(true);
        try {
            const r = await admin.runScheduleNow(feed.key);
            toast.success(`${feed.source} · ad-hoc run queued`, { description: `job ${r.jobId}` });
        } catch (err) {
            toast.error('Run failed', { description: (err as Error).message });
        } finally {
            setRunning(false);
        }
    };

    const last = feed.lastRun;
    const lastFailing = last?.status === 'failed';
    const isCustomised = feed.override !== null;
    const presetValue: IntervalPreset | 'default' = feed.override?.intervalPreset ?? 'default';

    return (
        <Card className={cn(
            'transition-colors',
            !feed.enabled && 'opacity-60 border-l-2 border-l-amber-500/40',
            feed.enabled && lastFailing && 'border-l-2 border-l-red-500/50',
            feed.enabled && !lastFailing && isCustomised && 'border-l-2 border-l-brand/40',
        )}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            <Database className="size-4 text-muted-foreground" />
                            <span className="font-mono">{feed.source}</span>
                            {!feed.enabled && (
                                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-amber-500/15 text-amber-400 border-amber-500/30">
                                    Paused
                                </Badge>
                            )}
                            {feed.enabled && lastFailing && (
                                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-red-500/15 text-red-400 border-red-500/30">
                                    Last run failed
                                </Badge>
                            )}
                            {feed.enabled && isCustomised && !lastFailing && (
                                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-brand/15 text-brand border-brand/30">
                                    Customised
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">{feed.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Switch
                            checked={feed.enabled}
                            onCheckedChange={(checked) => update({ enabled: checked })}
                            disabled={busy}
                            aria-label={`${feed.enabled ? 'Disable' : 'Enable'} ${feed.source}`}
                        />
                        <Button size="sm" variant="outline" onClick={runNow} disabled={running || !feed.enabled}>
                            {running
                                ? <><Loader2 className="size-3.5 animate-spin" /> Running…</>
                                : <><Play className="size-3.5" /> Run now</>}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Interval preset */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Interval
                        </label>
                        <Select
                            value={presetValue}
                            onValueChange={(v) => {
                                const next = v === 'default' ? null : (v as IntervalPreset);
                                update({ intervalPreset: next });
                            }}
                            disabled={busy || !feed.enabled}
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="default">
                                    Use code default · {describeCron(feed.defaultCron)}
                                </SelectItem>
                                {Object.entries(PRESET_LABELS).map(([k, label]) => (
                                    <SelectItem key={k} value={k}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Last run summary */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Last run
                        </label>
                        <div className="h-9 inline-flex items-center gap-2 text-xs">
                            {last ? (
                                <>
                                    {last.status === 'completed'
                                        ? <CheckCircle2 className="size-3.5 text-emerald-500" />
                                        : <XCircle className="size-3.5 text-red-500" />}
                                    <span className="tabular-nums">{relTime(last.startedAt)}</span>
                                    <span className="opacity-50">·</span>
                                    <span className="font-mono tabular-nums">
                                        {last.itemsIngested.toLocaleString()} items
                                    </span>
                                    {last.errors > 0 && (
                                        <>
                                            <span className="opacity-50">·</span>
                                            <span className="font-mono tabular-nums text-red-400">
                                                {last.errors} errors
                                            </span>
                                        </>
                                    )}
                                    {last.durationMs != null && (
                                        <>
                                            <span className="opacity-50">·</span>
                                            <span className="font-mono tabular-nums text-muted-foreground">
                                                {(last.durationMs / 1000).toFixed(1)}s
                                            </span>
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Clock className="size-3.5 text-muted-foreground" />
                                    <span className="text-muted-foreground">No runs recorded yet</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer micro-row + history expand */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 font-mono tabular-nums pt-2 mt-2 border-t border-border/50">
                    <span>
                        active: <span className="text-muted-foreground">{describeCron(feed.effectiveCron)}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setExpanded(e => !e)}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                        {expanded
                            ? <><ChevronDown className="size-3" /> Hide history</>
                            : <><ChevronRight className="size-3" /> Show history</>}
                    </button>
                </div>

                {expanded && <HistoryPanel feedSource={feed.source} />}
            </CardContent>
        </Card>
    );
}

function HistoryPanel({ feedSource }: { feedSource: string }) {
    const { data, isLoading } = useSWR(
        ['admin:feed:history', feedSource],
        () => admin.feedHistory(feedSource, HISTORY_LIMIT),
        { revalidateOnFocus: false },
    );

    const runs: FeedSyncRun[] = data?.runs ?? [];

    if (isLoading) {
        return <div className="mt-3 text-[11px] text-muted-foreground/70">Loading history…</div>;
    }
    if (runs.length === 0) {
        return <div className="mt-3 text-[11px] text-muted-foreground/70 italic">No sync history yet.</div>;
    }

    return (
        <div className="mt-3 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Last {runs.length} runs
            </div>
            <ul className="space-y-1">
                {runs.map(r => (
                    <li key={r.id} className="grid grid-cols-[14px_1fr_auto_auto_auto] gap-2 items-center text-[11px] tabular-nums">
                        {r.status === 'completed'
                            ? <CheckCircle2 className="size-3 text-emerald-500" />
                            : r.status === 'failed'
                                ? <XCircle className="size-3 text-red-500" />
                                : <Loader2 className="size-3 text-muted-foreground animate-spin" />}
                        <span className="font-mono text-muted-foreground truncate" title={r.startedAt}>
                            {relTime(r.startedAt)}
                        </span>
                        <span className="font-mono">{r.itemsIngested.toLocaleString()} items</span>
                        <span className={cn('font-mono', r.errors > 0 ? 'text-red-400' : 'text-muted-foreground/60')}>
                            {r.errors} err
                        </span>
                        <span className="font-mono text-muted-foreground/70">
                            {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
