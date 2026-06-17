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
 *
 * Data source: `/v1/events` — the semantic platform-event stream
 * (cti-platform-api PR #19). KEV adds, high-CVSS CVEs, new actors,
 * significant pulses, failed/partial syncs. Previously this rail was
 * fed by `/v1/notifications` as a stand-in, which surfaced a wall of
 * routine `Feed Sync — URLHAUS / 649 IOCs ingested` rows that drowned
 * the actual changes.
 *
 * Notifications still own the topbar bell badge count (the per-user
 * read/unread state) — those are different concepts and live in
 * different surfaces.
 */

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { Flame, ShieldAlert, Users, Rss, AlertTriangle, X, BrainCircuit, Wallet, RadioTower, type LucideIcon } from 'lucide-react';
import { events, type EventKind, type PlatformEvent } from '@/lib/api';
import { relTime, cn } from '@/lib/utils';
import { useTweaks } from './tweaks';
import { StatusDot } from './status-dot';

/**
 * Map an EventKind to a square icon + tint. The icon lives inside a
 * soft-tinted square — design language is "category at-a-glance"
 * rather than "this is bad". Tints lean on the sev-* tokens for
 * consistency but the semantics are domain (KEV vs actor vs sync),
 * not severity.
 */
const KIND_DISPLAY: Record<EventKind, { icon: LucideIcon; tint: string; iconColor: string }> = {
    // KEV — exploited in the wild, the "fire" metaphor reads instantly
    kev:    { icon: Flame,          tint: 'bg-sev-crit-soft', iconColor: 'text-sev-crit' },
    // CVE — vulnerability shield with a warning. Less alarming tone than KEV.
    cve:    { icon: ShieldAlert,    tint: 'bg-sev-high-soft', iconColor: 'text-sev-high' },
    // Actor — people. The med tint reads as "interesting, not urgent".
    actor:  { icon: Users,          tint: 'bg-sev-med-soft',  iconColor: 'text-sev-med'  },
    // Pulse — RSS feed glyph. Info tint because pulses are informational.
    pulse:  { icon: Rss,            tint: 'bg-sev-info-soft', iconColor: 'text-sev-info' },
    // Sync — operational urgency. High tint signals "operator should look".
    sync:   { icon: AlertTriangle,  tint: 'bg-sev-high-soft', iconColor: 'text-sev-high' },
    // AI incident — the AI vertical. Info tint: emerging real-world AI harm.
    'ai-incident': { icon: BrainCircuit, tint: 'bg-sev-info-soft', iconColor: 'text-sev-info' },
    // Wallet — a NEW sanctioned address. Crit tint: OFAC SDN is the on-chain "fire".
    wallet: { icon: Wallet,         tint: 'bg-sev-crit-soft', iconColor: 'text-sev-crit' },
    // Telco — 5G fraud scheme added. Med tint: notable, not urgent.
    telco:  { icon: RadioTower,     tint: 'bg-sev-med-soft',  iconColor: 'text-sev-med'  },
};

export function AttentionRail() {
    const tweaks = useTweaks();
    const router = useRouter();

    // Poll every 60s — same cadence as the Command page's sparklines.
    // /v1/events is unauthenticated and cheap (5 parallel COUNT-style
    // queries on indexed timestamps), so the poll is fine to run from
    // every browser tab without coordination.
    const { data, isLoading } = useSWR(
        tweaks.rail ? 'attention-rail:events' : null,
        () => events.list({ limit: 25 }),
        { refreshInterval: 60_000 },
    );

    if (!tweaks.rail) return null;

    const items: PlatformEvent[] = data?.events ?? [];
    const total = data?.total ?? items.length;

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
                <div className="flex items-center gap-1.5 shrink-0">
                    {total > 0 && (
                        <span className="text-[11px] font-mono tnum text-text-3">{total}</span>
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
                        Nothing new in the last day. The feed updates every minute.
                    </div>
                ) : (
                    <ul className="motion-enter">
                        {items.map(e => {
                            const { icon: Icon, tint, iconColor } = KIND_DISPLAY[e.kind] ?? KIND_DISPLAY.pulse;
                            const clickable = !!e.href;
                            return (
                                <li
                                    key={e.id}
                                    className={cn(
                                        'grid grid-cols-[28px_1fr_auto] gap-2.5 items-start px-4 py-2.5 border-b border-line-soft transition-colors',
                                        clickable && 'hover:bg-bg-2 cursor-pointer',
                                    )}
                                    onClick={clickable ? () => router.push(e.href!) : undefined}
                                    role={clickable ? 'link' : undefined}
                                >
                                    <span className={cn('flex items-center justify-center size-7 rounded shrink-0', tint)}>
                                        <Icon className={cn('size-3.5', iconColor)} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-[12.5px] font-medium leading-snug line-clamp-2">{e.title}</div>
                                        {e.meta && (
                                            <div className="text-[11px] text-text-3 line-clamp-2 mt-0.5">{e.meta}</div>
                                        )}
                                    </div>
                                    <span className="text-[10.5px] text-text-4 font-mono tnum shrink-0">
                                        {relTime(e.timestamp)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </aside>
    );
}
