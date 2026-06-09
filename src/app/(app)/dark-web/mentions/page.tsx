'use client';

/**
 * Dark-web mentions triage queue — Phase 5 #4.
 *
 * Mirror of `/paste/mentions`. The table reads zero rows right now because
 * the upstream Ahmia parser is broken — see <UpstreamBannerNotice />.
 * UI shape is ready to surface results as soon as an alternative source
 * is wired into the backend.
 *
 * Onion URLs are rendered as plain text (not links) because clicking them
 * in a normal browser will fail or, worse, leak via DNS to a malicious
 * intermediary. Operators copy the URL to a Tor browser.
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    darkWeb,
    type DarkWebMention, type DarkWebMentionStatus,
} from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';
import { type Severity } from '@/components/cc/sev';
import { UpstreamBannerNotice } from '../_components/upstream-banner';

const STATUS_OPTIONS: Array<{ value: DarkWebMentionStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'All statuses' },
    { value: 'new',       label: 'New' },
    { value: 'triaging',  label: 'Triaging' },
    { value: 'escalated', label: 'Escalated' },
    { value: 'benign',    label: 'Benign' },
    { value: 'blocked',   label: 'Blocked' },
];

const PAGE_SIZE = 50;

function scoreToSeverity(score: number): Severity {
    if (score >= 80) return 'crit';
    if (score >= 60) return 'high';
    if (score >= 40) return 'med';
    if (score >= 20) return 'low';
    return 'info';
}

export default function DarkWebMentionsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    const [statusFilter, setStatusFilter] = useState<DarkWebMentionStatus | 'all'>(
        () => (initialParams.get('status') as DarkWebMentionStatus | null) ?? 'all',
    );
    const [minScore, setMinScore] = useState<string>(
        () => initialParams.get('minScore') ?? '',
    );
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });

    useEffect(() => {
        const next = new URLSearchParams();
        if (statusFilter !== 'all') next.set('status', statusFilter);
        if (minScore.trim()) next.set('minScore', minScore.trim());
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [statusFilter, minScore, page, pathname, router]);

    const minScoreNum = useMemo(() => {
        const n = Number(minScore);
        return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
    }, [minScore]);

    const { data, isLoading, mutate } = useSWR(
        ['darkweb.mentions', statusFilter, minScoreNum, page],
        () => darkWeb.listMentions({
            page,
            pageSize: PAGE_SIZE,
            status: statusFilter === 'all' ? undefined : statusFilter,
            minScore: minScoreNum,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const handleStatusChange = async (m: DarkWebMention, next: DarkWebMentionStatus) => {
        try {
            await darkWeb.updateMention(m.id, { status: next });
            toast.success(`${m.title} → ${next}`);
            mutate();
        } catch (err) {
            toast.error('Update failed', { description: (err as Error).message });
        }
    };

    const handleCopyOnion = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Onion URL copied', { description: 'Paste into Tor browser' });
        } catch {
            toast.error('Copy failed');
        }
    };

    const columns: CcColumn<DarkWebMention>[] = [
        {
            id: 'score',
            header: 'Score',
            width: 'w-16',
            align: 'right',
            sortable: true,
            cell: r => <span className="font-mono text-[12px] tnum">{r.score}</span>,
        },
        {
            id: 'title',
            header: 'Title',
            cell: r => (
                <span className="text-[12px] truncate block max-w-[48ch]" title={r.title}>
                    {r.title}
                </span>
            ),
        },
        {
            id: 'onionUrl',
            header: 'Onion URL (open in Tor)',
            width: 'w-72',
            cell: r => (
                <span
                    className="font-mono text-[11px] text-text-2 truncate block max-w-[36ch]"
                    title={r.onionUrl}
                >
                    {r.onionUrl}
                </span>
            ),
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-36',
            cell: r => (
                <div onClick={(e) => e.stopPropagation()}>
                    <Select
                        value={r.status}
                        onValueChange={(v) => handleStatusChange(r, v as DarkWebMentionStatus)}
                    >
                        <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.filter(s => s.value !== 'all').map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ),
        },
        {
            id: 'firstSeen',
            header: 'First seen',
            width: 'w-24',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11px] text-text-3 font-mono tnum">{relTime(r.firstSeenAt)}</span>,
        },
        {
            id: 'copy',
            header: '',
            width: 'w-10',
            align: 'right',
            cell: r => (
                <button
                    onClick={(e) => { e.stopPropagation(); handleCopyOnion(r.onionUrl); }}
                    className="inline-flex text-text-3 hover:text-text"
                    title="Copy onion URL"
                >
                    <Copy className="size-3.5" />
                </button>
            ),
        },
    ];

    const sevTint = (r: DarkWebMention): Severity => scoreToSeverity(r.score);

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="shrink-0">
                <UpstreamBannerNotice />
            </div>

            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Dark-web mentions</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} mentions in queue`}
                        {' · '}
                        <Link href="/dark-web/watchterms" className="underline-offset-2 hover:underline">
                            view watchterms →
                        </Link>
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as DarkWebMentionStatus | 'all'); setPage(1); }}>
                    <SelectTrigger className="w-44 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="relative w-40">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-3" />
                    <Input
                        value={minScore}
                        onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
                        placeholder="Min score (0–100)"
                        inputMode="numeric"
                        className="pl-8 pr-8 h-9"
                    />
                    {minScore && (
                        <button
                            onClick={() => { setMinScore(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <CcDataTable
                    columns={columns}
                    data={items}
                    rowKey={r => r.id}
                    isLoading={isLoading}
                    onRowClick={() => undefined}
                    sevtintFn={sevTint}
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                />
            </div>
        </div>
    );
}
