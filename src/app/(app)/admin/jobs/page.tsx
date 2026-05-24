'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { admin } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn, relTime } from '@/lib/utils';
import { toast } from 'sonner';
import {
    ShieldAlert, Database, Network, Brain, AlertTriangle, Play, Loader2, Clock, Radar,
} from 'lucide-react';

type JobKind =
    | 'cvss-backfill'
    | 'ioc-enrich-sweep'
    | 'nvd-sync'
    | 'vuln-enrich'
    | 'actor-enrich'
    | 'neo4j-actors'
    | 'neo4j-pulses-iocs'
    | 'neo4j-full';

interface JobRecord {
    kind: JobKind;
    startedAt: string;
    finishedAt: string | null;
    status: 'running' | 'success' | 'error';
    summary?: string;
    error?: string;
}

interface JobCard {
    kind: JobKind;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    cost: 'light' | 'medium' | 'heavy';
    warn?: string;
    /** Resolves to a short success summary, or throws. */
    run: () => Promise<string>;
}

const HISTORY_KEY = 'rinjani.adminJobHistory';
const MAX_HISTORY = 15;

const JOBS: JobCard[] = [
    {
        kind: 'cvss-backfill',
        title: 'CVSS enrichment sweep',
        description: 'Manual sweep — the worker is work-driven (fires on data arrival). Tries OSV first (no rate limit), NVD as fallback. Use this to drain a historical backlog or after a long outage.',
        icon: ShieldAlert,
        cost: 'heavy',
        warn: 'CVEs not in OSV fall through to NVD, which is rate-limited (~5 req/30s without an API key). A backlog of NVD-only CVEs takes minutes per batch.',
        run: async () => {
            const r = await admin.runCvssBackfill();
            return r.message;
        },
    },
    {
        kind: 'ioc-enrich-sweep',
        title: 'IOC enrichment sweep',
        description: 'Manual sweep — the IOC worker is work-driven (fires on insert). Use this to enqueue any IOCs that have NULL enrichment after a long outage. Capped at 100 per call.',
        icon: Radar,
        cost: 'medium',
        warn: 'External enrichment APIs (VirusTotal, AbuseIPDB) charge per call — keep an eye on quota.',
        run: async () => {
            const r = await admin.runIocEnrichSweep();
            return `${r.enqueued} job(s) queued`;
        },
    },
    {
        kind: 'nvd-sync',
        title: 'NVD CVE sync',
        description: 'Pull the latest CVEs directly from NVD (synchronous, bypasses BullMQ).',
        icon: Database,
        cost: 'medium',
        run: async () => {
            const r = await admin.runNvdSync();
            return `${r.cves} new · ${r.processed} processed · ${r.errors.length} errors`;
        },
    },
    {
        kind: 'vuln-enrich',
        title: 'Bulk vulnerability enrichment',
        description: 'Iterate vulns with null cvssScore and back-fill from NVD. Capped per call.',
        icon: AlertTriangle,
        cost: 'medium',
        run: async () => {
            const r = await admin.runVulnEnrichBulk(50);
            return `${r.enriched}/${r.considered} enriched · ${r.notFound} missing · ${r.errors.length} errors`;
        },
    },
    {
        kind: 'actor-enrich',
        title: 'Bulk actor LLM enrichment',
        description: 'Run Gemini/OpenRouter over actors with missing STIX fields. Skips already-filled ones.',
        icon: Brain,
        cost: 'heavy',
        warn: 'LLM cost grows linearly with the limit. Defaults to 25 actors per run.',
        run: async () => {
            const r = await admin.runActorEnrichBulk(25);
            return `${r.enriched}/${r.considered} enriched · ${r.skipped} skipped · ${r.errors.length} errors`;
        },
    },
    {
        kind: 'neo4j-actors',
        title: 'Neo4j: sync actors',
        description: 'Push threat actors into the graph DB. Fast — typically completes in seconds.',
        icon: Network,
        cost: 'light',
        run: async () => {
            const r = await admin.runNeo4jSync('actors');
            return `Queued · job ${r.jobId}`;
        },
    },
    {
        kind: 'neo4j-pulses-iocs',
        title: 'Neo4j: sync pulses + IOCs',
        description: 'Push the most recent pulses and their indicators into the graph (last 500 pulses by default).',
        icon: Network,
        cost: 'medium',
        run: async () => {
            const r = await admin.runNeo4jSync('pulses-iocs');
            return `Queued · job ${r.jobId}`;
        },
    },
    {
        kind: 'neo4j-full',
        title: 'Neo4j: full graph sync',
        description: 'Resync everything (actors, techniques, malware, tools, relationships, IOCs). Heavy — minutes.',
        icon: Network,
        cost: 'heavy',
        warn: 'Full sync rewrites the entire graph. Only run when the graph is suspected to be inconsistent.',
        run: async () => {
            const r = await admin.runNeo4jSync('full');
            return `Queued · job ${r.jobId}`;
        },
    },
];

