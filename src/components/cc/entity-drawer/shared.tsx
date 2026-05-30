'use client';

/**
 * Shared parts used by all three drawer content variants (IOC / CVE /
 * Actor): action row, attribute list, related/pivot section, sighting
 * trend placeholder, footer. Extracted here so each content file stays
 * focused on the type-specific shape.
 */

import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { Copy, Check, Eye, Network as GraphIcon, FileText, Workflow, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { search, hitHref, hitLabel, normalizeEntityType, type SearchHit } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEntityDrawer, type EntityKind } from './context';
import { Sparkline } from '@/components/sparkline';

export function DrawerSection({
    title, children, className,
}: { title?: string; children: ReactNode; className?: string }) {
    return (
        <section className={cn('px-4 py-3 border-b border-line-soft', className)}>
            {title && <div className="eyebrow mb-2">{title}</div>}
            {children}
        </section>
    );
}

/** Two-column key/value list used in Attributes. */
export function AttrList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
    return (
        <dl className="grid grid-cols-[112px_1fr] gap-y-1.5 text-[12.5px]">
            {rows.map((r, i) => (
                <div key={`${r.label}:${i}`} className="contents">
                    <dt className="text-text-3">{r.label}</dt>
                    <dd className="text-text break-words min-w-0">{r.value ?? <span className="text-text-4">—</span>}</dd>
                </div>
            ))}
        </dl>
    );
}

/** Tags row — falls back to em-dash if empty. */
export function TagsRow({ tags }: { tags: string[] | null | undefined }) {
    const list = tags ?? [];
    if (list.length === 0) {
        return <span className="text-[12.5px] text-text-4">No tags.</span>;
    }
    return (
        <div className="flex flex-wrap gap-1">
            {list.map(t => (
                <span key={t} className="chip">{t}</span>
            ))}
        </div>
    );
}

/** Action row — Pivot in graph (primary), Copy, Watch. */
export function DrawerActions({
    pivotValue, copyValue, onWatch, watchActive,
}: {
    /** Value to seed the graph explorer with — typically the IOC value. */
    pivotValue?: string;
    /** Value placed on the clipboard — typically the IOC value or CVE id. */
    copyValue: string;
    /** Watch handler — if absent the button is hidden. */
    onWatch?: () => void;
    watchActive?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(copyValue);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error('Copy failed — clipboard blocked');
        }
    };
    const handlePivot = () => {
        if (!pivotValue) return;
        window.location.assign(`/graph?seed=${encodeURIComponent(pivotValue)}`);
    };
    return (
        <div className="flex items-center gap-2 flex-wrap">
            {pivotValue && (
                <button
                    type="button"
                    onClick={handlePivot}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-[12.5px] font-medium bg-brand text-brand-fg hover:bg-brand-2 transition-colors"
                >
                    <GraphIcon className="size-3.5" />
                    Pivot in graph
                </button>
            )}
            <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-[12.5px] text-text-2 hover:bg-bg-2 hover:text-text border border-line-soft transition-colors"
            >
                {copied
                    ? <Check className="size-3.5 text-ok" />
                    : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
            </button>
            {onWatch && (
                <button
                    type="button"
                    onClick={onWatch}
                    className={cn(
                        'inline-flex items-center gap-1.5 h-8 px-3 rounded text-[12.5px] border transition-colors',
                        watchActive
                            ? 'bg-brand-soft border-brand-line text-brand'
                            : 'text-text-2 hover:bg-bg-2 hover:text-text border-line-soft',
                    )}
                >
                    <Eye className="size-3.5" />
                    {watchActive ? 'Watching' : 'Watch'}
                </button>
            )}
        </div>
    );
}

