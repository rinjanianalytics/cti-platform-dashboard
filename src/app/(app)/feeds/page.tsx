'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { pulses, type Pulse } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Database } from 'lucide-react';
import { relTime } from '@/lib/utils';

const TLP_TONE: Record<string, string> = {
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'amber+strict': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    white: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    clear: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const PAGE_SIZE = 25;

export default function FeedsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });

    useEffect(() => {
        const next = new URLSearchParams();
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [page, pathname, router]);

    const { data, isLoading } = useSWR(
        ['feeds:pulses', page],
        () => pulses.list({ page, pageSize: PAGE_SIZE }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const columns: ColumnDef<Pulse>[] = [
        {
            id: 'name',
            header: 'Name',
            accessor: p => p.name,
            sortable: true,
            cell: p => (
                <div className="min-w-0">
                    <div className="text-sm font-medium truncate max-w-105">{p.name}</div>
                    {p.description && (
                        <div className="text-[11px] text-muted-foreground truncate max-w-105">
                            {p.description}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: 'author',
            header: 'Author',
            width: 'w-35',
            accessor: p => p.author,
            sortable: true,
            cell: p => <span className="text-xs text-muted-foreground truncate block max-w-35">{p.author ?? '—'}</span>,
        },
        {
            id: 'tags',
            header: 'Tags',
            width: 'w-50',
            accessor: p => p.tags?.join(', '),
            cell: p => {
                const tags = p.tags ?? [];
                return <span className="text-xs text-muted-foreground truncate block max-w-50">{tags.length > 0 ? tags.slice(0, 3).join(' · ') : '—'}</span>;
            },
        },
        {
            id: 'tlp',
            header: 'TLP',
            width: 'w-20',
            accessor: p => p.tlp,
            sortable: true,
            cell: p => {
                const tlp = p.tlp?.toLowerCase();
                return tlp
                    ? <Badge variant="outline" className={`font-mono text-[10px] uppercase ${TLP_TONE[tlp] ?? ''}`}>{tlp}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>;
            },
        },
        {
            id: 'iocs',
            header: 'IOCs',
            width: 'w-20',
            align: 'right',
            accessor: p => p.indicatorCount,
            sortable: true,
            cell: p => <span className="text-xs tabular-nums">{p.indicatorCount?.toLocaleString() ?? '—'}</span>,
        },
        {
            id: 'updated',
            header: 'Updated',
            width: 'w-22',
            align: 'right',
            accessor: p => p.otxModified ? Date.parse(p.otxModified) : (p.updatedAt ? Date.parse(p.updatedAt) : null),
            sortable: true,
            cell: p => <span className="text-xs text-muted-foreground tabular-nums">{relTime(p.otxModified || p.updatedAt)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Feeds</h1>
                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                        {isLoading ? 'Loading…' : `${total.toLocaleString()} ingested intelligence pulses`}
                    </p>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={items}
                rowKey={p => p.id}
                isLoading={isLoading}
                onRowClick={p => router.push(`/feeds/${encodeURIComponent(p.otxId || p.id)}`)}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                density="compact"
                emptyState={
                    <EmptyState
                        icon={Database}
                        title="No feed pulses yet"
                        description="Once an OTX, AlienVault, or other source syncs, its pulses will appear here. Configure ingestion in the operator settings."
                    />
                }
            />
        </div>
    );
}
