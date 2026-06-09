'use client';

/**
 * HIBP breach catalog — Phase 5 #3 (read-only).
 *
 * Operator answers "what new breaches affecting my monitored domains have
 * been disclosed recently". Single table, no CRUD; filters mirrored to URL
 * for shareable links.
 *
 * The catalog refreshes once a day at 06:30 UTC via the scheduled feed
 * sync — operators with admin role get a "Resync now" button for ad-hoc
 * refreshes; everyone else just reads the most recent landed copy.
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { breaches, type DataBreach } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, RefreshCcw, ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';

const PAGE_SIZE = 50;

export default function DataBreachesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();
    const { user } = useAuth();

    const [domain, setDomain] = useState(() => initialParams.get('domain') ?? '');
    const [addedSince, setAddedSince] = useState(() => initialParams.get('addedSince') ?? '');
    const [page, setPage] = useState(() => {
        const n = Number(initialParams.get('page') ?? '1');
        return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        const next = new URLSearchParams();
        if (domain) next.set('domain', domain);
        if (addedSince) next.set('addedSince', addedSince);
        if (page > 1) next.set('page', String(page));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [domain, addedSince, page, pathname, router]);

    const { data, isLoading, mutate } = useSWR(
        ['breaches', domain, addedSince, page],
        () => breaches.list({
            page,
            pageSize: PAGE_SIZE,
            domain: domain.trim() || undefined,
            // The backend accepts ISO-8601 datetimes; a date input gives
            // us YYYY-MM-DD, so append T00:00:00Z to satisfy z.string().datetime().
            addedSince: addedSince ? `${addedSince}T00:00:00Z` : undefined,
        }),
    );

    const items = data?.items ?? [];
    const total = data?.pagination?.total ?? 0;

    const handleSync = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            const summary = await breaches.sync();
            toast.success('Catalog resynced', {
                description: `${summary.totalEntries.toLocaleString()} entries · ${summary.added} added, ${summary.updated} updated`,
            });
            mutate();
        } catch (err) {
            toast.error('Sync failed', { description: (err as Error).message });
        } finally {
            setSyncing(false);
        }
    };

    const columns: CcColumn<DataBreach>[] = [
        {
            id: 'name',
            header: 'Name',
            width: 'w-44',
            sortable: true,
            cell: r => (
                <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px]">{r.name}</span>
                    {r.isVerified && (
                        <ShieldCheck className="size-3 text-sev-low" aria-label="Verified" />
                    )}
                </div>
            ),
        },
        {
            id: 'domain',
            header: 'Domain',
            width: 'w-48',
            sortable: true,
            cell: r => r.domain
                ? <span className="font-mono text-[12px] text-text-2">{r.domain}</span>
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'pwnCount',
            header: 'Accounts',
            width: 'w-32',
            align: 'right',
            sortable: true,
            cell: r => (
                <span className="font-mono text-[12px] tnum">
                    {r.pwnCount.toLocaleString()}
                </span>
            ),
        },
        {
            id: 'breachDate',
            header: 'Breach',
            width: 'w-24',
            align: 'right',
            sortable: true,
            cell: r => r.breachDate
                ? <span className="font-mono text-[11px] text-text-3 tnum">
                    {r.breachDate.slice(0, 10)}
                  </span>
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'addedDate',
            header: 'Added',
            width: 'w-28',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11px] text-text-3 font-mono tnum">{relTime(r.addedDate)}</span>,
        },
        {
            id: 'hibp',
            header: '',
            width: 'w-10',
            align: 'right',
            cell: r => (
                <a
                    href={`https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(r.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex text-text-3 hover:text-text"
                    title="Open in HIBP"
                >
                    <ExternalLink className="size-3.5" />
                </a>
            ),
        },
    ];

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Data breaches</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading
                            ? 'Loading…'
                            : `${total.toLocaleString()} breaches in catalog`}
                        {' · '}
                        <span className="text-text-3">free-tier HIBP /breaches sync</span>
                    </p>
                </div>
                {user?.role === 'admin' && (
                    <Button size="sm" variant="ghost" onClick={handleSync} disabled={syncing}>
                        <RefreshCcw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing…' : 'Resync now'}
                    </Button>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-3" />
                    <Input
                        value={domain}
                        onChange={(e) => { setDomain(e.target.value); setPage(1); }}
                        placeholder="Filter by domain (e.g. adobe.com)…"
                        className="pl-8 pr-8 h-9"
                    />
                    {domain && (
                        <button
                            onClick={() => { setDomain(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-text-3 font-mono">Added since</span>
                    <Input
                        type="date"
                        value={addedSince}
                        onChange={(e) => { setAddedSince(e.target.value); setPage(1); }}
                        className="w-40 h-9"
                    />
                    {addedSince && (
                        <button
                            onClick={() => { setAddedSince(''); setPage(1); }}
                            className="text-text-3 hover:text-text"
                            aria-label="Clear addedSince filter"
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
