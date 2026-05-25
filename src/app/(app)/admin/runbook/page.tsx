'use client';

/**
 * Engineering runbook — the page someone opens at 2 a.m. when an alert
 * fires. Five cards:
 *
 *   Summary       — what this platform does, three-process model.
 *   Dependencies  — live datastore + enrichment-source health.
 *   Alerts        — currently-firing failure groupings matched to a
 *                   playbook of "what it means" + "first response".
 *   Procedures    — copy-pasteable commands for the ops actions that
 *                   aren't yet one-click in the admin UI.
 *   Incident      — five-step checklist for the first 30 minutes.
 *
 * Layout mirrors /admin/services: `space-y-6` stack of Cards, each with
 * its own CardHeader + icon + CardTitle. Inline alignment uses flex;
 * column splits use grid-cols-2.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
    admin,
    type AdminServicesReport,
    type ActivityFailureGroup,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
    BookOpen, Cpu, Network,
    Workflow, Wrench, Siren, RefreshCw, ListChecks, Database,
} from 'lucide-react';
import { cn, relTime } from '@/lib/utils';
import { PageHeader } from '@/components/admin/page-header';
import { StatusTile } from '@/components/admin/stat';

const REFRESH_MS = 30_000;

export default function AdminRunbookPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') {
            router.replace('/');
        }
    }, [user, authLoading, router]);

    const { data: services, isLoading: servicesLoading, mutate: refetchServices } =
        useSWR<AdminServicesReport>(
            user?.role === 'admin' ? 'admin:services' : null,
            () => admin.services(),
            { refreshInterval: REFRESH_MS },
        );
    const { data: failures, isLoading: failuresLoading, mutate: refetchFailures } =
        useSWR<{ groups: ActivityFailureGroup[] }>(
            user?.role === 'admin' ? 'admin:activityFailures' : null,
            () => admin.activityFailures(),
            { refreshInterval: REFRESH_MS },
        );
    const isLoading = servicesLoading || failuresLoading;

    if (!user || user.role !== 'admin') {
        return (
            <div className="py-16 text-center text-sm text-muted-foreground">
                Admin role required.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Runbook"
                description="Open this page first when something is on fire. Live dependency health + currently-firing failure groups up top; copy-pasteable procedures and a five-step incident checklist below."
                actions={
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { refetchServices(); refetchFailures(); }}
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
                        Refresh now
                    </Button>
                }
            />

            {/* ── Service summary + live dependencies ────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BookOpen className="size-4 text-muted-foreground" /> Service summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3">
                        <p>
                            The CTI Platform aggregates threat-intelligence feeds (OTX,
                            CISA KEV, ThreatFox, URLhaus, MalwareBazaar, OpenPhish, MITRE,
                            MISP Galaxy) into a normalised IOC + vulnerability store, runs
                            multi-source CVSS enrichment (OSV → NVD fallback), syncs to
                            Neo4j for graph queries, and indexes to OpenSearch for free-text
                            search.
                        </p>
                        <p className="text-muted-foreground">
                            Three Node processes share one Redis: <strong>API</strong> (Hono
                            HTTP), <strong>Worker</strong> (BullMQ executor), and the{' '}
                            <strong>Gateway</strong> (GraphQL facade). A Postgres advisory
                            lock elects one of them to own the scheduler so we don&apos;t
                            double-fire cron jobs.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Network className="size-4 text-muted-foreground" /> Dependencies
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!services ? (
                            <SkeletonRows n={8} />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <StatusTile
                                    label="Postgres"
                                    tone={services.datastores.postgres.connected ? 'success' : 'failed'}
                                    detail={services.datastores.postgres.latencyMs != null
                                        ? `${services.datastores.postgres.latencyMs}ms`
                                        : services.datastores.postgres.error}
                                />
                                <StatusTile
                                    label="OpenSearch"
                                    tone={services.datastores.opensearch.connected ? 'success' : 'failed'}
                                    detail={services.datastores.opensearch.status
                                        ?? services.datastores.opensearch.error}
                                />
                                <StatusTile
                                    label="Redis · queue"
                                    tone={services.datastores.redis.queue.connected ? 'success' : 'failed'}
                                />
                                <StatusTile
                                    label="Redis · cache"
                                    tone={services.datastores.redis.cache.connected ? 'success' : 'failed'}
                                />
                                <StatusTile
                                    label="Neo4j"
                                    tone={services.datastores.neo4j.connected ? 'success' : 'failed'}
                                    detail={services.datastores.neo4j.error}
                                />
                                <StatusTile
                                    label="OSV (CVSS primary)"
                                    tone={(services.enrichmentSources?.osv?.available ?? false) ? 'success' : 'failed'}
                                    detail={services.enrichmentSources?.osv?.latencyMs != null
                                        ? `${services.enrichmentSources.osv.latencyMs}ms`
                                        : 'no probe'}
                                />
                                <StatusTile
                                    label="NVD (CVSS fallback)"
                                    tone={(services.enrichmentSources?.nvd?.available ?? false) ? 'success' : 'failed'}
                                    detail={services.enrichmentSources?.nvd?.note}
                                />
                                <StatusTile
                                    label="Worker"
                                    tone={services.process.workerActive ? 'success' : 'failed'}
                                    detail={`${services.process.totalConnectedWorkers} connected`}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Alerts (live failure groups) ───────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Siren className="size-4 text-muted-foreground" /> Alerts you might wake up to
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    {failuresLoading ? (
                        <div className="px-4"><SkeletonRows n={3} /></div>
                    ) : !failures || failures.groups.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic px-4">
                            All clear — no active failure groups. When workers fail, errors
                            land here grouped by normalised signature with first-response
                            guidance.
                        </p>
                    ) : (
                        <div className="divide-y divide-border/40">
                            <div className="grid grid-cols-[1fr_64px_120px_88px] gap-3 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80">
                                <span>Signature · first response</span>
                                <span className="text-right">Count</span>
                                <span>Queues</span>
                                <span className="text-right">Last seen</span>
                            </div>
                            {failures.groups.map(g => {
                                const playbook = matchPlaybook(g.signature, g.sample);
                                return (
                                    <div
                                        key={g.signature}
                                        className="grid grid-cols-[1fr_64px_120px_88px] gap-3 px-4 py-3 text-sm items-start"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <div className="font-mono text-xs break-all">
                                                {g.signature}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {playbook.meaning}
                                            </div>
                                            <div className="text-xs">
                                                <span className="font-medium">Try:</span>{' '}
                                                <span className="text-muted-foreground">
                                                    {playbook.firstResponse}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-right font-mono text-sm tabular-nums text-amber-400">
                                            {g.count.toLocaleString()}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                            {g.queues.slice(0, 2).map(q => (
                                                <Badge key={q} variant="outline" className="font-mono text-[9px] uppercase">{q}</Badge>
                                            ))}
                                            {g.queues.length > 2 && (
                                                <span className="text-[10px] text-muted-foreground/70 self-center font-mono">
                                                    +{g.queues.length - 2}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-right text-[11px] text-muted-foreground tabular-nums font-mono">
                                            {relTime(g.lastSeen)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Procedures ─────────────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Wrench className="size-4 text-muted-foreground" /> Common procedures
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {PROCEDURES.map(p => (
                            <Procedure key={p.title} {...p} />
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* ── Incident response ──────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <ListChecks className="size-4 text-muted-foreground" /> Incident response — first 30 minutes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4">
                        {INCIDENT_STEPS.map((s, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <div className="size-7 shrink-0 rounded-full bg-primary/10 text-primary font-mono text-xs font-semibold flex items-center justify-center">
                                    {i + 1}
                                </div>
                                <div className="text-sm flex-1 min-w-0">
                                    <div className="font-medium">{s.title}</div>
                                    <p className="text-muted-foreground mt-1">{s.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <p className="text-[11px] text-muted-foreground/70 italic">
                Live data (dependencies, alerts) refreshes every {REFRESH_MS / 1000}s.
                Procedures and incident steps are static — edit{' '}
                <code className="text-[11px]">/admin/runbook/page.tsx</code> to evolve them
                as new failure modes appear.
            </p>
        </div>
    );
}

function SkeletonRows({ n }: { n: number }) {
    return (
        <div className="flex flex-col gap-2">
            {Array.from({ length: n }, (_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
            ))}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Procedures                                                                 */
