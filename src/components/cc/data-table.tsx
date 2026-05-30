'use client';

/**
 * <CcDataTable> — Command Center data table primitive.
 *
 * Distinct from `src/components/ui/data-table.tsx` (which stays in use for
 * Users / Feeds / etc.) because the Command Center spec adds three
 * features that the shadcn DataTable doesn't have and that would balloon
 * its API if grafted on:
 *
 *   1. **Sticky header + internal scroll** — the page wraps in `.page-fill`
 *      (height: 100%), the toolbar sits above, the table body owns the
 *      scroll. Keeps the header pinned and the row count stable as the
 *      user scrolls deep into a long list.
 *
 *   2. **Selection** — opt-in checkbox column. Parent owns the `Set<id>`
 *      so the bulk-action-bar can render with the right count and clear
 *      after a successful bulk operation.
 *
 *   3. **Sev tint left edge** — per the design rule, the only warm colour
 *      on a row signals severity. `sevtintFn(row)` returns `crit/high/
 *      med/low/info | null`; the table renders a 3px coloured strip
 *      flush to the row's left edge via the `.sevtint sevtint-{level}`
 *      utility on the <tr>.
 *
 * Sorting is server-managed: the parent passes `sort` and `onSortChange`.
 * Local sort is supported via the existing shadcn DataTable; here we
 * deliberately keep it server-side because the IOCs/Vulns/Actors lists
 * are paginated server-side and a local-only sort would lie to the user
 * about what they're sorting.
 */

import { type ReactNode, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useTweaks, type DensityKey } from './tweaks';
import { Segmented } from './segmented';
import type { Severity } from './sev';

/**
 * Tailwind `w-N` → CSS width string (N × 0.25rem). Returns `undefined` for
 * un-widthed or non-spacing values so `<col>` claims its share of the
 * table's remaining space.
 *
 * Inline styles are used on `<col>` instead of className because some
 * Tailwind v4 + Turbopack pipelines drop classes that only ever appear on
 * `<col>` elements from the generated CSS bundle, leaving the colgroup
 * widthless and the body cells negotiating widths against header cells
 * (which DO have working classes via `<th>`) — the head/body shift the
 * user sees in /iocs, /vulnerabilities, /actors. Parsing to inline CSS
 * sidesteps the whole Tailwind layer here.
 */
function colWidthStyle(cls: string | undefined): CSSProperties | undefined {
    if (!cls) return undefined;
    const m = cls.match(/^w-(\d+)$/);
    if (!m) return undefined;
    return { width: `${Number(m[1]) * 0.25}rem` };
}

export type SortDir = 'asc' | 'desc';
export interface SortState { id: string; dir: SortDir }

export interface CcColumn<T> {
    id: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    /** Width hint (e.g. 'w-24', 'min-w-[120px]'). Goes to the <th> + each <td>. */
    width?: string;
    align?: 'left' | 'right' | 'center';
    sortable?: boolean;
    /** Tailwind classes added to every cell in this column. */
    className?: string;
    /** Tailwind classes added to the header cell. */
    headerClassName?: string;
}

interface CcDataTableProps<T> {
    columns: CcColumn<T>[];
    data: T[];
    rowKey: (row: T) => string;
    isLoading?: boolean;
    onRowClick?: (row: T) => void;

    /** Severity-tint stripe on the row's left edge. Returns null = no stripe. */
    sevtintFn?: (row: T) => Severity | null;

    /** Optional row selection — parent owns the Set so the bulk bar can read it. */
    selection?: {
        selectedIds: Set<string>;
        onChange: (next: Set<string>) => void;
    };

    /** Server-managed sort. */
    sort?: SortState | null;
    onSortChange?: (next: SortState | null) => void;

    /** Pagination — server-side, parent owns the cursor. */
    page?: number;
    pageSize?: number;
    total?: number;
    onPageChange?: (page: number) => void;

    /** Local density override — falls back to the global Tweak. */
    localDensity?: DensityKey | null;
    onLocalDensityChange?: (next: DensityKey | null) => void;

    emptyState?: ReactNode;
}

