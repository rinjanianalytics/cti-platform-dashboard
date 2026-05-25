'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardExpandFooterProps {
    /** Left-side micro-metadata, typically `queue · cve-enrich · customised 2h ago`.
     *  Optional — if omitted the expand button right-aligns alone. */
    meta?: React.ReactNode;
    /** Label rendered next to the chevron when collapsed. */
    expandLabel: string;
    /** Label rendered next to the chevron when expanded. Defaults to "Hide …". */
    collapseLabel?: string;
    /** Content shown when expanded. Pass children for static content or a render
     *  function for lazy loading (only invoked when the panel is opened). */
    children: React.ReactNode | (() => React.ReactNode);
    defaultOpen?: boolean;
    className?: string;
}

/**
 * Footer + expand area for cards in operational lists.
 *
 * Captures the Feeds page's "thin border-t footer with metadata on the
 * left and a toggle on the right; expansion drops below" pattern. Place
 * inside `<CardContent>` after the main body.
 *
 * The lazy render form (`children` as a function) avoids mounting expensive
 * history panels until the user actually opens them — matters when the
 * list has 20+ rows that each could fetch.
 */
export function CardExpandFooter({
    meta, expandLabel, collapseLabel, children, defaultOpen = false, className,
}: CardExpandFooterProps) {
    const [open, setOpen] = React.useState(defaultOpen);
    const Chevron = open ? ChevronDown : ChevronRight;
    const collapse = collapseLabel ?? `Hide ${expandLabel.replace(/^Show\s+/i, '')}`;
    return (
        <>
            <div className={cn(
                'flex items-center justify-between gap-3 text-[10px] text-muted-foreground/70 font-mono tabular-nums pt-2 mt-2 border-t border-border/50',
                className,
            )}>
                <span className="truncate min-w-0">{meta}</span>
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors shrink-0"
                    aria-expanded={open}
                >
                    <Chevron className="size-3" />
                    {open ? collapse : expandLabel}
                </button>
            </div>
            {open && (
                <div className="mt-3">
                    {typeof children === 'function' ? (children as () => React.ReactNode)() : children}
                </div>
            )}
        </>
    );
}
