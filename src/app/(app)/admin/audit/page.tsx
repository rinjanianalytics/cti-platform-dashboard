'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type AuditEntry, type AuditEntityType, type AuditAction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollText, Filter, X, RefreshCw } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';

const PAGE_SIZE = 50;

const ENTITY_TYPES: AuditEntityType[] = [
    'ioc', 'vulnerability', 'threat_actor', 'pulse', 'indicator', 'malware', 'user',
];
const ACTIONS: AuditAction[] = ['create', 'update', 'delete', 'merge', 'enrich'];

// Per the design: CREATE = low/green, UPDATE = info, DELETE = crit.
// Merge + enrich aren't in the design spec — pick something that
// reads at a glance without competing with the named-trio palette.
const ACTION_TONE: Record<string, string> = {
    create:  'bg-sev-low-soft  text-sev-low  border-[color:var(--sev-low)]',
    update:  'bg-sev-info-soft text-sev-info border-[color:var(--sev-info)]',
    delete:  'bg-sev-crit-soft text-sev-crit border-[color:var(--sev-crit)]',
    merge:   'bg-brand-soft    text-brand    border-brand-line',
    enrich:  'bg-sev-med-soft  text-sev-med  border-[color:var(--sev-med)]',
};

// Per the design: USER violet (custom), THREAT_ACTOR med, IOC accent
// (the brand), FEED info. Everything else falls through to muted bg-2.
const ENTITY_TONE: Record<string, string> = {
    user:           'bg-[oklch(0.45_0.13_295_/_0.16)] text-[oklch(0.75_0.13_295)] border-[color:oklch(0.55_0.13_295_/_0.36)]',
    ioc:            'bg-brand-soft    text-brand    border-brand-line',
    vulnerability:  'bg-sev-high-soft text-sev-high border-[color:var(--sev-high)]',
    threat_actor:   'bg-sev-med-soft  text-sev-med  border-[color:var(--sev-med)]',
    pulse:          'bg-sev-info-soft text-sev-info border-[color:var(--sev-info)]',
    indicator:      'bg-bg-2 text-text-3 border-line-soft',
    malware:        'bg-sev-crit-soft text-sev-crit border-[color:var(--sev-crit)]',
};

