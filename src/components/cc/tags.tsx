/**
 * <Tags> — render up to N chips inline and roll the rest into a single
 * accent-tinted `+M` overflow chip. Default `max=2` per the design spec.
 * Click on the overflow chip is currently a no-op (Phase 2 will expand
 * into a popover listing the rest); for now we surface the full list via
 * a tooltip on the overflow chip.
 */

import { cn } from '@/lib/utils';

export function Tags({
    items,
    max = 2,
    className,
}: {
    items: string[];
    max?: number;
    className?: string;
}) {
    if (!items || items.length === 0) {
        return <span className="text-text-4 text-[11px]">—</span>;
    }
    const shown = items.slice(0, max);
    const overflow = items.length - shown.length;
    return (
        <span className={cn('inline-flex items-center gap-1 min-w-0', className)}>
            {shown.map(t => (
                <span key={t} className="chip truncate max-w-[14ch]" title={t}>{t}</span>
            ))}
            {overflow > 0 && (
                <span
                    className="chip chip-brand tnum"
                    title={items.slice(max).join(', ')}
                >
                    +{overflow}
                </span>
            )}
        </span>
    );
}
