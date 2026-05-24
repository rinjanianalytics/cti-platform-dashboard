'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { actors } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { relTime } from '@/lib/utils';
import { SimilarPanel } from '@/components/similar-panel';

const SOPH_TONE: Record<string, string> = {
    strategic: 'bg-red-500/15 text-red-400 border-red-500/30',
    innovator: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
    expert: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    advanced: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    intermediate: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    minimal: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    none: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function ActorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const decoded = decodeURIComponent(id);
    const { data, isLoading, mutate } = useSWR(['actor', decoded], () => actors.get(decoded));
    const { user } = useAuth();
    const canEnrich = user?.role === 'admin' || user?.role === 'analyst';
    const [enriching, setEnriching] = useState(false);

    const onEnrich = async () => {
        if (!data) return;
        setEnriching(true);
        try {
            const r = await actors.enrich(data.id);
            if (r.filled.length === 0) {
                toast.info('Nothing to enrich', { description: r.message ?? 'All fields already populated.' });
            } else {
                toast.success(`Filled ${r.filled.length} field${r.filled.length === 1 ? '' : 's'}`, {
                    description: r.filled.join(', '),
                });
                await mutate();
            }
        } catch (err) {
            toast.error('Enrichment failed', { description: (err as Error).message });
        } finally {
            setEnriching(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="py-16 text-center">
                <p className="text-sm text-muted-foreground">Threat actor not found.</p>
                <Link href="/actors" className="text-sm underline mt-2 inline-block">Back to actors</Link>
            </div>
        );
    }

    const actor = data;
    const aliases = actor.aliases ?? [];
    const goals = actor.goals ?? [];
    const labels = actor.labels ?? [];
    const refs = actor.externalReferences ?? [];

    return (
        <div className="space-y-6">
            <div>
                <Link href="/actors" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-3.5" /> Threat actors
                </Link>
                <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-3xl font-semibold tracking-tight">{actor.name}</h1>
                            {actor.sophistication && (
                                <Badge variant="outline" className={`font-mono text-[10px] uppercase ${SOPH_TONE[actor.sophistication] ?? ''}`}>
                                    {actor.sophistication}
                                </Badge>
                            )}
                        </div>
                        {aliases.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                aka {aliases.join(' · ')}
                            </p>
                        )}
                        {actor.sourceName && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Catalogued by <span className="text-foreground font-medium">{actor.sourceName}</span>
                            </p>
                        )}
                    </div>

                    {canEnrich && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onEnrich}
                            disabled={enriching}
                            className="shrink-0"
                        >
                            <Sparkles className="size-3.5" />
                            {enriching ? 'Enriching…' : 'AI enrich'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Profile</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {actor.description || <span className="text-muted-foreground">No description available.</span>}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Attributes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <FieldRow label="Motivation" value={actor.primaryMotivation ? actor.primaryMotivation.replace(/-/g, ' ') : '—'} />
                        <FieldRow label="Resource level" value={actor.resourceLevel ?? '—'} />
                        <FieldRow label="Confidence" value={formatConfidence(actor.confidence)} />
                        <FieldRow label="Goals" value={
                            goals.length === 0 ? '—' : (
                                <ul className="list-disc list-inside space-y-0.5 text-xs">
                                    {goals.map((g, i) => <li key={i}>{g}</li>)}
                                </ul>
                            )
                        } />
                        <FieldRow label="Labels" value={
                            labels.length === 0 ? '—' : (
                                <div className="flex flex-wrap gap-1">
                                    {labels.map(l => <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>)}
                                </div>
                            )
                        } />
                        <FieldRow label="Updated" value={actor.updatedAt ? relTime(actor.updatedAt) : '—'} />
                    </CardContent>
                </Card>
            </div>

            <SimilarPanel docId={actor.id} type="threat_actor" />

            {refs.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">External references</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {refs.map((r, i) => (
                                <li key={i} className="text-sm">
                                    {r.url ? (
                                        <a href={r.url} target="_blank" rel="noreferrer"
                                            className="inline-flex items-center gap-1 hover:underline">
                                            <span className="font-medium">{r.source_name ?? r.url}</span>
                                            <ExternalLink className="size-3 text-muted-foreground" />
                                        </a>
                                    ) : (
                                        <span className="font-medium">{r.source_name ?? '—'}</span>
                                    )}
                                    {r.description && (
                                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/**
 * threat_actors.confidence is varchar(20) — STIX canonically uses a string
 * enum ("none" | "low" | "medium" | "high"), but some implementations
 * (OpenCTI, our LLM enrichment) write 0-100. Display each appropriately.
 */
function formatConfidence(raw: string | number | null | undefined): string {
    if (raw == null || raw === '') return '—';
    const s = String(raw).trim();
    const n = Number(s);
    if (Number.isFinite(n)) {
        // Probability (0-1) vs percentage (0-100) — scale up if needed.
        const pct = n <= 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
        return `${Math.max(0, Math.min(100, pct))}%`;
    }
    // String enum — capitalize for display.
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="text-sm">{value}</div>
        </div>
    );
}
