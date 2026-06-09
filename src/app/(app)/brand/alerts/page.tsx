'use client';

/**
 * Brand alerts triage queue — Phase 5 #1.
 *
 * Same shape as `/iocs` so analysts switching surfaces don't have to relearn
 * the table behaviour: URL-mirrored filters, sticky-header table, score-based
 * row tinting, lifecycle dropdown per row. Differences from the IOC queue:
 *
 *   - Status changes are inline (Select on the row) rather than a bulk bar.
 *     Brand alerts move through their lifecycle one at a time more often
 *     than en masse, and the dropdown reads as the natural affordance.
 *   - DNS state is its own column (active / mx_only / nx / error) because
 *     it's the strongest visual signal — an `mx_only` permutation with no
 *     A record but with MX is the high-risk phishing setup.
 *   - Score → severity tint maps 0..100 onto our crit/high/med/low/info
 *     scale so the existing row-edge tint reads consistently with the rest
 *     of the platform.
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    brand,
    type BrandAlert, type BrandAlertStatus, type BrandAlertDnsState,
} from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn, relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';
import { type Severity } from '@/components/cc/sev';

/* ── Filter dropdown options ──────────────────────────────────────────── */

const STATUS_OPTIONS: Array<{ value: BrandAlertStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'All statuses' },
    { value: 'new',       label: 'New' },
    { value: 'triaging',  label: 'Triaging' },
    { value: 'escalated', label: 'Escalated' },
    { value: 'benign',    label: 'Benign' },
    { value: 'blocked',   label: 'Blocked' },
];

const DNS_OPTIONS: Array<{ value: BrandAlertDnsState | 'all'; label: string }> = [
    { value: 'all',     label: 'Any DNS state' },
    { value: 'active',  label: 'Active (has A record)' },
    { value: 'mx_only', label: 'MX only (phishing risk)' },
    { value: 'nx',      label: 'NXDOMAIN' },
    { value: 'error',   label: 'Resolver error' },
];

const PAGE_SIZE = 50;

/* ── Score → severity tint mapping ────────────────────────────────────── */

function scoreToSeverity(score: number): Severity {
    if (score >= 80) return 'crit';
    if (score >= 60) return 'high';
    if (score >= 40) return 'med';
    if (score >= 20) return 'low';
    return 'info';
}

/* ── DNS state pill ───────────────────────────────────────────────────── */

function DnsBadge({ state }: { state: BrandAlertDnsState }) {
    const tone =
        state === 'active'  ? 'bg-sev-crit-s text-sev-crit border-sev-crit/40' :
        state === 'mx_only' ? 'bg-sev-high-s text-sev-high border-sev-high/40' :
        state === 'nx'      ? 'bg-bg-2 text-text-3 border-line-soft' :
                              'bg-bg-2 text-text-3 border-line-soft';
    const label = state === 'mx_only' ? 'MX only' : state.toUpperCase();
    return (
        <span className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider',
            tone,
        )}>
            {label}
        </span>
    );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function BrandAlertsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    const [statusFilter, setStatusFilter] = useState<BrandAlertStatus | 'all'>(
        () => (initialParams.get('status') as BrandAlertStatus | null) ?? 'all',
    );
    const [dnsFilter, setDnsFilter] = useState<BrandAlertDnsState | 'all'>(
        () => (initialParams.get('dnsState') as BrandAlertDnsState | null) ?? 'all',
    );
    const [minScore, setMinScore] = useState<string>(
        () => initialParams.get('minScore') ?? '',
    );
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });

    // Mirror filter state → URL.
    useEffect(() => {
        const next = new URLSearchParams();
        if (statusFilter !== 'all') next.set('status', statusFilter);
        if (dnsFilter !== 'all') next.set('dnsState', dnsFilter);
        if (minScore.trim()) next.set('minScore', minScore.trim());
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [statusFilter, dnsFilter, minScore, page, pathname, router]);

    const minScoreNum = useMemo(() => {
        const n = Number(minScore);
        return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
    }, [minScore]);

    const { data, isLoading, mutate } = useSWR(
        ['brand.alerts', statusFilter, dnsFilter, minScoreNum, page],
        () => brand.listAlerts({
            page,
            pageSize: PAGE_SIZE,
            status: statusFilter === 'all' ? undefined : statusFilter,
            dnsState: dnsFilter === 'all' ? undefined : dnsFilter,
            minScore: minScoreNum,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    /* ── Inline status change ─────────────────────────────────────── */
    const handleStatusChange = async (a: BrandAlert, next: BrandAlertStatus) => {
        try {
            await brand.updateAlert(a.id, { status: next });
            toast.success(`${a.permutation} → ${next}`);
            mutate();
        } catch (err) {
            toast.error('Update failed', { description: (err as Error).message });
        }
    };

    const columns: CcColumn<BrandAlert>[] = [
        {
            id: 'score',
            header: 'Score',
            width: 'w-16',
            align: 'right',
            sortable: true,
            cell: r => <span className="font-mono text-[12px] tnum">{r.score}</span>,
        },
        {
            id: 'permutation',
            header: 'Permutation',
            sortable: true,
            cell: r => (
                <span className="font-mono text-[13px] truncate block max-w-[40ch]">{r.permutation}</span>
            ),
        },
        {
            id: 'algorithm',
            header: 'Algorithm',
            width: 'w-32',
            sortable: true,
            cell: r => (
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-3">
                    {r.algorithm}
                </span>
            ),
        },
        {
            id: 'dnsState',
            header: 'DNS',
            width: 'w-28',
            cell: r => <DnsBadge state={r.dnsState} />,
        },
        {
            id: 'ipAddresses',
            header: 'A records',
            width: 'w-44',
            cell: r => r.ipAddresses
                ? <span className="font-mono text-[11px] text-text-2 truncate block">{r.ipAddresses}</span>
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-36',
            cell: r => (
                <div onClick={(e) => e.stopPropagation()}>
                    <Select
                        value={r.status}
                        onValueChange={(v) => handleStatusChange(r, v as BrandAlertStatus)}
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
    ];

    const sevTint = (r: BrandAlert): Severity => scoreToSeverity(r.score);

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Brand alerts</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} alerts in queue`}
                        {' · '}
                        <Link href="/brand/domains" className="underline-offset-2 hover:underline">
                            view watchlist →
                        </Link>
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as BrandAlertStatus | 'all'); setPage(1); }}>
                    <SelectTrigger className="w-44 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={dnsFilter} onValueChange={(v) => { setDnsFilter(v as BrandAlertDnsState | 'all'); setPage(1); }}>
                    <SelectTrigger className="w-52 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DNS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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

            {/* Table */}
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
