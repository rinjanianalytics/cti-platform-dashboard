'use client';

/**
 * Actor content panel — drawer body for a single threat actor.
 *
 * Sophistication maps to a sev-style pill per the design:
 *   strategic       → crit
 *   advanced/expert → high
 *   intermediate    → med
 *   minimal/novice  → low
 *   (else)          → info
 *
 * Pivot in graph uses the actor name as the seed value — the graph
 * explorer accepts actor names for actor-graph mode (see screens-graph
 * spec). Watch isn't wired today (no watchlist endpoint); button shown
 * as a toast for symmetry across types.
 */

import useSWR from 'swr';
import { toast } from 'sonner';
import { actors } from '@/lib/api';
import { relTime } from '@/lib/utils';
import { Sev, type Severity } from '../sev';
import {
    DrawerSection, AttrList, TagsRow, DrawerActions,
    RelatedSection, SightingTrend, DrawerFooter,
} from './shared';

function sophisticationToSev(raw: string | null | undefined): Severity {
    const s = (raw ?? '').toLowerCase();
    if (s === 'strategic') return 'crit';
    if (s === 'advanced' || s === 'expert') return 'high';
    if (s === 'intermediate') return 'med';
    if (s === 'minimal' || s === 'novice') return 'low';
    return 'info';
}

export function ActorContent({ idOrName }: { idOrName: string }) {
    const { data, isLoading } = useSWR(
        ['drawer:actor', idOrName],
        () => actors.get(idOrName),
    );

    if (isLoading) {
        return <DrawerSection><div className="text-text-3 text-[12.5px]">Loading…</div></DrawerSection>;
    }
    if (!data) {
        return <DrawerSection><div className="text-text-3 text-[12.5px]">Actor not found.</div></DrawerSection>;
    }

    return (
        <>
            {/* Header */}
            <DrawerSection>
                <div className="flex items-start gap-2 flex-wrap">
                    <span className="chip uppercase text-text-3">actor</span>
                    {data.sophistication && (
                        <span title={`Sophistication: ${data.sophistication}`}>
                            <Sev level={sophisticationToSev(data.sophistication)} short />
                        </span>
                    )}
                </div>
                <h2 className="text-[20px] font-semibold mt-2 leading-snug">{data.name}</h2>
                {data.description && (
                    <p className="text-[12.5px] text-text-2 mt-2 leading-relaxed">
                        {data.description.length > 360
                            ? data.description.slice(0, 360) + '…'
                            : data.description}
                    </p>
                )}
            </DrawerSection>

            {/* Actions */}
            <DrawerSection>
                <DrawerActions
                    pivotValue={data.name}
                    copyValue={data.name}
                    onWatch={() => toast.info('Watchlist endpoint lands in Phase 3.')}
                />
            </DrawerSection>

            {/* Attributes */}
            <DrawerSection title="Attributes">
                <AttrList
                    rows={[
                        { label: 'Aliases', value: data.aliases && data.aliases.length > 0
                            ? <span className="font-mono text-[12px]">{data.aliases.join(', ')}</span>
                            : null },
                        { label: 'Country',        value: data.country ? <span className="font-mono uppercase">{data.country}</span> : null },
                        { label: 'Sophistication', value: data.sophistication ?? null },
                        { label: 'Resource level', value: data.resourceLevel ?? null },
                        { label: 'Motivation',     value: data.primaryMotivation ?? null },
                        { label: 'First seen',     value: data.firstSeen ? relTime(data.firstSeen) : null },
                        { label: 'Last seen',      value: data.lastSeen ? relTime(data.lastSeen) : null },
                    ]}
                />
            </DrawerSection>

            {/* Tags (labels) */}
            <DrawerSection title="Labels">
                <TagsRow tags={data.labels} />
            </DrawerSection>

            {/* Related */}
            <RelatedSection docId={data.id} type="actor" />

            {/* Sighting trend (placeholder) */}
            <SightingTrend />

            {/* Footer */}
            <DrawerFooter />
        </>
    );
}
