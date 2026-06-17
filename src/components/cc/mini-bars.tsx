import { cn } from '@/lib/utils';

/**
 * MiniBars — a full-width "over time" bar mini-chart on the Command Center
 * type scale. Unlike <Sparkline> (fixed pixel width), this fills its
 * container, so it reads as a real monthly/period trend inside a panel.
 *
 * Each bar is `flex-1` so the row always fits its parent (no overflow); the
 * column carries the definite height so the percentage bar heights render.
 */
export function MiniBars({
    data,
    height = 'h-12',
    tone = 'var(--brand)',
    className,
}: {
    data: number[];
    /** Tailwind height class for the chart band. */
    height?: string;
    /** Bar fill colour (CSS value). */
    tone?: string;
    className?: string;
}) {
    if (!data || data.length === 0) return null;
    const max = Math.max(1, ...data);
    return (
        <div className={cn('flex items-end gap-px', height, className)}>
            {data.map((v, i) => (
                <div key={i} className="flex-1 min-w-0 h-full flex items-end" title={String(v)}>
                    <div
                        className="w-full rounded-[1px]"
                        style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: tone }}
                    />
                </div>
            ))}
        </div>
    );
}
