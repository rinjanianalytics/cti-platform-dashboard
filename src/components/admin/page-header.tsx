'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    /** Sub-line under the title. Pass a string for plain prose, or a node for
     *  styled metadata (counters, status pills). Rendered tabular-nums so
     *  numeric counts don't jitter on refresh. */
    description?: React.ReactNode;
    /** Right-aligned slot for buttons / filters / pickers. */
    actions?: React.ReactNode;
    className?: string;
}

/**
 * Standard page header for admin surfaces.
 *
 * Before this component, each page hand-rolled the same `<div flex>…<h1>…
 * <p>…</div>` block with subtle variations (gap, wrap behaviour, mt-1 vs
 * mt-0.5). Centralising means new pages start aligned to the existing
 * vocabulary and any tweak to the header style propagates everywhere.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
    return (
        <div className={cn('flex items-end justify-between gap-4 flex-wrap', className)}>
            <div className="min-w-0">
                {/*  text-2xl (was text-3xl) — operational pages live by Linear /
                 *  Datadog / Grafana sizing conventions. 30px H1s eat vertical
                 *  budget without doing hierarchy work for an admin who is
                 *  scanning rows. 24px lets a glance reach the data faster. */}
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {description && (
                    <div className="text-[13px] text-muted-foreground mt-1 tabular-nums">
                        {description}
                    </div>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2 shrink-0">{actions}</div>
            )}
        </div>
    );
}

/**
 * Conventional refresh affordance used in nearly every admin header.
 * Centralised so the icon size, label, and ghost variant stay identical.
 */
export function RefreshAction({
    onClick, disabled,
}: { onClick: () => void; disabled?: boolean }) {
    return (
        <Button size="sm" variant="ghost" onClick={onClick} disabled={disabled}>
            <RefreshCw className="size-3.5" /> Refresh
        </Button>
    );
}
