'use client';

/**
 * Threat-actor TTP changelog — Phase 5 #2 (read-only).
 *
 * Append-only log of `intrusion-set → attack-pattern` additions and
 * removals. The differ runs daily at 04:30 UTC after the weekly MITRE
 * sync; this page is the operator-facing browse over that history.
 *
 * Filters mirrored to URL: actorId, techniqueId, changeType, since.
 * STIX 2.1 ID format is `intrusion-set--<uuid>` / `attack-pattern--<uuid>`
 * — operators usually paste these from a graph hit or actor page.
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ttps, type ActorTtpChange, type TtpChangeType } from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X, Plus, Minus } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';

const CHANGE_TYPES: Array<{ value: TtpChangeType | 'all'; label: string }> = [
    { value: 'all',     label: 'All changes' },
    { value: 'added',   label: 'Added' },
    { value: 'removed', label: 'Removed' },
];

const PAGE_SIZE = 100;

/** Small ± pill — added (green) or removed (red), short label. */
function ChangeBadge({ kind }: { kind: TtpChangeType }) {
    const Icon = kind === 'added' ? Plus : Minus;
    return (
        <span className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider',
            kind === 'added'
                ? 'bg-sev-low-s text-sev-low border-sev-low/40'
                : 'bg-sev-high-s text-sev-high border-sev-high/40',
        )}>
            <Icon className="size-2.5" />
            {kind}
        </span>
    );
}

export default function TtpChangesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    const [actorId, setActorId] = useState(() => initialParams.get('actorId') ?? '');
    const [techniqueId, setTechniqueId] = useState(() => initialParams.get('techniqueId') ?? '');
    const [changeType, setChangeType] = useState<TtpChangeType | 'all'>(
        () => (initialParams.get('changeType') as TtpChangeType | null) ?? 'all',
    );
    const [since, setSince] = useState(() => initialParams.get('since') ?? '');
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });

    useEffect(() => {
        const next = new URLSearchParams();
        if (actorId) next.set('actorId', actorId);
        if (techniqueId) next.set('techniqueId', techniqueId);
        if (changeType !== 'all') next.set('changeType', changeType);
        if (since) next.set('since', since);
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [actorId, techniqueId, changeType, since, page, pathname, router]);

    const { data, isLoading } = useSWR(
        ['ttp-changes', actorId, techniqueId, changeType, since, page],
        () => ttps.list({
            page,
            pageSize: PAGE_SIZE,
            actorId: actorId.trim() || undefined,
            techniqueId: techniqueId.trim() || undefined,
            changeType: changeType === 'all' ? undefined : changeType,
            since: since ? `${since}T00:00:00Z` : undefined,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const columns: CcColumn<ActorTtpChange>[] = [
        {
            id: 'changeType',
            header: '',
            width: 'w-24',
            cell: r => <ChangeBadge kind={r.changeType} />,
        },
        {
            id: 'actorId',
            header: 'Actor (STIX id)',
            sortable: true,
            cell: r => (
                <span
                    className="font-mono text-[12px] truncate block max-w-[40ch]"
                    title={r.actorId}
                >
                    {r.actorId}
                </span>
            ),
        },
        {
            id: 'techniqueId',
            header: 'Technique (STIX id)',
            sortable: true,
            cell: r => (
                <span
                    className="font-mono text-[12px] truncate block max-w-[40ch]"
                    title={r.techniqueId}
                >
                    {r.techniqueId}
                </span>
            ),
        },
        {
            id: 'detectedAt',
            header: 'Detected',
            width: 'w-28',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11px] text-text-3 font-mono tnum">{relTime(r.detectedAt)}</span>,
        },
    ];

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">TTP changelog</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading
                            ? 'Loading…'
                            : `${total.toLocaleString()} changes since differ baseline`}
                        {' · '}
                        <span className="text-text-3">MITRE intrusion-set → attack-pattern diffs</span>
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
                <div className="relative w-64">
                    <Input
                        value={actorId}
                        onChange={(e) => { setActorId(e.target.value); setPage(1); }}
                        placeholder="Filter by actor STIX id…"
                        className="pr-8 h-9 font-mono text-[12px]"
                    />
                    {actorId && (
                        <button
                            onClick={() => { setActorId(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <div className="relative w-64">
                    <Input
                        value={techniqueId}
                        onChange={(e) => { setTechniqueId(e.target.value); setPage(1); }}
                        placeholder="Filter by technique STIX id…"
                        className="pr-8 h-9 font-mono text-[12px]"
                    />
                    {techniqueId && (
                        <button
                            onClick={() => { setTechniqueId(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <Select value={changeType} onValueChange={(v) => { setChangeType(v as TtpChangeType | 'all'); setPage(1); }}>
                    <SelectTrigger className="w-36 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CHANGE_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-text-3 font-mono">Since</span>
                    <Input
                        type="date"
                        value={since}
                        onChange={(e) => { setSince(e.target.value); setPage(1); }}
                        className="w-40 h-9"
                    />
                    {since && (
                        <button
                            onClick={() => { setSince(''); setPage(1); }}
                            className="text-text-3 hover:text-text"
                            aria-label="Clear since filter"
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
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                />
            </div>
        </div>
    );
}
