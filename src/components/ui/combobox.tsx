'use client';

import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption<V extends string = string> {
    value: V;
    label: string;
    /** Optional descriptive line under the label. */
    description?: string;
}

interface ComboboxProps<V extends string = string> {
    options: ComboboxOption<V>[];
    value: V | null;
    onValueChange: (value: V | null) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    className?: string;
    /** Tailwind width class for the trigger. Default w-50. */
    triggerWidth?: string;
}

/**
 * Filterable single-select combobox. Built on @base-ui/react/combobox.
 * Use when an option list is ≥6 items or the user benefits from type-ahead
 * (e.g. IOC type, source, MITRE technique).
 */
export function Combobox<V extends string>({
    options,
    value,
    onValueChange,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    emptyMessage = 'No matches.',
    className,
    triggerWidth = 'w-50',
}: ComboboxProps<V>) {
    const selected = options.find(o => o.value === value);

    return (
        <ComboboxPrimitive.Root
            items={options}
            value={selected ?? null}
            onValueChange={(next) => {
                if (!next) return onValueChange(null);
                onValueChange((next as ComboboxOption<V>).value);
            }}
            itemToStringLabel={(item) => (item as ComboboxOption<V>).label}
            itemToStringValue={(item) => (item as ComboboxOption<V>).value}
        >
            <ComboboxPrimitive.Trigger
                className={cn(
                    'inline-flex items-center gap-2 h-9 rounded-md border bg-input/30 px-3 text-sm',
                    'hover:bg-input/50 transition-colors',
                    'data-[popup-open]:bg-input/50',
                    triggerWidth,
                    className,
                )}
            >
                <ComboboxPrimitive.Value>
                    {() => (
                        <span className={cn('flex-1 text-left truncate', !selected && 'text-muted-foreground')}>
                            {selected?.label ?? placeholder}
                        </span>
                    )}
                </ComboboxPrimitive.Value>
                <ComboboxPrimitive.Icon>
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                </ComboboxPrimitive.Icon>
            </ComboboxPrimitive.Trigger>

            <ComboboxPrimitive.Portal>
                <ComboboxPrimitive.Positioner sideOffset={6}>
                    <ComboboxPrimitive.Popup
                        className={cn(
                            'z-50 max-h-(--available-height) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10',
                            'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-100',
                            'w-(--anchor-width) min-w-50',
                        )}
                    >
                        <div className="flex items-center gap-2 px-3 border-b">
                            <Search className="size-3.5 text-muted-foreground shrink-0" />
                            <ComboboxPrimitive.Input
                                placeholder={searchPlaceholder}
                                className="flex-1 h-9 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            />
                        </div>
                        <ComboboxPrimitive.List className="max-h-72 overflow-y-auto p-1">
                            <ComboboxPrimitive.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
                                {emptyMessage}
                            </ComboboxPrimitive.Empty>
                            {options.map(opt => (
                                <ComboboxPrimitive.Item
                                    key={opt.value}
                                    value={opt}
                                    className={cn(
                                        'flex items-start gap-2 rounded px-2 py-1.5 text-sm cursor-default',
                                        'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
                                        'data-selected:font-medium',
                                    )}
                                >
                                    <ComboboxPrimitive.ItemIndicator className="mt-0.5">
                                        <Check className="size-3.5 text-primary" />
                                    </ComboboxPrimitive.ItemIndicator>
                                    <span className="size-3.5 shrink-0 data-[selected]:hidden mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate">{opt.label}</div>
                                        {opt.description && (
                                            <div className="text-[11px] text-muted-foreground truncate">{opt.description}</div>
                                        )}
                                    </div>
                                </ComboboxPrimitive.Item>
                            ))}
                        </ComboboxPrimitive.List>
                    </ComboboxPrimitive.Popup>
                </ComboboxPrimitive.Positioner>
            </ComboboxPrimitive.Portal>
        </ComboboxPrimitive.Root>
    );
}
