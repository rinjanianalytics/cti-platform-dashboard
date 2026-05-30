/**
 * <PanelHead> — the standard heading row for every Command Center panel.
 * Eyebrow label + title + optional sub-line + optional icon + optional
 * right slot (action link, chip, segmented control).
 *
 * Visual spec: title is 14px/600, sub is 12px text-3, eyebrow is the .eyebrow
 * mono utility. Layout: icon (16.5px) left of the title cluster, right slot
 * pinned right. All wrapped in a flex row with `padding-bottom: var(--pad)`
 * so the panel body picks up directly after.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PanelHead({
    icon,
    eyebrow,
    title,
    sub,
    right,
    className,
}: {
    icon?: ReactNode;
    eyebrow?: string;
    title: ReactNode;
    sub?: ReactNode;
    right?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex items-start justify-between gap-3', className)}>
            <div className="flex items-start gap-2.5 min-w-0">
                {icon && <span className="text-text-3 shrink-0 mt-0.5">{icon}</span>}
                <div className="min-w-0">
                    {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
                    <div className="text-[14px] font-semibold leading-tight truncate">{title}</div>
                    {sub && <div className="sub mt-0.5 truncate">{sub}</div>}
                </div>
            </div>
            {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
        </div>
    );
}
