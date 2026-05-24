'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { vulns, type Vulnerability } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, X, ShieldAlert, Shield } from 'lucide-react';
import { cn, severityTone, cvssTone, relTime } from '@/lib/utils';

function toIso(d: Date | undefined): string | undefined {
    if (!d) return undefined;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fromIso(s: string | null): Date | undefined {
    if (!s) return undefined;
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : undefined;
}

const SEVERITY_FILTERS = [
    { value: 'all', label: 'Any severity' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

const PAGE_SIZE = 25;

export default function VulnerabilitiesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    // URL is the source of truth so deep-links (e.g. /vulnerabilities?severity=critical)
    // from the Overview / external bookmarks land on the right filter state.
    const [q, setQ] = useState(() => initialParams.get('q') ?? '');
    const [severity, setSeverity] = useState(() => initialParams.get('severity') ?? 'all');
    const [exploitedOnly, setExploitedOnly] = useState(() => initialParams.get('exploited') === 'true');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const from = fromIso(initialParams.get('dateFrom'));
        const to = fromIso(initialParams.get('dateTo'));
        if (!from && !to) return undefined;
        return { from, to };
    });
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });

    const dateFrom = toIso(dateRange?.from);
    const dateTo = toIso(dateRange?.to);

    // Sync state → URL. Skip params at their default so the URL stays clean.
    useEffect(() => {
        const next = new URLSearchParams();
        if (q) next.set('q', q);
        if (severity !== 'all') next.set('severity', severity);
        if (exploitedOnly) next.set('exploited', 'true');
        if (dateFrom) next.set('dateFrom', dateFrom);
        if (dateTo) next.set('dateTo', dateTo);
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

    const columns: ColumnDef<Vulnerability>[] = [
        {
            id: 'cveId',
            header: 'CVE',
            width: 'w-35',
            accessor: r => r.cveId,
            sortable: true,
            cell: r => <span className="font-mono text-xs">{r.cveId ?? '—'}</span>,
        },
        {
            id: 'description',
            header: 'Description',
            accessor: r => r.description,
            cell: r => <span className="text-sm text-muted-foreground truncate block max-w-105">{r.description ?? '—'}</span>,
        },
        {
            id: 'vendor',
            header: 'Vendor / Product',
            width: 'w-45',
            accessor: r => [r.vendorProject, r.product].filter(Boolean).join(' / '),
            sortable: true,
            cell: r => <span className="text-xs text-muted-foreground truncate block max-w-45">{[r.vendorProject, r.product].filter(Boolean).join(' / ') || '—'}</span>,
        },
        {
            id: 'severity',
            header: 'Severity',
            width: 'w-25',
            accessor: r => r.severity,
            sortable: true,
            cell: r => r.severity
                ? <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', severityTone(r.severity))}>{r.severity}</Badge>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            id: 'cvss',
            header: 'CVSS',
            width: 'w-18',
            align: 'right',
            accessor: r => r.cvssScore,
            sortable: true,
            cell: r => <span className={cn('font-mono text-sm tabular-nums', cvssTone(r.cvssScore))}>{r.cvssScore != null ? r.cvssScore.toFixed(1) : '—'}</span>,
        },
        {
            id: 'kev',
            header: 'KEV',
            width: 'w-20',
            align: 'center',
            accessor: r => r.isExploited ? 1 : 0,
            sortable: true,
            cell: r => r.isExploited
                ? <ShieldAlert className="size-4 text-red-400 mx-auto" />
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            id: 'published',
            header: 'Published',
            width: 'w-20',
            align: 'right',
            accessor: r => r.publishedDate ? Date.parse(r.publishedDate) : null,
            sortable: true,
            cell: r => <span className="text-xs text-muted-foreground tabular-nums">{relTime(r.publishedDate)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Vulnerabilities</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} CVEs from CISA KEV + ingested feeds`}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setPage(1); }}
                        placeholder="Search CVE ID, product, vendor, description…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button
                            onClick={() => { setQ(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                <div className="flex items-center gap-2 px-2 h-9">
                    <Switch
                        id="exploited"
                        checked={exploitedOnly}
                        onCheckedChange={(v) => { setExploitedOnly(v); setPage(1); }}
                    />
                    <Label htmlFor="exploited" className="text-xs text-muted-foreground cursor-pointer">
                        Known exploited only
                    </Label>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={items}
                rowKey={r => r.id ?? r.cveId}
                isLoading={isLoading}
                onRowClick={r => router.push(`/vulnerabilities/${encodeURIComponent(r.cveId || r.id)}`)}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                density="compact"
                emptyState={
                    <EmptyState
                        icon={Shield}
                        title="No vulnerabilities in scope"
                        description="No CVEs match the current filter set. Try widening the date range or clearing the severity / KEV filter."
                    />
                }
            />
        </div>
    );
}
