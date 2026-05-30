'use client';

/**
 * <AttentionRail> — the persistent right-hand "What changed" live feed.
 *
 * Per the design spec:
 *   - 340px wide, height of viewport, sits to the right of the main
 *     scroll area
 *   - toggleable via Tweaks.rail (persisted) AND via the topbar bell
 *   - header reads "What changed · last 2h" with a pulsing ok-dot
 *   - each row: severity-tinted square icon, title, meta, relative time
 *   - footer "Mark all reviewed"
 *
 * Per-event data source: `/v1/notifications` is the closest thing we
 * have today — it's the live activity stream that the bell already
 * counts unread for. The events stream the brief describes (KEV
 * additions, actor spikes, feed events) is Phase 3 backend work; until
 * it lands we surface notifications as the stand-in. The notification
 * shape maps cleanly: `type` → severity tint, `title` + `message` →
 * row content, `source` → meta.
 */

import useSWR from 'swr';
import Link from 'next/link';
import { Zap, Database, ShieldAlert, Users, Info, X } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
import { notifications, type AppNotification } from '@/lib/api';
import { relTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useTweaks } from './tweaks';
import { StatusDot } from './status-dot';

/**
 * Map a notification kind / source to a square icon + tint. The icon
 * lives inside a soft-tinted square — the design language is "category
 * at-a-glance" rather than "severity". Tints lean on sev-* tokens for
 * consistency but the semantics are domain (feed event vs actor event)
 * not "this is bad".
 */
function kindFor(n: AppNotification): { icon: LucideIcon; tint: string; iconColor: string } {
    const t = (n.type ?? '').toLowerCase();
    const s = (n.source ?? '').toLowerCase();
    // Errors and warnings ride a warmer tint.
    if (t === 'error')   return { icon: ShieldAlert, tint: 'bg-sev-crit-soft', iconColor: 'text-sev-crit' };
    if (t === 'warning') return { icon: ShieldAlert, tint: 'bg-sev-high-soft', iconColor: 'text-sev-high' };
    if (t === 'success') return { icon: Zap,         tint: 'bg-sev-low-soft',  iconColor: 'text-sev-low'  };
    // Otherwise classify by source — feed events / actor events read
    // very differently and analysts skim by domain icon first.
    if (s.includes('feed') || s.includes('pulse')) return { icon: Database,   tint: 'bg-sev-info-soft', iconColor: 'text-sev-info' };
    if (s.includes('actor'))                       return { icon: Users,      tint: 'bg-sev-med-soft',  iconColor: 'text-sev-med'  };
    if (s.includes('kev')   || s.includes('cve'))  return { icon: ShieldAlert, tint: 'bg-sev-high-soft', iconColor: 'text-sev-high' };
    return { icon: Info, tint: 'bg-bg-2', iconColor: 'text-text-3' };
}

export function AttentionRail() {
    const tweaks = useTweaks();

    // Poll every 60s — that's the same cadence as the Command page's
    // sparklines and well under the notification API's rate limit.
    const { data, isLoading, mutate } = useSWR(
        tweaks.rail ? 'attention-rail' : null,
        () => notifications.list({ limit: 25 }),
        { refreshInterval: 60_000 },
    );

    if (!tweaks.rail) return null;

    const items = data ?? [];
    const unread = items.filter(n => !n.read);

    const markAllRead = async () => {
        await notifications.markRead();
        await mutate();
    };

    return (
        <aside
            className={cn(
                // Hidden under lg so the main content owns the page on
                // narrower screens. Tablet+ shows it as a fixed-width column.
                'hidden lg:flex shrink-0 w-[340px] flex-col border-l border-line-soft bg-bg-0',
                'shadow-[var(--shadow-rail)]',
            )}
        >
            {/* Header */}
            <header className="flex items-center justify-between gap-2 h-14 px-4 border-b border-line-soft shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status="ok" live />
                    <div className="min-w-0">
                        <div className="text-[12px] font-medium leading-tight">What changed</div>
                        <div className="text-[10.5px] text-text-3 leading-tight">last 2h</div>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {unread.length > 0 && (
                        <span className="text-[10.5px] font-mono tnum px-1.5 py-0.5 rounded bg-sev-high-soft text-sev-high">
                            {unread.length}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => tweaks.setRail(false)}
                        className="inline-flex items-center justify-center size-6 rounded text-text-3 hover:bg-bg-2 hover:text-text transition-colors"
                        aria-label="Hide attention rail"
                        title="Hide rail (toggle from Tweaks)"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            </header>

            {/* List — own internal scroll so the footer stays pinned */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {isLoading && items.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-text-3">
                        Loading…
                    </div>
                ) : items.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-text-3">
                        Nothing new. The feed updates every minute.
                    </div>
                ) : (
                    <ul className="motion-enter">
                        {items.map(n => {
                            const { icon: Icon, tint, iconColor } = kindFor(n);
                            return (
                                <li
                                    key={n.id}
                                    className={cn(
                                        'grid grid-cols-[28px_1fr_auto] gap-2.5 items-start px-4 py-2.5 border-b border-line-soft hover:bg-bg-2 transition-colors',
                                        !n.read && 'bg-brand-soft/15',
                                    )}
                                >
                                    <span className={cn('flex items-center justify-center size-7 rounded shrink-0', tint)}>
                                        <Icon className={cn('size-3.5', iconColor)} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-[12.5px] truncate font-medium">{n.title}</div>
                                        {n.message && (
                                            <div className="text-[11px] text-text-3 line-clamp-2">{n.message}</div>
                                        )}
                                        <div className="text-[10.5px] text-text-4 font-mono mt-0.5">{n.source}</div>
                                    </div>
                                    <span className="text-[10.5px] text-text-4 font-mono tnum shrink-0">
                                        {relTime(n.createdAt)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Footer */}
            <footer className="px-4 py-2.5 border-t border-line-soft shrink-0 flex items-center justify-between">
                <button
                    type="button"
                    onClick={markAllRead}
                    disabled={unread.length === 0}
                    className={cn(
                        'text-[11.5px] text-text-3 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                    )}
                >
                    Mark all reviewed
                </button>
                <Link
                    href="/notifications"
                    className="text-[11.5px] text-text-3 hover:text-text transition-colors"
                >
                    All notifications →
                </Link>
            </footer>
        </aside>
    );
}
