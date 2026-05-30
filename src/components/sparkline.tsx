'use client';

import { cn } from '@/lib/utils';

/**
 * Inline SVG sparkline — area fill + smooth path + optional end-cap dot.
 *
 * Two visual variants:
 *   - `gradient` (default, Command Center) — vertical alpha ramp from
 *     the tone colour to transparent. Tighter, less busy than hatched.
 *   - `pattern` — diagonal hatching, matches the embedded Workbench's
 *     summary cards. Use when the surface needs to visually rhyme with
 *     Workbench (overview KPI strip → Workbench overview, etc.).
 *
 * Tones map to Command Center tokens (`var(--brand)`, `var(--sev-*)`,
 * `var(--ok|warn|down)`) so the chart automatically follows the theme
 * when the Tweaks panel swaps the accent. The legacy `success/danger/
 * warning/muted` tones are kept as aliases for callers that pre-date
 * the Command Center palette.
 */

export type SparklineTone =
    | 'brand' | 'ok' | 'warn' | 'down'
    | 'sev-crit' | 'sev-high' | 'sev-med' | 'sev-low' | 'sev-info'
    // legacy aliases (Phase 1 keeps these so the existing overview page
    // doesn't break mid-merge if the rebuild lands separately):
    | 'success' | 'danger' | 'warning' | 'muted';

interface SparklineProps {
    /** Series of numbers — array length is the X axis (one point per index). */
    data: number[];
    className?: string;
    tone?: SparklineTone;
    variant?: 'gradient' | 'pattern';
    width?: number;
    height?: number;
    strokeWidth?: number;
    /** End-cap dot at the last point. Defaults to true for the gradient variant. */
    endCap?: boolean;
    /** ARIA label — fall back to "Trend, N buckets". */
    label?: string;
}

const TONE_VAR: Record<SparklineTone, string> = {
    'brand':    'var(--brand)',
    'ok':       'var(--ok)',
    'warn':     'var(--warn)',
    'down':     'var(--down)',
    'sev-crit': 'var(--sev-crit)',
    'sev-high': 'var(--sev-high)',
    'sev-med':  'var(--sev-med)',
    'sev-low':  'var(--sev-low)',
    'sev-info': 'var(--sev-info)',
    // legacy mapping
    'success':  'var(--ok)',
    'danger':   'var(--down)',
    'warning':  'var(--warn)',
    'muted':    'var(--text-3)',
};

export function Sparkline({
    data,
    className,
    tone = 'brand',
    variant = 'gradient',
    width = 80,
    height = 24,
    strokeWidth = 1.5,
    endCap,
    label,
}: SparklineProps) {
    if (!data || data.length === 0) return null;

    const colour = TONE_VAR[tone];

    // Render a flat baseline when every bucket is zero — without this special
    // case the y-normalisation collapses to NaN and the path disappears.
    const allZero = data.every(d => d === 0);

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((value, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = allZero ? height - 1 : height - ((value - min) / range) * (height - 2) - 1;
        return { x, y };
    });

    const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
    const areaPoints = [`0,${height}`, ...points.map(p => `${p.x},${p.y}`), `${width},${height}`].join(' ');

    const last = points[points.length - 1];
    const showCap = (endCap ?? variant === 'gradient') && !allZero;

    // Per-instance gradient/pattern ID so multiple sparklines with different
    // tones don't collide in the SVG defs namespace.
    const gradId    = `cc-spark-grad-${tone}-${variant}`;
    const patternId = `cc-spark-pat-${tone}-${variant}`;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={cn('shrink-0', className)}
            style={{ width, height }}
            role="img"
            aria-label={label ?? `Trend, ${data.length} buckets`}
        >
            <defs>
                {variant === 'gradient' ? (
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={colour} stopOpacity="0.32" />
                        <stop offset="100%" stopColor={colour} stopOpacity="0" />
                    </linearGradient>
                ) : (
                    <pattern id={patternId} x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
                        <rect width="4" height="4" fill={colour} opacity="0.15" />
                        <path
                            d="M0,0 L4,4 M-1,3 L3,7 M-1,-1 L5,5"
                            stroke={colour}
                            strokeWidth="0.75"
                            opacity="0.4"
                            fill="none"
                        />
                    </pattern>
                )}
            </defs>
            {!allZero && (
                <polygon
                    points={areaPoints}
                    fill={variant === 'gradient' ? `url(#${gradId})` : `url(#${patternId})`}
                />
            )}
            <path
                d={linePath}
                fill="none"
                stroke={colour}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {showCap && (
                <circle cx={last.x} cy={last.y} r={1.6} fill={colour} />
            )}
        </svg>
    );
}
