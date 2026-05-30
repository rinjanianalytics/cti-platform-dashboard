'use client';

/**
 * <TweaksPanel> — the popover UI for adjusting accent + density.
 * The button (a small Sliders icon) lives in the Topbar; clicking it
 * opens a popover with three sections — Accent, Density, Toggles.
 *
 * Severity-row-tint and Attention-rail toggles are present and persisted
 * (Phase 1) but currently no-op visually because the table refactor lands
 * in Phase 2 and the rail in Phase 3. Surfacing them now means the
 * preference state migrates forward without a UI flicker.
 */

import { Sliders } from 'lucide-react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useTweaks, ACCENTS, type AccentKey, type DensityKey } from './tweaks';
import { cn } from '@/lib/utils';
import { Segmented } from './segmented';

export function TweaksPanel() {
    const t = useTweaks();
    return (
        <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger
                className={cn(
                    'inline-flex items-center justify-center size-7 rounded-md',
                    'text-text-3 hover:text-text hover:bg-bg-2 transition-colors',
                    'data-[popup-open]:bg-bg-2 data-[popup-open]:text-text',
                )}
                title="Tweaks"
                aria-label="Tweaks"
            >
                <Sliders className="size-3.5" />
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner sideOffset={8} align="end">
                    <PopoverPrimitive.Popup
                        className={cn(
                            'z-50 w-[280px] bg-bg-1 border border-line-soft rounded-lg p-3 text-sm',
                            'shadow-[var(--shadow-pop)]',
                            'data-open:animate-in data-open:fade-in-0',
                            'data-closed:animate-out data-closed:fade-out-0 data-closed:duration-100',
                        )}
                    >
                        <div className="eyebrow mb-2">Accent</div>
                        <div className="grid grid-cols-3 gap-1.5 mb-4">
                            {(Object.keys(ACCENTS) as AccentKey[]).map(key => {
                                const a = ACCENTS[key];
                                const active = t.accent === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => t.setAccent(key)}
                                        className={cn(
                                            'flex flex-col items-center gap-1.5 p-2 rounded border transition-colors',
                                            active
                                                ? 'bg-brand-soft border-brand-line'
                                                : 'border-line-soft hover:bg-bg-2',
                                        )}
                                        title={a.label}
                                    >
                                        <span
                                            className="block size-5 rounded-full"
                                            style={{ background: a.base }}
                                        />
                                        <span className="text-[10px] text-text-3 leading-none text-center">
                                            {a.label.split(' ')[1] ?? a.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="eyebrow mb-2">Density</div>
                        <div className="mb-4">
                            <Segmented<DensityKey>
                                options={[
                                    { value: 'comfortable', label: 'Comfort' },
                                    { value: 'compact',     label: 'Compact' },
                                ]}
                                value={t.density}
                                onChange={t.setDensity}
                                className="w-full"
                            />
                        </div>

                        <div className="eyebrow mb-2">Toggles</div>
                        <div className="space-y-2">
                            <ToggleRow
                                label="Severity row tint"
                                hint="Left-edge severity strip on table rows"
                                value={t.sevtint}
                                onChange={t.setSevtint}
                            />
                            <ToggleRow
                                label="Attention rail"
                                hint="Right-hand “What changed” live feed"
                                value={t.rail}
                                onChange={t.setRail}
                            />
                        </div>
                    </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

function ToggleRow({
    label, hint, value, onChange,
}: {
    label: string;
    hint: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
            <div className="min-w-0">
                <div className="text-[12.5px] leading-tight">{label}</div>
                <div className="text-[11px] text-text-4 truncate">{hint}</div>
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                role="switch"
                aria-checked={value}
                className={cn(
                    'relative w-[38px] h-[21px] rounded-full transition-colors shrink-0',
                    value ? 'bg-brand' : 'bg-bg-3',
                )}
            >
                <span
                    className={cn(
                        'absolute top-0.5 size-[17px] rounded-full bg-bg-0 transition-transform',
                        value ? 'translate-x-[19px]' : 'translate-x-0.5',
                    )}
                />
            </button>
        </label>
    );
}