const COST_TONE: Record<JobCard['cost'], string> = {
    light:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    heavy:  'bg-red-500/15 text-red-400 border-red-500/30',
};

export default function AdminJobsPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') router.replace('/');
    }, [user, authLoading, router]);

    const [history, setHistory] = useState<JobRecord[]>([]);
    const [running, setRunning] = useState<JobKind | null>(null);
    const [confirmKind, setConfirmKind] = useState<JobKind | null>(null);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(HISTORY_KEY);
            if (stored) setHistory(JSON.parse(stored));
        } catch { /* corrupt entry — ignore */ }
    }, []);

    const persist = (next: JobRecord[]) => {
        const capped = next.slice(0, MAX_HISTORY);
        setHistory(capped);
        try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(capped)); } catch { /* quota */ }
    };

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    const confirmJob = JOBS.find(j => j.kind === confirmKind) ?? null;

    const execute = async (card: JobCard) => {
        setRunning(card.kind);
        const startedAt = new Date().toISOString();
        const placeholder: JobRecord = { kind: card.kind, startedAt, finishedAt: null, status: 'running' };
        persist([placeholder, ...history]);

        try {
            const summary = await card.run();
            persist([
                { kind: card.kind, startedAt, finishedAt: new Date().toISOString(), status: 'success', summary },
                ...history,
            ]);
            toast.success(card.title, { description: summary });
        } catch (err) {
            const msg = (err as Error).message;
            persist([
                { kind: card.kind, startedAt, finishedAt: new Date().toISOString(), status: 'error', error: msg },
                ...history,
            ]);
            toast.error(`${card.title} failed`, { description: msg });
        } finally {
            setRunning(null);
            setConfirmKind(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-semibold tracking-tight">Job runner</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    One-click bulk operations. Use for incident response and back-fills — not as a substitute for scheduled jobs.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {JOBS.map((card) => {
                    const last = history.find(h => h.kind === card.kind);
                    const isRunning = running === card.kind;
                    return (
                        <Card key={card.kind}>
                            <CardHeader>
                                <div className="flex items-start gap-3">
                                    <card.icon className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <CardTitle className="text-sm flex items-center gap-2">
                                            {card.title}
                                            <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', COST_TONE[card.cost])}>
                                                {card.cost}
                                            </Badge>
                                        </CardTitle>
                                        <CardDescription className="text-xs mt-1">{card.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {last && (
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                        <Clock className="size-3" />
                                        Last: <span className={cn(
                                            'font-mono',
                                            last.status === 'success' && 'text-emerald-400',
                                            last.status === 'error' && 'text-red-400',
                                            last.status === 'running' && 'text-blue-400',
                                        )}>{last.status}</span>
                                        <span>·</span>
                                        <span className="tabular-nums">{relTime(last.startedAt)}</span>
                                        {last.summary && <span className="opacity-70 truncate">— {last.summary}</span>}
                                        {last.error && <span className="text-red-400/80 truncate">— {last.error}</span>}
                                    </div>
                                )}
                                <Button
                                    size="sm"
                                    onClick={() => card.warn ? setConfirmKind(card.kind) : execute(card)}
                                    disabled={isRunning || !!running}
                                >
                                    {isRunning
                                        ? <><Loader2 className="size-3.5 animate-spin" /> Running…</>
                                        : <><Play className="size-3.5" /> Run now</>}
                                </Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {history.length > 0 && (
                <div>
                    <h2 className="text-sm font-medium mb-2 text-muted-foreground">Recent runs</h2>
                    <div className="space-y-1">
                        {history.map((h, i) => (
                            <div key={i} className="flex items-center gap-3 text-xs py-2 px-3 rounded-md bg-card border tabular-nums">
                                <Badge variant="outline" className={cn(
                                    'font-mono text-[10px] uppercase',
                                    h.status === 'success' && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                                    h.status === 'error' && 'bg-red-500/15 text-red-400 border-red-500/30',
                                    h.status === 'running' && 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                                )}>
                                    {h.status}
                                </Badge>
                                <span className="font-mono text-[11px]">{h.kind}</span>
                                <span className="text-muted-foreground">{relTime(h.startedAt)}</span>
                                <span className="text-muted-foreground/70 truncate flex-1">
                                    {h.summary || h.error || ''}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Dialog open={!!confirmJob} onOpenChange={() => setConfirmKind(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="size-4 text-amber-400" /> Run {confirmJob?.title}?
                        </DialogTitle>
                        <DialogDescription>
                            {confirmJob?.warn}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfirmKind(null)}>Cancel</Button>
                        <Button onClick={() => confirmJob && execute(confirmJob)} disabled={!!running}>
                            Run anyway
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
