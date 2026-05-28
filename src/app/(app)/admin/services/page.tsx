'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type AdminServicesReport } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    Database, Cpu, Workflow, Radio, RefreshCw, Sparkles,
    Play, ServerCog, AlertTriangle,
} from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { PageHeader } from '@/components/admin/page-header';
import { StatusTile } from '@/components/admin/stat';
import { StatusBadge, type StatusKind } from '@/lib/tone';

const REFRESH_MS = 15_000;

/**
 * Services — single pane of glass for ops health.
 *
 * The previous version was seven sibling cards (Processes / Datastores /
 * AI providers / Optional / Enrichment / Queues / Feeds), each with its
 * own grid strategy. An admin had to scan top-to-bottom to figure out
 * "what's broken" because failures were scattered across panels.
 *
 * This version collapses everything into two panels:
 *   • **System health** — every probe (datastores, process, AI, enrichment,
 *     optional integrations), grouped by category but rendered as one
 *     uniform StatusTile grid. A failure count rides the header so the
 *     "everything's fine" / "two things are red" read is instant.
 *   • **Operations** — queue depths and feed sync history side-by-side.
 *     This is the "things that should be flowing" pane; separate from
 *     the binary up/down probes above.
 */

interface Probe {
    label: string;
    tone: StatusKind;
    detail: string;
    /** Source category — used to group within the Health card. */
    group: 'data' | 'process' | 'ai' | 'enrichment' | 'optional';
}

