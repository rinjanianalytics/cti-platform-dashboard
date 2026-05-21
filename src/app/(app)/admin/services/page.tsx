'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type AdminServicesReport } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    CheckCircle2, AlertCircle, MinusCircle, Database, Cpu, Workflow,
    Radio, RefreshCw, ServerCog, Sparkles, Play,
} from 'lucide-react';
import { cn, relTime } from '@/lib/utils';

const REFRESH_MS = 15_000;

export default function AdminServicesPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    // Hard gate — viewers / analysts redirected away from /admin/*.
    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') {
            router.replace('/');
        }
    }, [user, authLoading, router]);

    const { data, isLoading, mutate } = useSWR<AdminServicesReport>(
        user?.role === 'admin' ? 'admin:services' : null,
        () => admin.services(),
        { refreshInterval: REFRESH_MS },
    );

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Datastores, workers, queues, and feeds at a glance. Auto-refreshes every {Math.round(REFRESH_MS / 1000)}s.
                    </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => mutate()} disabled={isLoading}>
                    <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} /> Refresh now
                </Button>
            </div>

            {/* ── Process / worker liveness ─────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Cpu className="size-4 text-muted-foreground" /> Processes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!data ? (
                        <SkeletonStrip n={3} />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <StatusTile
                                label="API"
                                ok
                                detail={data.process.bootlockHeldByThisProcess ? 'Holds bootlock (running background services)' : 'Serving HTTP'}
                            />
                            <StatusTile
                                label="Worker"
                                ok={data.process.workerActive}
                                detail={data.process.workerActive
                                    ? `${data.process.totalConnectedWorkers} workers across ${data.process.workersByQueue.length} queues`
                                    : 'No workers connected — run `pnpm --filter @rinjani/worker dev:workers`'}
                            />
                            <StatusTile
                                label="Bootlock holder"
                                ok={!!data.process.bootlockOwner}
                                detail={data.process.bootlockOwner ?? 'Nobody holds the lock — scheduler is not running'}
                                muted
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Datastores ────────────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Database className="size-4 text-muted-foreground" /> Datastores
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!data ? <SkeletonStrip n={4} /> : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <StatusTile label="Postgres"   ok={data.datastores.postgres.connected}   detail={fmtLat(data.datastores.postgres.latencyMs, data.datastores.postgres.error)} />
                            <StatusTile label="OpenSearch" ok={data.datastores.opensearch.connected} detail={fmtLat(data.datastores.opensearch.latencyMs, data.datastores.opensearch.error, data.datastores.opensearch.status)} />
                            <StatusTile label="Redis"      ok={data.datastores.redis.queue.connected && data.datastores.redis.cache.connected} detail={`queue ${fmtLatN(data.datastores.redis.queue.latency)} · cache ${fmtLatN(data.datastores.redis.cache.latency)}`} />
                            <StatusTile label="Neo4j"      ok={data.datastores.neo4j.connected}      detail={fmtLat(data.datastores.neo4j.latencyMs, data.datastores.neo4j.error)} />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── LLM + Optional services ───────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="size-4 text-muted-foreground" /> AI providers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!data ? <SkeletonStrip n={3} /> : (
                            <div className="grid grid-cols-3 gap-3 text-sm">
                                <StatusTile label="Gemini"     ok={data.llm.gemini.configured}     detail={data.llm.gemini.configured ? 'API key set' : 'No GEMINI_API_KEY'} />
                                <StatusTile label="OpenRouter" ok={data.llm.openrouter.configured} detail={data.llm.openrouter.configured ? 'API key set' : 'No OPENROUTER_API_KEY'} />
                                <StatusTile label="Ollama"     ok={data.llm.ollama.available}      detail="Local fallback" muted />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ServerCog className="size-4 text-muted-foreground" /> Optional services
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!data ? <SkeletonStrip n={4} /> : (
                            <div className="grid grid-cols-4 gap-3 text-sm">
                                {Object.entries(data.optionalServices).map(([name, s]) => (
                                    <StatusTile
                                        key={name}
                                        label={name}
                                        ok={s.available}
                                        detail={s.available ? 'Active' : 'Unavailable'}
                                        muted
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Queues ────────────────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Workflow className="size-4 text-muted-foreground" /> Queues
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    {!data ? <SkeletonRows /> : data.queues.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-6">No queue stats available — is Redis reachable?</p>
                    ) : (
                        <div className="divide-y -mx-3">
                            <div className="grid grid-cols-[1fr_60px_60px_60px_60px_60px_60px] px-6 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                <span>Queue</span>
                                <span className="text-right">Workers</span>
                                <span className="text-right">Waiting</span>
                                <span className="text-right">Active</span>
                                <span className="text-right">Delayed</span>
                                <span className="text-right">Failed</span>
                                <span className="text-right">Done</span>
                            </div>
                            {data.queues.map(q => {
                                const workers = data.process.workersByQueue.find(w => w.queue === q.name)?.workerCount ?? 0;
                                return (
                                    <div key={q.name} className="grid grid-cols-[1fr_60px_60px_60px_60px_60px_60px] px-6 py-1.5 text-xs items-center">
                                        <span className="font-mono">{q.name}</span>
                                        <span className={cn('text-right tabular-nums', workers === 0 ? 'text-red-400' : 'text-emerald-400')}>
                                            {workers}
                                        </span>
                                        <span className="text-right tabular-nums text-muted-foreground">{q.waiting}</span>
                                        <span className="text-right tabular-nums">{q.active}</span>
                                        <span className="text-right tabular-nums text-muted-foreground">{q.delayed}</span>
                                        <span className={cn('text-right tabular-nums', q.failed > 0 && 'text-amber-400')}>{q.failed}</span>
                                        <span className="text-right tabular-nums text-muted-foreground">{q.completed.toLocaleString()}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Feeds ─────────────────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Radio className="size-4 text-muted-foreground" /> Feed syncs
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    {!data ? <SkeletonRows /> : data.feeds.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-6">No feed sync history yet.</p>
                    ) : (
                        <div className="divide-y -mx-3">
                            {data.feeds.map(f => <FeedRow key={f.feed} feed={f} onSynced={() => mutate()} />)}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function StatusTile({
    label, ok, detail, muted,
}: { label: string; ok: boolean; detail?: string; muted?: boolean }) {
    const Icon = muted ? MinusCircle : ok ? CheckCircle2 : AlertCircle;
    const tone = muted
        ? 'text-muted-foreground'
        : ok ? 'text-emerald-500' : 'text-red-500';
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Icon className={cn('size-3.5', tone)} />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
            </div>
            {detail && <p className="text-[11px] text-muted-foreground leading-snug">{detail}</p>}
        </div>
    );
}

function FeedRow({ feed: f, onSynced }: {
    feed: AdminServicesReport['feeds'][number];
    onSynced: () => void;
}) {
    const ok = f.status === 'success' && !f.errorMessage;
    const [syncing, setSyncing] = useState(false);

    const onSync = async () => {
        if (!f.registryKey) return;
        setSyncing(true);
        try {
            const job = await admin.syncFeed(f.registryKey);
            toast.success(`Queued ${f.registryKey} sync`, { description: `Job ${job.jobId}` });
            // Give the worker a moment to mark the job active before we re-poll.
            setTimeout(onSynced, 1500);
        } catch (err) {
            toast.error('Sync trigger failed', { description: (err as Error).message });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="grid grid-cols-[1fr_120px_100px_120px_1.5fr_70px] gap-3 px-6 py-2 items-center text-xs">
            <span className="font-mono truncate">{f.feed}</span>
            <span className="text-right tabular-nums">{f.itemsProcessed.toLocaleString()} new</span>
            <span className={cn('text-right tabular-nums', f.itemsFailed > 0 && 'text-amber-400')}>
                {f.itemsFailed} failed
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{f.lastSync ? relTime(f.lastSync) : '—'}</span>
            <span className="min-w-0 truncate">
                {ok ? (
                    <Badge variant="outline" className="text-[9px] uppercase font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        success
                    </Badge>
                ) : (
                    <span className="text-[11px] text-red-400 truncate" title={f.errorMessage ?? f.status}>
                        {f.errorMessage ?? f.status}
                    </span>
                )}
            </span>
            <Button
                size="xs"
                variant="outline"
                onClick={onSync}
                disabled={syncing || !f.registryKey}
                title={f.registryKey ? `Queue ${f.registryKey} sync` : 'No registered handler for this feed'}
                className="justify-self-end"
            >
                <Play className="size-3" />
                {syncing ? '…' : 'Sync'}
            </Button>
        </div>
    );
}

function SkeletonStrip({ n }: { n: number }) {
    return (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
    );
}

function SkeletonRows() {
    return <div className="space-y-2 px-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>;
}

/* -------------------------------------------------------------------------- */

function fmtLat(ms?: number, err?: string, status?: string): string {
    if (err) return err.slice(0, 60);
    const parts: string[] = [];
    if (ms != null) parts.push(`${ms}ms`);
    if (status) parts.push(status);
    return parts.join(' · ') || 'OK';
}
function fmtLatN(ms?: number): string {
    return ms != null ? `${ms}ms` : '—';
}
