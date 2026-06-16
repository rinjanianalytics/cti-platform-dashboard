'use client';

/**
 * CoverageHeatmap — a 3-col grid of tactic cells, heat-shaded by count.
 *
 * Generalizes the ATT&CK coverage card (see app/(app)/page.tsx → AttackHeatmap)
 * so FiGHT (5G) and ATLAS (AI) get the identical treatment: cell background =
 * brand accent at alpha 0.12 + ratio*0.85; dark ink once ratio ≥ 0.5 for
 * contrast on the bright fill. Same Command Center panel chrome.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PanelHead } from '@/components/cc/panel-head';

export interface CoverageCell {
    id: string;
    name: string;
    count: number;
}

export function CoverageHeatmap({
    title, sub, icon, cells,
}: {
    title: string;
    sub: string;
    icon?: ReactNode;
    cells: CoverageCell[];
}) {
    const max = cells.reduce((m, c) => Math.max(m, c.count), 1);
    return (
        <div className="panel panel-pad">
            <PanelHead icon={icon} title={title} sub={sub} />
            <div className="mt-3 grid grid-cols-3 gap-1.75">
                {cells.length === 0 ? (
                    <div className="col-span-3 text-[12.5px] text-text-3">No coverage data — run the ingest.</div>
                ) : cells.map((c) => {
                    const ratio = c.count / max;
                    const alpha = 0.12 + ratio * 0.85;
                    const dark = ratio >= 0.5;
                    return (
                        <div
                            key={c.id}
                            className="min-w-0 rounded-md border border-line-soft px-2.5 py-2.25"
                            style={{
                                background: `oklch(from var(--brand) l c h / ${alpha})`,
                                color: dark ? '#0b0e14' : 'var(--text)',
                            }}
                        >
                            <div
                                className="mb-0.75 font-mono text-[9.5px] tracking-wider"
                                style={{ color: dark ? 'rgba(11,14,20,.62)' : 'var(--text-3)' }}
                            >
                                {c.id}
                            </div>
                            <div className={cn('mb-1.25 truncate text-[11.5px]', dark ? 'font-semibold' : 'font-normal')}>
                                {c.name}
                            </div>
                            <div className="tnum font-mono text-[16px] font-semibold leading-tight">{c.count}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
