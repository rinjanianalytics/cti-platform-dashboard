'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCOPE_OPTIONS = [
    { value: 'all',           label: 'All',         placeholder: 'Search indicators, CVEs, actors, feeds…' },
    { value: 'ioc',           label: 'Indicators',  placeholder: 'Search by value, type, source, tag…' },
    { value: 'vulnerability', label: 'CVEs',        placeholder: 'Search by CVE ID, vendor, product…' },
    { value: 'threat_actor',  label: 'Actors',      placeholder: 'Search by name, alias, motivation…' },
    { value: 'pulse',         label: 'Feeds',       placeholder: 'Search ingested pulses by name or tag…' },
] as const;

type ScopeValue = typeof SCOPE_OPTIONS[number]['value'];

/**
 * Compact search pill mounted in the global header.
 *
 * Visual recipe matches the Overview hero pattern (scope dropdown · input ·
 * accent submit) but tuned to the 48px header height. On submit it dispatches
 * `rinjani:open-search` so the global SearchPalette opens pre-filled.
 */
export function HeaderSearch({ className }: { className?: string }) {
    const [scope, setScope] = useState<ScopeValue>('all');
    const [q, setQ] = useState('');
    const [scopeOpen, setScopeOpen] = useState(false);
    const wrapRef = useRef<HTMLFormElement>(null);

    const active = SCOPE_OPTIONS.find(s => s.value === scope) ?? SCOPE_OPTIONS[0];

    // Close the scope dropdown when clicking anywhere outside.
    useEffect(() => {
        if (!scopeOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setScopeOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [scopeOpen]);

    const submit = (term: string) => {
        const trimmed = term.trim();
        if (!trimmed) return;
        window.dispatchEvent(new CustomEvent('rinjani:open-search', {
            detail: { q: trimmed, mode: 'text' },
        }));
    };

    return (
        <form
            ref={wrapRef}
            onSubmit={(e) => { e.preventDefault(); submit(q); }}
            className={cn(
                'group/header-search relative flex items-center gap-2 pl-3 pr-1 h-8',
                'rounded-full border bg-muted/30',
                'focus-within:border-primary/50 focus-within:bg-muted/50 transition-colors',
                className,
            )}
        >
            {/* Scope selector */}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setScopeOpen(o => !o)}
                    className={cn(
                        'inline-flex items-center gap-1 pr-2 mr-1 h-7',
                        'border-r border-border',
                        'text-xs font-medium text-foreground/90 hover:text-foreground transition-colors',
                    )}
                    aria-haspopup="listbox"
                    aria-expanded={scopeOpen}
                >
                    {active.label}
                    <ChevronDown className={cn(
                        'size-3 text-muted-foreground transition-transform',
                        scopeOpen && 'rotate-180',
                    )} />
                </button>

                {scopeOpen && (
                    <ul
                        role="listbox"
                        // Explicit popover bg via the CSS variable — avoids the
                        // earlier transparency bug where `bg-popover` didn't
                        // resolve through the form's backdrop-filter stacking.
                        className="absolute top-full left-0 mt-1 z-60 min-w-40 rounded-md border shadow-md ring-1 ring-foreground/10 py-1"
                        style={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)' }}
                    >
                        {SCOPE_OPTIONS.map(opt => (
                            <li key={opt.value}>
                                <button
                                    type="button"
                                    onClick={() => { setScope(opt.value); setScopeOpen(false); }}
                                    role="option"
                                    aria-selected={scope === opt.value}
                                    className={cn(
                                        'w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors',
                                        scope === opt.value && 'text-primary font-medium',
                                    )}
                                >
                                    {opt.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Input */}
            <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={active.placeholder}
                aria-label="Search query"
                className={cn(
                    'flex-1 min-w-0 h-7 bg-transparent outline-none',
                    'text-xs text-foreground placeholder:text-muted-foreground/70 placeholder:italic',
                )}
            />

            {/* ⌘K hint — only visible while the input is empty and unfocused. */}
            {!q && (
                <kbd
                    aria-hidden
                    className={cn(
                        'hidden sm:inline-flex items-center font-mono text-[10px] text-muted-foreground',
                        'px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 mr-1',
                        // Hide once the user actively engages with the input.
                        'group-focus-within/header-search:hidden',
                    )}
                >
                    ⌘K
                </kbd>
            )}

            {/* Submit (brand teal) */}
            <button
                type="submit"
                disabled={!q.trim()}
                aria-label="Submit search"
                className={cn(
                    'inline-flex items-center justify-center size-6 rounded-full',
                    'bg-primary text-primary-foreground shrink-0',
                    'hover:bg-primary/90 transition-colors',
                    'disabled:opacity-40 disabled:hover:bg-primary disabled:cursor-not-allowed',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                )}
            >
                <Search className="size-3" />
            </button>
        </form>
    );
}
