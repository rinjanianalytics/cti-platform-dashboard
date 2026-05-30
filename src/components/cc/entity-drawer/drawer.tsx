'use client';

/**
 * <EntityDrawer> — right slide-over (480px, max 94vw) with a dimmed
 * /blurred backdrop. Reads its target from EntityDrawerProvider; renders
 * one of three per-type content components.
 *
 * Per the design spec:
 *   - drawer-in 0.2s cubic-bezier(.2,.8,.2,1) entry
 *   - Esc closes
 *   - backdrop click closes
 *   - X button in the header closes
 *
 * Sections inside the content (per type — see ioc-content, cve-content,
 * actor-content):
 *   - Header: kind chip + sev pill + KEV badge + title
 *   - Action row: Pivot in graph (primary), Copy, Watch
 *   - Attributes: type-specific key/value rows
 *   - Tags
 *   - Related · pivot
 *   - Sighting trend · 14d (placeholder until Phase 3 backend)
 *   - Footer: Create playbook, Export STIX
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEntityDrawer } from './context';
import { IocContent } from './ioc-content';
import { CveContent } from './cve-content';
import { ActorContent } from './actor-content';

export function EntityDrawer() {
    const { current, close } = useEntityDrawer();
    const open = current !== null;

    // Esc-to-close. Capture phase so we intercept before downstream handlers.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [open, close]);

    // Lock body scroll while the drawer is open — prevents the table
    // scroll behind from jumping when content updates.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px] transition-opacity',
                    open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                )}
                onClick={close}
                aria-hidden="true"
            />

            {/* Panel */}
            <aside
                className={cn(
                    'fixed inset-y-0 right-0 z-50 w-[480px] max-w-[94vw] bg-bg-1 border-l border-line',
                    'shadow-[var(--shadow-rail)] flex flex-col',
                    'transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)]',
                    open ? 'translate-x-0' : 'translate-x-full',
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Entity details"
            >
                <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line-soft shrink-0">
                    <div className="eyebrow">
                        {current?.type === 'ioc' && 'Indicator'}
                        {current?.type === 'cve' && 'Vulnerability'}
                        {current?.type === 'actor' && 'Threat actor'}
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        className="inline-flex items-center justify-center size-7 rounded text-text-3 hover:bg-bg-2 hover:text-text transition-colors"
                        aria-label="Close drawer (Esc)"
                    >
                        <X className="size-3.5" />
                    </button>
                </header>

                {/* Content per type — each owns its own fetch + render. */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {current?.type === 'ioc'   && <IocContent id={current.id} />}
                    {current?.type === 'cve'   && <CveContent cveId={current.id} />}
                    {current?.type === 'actor' && <ActorContent idOrName={current.id} />}
                </div>
            </aside>
        </>
    );
}
