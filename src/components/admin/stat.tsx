'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { textTone, dotTone, type StatusKind } from '@/lib/tone';

/* -------------------------------------------------------------------------- */
/* <Stat> — small inline numeric pill                                          */
/*                                                                             */
/* Used in row cards (Queues "waiting / active / failed / done" strip),       */
/* dense tables, anywhere a count needs a tiny label underneath it. Reads     */
/* as a number first, label second. Tone defaults to muted when value is 0   */
/* so empty counters don't shout.                                              */
/* -------------------------------------------------------------------------- */

interface StatProps {
    label: string;
    value: React.ReactNode;
    /** Force a tone; otherwise the component picks `idle` when value is 0
     *  and the provided tone (default: foreground) when it isn't. */
    tone?: StatusKind | 'default';
    className?: string;
}

export function Stat({ label, value, tone = 'default', className }: StatProps) {
    const isZero = value === 0 || value === '0';
    const colour =
        isZero        ? 'text-muted-foreground/60'
      : tone === 'default' ? 'text-foreground'
      : textTone(tone);
    return (
        <div className={cn('text-center', className)}>
            <div className={cn('font-mono tabular-nums', colour)}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            <div className="text-[9px] uppercase text-muted-foreground/70 tracking-wide">
                {label}
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* <StatusTile> — grid cell with icon + status dot + label + detail            */
/*                                                                             */
/* Used in Services and Runbook to show health of one thing (Postgres,        */
/* Redis, NVD key). Replaces the per-page StatusTile helpers that diverged   */
/* on icon size, gap, and dot position.                                       */
/* -------------------------------------------------------------------------- */

interface StatusTileProps {
    icon?: LucideIcon;
    label: string;
    /** Status colour — drives both the dot and (optionally) the icon tint. */
    tone: StatusKind;
    /** Secondary line under the label — latency, version, "no API key", etc. */
    detail?: React.ReactNode;
    /** Optional click handler — renders as a button surface. */
    onClick?: () => void;
    className?: string;
}

export function StatusTile({
    icon: Icon, label, tone, detail, onClick, className,
}: StatusTileProps) {
    const inner = (
        <>
            <div className="flex items-center gap-2 min-w-0">
                {Icon && <Icon className="size-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium truncate">{label}</span>
                <span aria-hidden className={cn('size-1.5 rounded-full shrink-0 ml-auto', dotTone(tone))} />
            </div>
            {detail && (
                <div className="text-[11px] text-muted-foreground/80 font-mono tabular-nums mt-1.5 truncate">
                    {detail}
                </div>
            )}
        </>
    );
    const base = 'rounded-lg border bg-card px-3 py-2.5 transition-colors';
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={cn(base, 'text-left hover:bg-accent/40', className)}>
                {inner}
            </button>
        );
    }
    return <div className={cn(base, className)}>{inner}</div>;
}

/* -------------------------------------------------------------------------- */
/* <StatField> — small label-on-top form/info row used in cards                */
/*                                                                             */
/* Captures the "Interval / Active schedule / Last run" pattern from          */
/* Feeds / Schedules. Tiny mono uppercase label + a slot for the value        */
/* (a Select, plain text, formatted run summary, …).                          */
/* -------------------------------------------------------------------------- */

interface StatFieldProps {
    label: string;
    children: React.ReactNode;
    className?: string;
}

export function StatField({ label, children, className }: StatFieldProps) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {label}
            </label>
            <div className="min-h-9 flex items-center">{children}</div>
        </div>
    );
}
