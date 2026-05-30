/**
 * <StatusDot> — 7px circle, glow ring for ok/warn/down, no glow for idle.
 * Add `live` to pulse opacity (1 ↔ 0.35 over 1.8s) — used in topbar clock,
 * "What changed" rail, and feed sync indicators where the dot signals
 * something is *actively* observing or ticking.
 *
 * Per the design system: severity is severity, status is status. A green
 * dot here means *service up*, NOT *severity: low*. Don't reuse for sev.
 */

import { cn } from '@/lib/utils';

export type Status = 'ok' | 'warn' | 'down' | 'idle';

export function StatusDot({
    status,
    live = false,
    className,
    title,
}: {
    status: Status;
    live?: boolean;
    className?: string;
    title?: string;
}) {
    return (
        <span
            className={cn('dot', status, live && 'live', className)}
            title={title}
            aria-label={`status: ${status}`}
        />
    );
}
