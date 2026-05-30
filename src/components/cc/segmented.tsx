/**
 * <Segmented> — pill segmented control (2–4 short options). Mono, uppercase,
 * letter-spaced. Active segment fills with --bg-3 and full --text colour;
 * inactive segments are --text-3 on transparent.
 *
 * Used in the Command page (24H / 7D / 30D window selector), in the Feeds
 * landscape band (6H / 24H / 7D), and inline as a Compact/Comfort override
 * in data-table toolbars.
 */

import { cn } from '@/lib/utils';

export function Segmented<T extends string>({
    options,
    value,
    onChange,
    size = 'md',
    className,
}: {
    options: ReadonlyArray<{ value: T; label: string }>;
    value: T;
    onChange: (next: T) => void;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const heightClass = size === 'sm' ? 'h-6' : 'h-7';
    const padClass    = size === 'sm' ? 'px-2 text-[10px]' : 'px-2.5 text-[10.5px]';
    return (
        <div className={cn(
            'inline-flex items-center gap-0.5 p-0.5 bg-bg-1 border border-line-soft rounded-md',
            heightClass,
            className,
        )}>
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'font-mono uppercase tracking-wider rounded transition-colors',
                            padClass,
                            heightClass,
                            'leading-none flex items-center',
                            active
                                ? 'bg-bg-3 text-text'
                                : 'text-text-3 hover:text-text',
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
