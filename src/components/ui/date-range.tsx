'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { DayPicker, type DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type { DateRange };

interface DateRangePickerProps {
    value: DateRange | undefined;
    onValueChange: (range: DateRange | undefined) => void;
    placeholder?: string;
    /** Tailwind width class for the trigger. */
    className?: string;
}

/**
 * Date-range picker built on react-day-picker + base-ui Popover. Returns a
 * `{ from?, to? }` range; callers should convert to ISO `dateFrom`/`dateTo`
 * before passing to the API.
 */
export function DateRangePicker({
    value,
    onValueChange,
    placeholder = 'Pick a date range',
    className,
}: DateRangePickerProps) {
    const label = value?.from
        ? value.to
            ? `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d, yyyy')}`
            : `${format(value.from, 'MMM d, yyyy')} – …`
        : placeholder;

    return (
        <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger
                className={cn(
                    'inline-flex items-center gap-2 h-9 rounded-md border bg-input/30 px-3 text-sm',
                    'hover:bg-input/50 transition-colors data-[popup-open]:bg-input/50',
                    !value?.from && 'text-muted-foreground',
                    className,
                )}
            >
                <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
                {value?.from && (
                    <X
                        className="size-3.5 shrink-0 text-muted-foreground hover:text-foreground ml-1"
                        onClick={(e) => { e.stopPropagation(); onValueChange(undefined); }}
                    />
                )}
            </PopoverPrimitive.Trigger>

            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner sideOffset={6}>
                    <PopoverPrimitive.Popup
                        className={cn(
                            'z-50 rounded-md border bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10',
                            'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-100',
                        )}
                    >
                        <DayPicker
                            mode="range"
                            selected={value}
                            onSelect={onValueChange}
                            numberOfMonths={2}
                            showOutsideDays
                            classNames={DAY_PICKER_CLASSNAMES}
                        />
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                            <PresetButtons onSelect={onValueChange} />
                            <Button size="xs" variant="ghost" onClick={() => onValueChange(undefined)}>
                                Clear
                            </Button>
                        </div>
                    </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

function PresetButtons({ onSelect }: { onSelect: (range: DateRange) => void }) {
    const today = new Date();
    const apply = (days: number) => {
        const from = new Date(today);
        from.setDate(from.getDate() - days);
        onSelect({ from, to: today });
    };
    return (
        <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" onClick={() => apply(7)}>7d</Button>
            <Button size="xs" variant="outline" onClick={() => apply(30)}>30d</Button>
            <Button size="xs" variant="outline" onClick={() => apply(90)}>90d</Button>
        </div>
    );
}

/**
 * react-day-picker ships with default CSS that doesn't match shadcn. We
 * override the class names per element so the calendar inherits our tokens.
 */
const DAY_PICKER_CLASSNAMES: React.ComponentProps<typeof DayPicker>['classNames'] = {
    months: 'flex gap-4',
    month: 'space-y-2',
    month_caption: 'flex justify-center items-center h-8 text-sm font-medium',
    caption_label: 'text-sm font-medium',
    nav: 'flex items-center justify-between gap-1 px-1',
    button_previous: 'inline-flex size-6 items-center justify-center rounded-md hover:bg-accent text-muted-foreground',
    button_next: 'inline-flex size-6 items-center justify-center rounded-md hover:bg-accent text-muted-foreground',
    month_grid: 'w-full border-collapse space-y-1',
    weekdays: 'flex',
    weekday: 'text-muted-foreground rounded-md w-8 font-normal text-[10px] uppercase tracking-wider',
    week: 'flex w-full mt-1',
    day: 'h-8 w-8 text-center text-xs p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
    day_button: 'inline-flex h-8 w-8 items-center justify-center rounded-md p-0 font-normal aria-selected:opacity-100 hover:bg-accent',
    selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
    range_start: 'bg-primary text-primary-foreground',
    range_end: 'bg-primary text-primary-foreground',
    range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
    today: 'bg-accent text-accent-foreground',
    outside: 'text-muted-foreground opacity-50',
    disabled: 'text-muted-foreground opacity-50',
    hidden: 'invisible',
};
