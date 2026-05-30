'use client';

/**
 * IOC content panel — drawer body for a single indicator.
 * Renders: title row, action row, attributes, tags, related, trend,
 * footer. Watch is wired to the existing verdict API (mark as
 * `suspicious` until a real watchlist endpoint exists).
 */

import useSWR from 'swr';
import { toast } from 'sonner';
import { iocs } from '@/lib/api';
import { relTime } from '@/lib/utils';
import { Sev, normalizeSeverity } from '../sev';
import { ConfBar } from '../conf-bar';
import {
    DrawerSection, AttrList, TagsRow, DrawerActions,
    RelatedSection, SightingTrend, DrawerFooter,
} from './shared';

export function IocContent({ id }: { id: string }) {
    const { data, isLoading, mutate } = useSWR(
        ['drawer:ioc', id],
        () => iocs.get(id),
    );

    if (isLoading) {
        return <DrawerSection><div className="text-text-3 text-[12.5px]">Loading…</div></DrawerSection>;
    }
    if (!data) {
        return <DrawerSection><div className="text-text-3 text-[12.5px]">Indicator not found.</div></DrawerSection>;
    }

    const sev = normalizeSeverity(data.severity);

    const handleWatch = async () => {
        try {
            await iocs.setVerdict(data.id, 'suspicious', 'Marked from drawer watch');
            await mutate();
            toast.success('Added to watch list');
        } catch (e) {
            toast.error((e as Error).message || 'Watch failed');
        }
    };

    return (
        <>
            {/* Header — title + sev pill */}
            <DrawerSection>
                <div className="flex items-start gap-2 flex-wrap">
                    <span className="chip uppercase text-text-3">{data.type}</span>
                    <Sev level={sev} />
                </div>
                <h2 className="text-[18px] font-mono mt-2 break-all leading-snug">{data.value}</h2>
                {data.threatType && (
                    <p className="text-[12.5px] text-text-3 mt-1">{data.threatType}</p>
                )}
            </DrawerSection>

            {/* Actions */}
            <DrawerSection>
                <DrawerActions pivotValue={data.value} copyValue={data.value} onWatch={handleWatch} />
            </DrawerSection>

            {/* Attributes */}
            <DrawerSection title="Attributes">
                <AttrList
                    rows={[
                        { label: 'Source',     value: <span className="font-mono">{data.source}</span> },
                        { label: 'Severity',   value: <Sev level={sev} /> },
                        { label: 'Confidence', value: data.confidence != null ? <ConfBar value={data.confidence} /> : null },
                        { label: 'First seen', value: data.firstSeen ? relTime(data.firstSeen) : null },
                        { label: 'Last seen',  value: data.lastSeen ? relTime(data.lastSeen) : null },
                        { label: 'Updated',    value: data.updatedAt ? relTime(data.updatedAt) : null },
                    ]}
                />
            </DrawerSection>

            {/* Tags */}
            <DrawerSection title="Tags">
                <TagsRow tags={data.tags} />
            </DrawerSection>

            {/* Related */}
            <RelatedSection docId={data.id} type="ioc" />

            {/* Sighting trend (placeholder) */}
            <SightingTrend />

            {/* Footer */}
            <DrawerFooter />
        </>
    );
}
