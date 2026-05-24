'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { vulns } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ShieldAlert, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn, severityTone, cvssTone, relTime } from '@/lib/utils';
import { SimilarPanel } from '@/components/similar-panel';

export default function VulnerabilityDetailPage({ params }: { params: Promise<{ cveId: string }> }) {
    const { cveId } = use(params);
    const decoded = decodeURIComponent(cveId);
    const { data, isLoading, mutate } = useSWR(['vuln', decoded], () => vulns.get(decoded));
    const { user } = useAuth();
    const canEnrich = user?.role === 'admin' || user?.role === 'analyst';
    const [enriching, setEnriching] = useState(false);

    const onEnrich = async () => {
        if (!data?.cveId) return;
        setEnriching(true);
        try {
            const r = await vulns.enrich(data.cveId);
            if (!r.applied) {
                toast.info('Nothing applied', {
                    description: r.reason === 'already-scored'
                        ? 'This CVE already has a CVSS score.'
                        : 'Neither OSV nor NVD has CVSS data for this CVE.',
                });
            } else {
                const sourceLabel = r.source === 'osv' ? 'OSV' : 'NVD';
                toast.success(`CVSS ${r.score?.toFixed(1)} (${r.severity})`, {
                    description: `From ${sourceLabel} ${r.version}`,
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
                <p className="text-sm text-muted-foreground">CVE not found.</p>
                <Link href="/vulnerabilities" className="text-sm underline mt-2 inline-block">Back to vulnerabilities</Link>
            </div>
        );
    }

    const vuln = data;
    const nvdLink = vuln.cveId?.startsWith('CVE-')
        ? `https://nvd.nist.gov/vuln/detail/${vuln.cveId}`
        : null;

    return (
        <div className="space-y-6">
            <div>
                <Link href="/vulnerabilities" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-3.5" /> Vulnerabilities
                </Link>
                <div className="flex items-start justify-between gap-4 mt-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-3xl font-mono">{vuln.cveId ?? '—'}</h1>
                            {vuln.severity && (
                                <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', severityTone(vuln.severity))}>
                                    {vuln.severity}
                                </Badge>
                            )}
                            {vuln.isExploited && (
                                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-red-500/15 text-red-400 border-red-500/30">
                                    <ShieldAlert className="size-3 mr-1" /> Known exploited
                                </Badge>
                            )}
                        </div>
                        {[vuln.vendorProject, vuln.product].filter(Boolean).length > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                                {[vuln.vendorProject, vuln.product].filter(Boolean).join(' · ')}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {canEnrich && vuln.cvssScore == null && (
                            <Button size="sm" variant="outline" onClick={onEnrich} disabled={enriching}>
                                <Sparkles className="size-3.5" />
                                {enriching ? 'Fetching…' : 'Fetch CVSS from NVD'}
                            </Button>
                        )}
                        {nvdLink && (
                            <a
                                href={nvdLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                NVD <ExternalLink className="size-3" />
                            </a>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed">
                            {vuln.description ?? <span className="text-muted-foreground">No description available.</span>}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Scoring</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <FieldRow
                            label="CVSS"
                            value={
                                <span className={cn('font-mono tabular-nums', cvssTone(vuln.cvssScore))}>
                                    {vuln.cvssScore != null ? vuln.cvssScore.toFixed(1) : '—'}
                                </span>
                            }
                        />
                        <FieldRow label="Severity" value={vuln.severity ?? '—'} />
                        <FieldRow label="Exploited" value={vuln.isExploited ? 'Yes — listed in CISA KEV' : 'Unknown'} />
                        <FieldRow label="Published" value={vuln.publishedDate ? new Date(vuln.publishedDate).toLocaleDateString() : '—'} />
                        <FieldRow label="Last modified" value={vuln.lastModified ? relTime(vuln.lastModified) : '—'} />
                    </CardContent>
                </Card>
            </div>

            <SimilarPanel docId={vuln.id ?? (vuln.cveId ?? '')} type="vulnerability" />

            {vuln.rawData && Object.keys(vuln.rawData).length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Raw data</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded-md p-3 overflow-auto max-h-96">
                            {JSON.stringify(vuln.rawData, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="text-sm">{value}</div>
        </div>
    );
}
