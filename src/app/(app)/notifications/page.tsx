'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { notifications as notifApi, type AppNotification } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Bell, Check, RefreshCw } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const TYPE_TONE: Record<string, string> = {
    error:   'bg-red-500/15 text-red-400 border-red-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    info:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const DOT_TONE: Record<string, string> = {
    error:   'bg-red-500',
    warning: 'bg-amber-500',
    success: 'bg-emerald-500',
    info:    'bg-blue-500',
};

export default function NotificationsPage() {
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [page, setPage] = useState(1);
    const offset = (page - 1) * PAGE_SIZE;

    const { data, isLoading, mutate } = useSWR(
        ['notifications:page', page],
        () => notifApi.list({ limit: PAGE_SIZE, offset }),
    );
    const { data: count, mutate: refetchCount } = useSWR(
        'notifications:unread',
        () => notifApi.unreadCount(),
    );

    const items: AppNotification[] = data ?? [];
    const filtered = filter === 'unread' ? items.filter(n => !n.read) : items;
    const unread = count ?? 0;

    const markAll = async () => {
        if (unread === 0) return;
        try {
            await notifApi.markRead();
            await Promise.all([mutate(), refetchCount()]);
            toast.success('All notifications marked read');
        } catch (err) {
            toast.error('Could not mark read', { description: (err as Error).message });
        }
    };

    const markOne = async (n: AppNotification) => {
        if (n.read) return;
        try {
            await notifApi.markRead(n.id);
            await Promise.all([mutate(), refetchCount()]);
        } catch {
            /* silent */
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                        {unread > 0
                            ? `${unread.toLocaleString()} unread`
                            : 'All caught up'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filter} onValueChange={(v) => setFilter((v as 'all' | 'unread') ?? 'all')}>
                        <SelectTrigger className="w-32 h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="unread">Unread</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { mutate(); refetchCount(); }}
                        title="Refresh"
                    >
                        <RefreshCw className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={markAll} disabled={unread === 0}>
                        <Check className="size-3.5" /> Mark all read
                    </Button>
                </div>
            </div>

            {isLoading && (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
            )}

            {!isLoading && filtered.length === 0 && (
                <EmptyState
                    icon={Bell}
                    title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                    description={filter === 'unread'
                        ? 'Switch to "All" to see notifications you have already read.'
                        : 'High/critical alerts, feed-sync issues, and playbook runs will surface here.'}
                />
            )}

            {!isLoading && filtered.length > 0 && (
                <div className="space-y-1.5">
                    {filtered.map((n) => (
                        <button
                            key={n.id}
                            type="button"
                            onClick={() => markOne(n)}
                            className={cn(
                                'w-full text-left rounded-md border bg-card px-4 py-3',
                                'hover:bg-accent/40 transition-colors',
                                'flex items-start gap-3',
                                !n.read && 'border-l-2 border-l-primary/60',
                            )}
                        >
                            <span
                                className={cn('mt-1.5 size-2 rounded-full shrink-0', DOT_TONE[n.type] ?? DOT_TONE.info, n.read && 'opacity-40')}
                                aria-hidden
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn('text-sm font-medium', n.read && 'text-muted-foreground')}>
                                        {n.title}
                                    </span>
                                    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', TYPE_TONE[n.type] ?? TYPE_TONE.info)}>
                                        {n.type}
                                    </Badge>
                                    {!n.read && (
                                        <Badge variant="outline" className="font-mono text-[10px] uppercase bg-primary/10 text-primary border-primary/30">
                                            New
                                        </Badge>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">{n.message}</div>
                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/70 tabular-nums">
                                    <span>{relTime(n.createdAt)}</span>
                                    <span className="opacity-50">·</span>
                                    <span className="font-mono uppercase">{n.source}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {!isLoading && items.length === PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        Previous
                    </Button>
                    <span className="tabular-nums">Page {page}</span>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}
            {!isLoading && page > 1 && items.length < PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Previous
                    </Button>
                    <span className="tabular-nums">Page {page}</span>
                    <span />
                </div>
            )}
        </div>
    );
}
