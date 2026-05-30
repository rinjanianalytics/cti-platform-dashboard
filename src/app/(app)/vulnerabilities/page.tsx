'use client';

/**
 * Vulnerabilities — Command Center refit (Phase 2).
 *
 * Header + filter shape matches the design: search, severity select,
 * date range, and a KEV-only toggle button that turns `--sev-crit`
 * (filled flame) when active.
 *
 * EPSS isn't surfaced today because the field isn't on the existing
 * schema (Phase 1 Roadmap, enrichment). When the backend ships it,
 * add an `EPSS` column between `CVSS` and `KEV` (placeholder slot
 * marked with a comment below) without other table changes.
 *
 * Row click → CVE drawer (deep-link to /vulnerabilities/[cveId] still
 * works for sharable URLs).
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { vulns, type Vulnerability } from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range';
import { Search, X, Flame } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';
import { Sev, normalizeSeverity, severityFromCvss, type Severity } from '@/components/cc/sev';
import { useEntityDrawer } from '@/components/cc/entity-drawer';

function toIso(d: Date | undefined): string | undefined {
    return d ? d.toISOString().slice(0, 10) : undefined;
}
function fromIso(s: string | null): Date | undefined {
    if (!s) return undefined;
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : undefined;
}

const SEVERITY_FILTERS = [
    { value: 'all',      label: 'Any severity' },
    { value: 'critical', label: 'Critical' },
    { value: 'high',     label: 'High' },
    { value: 'medium',   label: 'Medium' },
    { value: 'low',      label: 'Low' },
];

const PAGE_SIZE = 25;

export default function VulnerabilitiesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();
    const drawer = useEntityDrawer();

    const [q, setQ] = useState(() => initialParams.get('q') ?? '');
    const [severity, setSeverity] = useState(() => initialParams.get('severity') ?? 'all');
    const [exploitedOnly, setExploitedOnly] = useState(() => initialParams.get('exploited') === 'true');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const from = fromIso(initialParams.get('dateFrom'));
        const to   = fromIso(initialParams.get('dateTo'));
        if (!from && !to) return undefined;
        return { from, to };
    });
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });

    const dateFrom = toIso(dateRange?.from);
    const dateTo   = toIso(dateRange?.to);

    useEffect(() => {
        const next = new URLSearchParams();
        if (q) next.set('q', q);
        if (severity !== 'all') next.set('severity', severity);
        if (exploitedOnly) next.set('exploited', 'true');
        if (dateFrom) next.set('dateFrom', dateFrom);
        if (dateTo)   next.set('dateTo',   dateTo);
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [q, severity, exploitedOnly, dateFrom, dateTo, page, pathname, router]);

    const { data, isLoading } = useSWR(
        ['vulnerabilities', q, severity, exploitedOnly, dateFrom, dateTo, page],
        () => vulns.list({
            page,
            pageSize: PAGE_SIZE,
            q: q || undefined,
            severity: severity === 'all' ? undefined : severity,
            exploited: exploitedOnly ? true : undefined,
            dateFrom,
            dateTo,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const columns: CcColumn<Vulnerability>[] = [
        {
            id: 'cveId',
            header: 'CVE',
            width: 'w-36',
            sortable: true,
            cell: r => <span className="font-mono text-[12.5px] text-brand">{r.cveId ?? '—'}</span>,
        },
        {
            id: 'description',
            header: 'Description',
            cell: r => (
                <span className="text-[12.5px] text-text-2 truncate block max-w-[64ch]">
                    {r.description ?? '—'}
                </span>
            ),
        },
        {
            id: 'vendor',
            header: 'Vendor / Product',
            width: 'w-44',
            sortable: true,
            cell: r => (
                <span className="text-[11.5px] font-mono text-text-3 truncate block max-w-44">
                    {[r.vendorProject, r.product].filter(Boolean).join(' / ') || '—'}
                </span>
            ),
        },
        {
            id: 'severity',
            header: 'Severity',
            width: 'w-24',
            sortable: true,
            cell: r => r.severity
                ? <Sev level={normalizeSeverity(r.severity)} short />
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'cvss',
            header: 'CVSS',
            width: 'w-16',
            align: 'right',
            sortable: true,
            cell: r => {
                if (r.cvssScore == null) return <span className="text-text-4">—</span>;
                const sev = r.severity ? normalizeSeverity(r.severity) : severityFromCvss(r.cvssScore);
                return (
                    <span className={cn('font-mono text-[13px] tnum', cvssClass(sev))}>
                        {r.cvssScore.toFixed(1)}
                    </span>
                );
            },
        },
        // EPSS column slot — uncomment once `r.epssScore` lands on the
        // Vulnerability schema (Phase 1 Roadmap, enrichment phase 1).
        // {
        //     id: 'epss', header: 'EPSS', width: 'w-16', align: 'right', sortable: true,
        //     cell: r => r.epssScore != null
        //         ? <span className={cn('font-mono text-[12.5px] tnum', r.epssScore > 0.5 ? 'text-sev-high' : 'text-text-3')}>
        //               {(r.epssScore * 100).toFixed(0)}%
        //           </span>
        //         : <span className="text-text-4">—</span>,
        // },
        {
            id: 'kev',
            header: 'KEV',
            width: 'w-16',
            align: 'center',
            sortable: true,
            cell: r => r.isExploited
                ? <Flame className="size-4 text-sev-crit mx-auto" aria-label="On CISA KEV catalog" />
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'published',
            header: 'Published',
            width: 'w-22',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11.5px] text-text-3 font-mono tnum">{relTime(r.publishedDate)}</span>,
        },
    ];

    const sevTint = (r: Vulnerability): Severity | null =>
        r.severity ? normalizeSeverity(r.severity)
        : r.cvssScore != null ? severityFromCvss(r.cvssScore)
        : null;

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Vulnerabilities</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} CVEs · CISA KEV + ingested feeds`}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-3" />
                    <Input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setPage(1); }}
                        placeholder="Search CVE ID, product, vendor, description…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button
                            onClick={() => { setQ(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <Select value={severity} onValueChange={(v) => { setSeverity(v ?? 'all'); setPage(1); }}>
                    <SelectTrigger className="w-37 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SEVERITY_FILTERS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DateRangePicker
                    value={dateRange}
                    onValueChange={(r) => { setDateRange(r); setPage(1); }}
                    placeholder="Published date"
                    className="w-60"
                />
                {/* KEV-only toggle button — turns sev-crit fill when active. */}
                <button
                    type="button"
                    onClick={() => { setExploitedOnly(v => !v); setPage(1); }}
                    aria-pressed={exploitedOnly}
                    className={cn(
                        'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-[12.5px] font-medium transition-colors',
                        exploitedOnly
                            ? 'bg-sev-crit-soft border-sev-crit text-sev-crit'
                            : 'border-line-soft text-text-2 hover:text-text hover:bg-bg-2',
                    )}
                    title="Filter to CISA Known Exploited Vulnerabilities"
                >
                    <Flame className="size-3.5" />
                    KEV only
                </button>
            </div>

            <div className="flex-1 min-h-0">
                <CcDataTable
                    columns={columns}
                    data={items}
                    rowKey={r => r.id ?? r.cveId}
                    isLoading={isLoading}
                    onRowClick={r => drawer.open({ type: 'cve', id: r.cveId || r.id })}
                    sevtintFn={sevTint}
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                    emptyState={
                        <div className="py-4 text-[12.5px] text-text-3">
                            No CVEs match the current filter set. Try widening the date range or clearing severity / KEV.
                        </div>
                    }
                />
            </div>
        </div>
    );
}

function cvssClass(sev: Severity): string {
    return sev === 'crit' ? 'text-sev-crit'
         : sev === 'high' ? 'text-sev-high'
         : sev === 'med'  ? 'text-sev-med'
         : sev === 'low'  ? 'text-sev-low'
         : 'text-text-3';
}