/** Related · pivot — clicking a related entity re-targets the drawer. */
export function RelatedSection({ docId, type }: { docId: string; type: EntityKind }) {
    const { open } = useEntityDrawer();
    const { data, error, isLoading } = useSWR(
        ['drawer:related', docId, type],
        () => search.similar(docId, { k: 5 }),
        { shouldRetryOnError: false },
    );

    // Vector index might be empty / mis-mapped — quietly degrade rather
    // than scream red box at the analyst.
    if (error) return null;

    const related = (data?.items ?? []).filter(h => h.id !== docId);

    return (
        <DrawerSection title="Related · pivot">
            {isLoading ? (
                <div className="text-[12.5px] text-text-3 flex items-center gap-2">
                    <Sparkles className="size-3.5 animate-pulse" />
                    Finding similar…
                </div>
            ) : related.length === 0 ? (
                <div className="text-[12.5px] text-text-3">No semantically-similar entities yet.</div>
            ) : (
                <ul className="space-y-1.5">
                    {related.map(hit => (
                        <li key={`${hit.entityType}:${hit.id}`}>
                            <button
                                type="button"
                                onClick={() => {
                                    const k = normalizeEntityType(hit.entityType);
                                    if (k === 'ioc')          open({ type: 'ioc',   id: hit.id });
                                    else if (k === 'vulnerability') open({ type: 'cve',   id: hit.cveId ?? hit.id });
                                    else if (k === 'threat_actor')  open({ type: 'actor', id: hit.id });
                                    else window.location.assign(hitHref(hit));
                                }}
                                className="w-full grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1 -mx-2 rounded hover:bg-bg-2 text-left transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="text-[12.5px] font-mono truncate">{hitLabel(hit)}</div>
                                    <div className="text-[10.5px] text-text-4 uppercase tracking-wider">
                                        {normalizeEntityType(hit.entityType).replace('_', ' ')}
                                    </div>
                                </div>
                                {hit._score != null && (
                                    <span className="text-[10.5px] font-mono tnum text-text-4">
                                        {hit._score.toFixed(2)}
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {related.length > 0 && type === 'ioc' && (
                <button
                    type="button"
                    onClick={() => window.location.assign('/graph')}
                    className="mt-3 text-[11.5px] text-brand hover:text-brand-2 inline-flex items-center gap-1"
                >
                    Explore neighbourhood →
                </button>
            )}
        </DrawerSection>
    );
}

/**
 * Sighting trend — 14-day sparkline placeholder.
 *
 * The brief asks for a per-entity sighting trend. The aggregate
 * `/v1/stats/sparklines` endpoint we use on the Command page sums across
 * all entities — there's no per-entity history endpoint yet (see
 * ROADMAP Phase 3 backend work). Until then, render a muted "no
 * timeline yet" placeholder so the section is present and the
 * Phase 3 wiring slot is obvious.
 */
export function SightingTrend() {
    return (
        <DrawerSection title="Sighting trend · 14d">
            <div className="flex items-center gap-3">
                <Sparkline
                    data={Array(14).fill(0)}
                    tone="muted"
                    variant="gradient"
                    width={160}
                    height={32}
                    endCap={false}
                    label="No timeline data yet"
                />
                <div className="text-[11.5px] text-text-4">
                    Per-entity timeline arrives with the events stream in Phase 3.
                </div>
            </div>
        </DrawerSection>
    );
}

/** Footer — Create playbook, Export STIX. Both are placeholders for now. */
export function DrawerFooter() {
    return (
        <footer className="px-4 py-3 border-t border-line-soft shrink-0 flex items-center gap-2 flex-wrap">
            <button
                type="button"
                onClick={() => toast.info('Playbook builder lands in Phase 3.')}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] text-text-2 hover:bg-bg-2 hover:text-text border border-line-soft transition-colors"
            >
                <Workflow className="size-3" />
                Create playbook
            </button>
            <button
                type="button"
                onClick={() => toast.info('STIX export lands with the federation push in Phase 3.')}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] text-text-2 hover:bg-bg-2 hover:text-text border border-line-soft transition-colors"
            >
                <FileText className="size-3" />
                Export STIX
            </button>
        </footer>
    );
}

/** Reusable: maps a SearchHit to the right drawer target. */
export function hitToDrawerTarget(hit: SearchHit): { type: EntityKind; id: string } | null {
    const k = normalizeEntityType(hit.entityType);
    if (k === 'ioc')           return { type: 'ioc',   id: hit.id };
    if (k === 'vulnerability') return { type: 'cve',   id: hit.cveId ?? hit.id };
    if (k === 'threat_actor')  return { type: 'actor', id: hit.id };
    return null;
}