export default function AdminServicesPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

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

    const probes = useMemo(() => (data ? buildProbes(data) : []), [data]);
    const failingCount = probes.filter(p => p.tone === 'failed').length;
    const idleCount = probes.filter(p => p.tone === 'idle').length;

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Services"
                description={
                    !data
                        ? `Auto-refreshes every ${Math.round(REFRESH_MS / 1000)}s.`
                        : `${probes.length - failingCount - idleCount} healthy · ${failingCount} failing · ${idleCount} inactive`
                }
                actions={
                    <Button size="sm" variant="outline" onClick={() => mutate()} disabled={isLoading}>
                        <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} /> Refresh now
                    </Button>
                }
            />

            {/* ── Panel 1 · System health ─────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <ServerCog className="size-4 text-muted-foreground" /> System health
                        {failingCount > 0 && (
                            <StatusBadge kind="failed">{failingCount} failing</StatusBadge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {!data ? (
                        <SkeletonGrid />
                    ) : (
                        <>
                            <ProbeGroup title="Datastores" icon={Database} probes={probes.filter(p => p.group === 'data')} />
                            <ProbeGroup title="Process"    icon={Cpu}      probes={probes.filter(p => p.group === 'process')} />
                            <ProbeGroup title="AI providers + enrichment" icon={Sparkles}
                                probes={[...probes.filter(p => p.group === 'ai'), ...probes.filter(p => p.group === 'enrichment')]} />
                            {probes.some(p => p.group === 'optional') && (
                                <ProbeGroup title="Optional integrations" icon={ServerCog}
                                    probes={probes.filter(p => p.group === 'optional')} />
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ── Panel 2 · Operations (queues + feeds side-by-side) ─────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Workflow className="size-4 text-muted-foreground" /> Queue depths
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        {!data ? <SkeletonRows /> : data.queues.length === 0 ? (
                            <p className="text-sm text-muted-foreground px-4">No queue stats — is Redis reachable?</p>
                        ) : (
                            <QueueTable data={data} />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Radio className="size-4 text-muted-foreground" /> Feed syncs
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        {!data ? <SkeletonRows /> : data.feeds.length === 0 ? (
                            <p className="text-sm text-muted-foreground px-4">No feed sync history yet.</p>
                        ) : (
                            <FeedTable feeds={data.feeds} onSynced={() => mutate()} />
                        )}
                    </CardContent>
                </Card>
            </div>

            <p className="text-[11px] text-muted-foreground/70 italic">
                OSV (primary) covers most OSS CVEs with no auth or rate limit. NVD (fallback) covers
                everything else; rate-limited without an API key.
            </p>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Probe assembly — flatten the report into a uniform list of probes.          */
/* -------------------------------------------------------------------------- */

function buildProbes(d: AdminServicesReport): Probe[] {
    const out: Probe[] = [];

    // Datastores
    out.push({
        group: 'data', label: 'Postgres',
        tone: d.datastores.postgres.connected ? 'success' : 'failed',
        detail: fmtLatency(d.datastores.postgres.latencyMs, d.datastores.postgres.error),
    });
    out.push({
        group: 'data', label: 'OpenSearch',
        tone: d.datastores.opensearch.connected ? 'success' : 'failed',
        detail: fmtLatency(d.datastores.opensearch.latencyMs, d.datastores.opensearch.error, d.datastores.opensearch.status),
    });
    out.push({
        group: 'data', label: 'Redis',
        tone: (d.datastores.redis.queue.connected && d.datastores.redis.cache.connected) ? 'success' : 'failed',
        detail: `queue ${fmtMs(d.datastores.redis.queue.latency)} · cache ${fmtMs(d.datastores.redis.cache.latency)}`,
    });
    out.push({
        group: 'data', label: 'Neo4j',
        tone: d.datastores.neo4j.connected ? 'success' : 'failed',
        detail: fmtLatency(d.datastores.neo4j.latencyMs, d.datastores.neo4j.error),
    });

    // Process
    out.push({
        group: 'process', label: 'API',
        tone: 'success',
        detail: d.process.bootlockHeldByThisProcess ? 'Serving HTTP · holds bootlock' : 'Serving HTTP',
    });
    out.push({
        group: 'process', label: 'Worker',
        tone: d.process.workerActive ? 'success' : 'failed',
        detail: d.process.workerActive
            ? `${d.process.totalConnectedWorkers} workers · ${d.process.workersByQueue.length} queues`
            : 'No workers connected',
    });
    // Bootlock — three distinct states matter to an operator:
    //   held    : someone owns it, services are running. Green.
    //   unowned : Redis is reachable but nothing claims the lock; usually a
    //             tsx-watch reload tore the previous holder down. The
    //             non-owner process polls every 30s (TTL) and will reclaim;
    //             mark amber/paused so the operator knows it's transient.
    //   error   : Redis itself is unreachable, can't tell. Red.
    // For older API instances that don't yet return `bootlockState`, fall
    // back to the original owner-string check.
    {
        const owner = d.process.bootlockOwner;
        const state = d.process.bootlockState ?? (owner ? 'held' : 'unowned');
        const tone: StatusKind =
            state === 'held'  ? 'success'
          : state === 'error' ? 'failed'
          :                     'paused';
        const detail =
            state === 'held'  ? (owner ?? 'held')
          : state === 'error' ? `Redis unreachable: ${d.process.bootlockError ?? 'unknown'}`
          :                     'Unowned · reclaim poller will retry within 30s';
        out.push({ group: 'process', label: 'Bootlock', tone, detail });
    }

    // AI providers
    out.push({
        group: 'ai', label: 'Gemini',
        tone: d.llm.gemini.configured ? 'success' : 'paused',
        detail: d.llm.gemini.configured ? 'API key set' : 'No GEMINI_API_KEY',
    });
    out.push({
        group: 'ai', label: 'OpenRouter',
        tone: d.llm.openrouter.configured ? 'success' : 'paused',
        detail: d.llm.openrouter.configured ? 'API key set' : 'No OPENROUTER_API_KEY',
    });
    out.push({
        group: 'ai', label: 'Ollama',
        tone: d.llm.ollama.available ? 'idle' : 'failed',
        detail: 'Local fallback',
    });

    // Enrichment sources
    for (const [name, s] of Object.entries(d.enrichmentSources)) {
        out.push({
            group: 'enrichment',
            label: enrichmentLabel(name),
            tone: s.error ? 'failed' : s.available ? 'success' : 'failed',
            detail: enrichmentDetail(name, s),
        });
    }

    // Optional integrations
    for (const [name, s] of Object.entries(d.optionalServices)) {
        out.push({
            group: 'optional', label: name,
            tone: s.available ? 'success' : 'idle',
            detail: s.available ? 'Active' : 'Unavailable',
        });
    }

    return out;
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function ProbeGroup({
    title, icon: Icon, probes,
}: { title: string; icon: typeof Database; probes: Probe[] }) {
    if (probes.length === 0) return null;
    // Sort: failed first (red catches the eye), then paused, then healthy/idle.
    const priority: Record<StatusKind, number> = {
        failed: 0, paused: 1, custom: 2, active: 2, success: 3, idle: 4,
    };
    const sorted = [...probes].sort((a, b) => priority[a.tone] - priority[b.tone]);
    return (
        <section>
            <div className="flex items-center gap-2 mb-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80">
                <Icon className="size-3" /> {title}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {sorted.map(p => (
                    <StatusTile key={p.label} label={p.label} tone={p.tone} detail={p.detail} />
                ))}
            </div>
        </section>
    );
}

function QueueTable({ data }: { data: AdminServicesReport }) {
    return (
        <div className="divide-y divide-border/40">
            <div className="grid grid-cols-[1fr_44px_44px_44px_44px] px-4 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                <span>Queue</span>
                <span className="text-right">Wkr</span>
                <span className="text-right">Wait</span>
                <span className="text-right">Act</span>
                <span className="text-right">Fail</span>
            </div>
            {data.queues.map(q => {
                const workers = data.process.workersByQueue.find(w => w.queue === q.name)?.workerCount ?? 0;
                return (
                    <div key={q.name} className="grid grid-cols-[1fr_44px_44px_44px_44px] px-4 py-1.5 text-xs items-center">
                        <span className="font-mono truncate">{q.name}</span>
                        <span className={cn('text-right tabular-nums font-mono', workers === 0 ? 'text-red-400' : 'text-emerald-400')}>
                            {workers}
                        </span>
                        <span className="text-right tabular-nums font-mono text-muted-foreground">{q.waiting}</span>
                        <span className={cn('text-right tabular-nums font-mono', q.active > 0 && 'text-blue-400')}>{q.active}</span>
                        <span className={cn('text-right tabular-nums font-mono', q.failed > 0 ? 'text-red-400' : 'text-muted-foreground/60')}>{q.failed}</span>
                    </div>
                );
            })}
        </div>
    );
}

function FeedTable({
    feeds, onSynced,
}: { feeds: AdminServicesReport['feeds']; onSynced: () => void }) {
    return (
        <div className="divide-y divide-border/40">
            {feeds.map(f => <FeedRow key={f.feed} feed={f} onSynced={onSynced} />)}
        </div>
    );
}

function FeedRow({ feed: f, onSynced }: {
    feed: AdminServicesReport['feeds'][number];
    onSynced: () => void;
}) {
    const failed = f.status !== 'success' || !!f.errorMessage;
    const [syncing, setSyncing] = useState(false);

    const onSync = async () => {
        if (!f.registryKey) return;
        setSyncing(true);
        try {
            const job = await admin.syncFeed(f.registryKey);
            toast.success(`Queued ${f.registryKey} sync`, { description: `Job ${job.jobId}` });
            setTimeout(onSynced, 1500);
        } catch (err) {
            toast.error('Sync trigger failed', { description: (err as Error).message });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="grid grid-cols-[1fr_auto_28px] gap-2 px-4 py-2 items-center text-xs">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono truncate">{f.feed}</span>
                    {failed && (
                        <AlertTriangle className="size-3 text-red-400 shrink-0" aria-label="last sync failed" />
                    )}
                </div>
                <div className="text-[10px] text-muted-foreground/80 font-mono tabular-nums mt-0.5 truncate">
                    {f.lastSync ? relTime(f.lastSync) : 'never'}
                    {f.itemsProcessed > 0 && ` · ${f.itemsProcessed.toLocaleString()} new`}
                    {f.itemsFailed > 0 && <span className="text-red-400"> · {f.itemsFailed} failed</span>}
                </div>
            </div>
            <span className="text-[10px] text-red-400/90 max-w-40 truncate font-mono" title={f.errorMessage ?? undefined}>
                {failed ? (f.errorMessage ?? f.status) : ''}
            </span>
            <Button
                size="xs"
                variant="ghost"
                onClick={onSync}
                disabled={syncing || !f.registryKey}
                title={f.registryKey ? `Queue ${f.registryKey} sync` : 'No registered handler for this feed'}
                className="justify-self-end"
            >
                <Play className="size-3" />
            </Button>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Skeletons + formatters                                                      */
/* -------------------------------------------------------------------------- */

function SkeletonGrid() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
    );
}
function SkeletonRows() {
    return <div className="space-y-1.5 px-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>;
}

function fmtLatency(ms?: number, err?: string, status?: string): string {
    if (err) return err.slice(0, 60);
    const parts: string[] = [];
    if (ms != null) parts.push(`${ms}ms`);
    if (status) parts.push(status);
    return parts.join(' · ') || 'OK';
}
function fmtMs(ms?: number): string {
    return ms != null ? `${ms}ms` : '—';
}

function enrichmentLabel(key: string): string {
    switch (key) {
        case 'osv': return 'OSV';
        case 'nvd': return 'NVD';
        default:    return key;
    }
}

function enrichmentDetail(
    key: string,
    s: { available: boolean; configured: boolean; latencyMs?: number; note?: string; error?: string },
): string {
    if (s.error) return `Error: ${s.error}`;
    if (key === 'osv') {
        return s.available
            ? `Reachable · ${fmtMs(s.latencyMs)}`
            : 'Unreachable';
    }
    return s.note ?? (s.configured ? 'API key set' : 'No API key');
}
