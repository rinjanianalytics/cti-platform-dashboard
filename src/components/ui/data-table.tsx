'use client';

import { useMemo, useState } from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

export interface ColumnDef<T> {
    /** Stable id used for sort state, visibility toggling, and React keys. */
    id: string;
    /** Header label or node. */
    header: React.ReactNode;
    /** Width hint, e.g. `w-30`, `w-[160px]`. Applied to <TableHead>. */
    width?: string;
    /** Cell text alignment. */
    align?: 'left' | 'right' | 'center';
    /** Function that pulls a sortable scalar from the row. Required if `sortable`. */
    accessor?: (row: T) => unknown;
    /** Render the cell. Falls back to `accessor` if omitted. */
    cell?: (row: T) => React.ReactNode;
    /** Allow clicking the header to sort by this column. Default false. */
    sortable?: boolean;
    /** Tailwind classes applied to <TableCell> for this column. */
    className?: string;
    /** If true, the column starts hidden but can be re-enabled via the visibility menu. */
    defaultHidden?: boolean;
}

interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
    rowKey: (row: T) => string;
    isLoading?: boolean;
    onRowClick?: (row: T) => void;
    /** Pagination — pass when the parent owns paging (server-side). */
    page?: number;
    pageSize?: number;
    total?: number;
    onPageChange?: (page: number) => void;
    /** Empty-state node when there are no rows after filtering. */
    emptyState?: React.ReactNode;
    density?: 'compact' | 'comfortable';
}

export function DataTable<T>({
    columns,
    data,
    rowKey,
    isLoading,
    onRowClick,
    page,
    pageSize,
    total,
    onPageChange,
    emptyState,
    density = 'comfortable',
}: DataTableProps<T>) {
    // -- Sort state (client-side, sorts only the current page) ---------------
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // -- Column visibility ----------------------------------------------------
    const [hidden, setHidden] = useState<Set<string>>(
        () => new Set(columns.filter(c => c.defaultHidden).map(c => c.id)),
    );
    const visibleColumns = columns.filter(c => !hidden.has(c.id));

    const sorted = useMemo(() => {
        if (!sortKey) return data;
        const col = columns.find(c => c.id === sortKey);
        if (!col?.accessor) return data;
        const sign = sortDir === 'asc' ? 1 : -1;
        return [...data].sort((a, b) => {
            const va = col.accessor!(a);
            const vb = col.accessor!(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1; // nulls last
            if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
            return sign * String(va).localeCompare(String(vb), undefined, { numeric: true });
        });
    }, [data, columns, sortKey, sortDir]);

    const toggleSort = (id: string) => {
        if (sortKey !== id) { setSortKey(id); setSortDir('desc'); return; }
        if (sortDir === 'desc') { setSortDir('asc'); return; }
        setSortKey(null);
    };

    const rowPadding = density === 'compact' ? 'py-1' : '';
    const showPager = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange;

    return (
        <div className="space-y-2">
            {/* Toolbar — column visibility + (future) density */}
            <div className="flex items-center justify-end gap-2">
                <ColumnVisibilityMenu columns={columns} hidden={hidden} onChange={setHidden} />
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            {visibleColumns.map(col => (
                                <TableHead
                                    key={col.id}
                                    className={cn(
                                        col.width,
                                        col.align === 'right' && 'text-right',
                                        col.align === 'center' && 'text-center',
                                        col.sortable && 'cursor-pointer select-none hover:text-foreground',
                                    )}
                                    onClick={col.sortable ? () => toggleSort(col.id) : undefined}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {col.header}
                                        {col.sortable && <SortIndicator active={sortKey === col.id} dir={sortDir} />}
                                    </span>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={visibleColumns.length}><Skeleton className="h-5 w-full" /></TableCell>
                                </TableRow>
                            ))
                        ) : sorted.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={visibleColumns.length} className="text-center py-12">
                                    {emptyState ?? <span className="text-sm text-muted-foreground">No results.</span>}
                                </TableCell>
                            </TableRow>
                        ) : (
                            sorted.map(row => (
                                <TableRow
                                    key={rowKey(row)}
                                    className={cn(onRowClick && 'cursor-pointer hover:bg-accent/40')}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                >
                                    {visibleColumns.map(col => (
                                        <TableCell
                                            key={col.id}
                                            className={cn(
                                                rowPadding,
                                                col.align === 'right' && 'text-right',
                                                col.align === 'center' && 'text-center',
                                                col.className,
                                            )}
                                        >
                                            {col.cell ? col.cell(row) : (col.accessor ? String(col.accessor(row) ?? '—') : null)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {showPager && <Pager page={page!} pageSize={pageSize!} total={total!} onPageChange={onPageChange!} />}
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <ChevronsUpDown className="size-3 text-muted-foreground/60" />;
    return dir === 'asc'
        ? <ChevronUp className="size-3 text-foreground" />
        : <ChevronDown className="size-3 text-foreground" />;
}

function ColumnVisibilityMenu<T>({
    columns, hidden, onChange,
}: { columns: ColumnDef<T>[]; hidden: Set<string>; onChange: (next: Set<string>) => void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="inline-flex items-center gap-1 rounded-md border bg-muted/20 hover:bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors"
            >
                <Columns3 className="size-3" /> Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Visible columns
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {columns.map(c => {
                    const isHidden = hidden.has(c.id);
                    return (
                        <DropdownMenuItem
                            key={c.id}
                            onClick={(e) => {
                                e.preventDefault();
                                const next = new Set(hidden);
                                if (isHidden) next.delete(c.id);
                                else next.add(c.id);
                                onChange(next);
                            }}
                            className="text-xs"
                        >
                            <span className="inline-flex items-center gap-2">
                                <span
                                    className={cn(
                                        'size-3 rounded-sm border flex items-center justify-center',
                                        !isHidden ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                                    )}
                                >
                                    {!isHidden && <span className="size-1.5 rounded-[1px] bg-primary-foreground" />}
                                </span>
                                {typeof c.header === 'string' ? c.header : c.id}
                            </span>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function Pager({
    page, pageSize, total, onPageChange,
}: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
                Showing <span className="text-foreground">{from.toLocaleString()}–{to.toLocaleString()}</span> of <span className="text-foreground">{total.toLocaleString()}</span>
            </span>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="xs"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    <ChevronLeft className="size-3" /> Prev
                </Button>
                <span className="px-2">Page {page} / {pages}</span>
                <Button
                    variant="outline"
                    size="xs"
                    disabled={page >= pages}
                    onClick={() => onPageChange(page + 1)}
                >
                    Next <ChevronRight className="size-3" />
                </Button>
            </div>
        </div>
    );
}