export default function AdminAuditPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const allowed = user?.role === 'admin' || user?.role === 'auditor';
    useEffect(() => {
        if (!authLoading && user && !allowed) router.replace('/');
    }, [user, authLoading, allowed, router]);

    const [entityType, setEntityType] = useState<AuditEntityType | 'all'>('all');
    const [action, setAction] = useState<AuditAction | 'all'>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [page, setPage] = useState(1);
    const [openId, setOpenId] = useState<string | null>(null);

    const filters = useMemo(() => ({
        entityType: entityType === 'all' ? undefined : entityType,
        action: action === 'all' ? undefined : action,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
        page,
        limit: PAGE_SIZE,
    }), [entityType, action, from, to, page]);

    const { data, isLoading, mutate } = useSWR(
        allowed ? ['admin:audit', filters] : null,
        () => admin.listAudit(filters),
    );

    const { data: stats } = useSWR(
        allowed ? 'admin:audit:stats' : null,
        () => admin.auditStats(7),
        { revalidateOnFocus: false },
    );

    const entries = data?.entries ?? [];
    const total = data?.total ?? 0;
    const pages = Math.ceil(total / PAGE_SIZE);

    const hasFilters = entityType !== 'all' || action !== 'all' || from || to;
    const clearFilters = () => {
        setEntityType('all'); setAction('all'); setFrom(''); setTo(''); setPage(1);
    };

    if (!user || !allowed) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin or auditor role required.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h-page">Audit log</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading
                            ? 'Loading…'
                            : `${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'}${stats ? ` · ${stats.total.toLocaleString()} in the last ${stats.days} days` : ''}`}
                    </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => mutate()}>
                    <RefreshCw className="size-3.5" /> Refresh
                </Button>
            </div>

            <div className="panel panel-pad">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Filter className="size-3.5" /> Filters
                        {hasFilters && (
                            <button
                                onClick={clearFilters}
                                className="ml-auto inline-flex items-center gap-1 text-[11px] hover:text-foreground transition-colors"
                            >
                                <X className="size-3" /> Clear
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Select value={entityType} onValueChange={(v) => { setEntityType((v as AuditEntityType | 'all') ?? 'all'); setPage(1); }}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="All entities" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All entities</SelectItem>
                                {ENTITY_TYPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={action} onValueChange={(v) => { setAction((v as AuditAction | 'all') ?? 'all'); setPage(1); }}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="All actions" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All actions</SelectItem>
                                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Input
                            type="date" value={from}
                            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                            placeholder="From" className="h-9"
                        />
                        <Input
                            type="date" value={to}
                            onChange={(e) => { setTo(e.target.value); setPage(1); }}
                            placeholder="To" className="h-9"
                        />
                    </div>
                </div>
            </div>

            {isLoading && (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
            )}

            {!isLoading && entries.length === 0 && (
                <EmptyState
                    icon={ScrollText}
                    title="No audit entries"
                    description={hasFilters
                        ? 'No entries match the current filters. Loosen them and try again.'
                        : 'Nothing has been audited yet. Admin actions (purges, role changes, enrichment) write here.'}
                />
            )}

            {!isLoading && entries.length > 0 && (
                <div className="space-y-1.5">
                    {entries.map((e) => (
                        <AuditRow
                            key={e.id}
                            entry={e}
                            expanded={openId === e.id}
                            onToggle={() => setOpenId(openId === e.id ? null : e.id)}
                        />
                    ))}
                </div>
            )}

            {pages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        Previous
                    </Button>
                    <span className="tabular-nums">Page {page} of {pages}</span>
                    <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}

function AuditRow({ entry: e, expanded, onToggle }: {
    entry: AuditEntry; expanded: boolean; onToggle: () => void;
}) {
    const meta = e.metadata ?? {};
    const hard = !!(meta as { hard?: boolean }).hard;

    return (
        <Card>
            <CardContent className="py-3">
                <button type="button" onClick={onToggle} className="w-full text-left flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', ACTION_TONE[e.action] ?? '')}>
                                {e.action}{hard && ' (hard)'}
                            </Badge>
                            <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', ENTITY_TONE[e.entityType] ?? '')}>
                                {e.entityType}
                            </Badge>
                            <span className="text-xs font-mono text-muted-foreground truncate" title={e.entityId}>
                                {e.entityId.slice(0, 8)}…
                            </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums mt-1 flex items-center gap-2 flex-wrap">
                            <span>{relTime(e.createdAt)}</span>
                            <span className="opacity-50">·</span>
                            <span>source <span className="font-mono">{e.source ?? 'unknown'}</span></span>
                            {e.userId && (
                                <>
                                    <span className="opacity-50">·</span>
                                    <span>by <span className="font-mono">{e.userId.slice(0, 8)}…</span></span>
                                </>
                            )}
                        </div>
                    </div>
                </button>

                {expanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                        {e.metadata && Object.keys(e.metadata).length > 0 && (
                            <Section title="Metadata">
                                <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-x-auto font-mono">
                                    {JSON.stringify(e.metadata, null, 2)}
                                </pre>
                            </Section>
                        )}
                        {e.changes?.diff && e.changes.diff.length > 0 && (
                            <Section title="Diff">
                                <div className="space-y-1 text-xs font-mono">
                                    {e.changes.diff.map((d, i) => (
                                        <div key={i} className="flex items-baseline gap-2">
                                            <span className="text-muted-foreground shrink-0">{d.field}:</span>
                                            <span className="text-red-400 line-through">{stringify(d.old)}</span>
                                            <span className="text-muted-foreground/50">→</span>
                                            <span className="text-emerald-400">{stringify(d.new)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        )}
                        {e.changes?.after && !e.changes?.diff && (
                            <Section title="Changed to">
                                <pre className="text-xs bg-muted/40 rounded-md p-2 overflow-x-auto font-mono">
                                    {JSON.stringify(e.changes.after, null, 2)}
                                </pre>
                            </Section>
                        )}
                        <div className="text-[10px] font-mono text-muted-foreground/60">
                            id {e.id} · entity {e.entityId}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
            {children}
        </div>
    );
}

function stringify(v: unknown): string {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch { return String(v); }
}
