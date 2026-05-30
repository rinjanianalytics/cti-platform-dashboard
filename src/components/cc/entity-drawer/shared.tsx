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
import {
    search, hitHref, hitLabel, normalizeEntityType,
    watch, platform,
    type WatchEntityType, type SearchHit,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEntityDrawer, type EntityKind } from './context';
import { Sparkline } from '@/components/sparkline';

/**
 * Shared "is this entity pinned + a toggle handler" hook used by every
 * drawer's Watch button. Encapsulates the three things that would
 * otherwise duplicate across IOC/CVE/Actor content files:
 *
 *   1. `/v1/watch/check/:type/:id` on mount → initial button state
 *   2. Optimistic flip on click → button feels instant even on slow nets
 *   3. POST or DELETE depending on current state → toggle, not separate buttons
 *
 * SWR keys are scoped by `(type, id)` so opening two drawers (via the
 * Related-pivot section) doesn't cross-pollute state. Re-mounting the
 * drawer with the same target re-uses the cached value via SWR's
 * dedupe.
 */
export function useWatchToggle(type: WatchEntityType, id: string | undefined) {
    const { data, mutate } = useSWR(
        id ? ['watch:check', type, id] : null,
        () => watch.check(type, id!),
        { revalidateOnFocus: false },
    );
    const watched = data?.watched ?? false;

    const toggle = async () => {
        if (!id) return;
        // Optimistic flip — re-revalidate after the mutation either way.
        try {
            await mutate(
                async () => {
                    if (watched) {
                        await watch.unpin(type, id);
                        return { watched: false, createdAt: null };
                    } else {
                        const item = await watch.pin({ entityType: type, entityId: id });
                        return { watched: true, createdAt: item.createdAt ?? null };
                    }
                },
                {
                    optimisticData: { watched: !watched, createdAt: watched ? null : new Date().toISOString() },
                    rollbackOnError: true,
                },
            );
            toast.success(watched ? 'Unwatched' : 'Added to watch list');
        } catch (e) {
            toast.error((e as Error).message || 'Watch failed');
        }
    };

    return { watched, toggle };
}

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
    // Dedup before rendering — some feeds emit the same tag more than once
    // per IOC (e.g. ThreatFox's "ClearFake, ClearFake"), and React's
    // duplicate-key check then fires `key={t}` collisions. We also lower-
    // case for the dedup pass so "ClearFake" and "clearfake" collapse,
    // keeping the first-seen casing for display.
    const seen = new Set<string>();
    const list = (tags ?? []).filter(t => {
        const norm = t.toLowerCase();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
    });
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
 * Sighting trend — 14-day per-entity activity sparkline.
 *
 * Fetches `/v1/timeline/:type/:id?days=14` for the open entity. The
 * backend routes by entity type to whichever truthful signal exists
 * today:
 *
 *   actor → pulse mentions (adversary match)
 *   cve   → pulse mentions (text-match on the CVE id)
 *   ioc   → sightings table (empty in dev; series stays flat zero
 *           until sightings populate, in which case this lights up
 *           automatically with no frontend change)
 *
 * The descriptive subtitle ("pulse mentions" vs "sightings") tracks
 * the backend's `signal` field so the analyst knows what's being
 * counted, not just a generic "activity".
 *
 * Rendered as a muted "No activity yet" placeholder when the entire
 * series is zero — better than a flat-line sparkline.
 */
export function SightingTrend({
    type,
    id,
}: {
    type: 'ioc' | 'cve' | 'actor';
    id: string | undefined;
}) {
    const { data, isLoading } = useSWR(
        id ? ['drawer:timeline', type, id] : null,
        () => platform.entityTimeline(type, id!, { days: 14 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    const series = data?.series ?? Array(14).fill(0);
    const total  = series.reduce((s, v) => s + v, 0);
    const signal = data?.signal;
    const empty  = !isLoading && total === 0;

    const subtitle = empty
        ? 'No activity yet'
        : signal === 'sightings'
            ? `${total} sighting${total === 1 ? '' : 's'} in last 14d`
            : `${total} pulse mention${total === 1 ? '' : 's'} in last 14d`;

    return (
        <DrawerSection title="Sighting trend · 14d">
            <div className="flex items-center gap-3">
                <Sparkline
                    data={series}
                    tone={empty ? 'muted' : 'brand'}
                    variant="gradient"
                    width={160}
                    height={32}
                    endCap={!empty}
                    label={subtitle}
                />
                <div className="text-[11.5px] text-text-4">{subtitle}</div>
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
