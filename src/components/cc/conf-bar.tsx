/**
 * <ConfBar> — 42px confidence track + fill + "N%" mono label.
 * Bar colour signals quality: ≥85 → ok (green), ≥70 → warn (amber),
 * else high (orange). The label sits to the right with tabular-nums so
 * the column aligns vertically across many rows.
 *
 * Used in the Indicators table; the same primitive doubles for any
 * 0-100 confidence-style metric (actor activity score, feed reliability).
 */

import { cn } from '@/lib/utils';

export function ConfBar({
    value,
    className,
}: {
    /** 0–100 confidence value. Anything outside is clamped. */
    value: number;
    className?: string;
}) {
    const v = Math.max(0, Math.min(100, value));
    const tone = v >= 85 ? 'bg-ok' : v >= 70 ? 'bg-warn' : 'bg-sev-high';
    return (
        <span className={cn('inline-flex items-center gap-2', className)}>
            <span className="relative inline-block w-[42px] h-1 bg-bg-3 rounded-full overflow-hidden">
                <span
                    className={cn('absolute inset-y-0 left-0 rounded-full', tone)}
                    style={{ width: `${v}%` }}
                />
            </span>
            <span className="font-mono text-[11px] tnum text-text-3 w-[26px] text-right">{v}%</span>
        </span>
    );
}
