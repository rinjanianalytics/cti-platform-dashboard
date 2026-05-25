'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type QueueJob, type QueueJobState } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, RotateCcw, Trash2, RefreshCw, Inbox, Zap } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { toast } from 'sonner';
import { StatusBadge } from '@/lib/tone';

const STATES: QueueJobState[] = ['waiting', 'active', 'failed', 'completed', 'delayed'];
const PAGE_SIZE = 50;
const REFRESH_MS = 5_000;

export default function QueueInspectorPage({ params }: { params: Promise<{ name: string }> }) {
    const { name: rawName } = use(params);
    const name = decodeURIComponent(rawName);
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') router.replace('/');
    }, [user, authLoading, router]);

    const [state, setState] = useState<QueueJobState>('waiting');
    const [page, setPage] = useState(0);
    const [openId, setOpenId] = useState<string | null>(null);

    const { data, isLoading, mutate } = useSWR(
        user?.role === 'admin' ? ['admin:queue-jobs', name, state, page] : null,
        () => admin.listQueueJobs(name, { state, start: page * PAGE_SIZE, limit: PAGE_SIZE }),
        { refreshInterval: state === 'active' || state === 'waiting' ? REFRESH_MS : 0 },
    );

    const jobs = data?.jobs ?? [];

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    const onAction = async (job: QueueJob, action: 'retry' | 'remove' | 'promote') => {
        try {
            if (action === 'retry') {
                await admin.retryQueueJob(name, job.id);
                toast.success(`Re-queued job ${job.id}`);
            } else if (action === 'promote') {
                await admin.promoteQueueJob(name, job.id);
                toast.success(`Promoted job ${job.id} to run now`);
            } else {
                await admin.removeQueueJob(name, job.id);
                toast.success(`Removed job ${job.id}`);
            }
            await mutate();
        } catch (err) {
            toast.error(`${action} failed`, { description: (err as Error).message });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <Link
                        href="/admin/queues"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
                    >
                        <ArrowLeft className="size-3.5" /> All queues
                    </Link>
                    <h1 className="text-3xl font-semibold tracking-tight font-mono">{name}</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                        {isLoading ? 'Loading…' : `${jobs.length.toLocaleString()} ${state} job${jobs.length === 1 ? '' : 's'}`}
                    </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => mutate()}>
                    <RefreshCw className="size-3.5" /> Refresh
                </Button>
            </div>

            <Tabs value={state} onValueChange={(v) => { setState(v as QueueJobState); setPage(0); setOpenId(null); }}>
                <TabsList>
                    {STATES.map((s) => (
                        <TabsTrigger key={s} value={s} className="font-mono text-xs uppercase">{s}</TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {isLoading && (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading jobs…</CardContent></Card>
            )}

            {!isLoading && jobs.length === 0 && (
                <EmptyState
                    icon={Inbox}
                    title={`No ${state} jobs`}
                    description={state === 'failed'
                        ? 'No jobs in this queue have failed within the visible window.'
                        : `The queue has nothing in the ${state} state right now.`}
                />
            )}

            {!isLoading && jobs.length > 0 && (
                <div className="space-y-1.5">
                    {jobs.map((job) => (
                        <JobRow
                            key={job.id}
                            job={job}
                            state={state}
                            expanded={openId === job.id}
                            onToggle={() => setOpenId(openId === job.id ? null : job.id)}
                            onAction={onAction}
                        />
                    ))}
                </div>
            )}

            {!isLoading && jobs.length === PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                        Previous
                    </Button>
                    <span className="tabular-nums">Page {page + 1}</span>
                    <Button size="sm" variant="ghost" onClick={() => setPage((p) => p + 1)}>
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}

function JobRow({
    job, state, expanded, onToggle, onAction,
}: {
    job: QueueJob;
    state: QueueJobState;
    expanded: boolean;
    onToggle: () => void;
    onAction: (job: QueueJob, a: 'retry' | 'remove' | 'promote') => void;
}) {
    const failed = state === 'failed' || !!job.failedReason;
    const delayed = state === 'delayed';
    const created = job.timestamp ? new Date(job.timestamp).toISOString() : null;
    const finished = job.finishedOn ? new Date(job.finishedOn).toISOString() : null;

    return (
        <Card className={cn(
            'transition-colors',
            failed && 'border-l-2 border-l-red-500/50',
            state === 'active' && 'border-l-2 border-l-blue-500/50',
            delayed && 'border-l-2 border-l-amber-500/40',
        )}>
            <CardContent className="py-3">
                <button
                    type="button"
                    onClick={onToggle}
                    className="w-full text-left flex items-center gap-3"
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono truncate">{job.name || '(anon)'}</span>
                            <Badge variant="outline" className="font-mono text-[10px]">#{job.id}</Badge>
                            {job.attemptsMade > 0 && (
                                <StatusBadge kind="paused">
                                    {job.attemptsMade} attempt{job.attemptsMade > 1 ? 's' : ''}
                                </StatusBadge>
                            )}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                            queued {relTime(created)}
                            {finished && state !== 'waiting' && ` · finished ${relTime(finished)}`}
                        </div>
                    </div>
                </button>

                {expanded && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                        {job.failedReason && (
                            <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Error</div>
                                <pre className="text-xs bg-red-500/5 border border-red-500/20 text-red-300 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
                                    {job.failedReason}
                                </pre>
                            </div>
                        )}
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Payload</div>
                            <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-x-auto font-mono">
                                {JSON.stringify(job.data, null, 2)}
                            </pre>
                        </div>
                        {job.result !== undefined && job.result !== null && (
                            <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Result</div>
                                <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-x-auto font-mono max-h-40">
                                    {typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}
                                </pre>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {delayed && (
                                <Button size="sm" variant="outline" onClick={() => onAction(job, 'promote')}>
                                    <Zap className="size-3.5" /> Run now
                                </Button>
                            )}
                            {failed && (
                                <Button size="sm" variant="outline" onClick={() => onAction(job, 'retry')}>
                                    <RotateCcw className="size-3.5" /> Retry
                                </Button>
                            )}
                            {(state === 'failed' || state === 'completed' || state === 'waiting' || state === 'delayed') && (
                                <Button size="sm" variant="ghost" className="text-red-400" onClick={() => onAction(job, 'remove')}>
                                    <Trash2 className="size-3.5" /> Remove
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