/* -------------------------------------------------------------------------- */

interface ProcedureDef {
    title: string;
    icon: typeof Wrench;
    when: string;
    blurb: string;
    snippet: string;
    /** Optional admin route that does the same thing in one click. */
    adminLink?: { href: string; label: string };
}

const PROCEDURES: ProcedureDef[] = [
    {
        title: 'Apply outstanding DB migrations',
        icon: Database,
        when: 'After pulling main, or when a route 500s with `relation does not exist`',
        blurb:
            'drizzle-kit only applies migrations in its journal; hand-authored .sql files need our custom runner. Use --baseline-until=N on a fresh DB that already has older tables present.',
        snippet:
            '# apply all outstanding migrations\npnpm --filter @rinjani/db db:apply\n\n# fresh DB that already has tables 1..30 — mark them applied without running\npnpm --filter @rinjani/db db:apply --baseline-until=30',
    },
    {
        title: 'Drain a queue / retry all failed',
        icon: Workflow,
        when: 'When a worker bug stuck a batch in failed state',
        blurb:
            'Both actions are wired into the admin UI; the curl form is here for scripted use.',
        snippet:
            '# admin UI: /admin/queues → pick queue → "Retry all"\ncurl -X POST -H "Authorization: Bearer $TOKEN" \\\n  $API/admin/queue/cve-enrichment/retry-all\n\n# clean completed entries older than 1h\ncurl -X POST -H "Authorization: Bearer $TOKEN" \\\n  "$API/admin/queue/cve-enrichment/clean/completed?grace=3600000"',
        adminLink: { href: '/admin/queues', label: 'Open /admin/queues →' },
    },
    {
        title: 'Trigger CVSS backfill (OSV → NVD)',
        icon: Wrench,
        when: 'After a bulk import of CVEs without scores; or as a smoke test',
        blurb:
            'Delegates to triggerEnrichmentSweep("cve-enrich"). Uses Redis dedup so back-to-back calls collapse to one sweep.',
        snippet:
            '# one-click in /admin/jobs, or:\ncurl -X POST -H "Authorization: Bearer $TOKEN" \\\n  $API/admin/jobs/cvss-backfill',
        adminLink: { href: '/admin/jobs', label: 'Open /admin/jobs →' },
    },
    {
        title: 'Force a feed sync (any registered source)',
        icon: Workflow,
        when: 'After credentialing a previously-broken feed, or for one-off catch-up',
        blurb:
            'Source key matches the feed registry — otx, cisa, threatfox, urlhaus, abusessl, malwarebazaar, openphish, mispgalaxy, mitre.',
        snippet:
            'curl -X POST -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"source":"otx"}\' \\\n  $API/admin/jobs/feed-sync',
        adminLink: { href: '/admin/feeds', label: 'Open /admin/feeds →' },
    },
    {
        title: 'Diagnose a stuck bootlock',
        icon: Cpu,
        when: 'Scheduler isn\'t firing; nobody owns the lock',
        blurb:
            '/admin/services surfaces who holds the Postgres advisory lock. If `bootlockOwner` is null, no process is running the scheduler — start the worker. If it\'s a stale PID, the holder crashed without releasing.',
        snippet:
            "-- inspect advisory locks held against the bootlock key\nSELECT pid, granted, mode FROM pg_locks WHERE locktype = 'advisory';\n\n-- if the holder is dead, terminate the orphaned backend so the lock releases\nSELECT pg_terminate_backend(<pid>);",
        adminLink: { href: '/admin/services', label: 'Open /admin/services →' },
    },
    {
        title: 'Hard-reset a user (purge + recreate)',
        icon: Wrench,
        when: 'OAuth identity collision, stuck session, or compliance request',
        blurb:
            'Soft-deletes the user but keeps audit log entries. Hard purge wipes audit entries — only use under explicit compliance instruction.',
        snippet:
            '# soft delete (default)\ncurl -X DELETE -H "Authorization: Bearer $TOKEN" \\\n  $API/admin/users/<id>\n\n# hard purge (compliance only)\ncurl -X DELETE -H "Authorization: Bearer $TOKEN" \\\n  "$API/admin/users/<id>?hard=true"',
        adminLink: { href: '/admin/users', label: 'Open /admin/users →' },
    },
];

