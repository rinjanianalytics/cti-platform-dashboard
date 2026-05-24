'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Popover } from '@base-ui/react/popover';
import { notifications, type AppNotification } from '@/lib/api';
import { cn, relTime } from '@/lib/utils';
import { Bell, BellRing, Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const POLL_MS = 30_000;
const POPOVER_LIMIT = 12;

const TYPE_TONE: Record<string, string> = {
    error:   'bg-red-500',
    warning: 'bg-amber-500',
    success: 'bg-emerald-500',
    info:    'bg-blue-500',
};

export function NotificationBell() {
    const [open, setOpen] = useState(false);

    const { data: countData, mutate: refetchCount } = useSWR(
        'notifications:unread',
        () => notifications.unreadCount(),
        { refreshInterval: POLL_MS, revalidateOnFocus: true },
    );
    const unread = countData ?? 0;

    const { data: items, isLoading, mutate: refetchList } = useSWR(
        open ? ['notifications:list', POPOVER_LIMIT] : null,
        () => notifications.list({ limit: POPOVER_LIMIT }),
        { revalidateOnFocus: false },
    );

    const refresh = () => {
        refetchCount();
        refetchList();
    };

    const markAllRead = async () => {
        if (unread === 0) return;
        try {
            await notifications.markRead();
            refresh();
        } catch (err) {
            toast.error('Could not mark read', { description: (err as Error).message });
        }
    };

    const markOneRead = async (n: AppNotification) => {
        if (n.read) return;
        try {
            await notifications.markRead(n.id);
            refresh();
        } catch {
            /* silent — user can click again or "Mark all read" */
        }
    };

    const Icon = unread > 0 ? BellRing : Bell;

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                className={cn(
                    'relative inline-flex items-center justify-center size-8 rounded-md',
                    'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                    unread > 0 && 'text-foreground',
                )}
                aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
            >
                <Icon className="size-4" />
                {unread > 0 && (
                    <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-primary-foreground text-[10px] font-mono font-medium leading-4 flex items-center justify-center tabular-nums"
                        aria-hidden
                    >
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Positioner sideOffset={8} align="end" className="z-50">
                    <Popover.Popup
                        className={cn(
                            'w-[360px] max-w-[calc(100vw-2rem)] rounded-md border bg-popover text-popover-foreground shadow-md',
                            'origin-[var(--transform-origin)] outline-none',
                            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
                            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
                            'transition-[opacity,transform] duration-150',
                        )}
                        style={{ backgroundColor: 'var(--popover)' }}
                    >
                        <div className="flex items-center justify-between px-3 py-2 border-b">
                            <div className="text-sm font-medium">Notifications</div>
                            <button
                                type="button"
                                onClick={markAllRead}
                                disabled={unread === 0}
                                className={cn(
                                    'inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-1',
                                    'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                                    'disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default',
                                )}
                            >
                                <Check className="size-3" /> Mark all read
                            </button>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto">
                            {isLoading && (
                                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                                    Loading…
                                </div>
                            )}
                            {!isLoading && (!items || items.length === 0) && (
                                <div className="px-3 py-8 text-center">
                                    <Bell className="size-6 mx-auto text-muted-foreground/40 mb-2" />
                                    <div className="text-sm text-muted-foreground">No notifications yet</div>
                                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                                        High/critical alerts and system events show up here.
                                    </div>
                                </div>
                            )}
                            {!isLoading && items && items.map((n) => (
                                <NotificationRow
                                    key={n.id}
                                    notif={n}
                                    onClick={() => markOneRead(n)}
                                />
                            ))}
                        </div>

                        <div className="border-t px-3 py-2">
                            <Link
                                href="/notifications"
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                                See all <ChevronRight className="size-3" />
                            </Link>
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

function NotificationRow({ notif, onClick }: { notif: AppNotification; onClick: () => void }) {
    const dotTone = TYPE_TONE[notif.type] ?? TYPE_TONE.info;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/40 transition-colors',
                'flex items-start gap-2.5',
                !notif.read && 'bg-accent/15',
            )}
        >
            <span
                className={cn(
                    'mt-1 size-2 rounded-full shrink-0',
                    dotTone,
                    notif.read && 'opacity-40',
                )}
                aria-hidden
            />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('text-sm font-medium truncate', notif.read && 'text-muted-foreground')}>
                        {notif.title}
                    </span>
                </div>
                <div className="text-[11.5px] text-muted-foreground line-clamp-2 mt-0.5">
                    {notif.message}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/70 tabular-nums">
                    <span>{relTime(notif.createdAt)}</span>
                    <span className="opacity-50">·</span>
                    <span className="font-mono uppercase">{notif.source}</span>
                </div>
            </div>
        </button>
    );
}
