'use client';

/**
 * <RailToggle> — the Topbar bell button. Toggles the attention rail
 * via the Tweaks API and surfaces the unread-notifications count as a
 * sev-high badge.
 *
 * Replaces the legacy <NotificationBell/> popover in the Command Center
 * shell: the popover was redundant once the rail itself exists, since
 * the rail is the inline persistent view of the same data. Bell stays
 * as the icon — it's the universal "what's new" affordance.
 */

import useSWR from 'swr';
import { Bell, BellOff } from 'lucide-react';
import { notifications } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTweaks } from './tweaks';

const POLL_MS = 30_000;

export function RailToggle() {
    const tweaks = useTweaks();

    // The bell badge is the SAME source as the rail's unread count —
    // the rail does its own list query and counts unread; the bell does
    // a cheaper unread-count query so the topbar doesn't have to wait
    // on the full list. Both poll independently.
    const { data: count } = useSWR(
        'notifications:unread',
        () => notifications.unreadCount(),
        { refreshInterval: POLL_MS, revalidateOnFocus: true },
    );
    const unread = count ?? 0;

    return (
        <button
            type="button"
            onClick={() => tweaks.setRail(!tweaks.rail)}
            className={cn(
                'relative inline-flex items-center justify-center size-7 rounded-md transition-colors',
                tweaks.rail
                    ? 'text-text bg-bg-2'
                    : 'text-text-3 hover:text-text hover:bg-bg-2',
            )}
            title={tweaks.rail ? 'Hide attention rail' : 'Show attention rail'}
            aria-label={tweaks.rail ? 'Hide attention rail' : 'Show attention rail'}
            aria-pressed={tweaks.rail}
        >
            {tweaks.rail ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
            {unread > 0 && (
                <span
                    className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-sev-high text-bg-0 text-[9.5px] font-mono tnum font-semibold flex items-center justify-center"
                    aria-label={`${unread} unread`}
                >
                    {unread > 99 ? '99+' : unread}
                </span>
            )}
        </button>
    );
}