function Procedure({ title, icon: Icon, when, blurb, snippet, adminLink }: ProcedureDef) {
    return (
        <div className="flex flex-col gap-2.5 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
                <Icon className="size-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm flex-1 min-w-0">{title}</span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 shrink-0">When</span>
                <span className="text-[11px] text-muted-foreground">{when}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{blurb}</p>
            <pre className="text-[11px] font-mono leading-relaxed bg-background border rounded-md p-3 overflow-x-auto whitespace-pre">
                {snippet}
            </pre>
            {adminLink && (
                <Link
                    href={adminLink.href}
                    className="text-[11px] font-mono text-primary hover:underline"
                >
                    {adminLink.label}
                </Link>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Incident steps                                                             */
/* -------------------------------------------------------------------------- */

const INCIDENT_STEPS: Array<{ title: string; body: string }> = [
    {
        title: 'Acknowledge — establish that you\'re on it.',
        body:
            'If the alert came from /admin/activity or a Slack webhook, mark it ack\'d so a co-admin doesn\'t double-respond. If you can\'t respond within 5 minutes, hand off explicitly.',
    },
    {
        title: 'Triage with /admin/services + /admin/activity.',
        body:
            'Services tells you whether a datastore is the root cause. Activity tells you which queue is bleeding. If both look green, suspect ingress (auth, OAuth, rate-limits) — check /admin/audit for recent admin actions.',
    },
    {
        title: 'Mitigate before you diagnose.',
        body:
            'A queue is jammed? Drain failed jobs and retry. A feed is throwing 5xx? Disable its schedule (toggle in /admin/schedules) — partial data beats no data. The post-mortem can wait; the user-facing 500 cannot.',
    },
    {
        title: 'Confirm restoration via the dependency panel above.',
        body:
            'Refresh this page. Every row in the Dependencies card should be green. If a row stays red, the mitigation didn\'t take and you need to escalate to step 5.',
    },
    {
        title: 'Hand off or document.',
        body:
            'If unresolved at 30 min, escalate. If resolved, write a one-paragraph note in /admin/audit (or CHANGELOG.md) — signature → cause → fix. The next person to see this signature should not have to re-derive the cause.',
    },
];

/* -------------------------------------------------------------------------- */
/* Failure → playbook matcher                                                 */
/* -------------------------------------------------------------------------- */

interface Playbook {
    meaning: string;
    firstResponse: string;
}

const DEFAULT_PLAYBOOK: Playbook = {
    meaning: 'Worker-side exception, not yet catalogued.',
    firstResponse:
        'Open the failing job in /admin/queues, copy the stack trace, then categorise here so the next firing has guidance.',
};

/**
 * Pattern-match a failure signature against known issues. The signature comes
 * from `jobActivityStream.ts`'s error normaliser — same shape across runs of
 * the same bug, so equality checks are stable.
 */
function matchPlaybook(signature: string, sample: string): Playbook {
    const s = `${signature} ${sample}`.toLowerCase();
    if (s.includes('relation') && s.includes('does not exist')) {
        return {
            meaning: 'A table referenced by a query has not been created — drizzle journal is out of sync with hand-authored migrations.',
            firstResponse: 'Run `pnpm --filter @rinjani/db db:apply`. On a fresh DB, use `--baseline-until=N`.',
        };
    }
    if (s.includes('stalled') || s.includes('lock')) {
        return {
            meaning: 'BullMQ lock expired before the worker finished. Job is too slow for the default 30s lock window.',
            firstResponse: 'Check lockDuration in the worker file. CVE enrichment uses 10min; clone that pattern for other long-running workers.',
        };
    }
    if (s.includes('econnrefused') || (s.includes('connect') && s.includes('refuse'))) {
        return {
            meaning: 'A datastore is unreachable (Postgres, Redis, OpenSearch, or Neo4j).',
            firstResponse: 'Check the Dependencies card above. Restart the affected service in docker-compose, then `Retry all` the failed jobs.',
        };
    }
    if (s.includes('401') || s.includes('unauthorized') || s.includes('forbidden')) {
        return {
            meaning: 'Outbound API rejected our credentials (NVD, OTX, etc.) or our own auth middleware bounced an internal call.',
            firstResponse: 'Check the credential\'s env var. For NVD: CVE_API_KEY. For OTX: OTX_API_KEY. For URLhaus: URLHAUS_AUTH_KEY.',
        };
    }
    if (s.includes('429') || s.includes('rate limit')) {
        return {
            meaning: 'Upstream feed is rate-limiting us. Default NVD limit without a key is 5 req/30s.',
            firstResponse: 'Acquire / set the API key, OR slow the feed cron in /admin/schedules. CVE pipeline auto-routes to OSV first to avoid this.',
        };
    }
    if (s.includes('cloudflare') || s.includes('challenge')) {
        return {
            meaning: 'Upstream is behind a Cloudflare challenge — usually NVD\'s API-key signup flow.',
            firstResponse: 'CVE enrichment is OSV-first specifically because of this; verify the OSV fallback is engaging in /admin/services → Enrichment sources.',
        };
    }
    return DEFAULT_PLAYBOOK;
}
