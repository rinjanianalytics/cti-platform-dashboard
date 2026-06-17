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
import { pulses, platform, aiIncidents, iocs, telco, onchain, type Pulse } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, Search, X, Flame, BrainCircuit, RadioTower, Wallet, Layers3 } from 'lucide-react';
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

    // Strategic verticals — AI · Telco · On-chain. Surfaced above the baseline
    // pulse stream so Feeds leads with our differentiated coverage. Wallet
    // totals come from the IOC sink's pagination.total (accurate past 500).
    const { data: aiStats }   = useSWR('feeds:ai',    () => aiIncidents.stats());
    const { data: ofacIocs }  = useSWR('feeds:ofac',  () => iocs.list({ source: 'ofac', pageSize: 1 }));
    const { data: scamIocs }  = useSWR('feeds:scam',  () => iocs.list({ source: 'scamsniffer', pageSize: 1 }));
    const { data: telcoFraud } = useSWR('feeds:telco', () => telco.fraudSchemes());

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

            {/* Strategic verticals — AI · Telco · On-chain (the differentiator) */}
            <div className="panel panel-pad">
                <PanelHead
                    icon={<Layers3 className="size-4" />}
                    title="Strategic verticals"
                    sub="AI · Telco · On-chain — our differentiated coverage"
                />
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <VerticalFeedCard
                        href="/ai-incidents"
                        icon={<BrainCircuit className="size-3.5" />}
                        label="AI incidents"
                        value={aiStats?.total ?? null}
                        meta="incidentdatabase.ai · daily"
                    />
                    <VerticalFeedCard
                        href="/onchain"
                        icon={<Wallet className="size-3.5" />}
                        label="On-chain wallets"
                        value={
                            ofacIocs && scamIocs
                                ? (ofacIocs.pagination?.total ?? 0) + (scamIocs.pagination?.total ?? 0)
                                : null
                        }
                        meta="OFAC sanctioned + ScamSniffer scam"
                    />
                    <VerticalFeedCard
                        href="/telco"
                        icon={<RadioTower className="size-3.5" />}
                        label="Telco · 5G fraud schemes"
                        value={telcoFraud?.length ?? null}
                        meta="GSMA signaling-fraud taxonomy"
                    />
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

            {/* Latest by vertical — AI incidents · On-chain wallets · Fraud schemes */}
            <VerticalLatestTabs />

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

function VerticalLatestTabs() {
    const { data: ai } = useSWR('feeds:tab-ai', () => aiIncidents.list({ limit: 8 }));
    const { data: wallets } = useSWR('feeds:tab-wallets', () => onchain.wallets({}));
    const { data: fraud } = useSWR('feeds:tab-fraud', () => telco.fraudSchemes());
    return (
        <div className="panel panel-pad">
            <PanelHead icon={<Layers3 className="size-4" />} title="Latest by vertical" sub="AI incidents · on-chain wallets · telco fraud schemes" />
            <Tabs defaultValue="ai" className="mt-3">
                <TabsList>
                    <TabsTrigger value="ai">AI incidents</TabsTrigger>
                    <TabsTrigger value="onchain">On-chain wallets</TabsTrigger>
                    <TabsTrigger value="fraud">Fraud schemes</TabsTrigger>
                </TabsList>
                <TabsContent value="ai" className="mt-3">
                    <ul>
                        {(ai ?? []).slice(0, 8).map((r, i) => (
                            <li key={r.id} className={cn(i > 0 && 'border-t border-line-soft')}>
                                <a href={r.url ?? '#'} target="_blank" rel="noreferrer" className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 hover:text-text transition-colors">
                                    <div className="min-w-0">
                                        <div className="text-[12.5px] truncate"><span className="font-mono text-[11px] text-text-4 mr-1.5">#{r.incidentId}</span>{r.title}</div>
                                        <div className="text-[11px] text-text-3 truncate">{r.developers.slice(0, 2).join(' · ') || '—'}</div>
                                    </div>
                                    <span className="text-[11px] text-text-4 font-mono tnum shrink-0">{r.incidentDate || ''}</span>
                                </a>
                            </li>
                        ))}
                        {(ai ?? []).length === 0 && <li className="text-[12.5px] text-text-3 py-2">No incidents.</li>}
                    </ul>
                </TabsContent>
                <TabsContent value="onchain" className="mt-3">
                    <ul>
                        {(wallets ?? []).slice(0, 8).map((w, i) => (
                            <li key={w.refId} className={cn(i > 0 && 'border-t border-line-soft')}>
                                <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-2">
                                    <div className="min-w-0">
                                        <div className="font-mono text-[11.5px] truncate">{w.chain}:{w.address}</div>
                                        <div className="text-[11px] text-text-3 truncate">{w.entityLabel || '—'}</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {w.entityType && <span className="chip">{w.entityType}</span>}
                                        <span className="font-mono text-[11px] tnum text-text-3 w-9 text-right">{w.confidence}%</span>
                                    </div>
                                </div>
                            </li>
                        ))}
                        {(wallets ?? []).length === 0 && <li className="text-[12.5px] text-text-3 py-2">No wallets.</li>}
                    </ul>
                </TabsContent>
                <TabsContent value="fraud" className="mt-3">
                    <ul>
                        {(fraud ?? []).slice(0, 8).map((f, i) => (
                            <li key={f.refId} className={cn(i > 0 && 'border-t border-line-soft')}>
                                <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-2">
                                    <div className="min-w-0">
                                        <div className="text-[12.5px] truncate">{f.name}</div>
                                        <div className="text-[11px] text-text-3 truncate font-mono">{f.refId}</div>
                                    </div>
                                    {f.schemeType && <span className="chip shrink-0">{f.schemeType}</span>}
                                </div>
                            </li>
                        ))}
                        {(fraud ?? []).length === 0 && <li className="text-[12.5px] text-text-3 py-2">No fraud schemes.</li>}
                    </ul>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function VerticalFeedCard({
    href, icon, label, value, meta,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    value: number | null;
    meta: string;
}) {
    return (
        <Link
            href={href}
            className="block rounded-md border border-line-soft bg-bg-2 hover:border-brand-line px-3 py-2.5 min-w-0 transition-colors"
        >
            <div className="flex items-center gap-1.5 text-[11px] text-text-3 min-w-0">
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <div className="text-[20px] font-mono tnum mt-1 leading-none">
                {value == null ? '—' : value.toLocaleString()}
            </div>
            <div className="text-[10.5px] text-text-4 mt-1 truncate">{meta}</div>
        </Link>
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
