'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    /** Optional primary CTA. */
    action?: {
        label: string;
        onClick?: () => void;
        href?: string;
    };
    /** Optional secondary CTA. */
    secondaryAction?: {
        label: string;
        onClick?: () => void;
        href?: string;
    };
    className?: string;
}

/**
 * Editorial empty state — icon medallion + analyst-voice copy + optional CTAs.
 * Use this for "no data yet" surfaces; pass a `secondaryAction` (e.g. docs
 * link, ingest setup) when the primary path doesn't fit every analyst.
 */
export function EmptyState({
    icon: Icon, title, description, action, secondaryAction, className,
}: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center text-center px-6 py-12', className)}>
            <div className="relative mb-4">
                {/* Subtle teal ring + soft glow under the icon — anchors the brand. */}
                <div
                    aria-hidden
                    className="absolute -inset-3 rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at center, color-mix(in oklch, var(--brand) 14%, transparent), transparent 70%)',
                    }}
                />
                <div className="relative size-12 rounded-full border border-border bg-card flex items-center justify-center">
                    <Icon className="size-5 text-muted-foreground" />
                </div>
            </div>
            <p className="font-display text-sm font-semibold tracking-tight max-w-xs">
                {title}
            </p>
            {description && (
                <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
                    {description}
                </p>
            )}
            {(action || secondaryAction) && (
                <div className="flex items-center gap-2 mt-5">
                    {action && (
                        action.href
                            ? <a href={action.href}><Button size="sm">{action.label}</Button></a>
                            : <Button size="sm" onClick={action.onClick}>{action.label}</Button>
                    )}
                    {secondaryAction && (
                        secondaryAction.href
                            ? <a href={secondaryAction.href}><Button size="sm" variant="outline">{secondaryAction.label}</Button></a>
                            : <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
                    )}
                </div>
            )}
        </div>
    );
}
