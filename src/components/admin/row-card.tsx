'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { borderLeftTone, type StatusKind } from '@/lib/tone';

interface RowCardProps extends React.ComponentProps<'div'> {
    /** Optional status tone — paints a 2px left border in the matching colour.
     *  Omit for default (transparent border, no accent). */
    tone?: StatusKind;
    /** When true, dims the row (used to show paused / inactive items). */
    muted?: boolean;
    children: React.ReactNode;
}

/**
 * List-row card variant — the shape used by Feeds, Schedules, Queues and
 * (after refactor) Jobs and Services queues. Pulls in the left-border tone
 * accent so the row's status is legible at a glance without reading any
 * text, and keeps the dimming + transition behaviour consistent.
 *
 * Use `<Card>` directly for stand-alone panels; `<RowCard>` only when the
 * surface is one item in a `space-y-2` vertical list.
 */
export function RowCard({ tone, muted, className, children, ...props }: RowCardProps) {
    return (
        <Card
            className={cn(
                'border-l-2 transition-colors',
                tone ? borderLeftTone(tone) : 'border-l-transparent',
                muted && 'opacity-60',
                className,
            )}
            {...props}
        >
            {children}
        </Card>
    );
}
