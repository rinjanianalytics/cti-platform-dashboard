'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { search, hitHref, hitLabel, type SearchHit } from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ENTITY_TONE: Record<string, string> = {
    ioc: 'text-blue-400',
    vulnerability: 'text-red-400',
    threat_actor: 'text-amber-400',
    pulse: 'text-emerald-400',
};

export function SearchPalette() {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'text' | 'semantic'>('text');
    const [q, setQ] = useState('');
    const [focused, setFocused] = useState(0);
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    // Global keyboard shortcut: Cmd/Ctrl+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Pre-fill from the hero pill (or any caller dispatching this event).
    // Payload: { q?: string, mode?: 'text' | 'semantic' }.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ q?: string; mode?: 'text' | 'semantic' }>).detail;
            if (detail?.mode) setMode(detail.mode);
            if (detail?.q !== undefined) setQ(detail.q);
            setOpen(true);
        };
        window.addEventListener('rinjani:open-search', handler);
        return () => window.removeEventListener('rinjani:open-search', handler);
    }, []);

    // Reset focus position when query/mode changes
    useEffect(() => { setFocused(0); }, [q, mode]);

    // Focus the input when opening
    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    const trimmed = q.trim();
    const enabled = trimmed.length >= 2;

    const { data, isLoading } = useSWR(
        enabled ? ['palette', mode, trimmed] : null,
        async () => {
            if (mode === 'semantic') {
                const r = await search.vector({ q: trimmed, k: 12 });
                return r.items;
            }
            const r = await search.unified({ q: trimmed, pageSize: 12 });
            return r.items;
        },
        { dedupingInterval: 300, keepPreviousData: true },
    );

    const items: SearchHit[] = data ?? [];

    const select = (hit: SearchHit) => {
        setOpen(false);
        setQ('');
        router.push(hitHref(hit));
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocused(f => Math.min(items.length - 1, f + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocused(f => Math.max(0, f - 1));
        } else if (e.key === 'Enter') {
            if (items[focused]) {
                e.preventDefault();
                select(items[focused]);
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            setMode(m => m === 'text' ? 'semantic' : 'text');
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-xl p-0 gap-0 sm:max-w-xl">
                <DialogTitle className="sr-only">Search</DialogTitle>
                <div className="flex items-center gap-2 px-3 py-2 border-b">
                    {mode === 'semantic'
                        ? <Sparkles className="size-4 text-muted-foreground" />
                        : <Search className="size-4 text-muted-foreground" />
                    }
                    <Input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={mode === 'semantic'
                            ? 'Describe a threat in natural language…'
                            : 'Search IOCs, CVEs, actors, feeds…'}
                        className="border-0 shadow-none focus-visible:ring-0 px-0 h-9"
                    />
                    <button
                        onClick={() => setMode(m => m === 'text' ? 'semantic' : 'text')}
                        className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border"
                        title="Toggle between text and semantic search (Tab)"
                    >
                        {mode === 'semantic' ? 'semantic' : 'text'}
                    </button>
                </div>

                <div className="max-h-[400px] overflow-y-auto">
                    {!enabled ? (
                        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                            Type at least two characters. Press <kbd className="font-mono">Tab</kbd> to switch between text and semantic search.
                        </p>
                    ) : isLoading && items.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            <Loader2 className="size-4 mx-auto animate-spin mb-2" />
                            Searching…
                        </div>
                    ) : items.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                            No matches. Try a different phrase or toggle search mode.
                        </p>
                    ) : (
                        <ul>
                            {items.map((hit, i) => (
                                <li key={`${hit.entityType}:${hit.id}`}>
                                    <button
                                        type="button"
                                        onClick={() => select(hit)}
                                        onMouseEnter={() => setFocused(i)}
                                        className={cn(
                                            'w-full grid grid-cols-[80px_1fr_60px] gap-3 items-center text-left px-3 py-2',
                                            i === focused ? 'bg-accent' : 'hover:bg-accent/50',
                                        )}
                                    >
                                        <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', ENTITY_TONE[hit.entityType] ?? '')}>
                                            {hit.entityType.replace('_', ' ')}
                                        </Badge>
                                        <div className="min-w-0">
                                            <div className="text-sm truncate font-mono">{hitLabel(hit)}</div>
                                            {hit.description && (
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                    {hit.description}
                                                </div>
                                            )}
                                        </div>
                                        {hit._score != null && (
                                            <span className="text-[10px] font-mono tabular-nums text-muted-foreground text-right">
                                                {hit._score.toFixed(2)}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-3 py-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex gap-3">
                        <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                        <span><kbd className="font-mono">↵</kbd> open</span>
                        <span><kbd className="font-mono">Tab</kbd> mode</span>
                    </div>
                    <span><kbd className="font-mono">Esc</kbd> close</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