export function CcDataTable<T>({
    columns, data, rowKey, isLoading, onRowClick,
    sevtintFn, selection,
    sort, onSortChange,
    page, pageSize, total, onPageChange,
    localDensity, onLocalDensityChange,
    emptyState,
}: CcDataTableProps<T>) {
    const tweaks = useTweaks();
    const effDensity = localDensity ?? tweaks.density;
    const rowPad = effDensity === 'compact' ? 'h-8'  : 'h-11';
    const cellY  = effDensity === 'compact' ? 'py-1' : 'py-2.5';

    const showPager = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange;

    const sevtintActive = sevtintFn && tweaks.sevtint;

    const toggleSort = (id: string) => {
        if (!onSortChange) return;
        if (!sort || sort.id !== id) { onSortChange({ id, dir: 'desc' }); return; }
        if (sort.dir === 'desc') { onSortChange({ id, dir: 'asc' }); return; }
        onSortChange(null);
    };

    /* ── Selection helpers ─────────────────────────────────────────── */
    const selectedIds = selection?.selectedIds ?? new Set<string>();
    const allOnPageSelected = selection
        ? data.length > 0 && data.every(r => selectedIds.has(rowKey(r)))
        : false;
    const someOnPageSelected = selection
        ? data.some(r => selectedIds.has(rowKey(r))) && !allOnPageSelected
        : false;
    const toggleAllOnPage = () => {
        if (!selection) return;
        const next = new Set(selectedIds);
        if (allOnPageSelected) {
            for (const r of data) next.delete(rowKey(r));
        } else {
            for (const r of data) next.add(rowKey(r));
        }
        selection.onChange(next);
    };
    const toggleRow = (id: string) => {
        if (!selection) return;
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selection.onChange(next);
    };

    /* ── Body content ──────────────────────────────────────────────── */
    const body = isLoading
        ? (
            Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk:${i}`} className={cn(rowPad, 'border-b border-line-soft')}>
                    {selection && <td className={cn('pl-3', cellY)}><Skeleton className="size-4" /></td>}
                    <td colSpan={columns.length} className={cn('px-3', cellY)}>
                        <Skeleton className="h-4 w-full" />
                    </td>
                </tr>
            ))
        )
        : data.length === 0
        ? (
            <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)} className="py-12 text-center">
                    {emptyState ?? <span className="text-sm text-text-3">No results.</span>}
                </td>
            </tr>
        )
        : data.map(row => {
            const id = rowKey(row);
            const sev = sevtintActive ? sevtintFn(row) : null;
            const isSelected = selectedIds.has(id);
            return (
                <tr
                    key={id}
                    className={cn(
                        rowPad,
                        'border-b border-line-soft transition-colors',
                        'sevtint',
                        sev && `sevtint-${sev}`,
                        onRowClick && 'cursor-pointer',
                        isSelected ? 'bg-brand-soft/40' : 'hover:bg-bg-2',
                    )}
                    onClick={onRowClick ? (e) => {
                        // Don't trigger row click when clicking the checkbox cell;
                        // we stop propagation on the checkbox itself.
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-row-checkbox]')) return;
                        onRowClick(row);
                    } : undefined}
                >
                    {selection && (
                        <td className={cn('pl-3', cellY)} data-row-checkbox>
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => { e.stopPropagation(); toggleRow(id); }}
                                onClick={(e) => e.stopPropagation()}
                                className="size-3.5 accent-brand cursor-pointer"
                                aria-label={`Select row ${id}`}
                            />
                        </td>
                    )}
                    {columns.map(col => (
                        <td
                            key={col.id}
                            // `overflow-hidden` is a safety net — `<col>` sets
                            // the column width; a cell renderer that forgets
                            // `truncate` would otherwise paint into the next
                            // column.
                            className={cn(
                                'px-3 overflow-hidden',
                                cellY,
                                col.align === 'right' && 'text-right',
                                col.align === 'center' && 'text-center',
                                col.className,
                            )}
                        >
                            {col.cell(row)}
                        </td>
                    ))}
                </tr>
            );
        });

    return (
        <div className="flex flex-col h-full min-h-0 panel">
            {/* Local density / toolbar tail */}
            {(onLocalDensityChange || total !== undefined) && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-line-soft text-[11px] text-text-3">
                    <span className="tabular-nums">
                        {total !== undefined && `${total.toLocaleString()} total`}
                    </span>
                    {onLocalDensityChange && (
                        <Segmented<'compact' | 'comfortable'>
                            options={[
                                { value: 'comfortable', label: 'Comfort' },
                                { value: 'compact',     label: 'Compact' },
                            ]}
                            value={effDensity}
                            onChange={onLocalDensityChange}
                            size="sm"
                        />
                    )}
                </div>
            )}

            {/* Scrollable table body.

                Column widths are defined ONCE at the table level via a
                `<colgroup>` of `<col>` elements — not on each `<th>` /
                `<td>`. This is the only place the browser will respect
                widths uniformly across head and body: `<col>` widths feed
                straight into the table layout algorithm before any row
                renders, so sticky positioning, severity-tint pseudos, or
                a wide content cell can't drag a column off-axis. The
                previous attempt put `w-*` on `<th>` and `<td>` and relied
                on `table-fixed` first-row negotiation — it lost to
                Chromium's sticky-header column resolution and produced
                the visible head/body shift.

                `table-fixed` keeps the `<col>` widths authoritative; an
                un-widthed column (the `value` column in /iocs) claims
                the remaining space. Cells truncate via `truncate block`
                wrappers in the cell renderers. */}
            <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-sm border-separate border-spacing-0 table-fixed">
                    <colgroup>
                        {selection && <col style={{ width: '2.5rem' }} />}
                        {columns.map(col => (
                            <col key={col.id} style={colWidthStyle(col.width)} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            {selection && (
                                <th
                                    style={{ width: '2.5rem' }}
                                    className="pl-3 py-2 text-left sticky top-0 z-10 bg-bg-2 border-b border-line-soft"
                                >
                                    <input
                                        type="checkbox"
                                        checked={allOnPageSelected}
                                        ref={el => { if (el) el.indeterminate = someOnPageSelected; }}
                                        onChange={toggleAllOnPage}
                                        className="size-3.5 accent-brand cursor-pointer"
                                        aria-label="Select all on page"
                                    />
                                </th>
                            )}
                            {columns.map(col => {
                                const sortedByMe = sort?.id === col.id;
                                // Apply width inline on the <th> too — `table-fixed`
                                // resolves column widths from the FIRST ROW when a
                                // <col> width doesn't take effect (e.g. some
                                // Tailwind/Turbopack pipelines). Belt and braces.
                                const widthStyle = colWidthStyle(col.width);
                                return (
                                    <th
                                        key={col.id}
                                        style={widthStyle}
                                        className={cn(
                                            'px-3 py-2 text-left font-medium text-[11px] text-text-3',
                                            'sticky top-0 z-10 bg-bg-2 border-b border-line-soft',
                                            col.align === 'right' && 'text-right',
                                            col.align === 'center' && 'text-center',
                                            col.sortable && 'cursor-pointer select-none hover:text-text',
                                            col.headerClassName,
                                        )}
                                        onClick={col.sortable ? () => toggleSort(col.id) : undefined}
                                    >
                                        <span className={cn(
                                            'inline-flex items-center gap-1 uppercase tracking-wider',
                                            col.align === 'right' && 'ml-auto',
                                        )}>
                                            {col.header}
                                            {col.sortable && <SortIndicator active={sortedByMe} dir={sort?.dir ?? 'desc'} />}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>{body}</tbody>
                </table>
            </div>

            {/* Pager */}
            {showPager && (
                <Pager
                    page={page!} pageSize={pageSize!} total={total!}
                    onPageChange={onPageChange!}
                />
            )}
        </div>
    );
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <ChevronsUpDown className="size-3 text-text-4" />;
    return dir === 'asc'
        ? <ChevronUp className="size-3 text-brand" />
        : <ChevronDown className="size-3 text-brand" />;
}

function Pager({
    page, pageSize, total, onPageChange,
}: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return (
        <div className="flex items-center justify-between px-3 py-2 border-t border-line-soft text-[11px] text-text-3 tabular-nums">
            <span>
                Showing <span className="text-text">{from.toLocaleString()}–{to.toLocaleString()}</span> of <span className="text-text">{total.toLocaleString()}</span>
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className={cn(
                        'inline-flex items-center gap-1 h-6 px-2 rounded border border-line-soft',
                        'hover:bg-bg-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                    )}
                >
                    <ChevronLeft className="size-3" /> Prev
                </button>
                <span className="px-1">Page {page} / {pages}</span>
                <button
                    type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= pages}
                    className={cn(
                        'inline-flex items-center gap-1 h-6 px-2 rounded border border-line-soft',
                        'hover:bg-bg-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                    )}
                >
                    Next <ChevronRight className="size-3" />
                </button>
            </div>
        </div>
    );
}
