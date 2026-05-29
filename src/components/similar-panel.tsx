'use client';

import useSWR from 'swr';
import Link from 'next/link';
import {
    search, hitHref, hitLabel, normalizeEntityType,
    type SearchEntityType, type SearchHit,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const ENTITY_TONE: Record<string, string> = {
    ioc: 'text-blue-400',
    vulnerability: 'text-red-400',
    threat_actor: 'text-amber-400',
    pulse: 'text-emerald-400',
};

/**
 * Renders semantically-similar entities for a given doc.
 * Quietly hides itself if vector search isn't ready (e.g. index reindexing).
 */
export function SimilarPanel({
    docId,
    type,
    k = 6,
}: {
    docId: string;
    type?: SearchEntityType;
    k?: number;
}) {
    const { data, error, isLoading } = useSWR(
        ['similar', docId, type, k],
        () => search.similar(docId, { k, type }),
        { shouldRetryOnError: false },
    );

    // While the index is being rebuilt or vector mapping is wrong, the API
    // returns 500. Surface nothing rather than a noisy red box.
    if (error) return null;

    const items: SearchHit[] = (data?.items ?? []).filter(h => h.id !== docId);

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="size-4 text-muted-foreground" />
                    Similar
                </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
                {isLoading ? (
                    <div className="space-y-2 px-6">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
                    </div>
                ) : items.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-6 py-2">
                        No semantically-similar entities yet.
                    </p>
                ) : (
                    <ul className="divide-y motion-enter">
                        {items.map(hit => (
                            <li key={`${hit.entityType}:${hit.id}`}>
                                <Link
                                    href={hitHref(hit)}
                                    className="grid grid-cols-[80px_1fr_50px] gap-3 items-center px-6 py-2 hover:bg-accent/40 transition-colors"
                                >
                                    {(() => {
                                        // Normalize before tone lookup + label-format —
                                        // OpenSearch indexes actors as `'threat-actor'`
                                        // while ENTITY_TONE keys are canonical underscore.
                                        const key = normalizeEntityType(hit.entityType);
                                        return (
                                            <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', ENTITY_TONE[key] ?? '')}>
                                                {key.replace('_', ' ')}
                                            </Badge>
                                        );
                                    })()}
                                    <span className="text-sm font-mono truncate">{hitLabel(hit)}</span>
                                    {hit._score != null && (
                                        <span className="text-[10px] font-mono tabular-nums text-muted-foreground text-right">
                                            {hit._score.toFixed(2)}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
