'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type ScheduledJob, type IntervalPreset } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Clock, Play, Pause, CalendarClock, Loader2 } from 'lucide-react';
import { relTime } from '@/lib/utils';
import { toast } from 'sonner';
import { PageHeader, RefreshAction } from '@/components/admin/page-header';
import { RowCard } from '@/components/admin/row-card';
import { StatField } from '@/components/admin/stat';
import { StatusBadge, type StatusKind } from '@/lib/tone';

const REFRESH_MS = 30_000;

/** UI labels for each interval preset — keep in lockstep with the backend map. */
const PRESET_LABELS: Record<IntervalPreset, string> = {
    '15m':   'Every 15 minutes',
    '30m':   'Every 30 minutes',
    '1h':    'Every hour',
    '4h':    'Every 4 hours',
    '6h':    'Every 6 hours',
    'daily': 'Daily',
    'weekly': 'Weekly',
};

/**
 * Convert a 5-field cron pattern to a short, human-readable label.
 * Falls back to the raw pattern if we don't recognise it.
 */
function describeCron(cron: string | null): string {
    if (!cron) return 'disabled';
    const known: Record<string, string> = {
        '*/15 * * * *': 'every 15 minutes',
        '*/30 * * * *': 'every 30 minutes',
        '0 * * * *':    'every hour',
        '0 */4 * * *':  'every 4 hours',
        '0 */6 * * *':  'every 6 hours',
        '0 2 * * *':    'daily at 02:00',
        '0 4 * * 0':    'weekly · Sunday 04:00',
        '*/5 * * * *':  'every 5 minutes',
    };
    if (known[cron]) return known[cron];

    // Heuristics for ad-hoc patterns
    if (/^\d+ \*\/(\d+) \* \* \*$/.test(cron)) {
        const [, , hours] = cron.match(/^\d+ \*\/(\d+) \* \* \*$/) ?? [];
        return `every ${hours} hours`;
    }
    if (/^\d+ \d+ \* \* \d$/.test(cron)) return 'weekly';
    if (/^\d+ \d+ \* \* \*$/.test(cron)) return 'daily';

    return cron;
}

export default function AdminSchedulesPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') router.replace('/');
    }, [user, authLoading, router]);

    const { data, isLoading, mutate } = useSWR(
        user?.role === 'admin' ? 'admin:schedules' : null,
        () => admin.listSchedules(),
        { refreshInterval: REFRESH_MS, revalidateOnFocus: false },
    );

    const jobs = data?.jobs ?? [];
    const enabledCount = jobs.filter(j => j.enabled).length;
    const overriddenCount = jobs.filter(j => j.override !== null).length;

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Schedules"
                description={isLoading
                    ? 'Loading…'
                    : `${enabledCount}/${jobs.length} active · ${overriddenCount} customised`}
                actions={<RefreshAction onClick={() => mutate()} />}
            />

            {isLoading && (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading schedules…</CardContent></Card>
            )}

            {!isLoading && jobs.length === 0 && (
                <EmptyState
                    icon={CalendarClock}
                    title="No scheduled jobs"
                    description="The registry is empty — check apps/api/src/queues/scheduler.ts."
                />
            )}

            {!isLoading && jobs.length > 0 && (
                <div className="space-y-2">
                    {jobs.map(job => (
                        <ScheduleRow key={job.key} job={job} onChanged={() => mutate()} />
                    ))}
                </div>
            )}

            <p className="text-[11px] text-muted-foreground/70 italic mt-6">
                Free-form cron isn&apos;t editable from the UI — a bad cron expression is a trivial self-DoS.
                Engineers can edit the registry in <span className="font-mono">apps/api/src/queues/scheduler.ts</span>.
            </p>
        </div>
    );
}

function ScheduleRow({ job, onChanged }: { job: ScheduledJob; onChanged: () => void }) {
    const [busy, setBusy] = useState(false);
    const [running, setRunning] = useState(false);

    const update = async (patch: {
        enabled?: boolean;
        intervalPreset?: IntervalPreset | null;
    }) => {
        setBusy(true);
        try {
            const result = await admin.updateSchedule(job.key, patch);
            const status = result.reconciled.status;
            toast.success(
                status === 'enabled'
                    ? `${job.name} · ${describeCron(result.reconciled.cron ?? null)}`
                    : `${job.name} disabled`,
            );
            onChanged();
        } catch (err) {
            toast.error('Save failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const runNow = async () => {
        setRunning(true);
        try {
            const r = await admin.runScheduleNow(job.key);
            toast.success(`Queued ad-hoc run · job ${r.jobId}`);
        } catch (err) {
            toast.error('Run failed', { description: (err as Error).message });
        } finally {
            setRunning(false);
        }
    };

    const isCustomised = job.override !== null;
    const presetValue: IntervalPreset | 'default' = job.override?.intervalPreset ?? 'default';
    const tone: StatusKind | undefined =
        !job.enabled    ? 'paused'
      : isCustomised    ? 'custom'
      : undefined;

    return (
        <RowCard tone={tone} muted={!job.enabled}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            <span className="font-mono">{job.name}</span>
                            {!job.enabled && <StatusBadge kind="paused">Paused</StatusBadge>}
                            {isCustomised && job.enabled && <StatusBadge kind="custom">Customised</StatusBadge>}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">{job.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Switch
                            checked={job.enabled}
                            onCheckedChange={(checked) => update({ enabled: checked })}
                            disabled={busy}
                            aria-label={`${job.enabled ? 'Disable' : 'Enable'} ${job.name}`}
                        />
                        <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
                            {running
                                ? <><Loader2 className="size-3.5 animate-spin" /> Running…</>
                                : <><Play className="size-3.5" /> Run now</>}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatField label="Interval">
                    <Select
                        value={presetValue}
                        onValueChange={(v) => {
                            const next = v === 'default' ? null : (v as IntervalPreset);
                            update({ intervalPreset: next });
                        }}
                        disabled={busy || !job.enabled}
                    >
                        <SelectTrigger className="h-9 text-xs w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">
                                Use code default · {describeCron(job.defaultCron)}
                            </SelectItem>
                            {Object.entries(PRESET_LABELS).map(([k, label]) => (
                                <SelectItem key={k} value={k}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </StatField>

                <StatField label="Active schedule">
                    {job.enabled ? (
                        <div className="inline-flex items-center gap-2 text-xs">
                            <Clock className="size-3.5 text-muted-foreground" />
                            <span className="font-mono">{describeCron(job.effectiveCron)}</span>
                            <span className="text-muted-foreground/70 font-mono text-[10px]">
                                {job.effectiveCron}
                            </span>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-2 text-xs">
                            <Pause className="size-3.5 text-amber-500" />
                            <span className="text-muted-foreground">No automatic runs</span>
                        </div>
                    )}
                </StatField>

                {/* Footer micro-row: queue, last updated */}
                <div className="sm:col-span-2 flex items-center justify-between text-[10px] text-muted-foreground/70 font-mono tabular-nums pt-1 border-t border-border/50 mt-1">
                    <span>queue · {job.queueName}</span>
                    {job.override && (
                        <span>customised {relTime(job.override.updatedAt)}</span>
                    )}
                </div>
            </CardContent>
        </RowCard>
    );
}
