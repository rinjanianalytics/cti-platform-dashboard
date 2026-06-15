'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
    connectors as connectorsApi,
    type ConnectorRow,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Database, Plus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { relTime } from '@/lib/utils';

const REFRESH_MS = 30_000;

const WRITE_ROLES = new Set(['admin', 'analyst', 'developer']);

/**
 * /admin/connectors — Declarative feed-engine manifest registry.
 *
 * Lists every manifest version saved via /v1/connectors. Highlights the
 * currently-active version per source, shows last-validated state, and
 * links to the New Connector builder.
 *
 * Manifests authored here flow through the BullMQ feed-sync worker once
 * FEED_ENGINE_ENABLED=true is set and the manifest is activated. Until
 * both gates flip, the legacy registry handler runs.
 */
export default function AdminConnectorsPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const allowed = !!user && WRITE_ROLES.has(user.role);
    useEffect(() => {
        if (!authLoading && user && !allowed) router.replace('/');
    }, [user, authLoading, allowed, router]);

    const { data, isLoading, mutate } = useSWR(
        allowed ? 'admin:connectors' : null,
        () => connectorsApi.list(),
        { refreshInterval: REFRESH_MS, revalidateOnFocus: false },
    );

    const rows = useMemo(() => data?.data ?? [], [data]);

    // Group by source so the active version is prominent and earlier versions
    // collapse beneath it. Sources with no active row still appear (operator
    // hasn't activated yet) — flagged with the muted "no active version" hint.
    const grouped = useMemo(() => groupBySource(rows), [rows]);
    const activeCount = rows.filter((r) => r.isActive).length;
    const sources = Object.keys(grouped).sort();

    async function handleActivate(id: string) {
        try {
            await connectorsApi.activate(id);
            toast.success('Connector activated');
            mutate();
        } catch (err) {
            toast.error('Activation failed', { description: (err as Error).message });
        }
    }

    async function handleDeactivate(id: string) {
        try {
            await connectorsApi.deactivate(id);
            toast.success('Connector deactivated');
            mutate();
        } catch (err) {
            toast.error('Deactivation failed', { description: (err as Error).message });
        }
    }

    if (!user || !allowed) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin / analyst / developer role required.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Feed Connectors</h1>
                    <p className="text-sm text-muted-foreground">
                        Declarative feed-engine manifests · {rows.length} version{rows.length === 1 ? '' : 's'} across {sources.length} source{sources.length === 1 ? '' : 's'} · {activeCount} active
                    </p>
                </div>
                <Link
                    href="/admin/connectors/new"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                    <Plus className="size-4" /> New connector
                </Link>
            </div>

            {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

            {!isLoading && rows.length === 0 && (
                <EmptyState
                    icon={Database}
                    title="No manifests yet"
                    description="Build the first declarative feed connector. The engine runs whatever the manifest says — no per-feed TypeScript needed."
                    action={{
                        label: 'New connector',
                        href: '/admin/connectors/new',
                    }}
                />
            )}

            {sources.map((source) => {
                const versions = grouped[source];
                const active = versions.find((v) => v.isActive);
                return (
                    <Card key={source}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="font-mono text-base">{source}</CardTitle>
                                    <CardDescription>
                                        {versions.length} version{versions.length === 1 ? '' : 's'} · entity <code className="text-xs">{versions[0].entity}</code>
                                        {!active && <span className="ml-2 text-amber-500">· no active version</span>}
                                    </CardDescription>
                                </div>
                                {active && (
                                    <Badge variant="default">
                                        <CheckCircle2 className="size-3" /> active · v{active.version}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1 text-sm">
                                {versions.map((v) => (
                                    <ConnectorRowDisplay
                                        key={v.id}
                                        row={v}
                                        onActivate={handleActivate}
                                        onDeactivate={handleDeactivate}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

function ConnectorRowDisplay({
    row,
    onActivate,
    onDeactivate,
}: {
    row: ConnectorRow;
    onActivate: (id: string) => void;
    onDeactivate: (id: string) => void;
}) {
    return (
        <div className="flex items-center justify-between border-l-2 border-muted pl-3 py-1.5">
            <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-muted-foreground">v{row.version}</span>
                <span className="text-xs text-muted-foreground">created {relTime(row.createdAt)}</span>
                {row.lastValidatedAt ? (
                    <span className="text-xs text-emerald-500 inline-flex items-center gap-1">
                        <Clock className="size-3" /> ran {relTime(row.lastValidatedAt)}
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <AlertCircle className="size-3" /> never run
                    </span>
                )}
            </div>
            <div className="flex gap-2">
                {row.isActive ? (
                    <Button variant="ghost" size="sm" onClick={() => onDeactivate(row.id)}>
                        Deactivate
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" onClick={() => onActivate(row.id)}>
                        Activate
                    </Button>
                )}
            </div>
        </div>
    );
}

function groupBySource(rows: ConnectorRow[]): Record<string, ConnectorRow[]> {
    const out: Record<string, ConnectorRow[]> = {};
    for (const r of rows) {
        if (!out[r.source]) out[r.source] = [];
        out[r.source].push(r);
    }
    // Sort each group: active first, then by version descending.
    for (const source of Object.keys(out)) {
        out[source].sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return b.version - a.version;
        });
    }
    return out;
}
