/**
 * Centralised tone registry for admin / operational surfaces.
 *
 * Before this file, every page picked its own meaning for "blue" / "amber"
 * / "red" — Queues used blue for active jobs, Activity used blue for events,
 * Users used blue for analyst role. Same colour, different semantics.
 *
 * Pages now request a *kind* (`active`, `paused`, `failed`, …) and the
 * registry hands back the matching Tailwind classes for the surface being
 * decorated (badge, text, border-left, dot). One palette decision, applied
 * consistently.
 *
 * Severity tones (critical/high/medium/low) stay in `utils.ts` because
 * they have their own ordered heat-gradient logic and synonym handling.
 */

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusKind =
    | 'active'   // something is doing work right now
    | 'paused'   // intentionally stopped
    | 'failed'   // last attempt errored
    | 'success'  // last attempt OK
    | 'custom'   // configuration overridden from default
    | 'idle';    // healthy but nothing happening

const BADGE: Record<StatusKind, string> = {
    active:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    paused:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
    failed:  'bg-red-500/15 text-red-400 border-red-500/30',
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    custom:  'bg-brand/15 text-brand border-brand/30',
    idle:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const TEXT: Record<StatusKind, string> = {
    active:  'text-blue-400',
    paused:  'text-amber-400',
    failed:  'text-red-400',
    success: 'text-emerald-400',
    custom:  'text-brand',
    idle:    'text-muted-foreground/60',
};

const BORDER_LEFT: Record<StatusKind, string> = {
    active:  'border-l-blue-500/40',
    paused:  'border-l-amber-500/40',
    failed:  'border-l-red-500/50',
    success: 'border-l-emerald-500/40',
    custom:  'border-l-brand/40',
    idle:    'border-l-transparent',
};

const DOT: Record<StatusKind, string> = {
    active:  'bg-blue-500',
    paused:  'bg-amber-500',
    failed:  'bg-red-500',
    success: 'bg-emerald-500',
    custom:  'bg-brand',
    idle:    'bg-muted-foreground/40',
};

export function badgeTone(kind: StatusKind): string { return BADGE[kind]; }
export function textTone(kind: StatusKind): string { return TEXT[kind]; }
export function borderLeftTone(kind: StatusKind): string { return BORDER_LEFT[kind]; }
export function dotTone(kind: StatusKind): string { return DOT[kind]; }

/**
 * Conventional outline badge used across admin pages. Mono caps style is the
 * established vocabulary (see Feeds / Schedules / Queues) — kept here so new
 * pages don't reinvent the className.
 */
export function StatusBadge({
    kind, children, className,
}: { kind: StatusKind; children: React.ReactNode; className?: string }) {
    return (
        <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', BADGE[kind], className)}>
            {children}
        </Badge>
    );
}
