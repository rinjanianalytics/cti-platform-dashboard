'use client';

/**
 * <BulkActionBar> — floating bottom-center bar that surfaces when the
 * user has selected ≥1 rows in a Command Center table. Per the design
 * spec the bar shows:
 *
 *   [ N selected · Watch · Pivot · Export · Playbook (primary) · ✕ ]
 *
 * The primary action (CTA-coloured fill) sits second-to-last; the clear
 * button (✕) is rightmost. Hide-on-zero is the table's responsibility:
 * pass `count > 0` to render.
 *
 * Each action is optional — surface only what makes sense per table
 * (e.g. Vulnerabilities has no "Watch" today, Actors has no "Pivot").
 * The order matters for muscle memory: keep it stable across tables.
 */

import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BulkAction {
    id: string;
    label: string;
    icon: ReactNode;
    /** Render as the primary CTA fill (one per bar). */
    primary?: boolean;
    onClick: () => void;
    disabled?: boolean;
}

export function BulkActionBar({
    count, actions, onClear,
}: {
    count: number;
    actions: BulkAction[];
    onClear: () => void;
}) {
    if (count === 0) return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 motion-enter">
            <div
                className={cn(
                    'pointer-events-auto flex items-center gap-1 h-11 pl-4 pr-2 rounded-lg',
                    'bg-bg-1 border border-line shadow-[var(--shadow-pop)]',
                )}
                role="toolbar"
                aria-label={`${count} selected`}
            >
                <span className="text-[12.5px] font-medium pr-2">
                    <span className="font-mono tnum text-text">{count}</span>
                    <span className="text-text-3"> selected</span>
                </span>
                <span className="h-5 w-px bg-line-soft mx-1" />
                {actions.map(a => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={a.onClick}
                        disabled={a.disabled}
                        className={cn(
                            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium transition-colors',
                            a.primary
                                ? 'bg-brand text-brand-fg hover:bg-brand-2'
                                : 'text-text-2 hover:bg-bg-2 hover:text-text',
                            a.disabled && 'opacity-50 cursor-not-allowed',
                        )}
                    >
                        {a.icon}
                        {a.label}
                    </button>
                ))}
                <span className="h-5 w-px bg-line-soft mx-1" />
                <button
                    type="button"
                    onClick={onClear}
                    className="inline-flex items-center justify-center size-7 rounded text-text-3 hover:bg-bg-2 hover:text-text transition-colors"
                    aria-label="Clear selection"
                    title="Clear selection (Esc)"
                >
                    <X className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
