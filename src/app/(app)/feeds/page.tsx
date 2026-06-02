'use client';

/**
 * Feeds — Command Center refit (Phase 3).
 *
 * Per the design spec:
 *   1. Page head: "Feeds" + count of ingested pulses
 *   2. Landscape shift band — repeat(6,1fr) of top-mover tag cards
 *      with the 6h / 24h / 7d window segmented at the band header.
 *      Each window re-queries the backend's `/v1/stats/trending-tags`
 *      with `?hours=6`, `?hours=24`, or `?days=7` respectively, and
 *      SWR re-keys on the window so the cards refresh on toggle.
 *   3. Pulse search toolbar (client-side filter on the page slice)
 *   4. Pulse panels — stacked, sev-dot + title + summary +
 *      tag chips; right column: TLP chip, IOC count (brand if >0),
 *      author · updated relTime
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { pulses, platform, type Pulse } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Globe, Search, X, Flame } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { PanelHead } from '@/components/cc/panel-head';
import { Segmented } from '@/components/cc/segmented';
import { StatusDot } from '@/components/cc/status-dot';

const PAGE_SIZE = 25;
const REFRESH_MS = 60_000;

type Window = '6H' | '24H' | '7D';

const TLP_TONE: Record<string, string> = {
    red:             'bg-sev-crit-soft text-sev-crit border-[color:var(--sev-crit)]',
    amber:           'bg-sev-high-soft text-sev-high border-[color:var(--sev-high)]',
    'amber+strict':  'bg-sev-high-soft text-sev-high border-[color:var(--sev-high)]',
    green:           'bg-sev-low-soft  text-sev-low  border-[color:var(--sev-low)]',
    white:           'bg-bg-2 text-text-3 border-line-soft',
    clear:           'bg-bg-2 text-text-3 border-line-soft',
};

export default function FeedsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const [q, setQ] = useState(() => initialParams.get('q') ?? '');
    const [window_, setWindow] = useState<Window>('24H');

    useEffect(() => {
        const next = new URLSearchParams();
        if (page > 1) next.set('page', String(page));
        if (q)        next.set('q', q);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [page, q, pathname, router]);

    const { data, isLoading } = useSWR(
        ['feeds:pulses', page],
        () => pulses.list({ page, pageSize: PAGE_SIZE }),
        { refreshInterval: REFRESH_MS },
    );

    const trendingOpts: { hours?: number; days?: number } =
        window_ === '6H'  ? { hours: 6 }  :
        window_ === '24H' ? { hours: 24 } :
                            { days: 7 };
    const { data: trending } = useSWR(
        ['feeds:trending', window_],
        () => platform.trendingTags(trendingOpts),
        { refreshInterval: REFRESH_MS },
    );

    const { data: feedHealth } = useSWR(
        'feeds:health',
        () => platform.feedMonitoring(),
    );

    // Memo'd so the downstream `filteredItems` useMemo dep doesn't churn
    // every render — same pattern as the search palette / page.tsx.
    const items = useMemo(() => data?.items ?? [], [data?.items]);
    const total = data?.pagination?.total ?? 0;
    const trendingList = trending ?? [];
    const feedList = feedHealth?.feeds ?? [];
    const healthyFeeds = feedList.filter(f => f.health === 'healthy').length;

    // Client-side filter on the current page — keeps the URL in sync so
    // copy-paste works. Server-side pulse search is a Phase 3 backend item.
    const filteredItems = useMemo(() => {
        if (!q.trim()) return items;
        const needle = q.trim().toLowerCase();
        return items.filter(p =>
            p.name.toLowerCase().includes(needle)
            || (p.description ?? '').toLowerCase().includes(needle)
            || (p.author ?? '').toLowerCase().includes(needle)
            || (p.tags ?? []).some(t => t.toLowerCase().includes(needle)),
        );
    }, [items, q]);

    return (
        <div className="space-y-3">
            {/* Page head */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h-page">Feeds</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} ingested intelligence pulses`}
                        {feedList.length > 0 && ` · ${healthyFeeds}/${feedList.length} sources active`}
                    </p>
                </div>
            </div>

            {/* Landscape shift band */}
            <div className="panel panel-pad">
                <PanelHead
                    icon={<Globe className="size-4" />}
                    title="Landscape shift"
                    sub="what's moving across all feeds"
                    right={
                        <Segmented<Window>
                            options={[
                                { value: '6H',  label: '6H' },
                                { value: '24H', label: '24H' },
                                { value: '7D',  label: '7D' },
                            ]}
                            value={window_}
                            onChange={setWindow}
                            size="sm"
                        />
                    }
                />
                {trendingList.length === 0 ? (
                    <div className="mt-3 text-[12.5px] text-text-3">No trending tags yet.</div>
                ) : (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {trendingList.slice(0, 6).map(t => (
                            <Link
                                key={t.tag}
                                href={`/iocs?q=${encodeURIComponent(t.tag)}`}
                                className={cn(
                                    'block rounded-md border border-line-soft bg-bg-2 hover:border-brand-line px-3 py-2.5 min-w-0',
                                    'transition-colors',
                                )}
                            >
                                <div className="text-[10px] font-mono uppercase tracking-wider text-text-3 truncate">{t.tag}</div>
                                <div className="text-[20px] font-mono tnum mt-1 leading-none">{t.count.toLocaleString()}</div>
                                {t.hot && (
                                    <div className="text-[10.5px] text-sev-high inline-flex items-center gap-1 mt-1">
                                        <Flame className="size-3" /> hot
                                    </div>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Search toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-3" />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search pulses, tags, authors…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button
                            onClick={() => setQ('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <span className="text-[11px] text-text-3 tabular-nums">
                    Showing {filteredItems.length} of {items.length} on this page
                </span>
            </div>

            {/* Pulse list */}
            <div className="space-y-2">
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={`sk:${i}`} className="panel panel-pad h-24 animate-pulse" />
                    ))
                ) : filteredItems.length === 0 ? (
                    <div className="panel panel-pad text-center text-[12.5px] text-text-3 py-10">
                        {q ? 'No pulses match this search.' : 'No pulses yet.'}
                    </div>
                ) : (
                    filteredItems.map(p => <PulseRow key={p.id} pulse={p} />)
                )}
            </div>

            {/* Pager */}
            {total > PAGE_SIZE && (
                <div className="flex items-center justify-between text-[11px] text-text-3 tabular-nums">
                    <span>Page {page} · {total.toLocaleString()} total</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="h-7 px-2 rounded border border-line-soft hover:bg-bg-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage(p => p + 1)}
                            disabled={items.length < PAGE_SIZE}
                            className="h-7 px-2 rounded border border-line-soft hover:bg-bg-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function PulseRow({ pulse: p }: { pulse: Pulse }) {
    const tlp = p.tlp?.toLowerCase();
    const indicatorCount = p.indicatorCount ?? 0;
    const updated = p.otxModified || p.updatedAt;
    return (
        <Link
            href={`/feeds/${encodeURIComponent(p.otxId || p.id)}`}
            className={cn(
                'block panel hover:border-line transition-colors',
                'p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4',
            )}
        >
            <div className="flex gap-3 min-w-0">
                <StatusDot status="ok" className="mt-1.5 shrink-0" />
                <div className="min-w-0">
                    <div className="text-[14px] font-semibold leading-snug truncate">{p.name}</div>
                    {p.description && (
                        <div className="text-[12.5px] text-text-3 mt-1 line-clamp-2 max-w-[760px]">
                            {p.description}
                        </div>
                    )}
                    {p.tags && p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {p.tags.slice(0, 5).map(t => (
                                <span key={t} className="chip">{t}</span>
                            ))}
                            {p.tags.length > 5 && (
                                <span className="chip chip-brand">+{p.tags.length - 5}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0 text-right min-w-[180px]">
                {tlp && (
                    <span className={cn('chip uppercase font-mono', TLP_TONE[tlp] ?? '')}>
                        TLP:{tlp.toUpperCase()}
                    </span>
                )}
                <div className={cn('text-[12px] tabular-nums', indicatorCount > 0 ? 'text-brand' : 'text-text-4')}>
                    {indicatorCount > 0 ? `${indicatorCount.toLocaleString()} IOCs` : 'No IOCs'}
                </div>
                <div className="text-[11px] text-text-4 font-mono tnum">
                    {[p.author, relTime(updated)].filter(Boolean).join(' · ')}
                </div>
            </div>
        </Link>
    );
}
