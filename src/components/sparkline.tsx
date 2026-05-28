'use client';

import { cn } from '@/lib/utils';

/**
 * Compact SVG sparkline — pattern-filled area + smooth path, no chart library.
 *
 * Design adapted from the Workbench fork's `SummaryCard` so the embedded
 * `/admin/workbench` overview and our own `Threat overview` KPI strip share
 * a visual idiom (operator's eye can pattern-match between the two surfaces).
 *
 * The component is intentionally tone-aware: the same chart shape reads as
 * "good" or "bad" depending on what's being measured (more IOCs = activity,
 * more failures = problem). Callers pick the `tone`.
 */

export type SparklineTone = 'success' | 'danger' | 'warning' | 'muted';

interface SparklineProps {
    /** Series of numbers — the array length is the X axis (one point per index). */
    data: number[];
    /** Optional override for the wrapping <svg>'s class — sizing, etc. */
    className?: string;
    tone?: SparklineTone;
    /** ARIA label so screen readers don't see "blank SVG". */
    label?: string;
}

const tones: Record<SparklineTone, { stroke: string; fill: string }> = {
    success: { stroke: 'stroke-emerald-500',  fill: 'fill-emerald-500' },
    danger:  { stroke: 'stroke-rose-500',     fill: 'fill-rose-500'    },
    warning: { stroke: 'stroke-amber-500',    fill: 'fill-amber-500'   },
    muted:   { stroke: 'stroke-muted-foreground', fill: 'fill-muted-foreground' },
};

export function Sparkline({ data, className, tone = 'success', label }: SparklineProps) {
    if (!data || data.length === 0) return null;

    // Render a flat baseline when every bucket is zero — without this special
    // case the y-normalisation collapses to NaN and the path disappears.
    const allZero = data.every(d => d === 0);

    const width = 80;
    const height = 24;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((value, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = allZero ? height - 1 : height - ((value - min) / range) * (height - 2) - 1;
        return `${x},${y}`;
    });

    const linePath = `M ${points.join(' L ')}`;
    const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(' ');

    const { stroke, fill } = tones[tone];
    const patternId = `sparkline-pattern-${tone}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={cn('h-6 w-20 shrink-0', className)}
            role="img"
            aria-label={label ?? `Trend, ${data.length} buckets`}
        >
            <defs>
                {/* Hatched fill — same idiom as Workbench so the two surfaces visually rhyme. */}
                <pattern id={patternId} x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
                    <rect width="4" height="4" className={cn(fill, 'opacity-15')} />
                    <path
                        d="M0,0 L4,4 M-1,3 L3,7 M-1,-1 L5,5"
                        className={stroke}
                        strokeWidth="0.75"
                        opacity="0.4"
                    />
                </pattern>
            </defs>
            {!allZero && <polygon points={areaPoints} fill={`url(#${patternId})`} />}
            <path
                d={linePath}
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn('stroke-current', stroke)}
            />
        </svg>
    );
}
