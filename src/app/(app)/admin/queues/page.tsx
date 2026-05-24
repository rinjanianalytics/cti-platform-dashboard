'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type QueueStats } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Layers, Pause, Play, Trash2, RotateCcw, ChevronRight, MoreVertical, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const REFRESH_MS = 10_000;

export default function AdminQueuesPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') router.replace('/');
    }, [user, authLoading, router]);

    const { data, isLoading, mutate } = useSWR(
        user?.role === 'admin' ? 'admin:queues' : null,
        () => admin.queueStats(),
        { refreshInterval: REFRESH_MS },
    );

    const queues: QueueStats[] = data?.queues ?? [];

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Queues</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                        {isLoading
                            ? 'Loading…'
                            : `${queues.length} queue${queues.length === 1 ? '' : 's'} · refreshing every ${REFRESH_MS / 1000}s`}
                    </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => mutate()}>
                    <RefreshCw className="size-3.5" /> Refresh
                </Button>
            </div>

            {isLoading && (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading queues…</CardContent></Card>
            )}

            {!isLoading && queues.length > 0 && (
                <div className="space-y-2">
                    {queues.map((q) => (
                        <QueueRow key={q.name} queue={q} onChanged={() => mutate()} />
                    ))}
                </div>
            )}
        </div>
    );
}

function QueueRow({ queue: q, onChanged }: { queue: QueueStats; onChanged: () => void }) {
    const totalBacklog = q.waiting + q.delayed;
    const hasFailures = q.failed > 0;
    const hasWork = q.active > 0;

    return (
        <Card className={cn(
            'border-l-2 transition-colors',
            q.isPaused && 'border-l-amber-500/50 bg-amber-500/5',
            !q.isPaused && hasFailures && 'border-l-red-500/40',
            !q.isPaused && !hasFailures && hasWork && 'border-l-blue-500/40',
            !q.isPaused && !hasFailures && !hasWork && 'border-l-transparent',
        )}>
            <CardContent className="py-3 flex items-center gap-4">
                <Link
                    href={`/admin/queues/${encodeURIComponent(q.name)}`}
                    className="flex-1 min-w-0 flex items-center gap-3 -my-3 py-3 hover:opacity-80 transition-opacity"
                >
                    <Layers className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium font-mono truncate">{q.name}</span>
                            {q.isPaused && (
                                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-amber-500/15 text-amber-400 border-amber-500/30">
                                    Paused
                                </Badge>
                            )}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                            {totalBacklog > 0
                                ? `${totalBacklog.toLocaleString()} pending`
                                : 'No backlog'}
                            {hasWork && ` · ${q.active} running`}
                        </div>
                    </div>
                </Link>

                <div className="hidden sm:flex items-center gap-4 text-xs tabular-nums">
                    <Stat label="waiting" value={q.waiting} />
                    <Stat label="active" value={q.active} tone="blue" />
                    <Stat label="failed" value={q.failed} tone={q.failed > 0 ? 'red' : 'mute'} />
                    <Stat label="done" value={q.completed} tone="mute" />
                </div>

                <QueueActions queue={q} onChanged={onChanged} />

                <Link
                    href={`/admin/queues/${encodeURIComponent(q.name)}`}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Open queue"
                >
                    <ChevronRight className="size-4" />
                </Link>
            </CardContent>
        </Card>
    );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'blue' | 'red' | 'mute' }) {
    const cls = {
        default: 'text-foreground',
        blue: value > 0 ? 'text-blue-400' : 'text-muted-foreground/60',
        red: value > 0 ? 'text-red-400' : 'text-muted-foreground/60',
        mute: 'text-muted-foreground/60',
    }[tone];
    return (
        <div className="text-center">
            <div className={cn('font-mono', cls)}>{value.toLocaleString()}</div>
            <div className="text-[9px] uppercase text-muted-foreground/70 tracking-wide">{label}</div>
        </div>
    );
}

function QueueActions({ queue: q, onChanged }: { queue: QueueStats; onChanged: () => void }) {
    const [busy, setBusy] = useState(false);
    const [drainOpen, setDrainOpen] = useState(false);

    const togglePause = async () => {
        setBusy(true);
        try {
            if (q.isPaused) {
                await admin.resumeQueue(q.name);
                toast.success(`${q.name} resumed`);
            } else {
                await admin.pauseQueue(q.name);
                toast.success(`${q.name} paused`);
            }
            onChanged();
        } catch (err) {
            toast.error('Action failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const retryAll = async () => {
        if (q.failed === 0) return;
        setBusy(true);
        try {
            const r = await admin.retryAllFailed(q.name);
            toast.success(`Retrying ${r.retried}/${r.totalFailed} failed jobs`);
            onChanged();
        } catch (err) {
            toast.error('Retry failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const drain = async () => {
        setBusy(true);
        try {
            await admin.drainQueue(q.name);
            toast.success(`${q.name} drained`, { description: 'All waiting jobs removed.' });
            setDrainOpen(false);
            onChanged();
        } catch (err) {
            toast.error('Drain failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const cleanCompleted = async () => {
        setBusy(true);
        try {
            const r = await admin.cleanQueue(q.name, 'completed', { grace: 0, limit: 1000 });
            toast.success(`Removed ${r.removed} completed jobs`);
            onChanged();
        } catch (err) {
            toast.error('Clean failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="size-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`Actions for ${q.name}`}
                >
                    <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); togglePause(); }} disabled={busy}>
                        {q.isPaused
                            ? <><Play className="size-3.5" /> Resume queue</>
                            : <><Pause className="size-3.5" /> Pause queue</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); retryAll(); }}
                        disabled={busy || q.failed === 0}
                    >
                        <RotateCcw className="size-3.5" /> Retry all failed
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); cleanCompleted(); }} disabled={busy || q.completed === 0}>
                        <Trash2 className="size-3.5" /> Clean completed
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); setDrainOpen(true); }}
                        disabled={busy || (q.waiting === 0 && q.delayed === 0)}
                        className="text-red-400"
                    >
                        <Trash2 className="size-3.5" /> Drain queue…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={drainOpen} onOpenChange={setDrainOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Drain queue {q.name}?</DialogTitle>
                        <DialogDescription>
                            This removes all {q.waiting + q.delayed} waiting/delayed jobs immediately.
                            Active jobs continue. This is not reversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDrainOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={drain} disabled={busy}>
                            {busy ? 'Draining…' : 'Drain'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
