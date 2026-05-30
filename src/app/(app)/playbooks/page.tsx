'use client';

import * as React from 'react';
import { useState } from 'react';
import useSWR from 'swr';
import { playbooks, type Playbook } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
    Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check } from 'lucide-react';
import {
    Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Play, MoreVertical, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { cn, relTime } from '@/lib/utils';

const ACTION_TYPES = ['enrich', 'notify', 'alert', 'tag', 'warninglist_check'] as const;

const TRIGGER_EXAMPLES = [
    'ioc.created',
    'ioc.updated',
    'vulnerability.published',
    'vulnerability.kev_added',
    'alert.received',
    'threat_actor.updated',
];

export default function PlaybooksPage() {
    const [createOpen, setCreateOpen] = useState(false);

    const { data, isLoading, mutate } = useSWR('playbooks:list', () => playbooks.list());
    const items = data?.items ?? [];

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h-page">Playbooks</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading ? 'Loading…' : `${items.length} automation rule${items.length === 1 ? '' : 's'}`}
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" /> New playbook
                </Button>
                <Sheet open={createOpen} onOpenChange={setCreateOpen}>
                    <CreatePlaybookSheet
                        open={createOpen}
                        onClose={() => setCreateOpen(false)}
                        onCreated={() => { setCreateOpen(false); mutate(); }}
                    />
                </Sheet>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
            ) : items.length === 0 ? (
                <Card>
                    <CardContent>
                        <EmptyState
                            icon={Workflow}
                            title="No automation rules yet"
                            description="Playbooks fire when an IOC, CVE, or alert event matches conditions you define. Create one to start automating triage, enrichment, or notification."
                            action={{ label: 'New playbook', onClick: () => setCreateOpen(true) }}
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map((pb) => <PlaybookCard key={pb.id} pb={pb} onChange={mutate} />)}
                </div>
            )}
        </div>
    );
}

function PlaybookCard({ pb, onChange }: { pb: Playbook; onChange: () => void }) {
    const [busy, setBusy] = useState(false);

    const toggleEnabled = async (enabled: boolean) => {
        setBusy(true);
        try {
            await playbooks.update(pb.id, { enabled });
            toast.success(enabled ? 'Playbook enabled' : 'Playbook disabled');
            onChange();
        } catch (err) {
            toast.error('Update failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const runNow = async () => {
        setBusy(true);
        try {
            const result = await playbooks.execute(pb.id, {});
            // Execution is synchronous on the server — the returned row already
            // carries the final status. Surface failures as toast.error so the
            // analyst doesn't read a green "started" message for a failed run.
            if (result.status === 'failed') {
                toast.error('Playbook execution failed', {
                    description: result.error ?? 'No error message',
                });
            } else {
                toast.success('Playbook executed', { description: `Status: ${result.status}` });
            }
            onChange();
        } catch (err) {
            toast.error('Execute failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!confirm(`Delete playbook "${pb.name}"? This cannot be undone.`)) return;
        setBusy(true);
        try {
            await playbooks.remove(pb.id);
            toast.success('Playbook deleted');
            onChange();
        } catch (err) {
            toast.error('Delete failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{pb.name}</CardTitle>
                        <div className="text-[11px] font-mono text-muted-foreground mt-1 truncate">
                            on {pb.triggerEvent}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Switch checked={pb.enabled} onCheckedChange={toggleEnabled} disabled={busy} />
                        <DropdownMenu>
                            <DropdownMenuTrigger className="size-7 inline-flex items-center justify-center rounded-md hover:bg-accent">
                                <MoreVertical className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={remove} className="text-red-400">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {pb.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{pb.description}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {pb.actions.map((a, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-[10px]">
                            {a.type}
                        </Badge>
                    ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                        updated {relTime(pb.updatedAt)}
                    </span>
                    <Button size="sm" variant="outline" onClick={runNow} disabled={busy}>
                        <Play className="size-3" /> Run now
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

/* -------------------------------------------------------------------------- */
/* Create playbook — 3-step Sheet                                              */
/* -------------------------------------------------------------------------- */

const STEPS = [
    { id: 0, label: 'Basics', desc: 'Name + trigger event' },
    { id: 1, label: 'Conditions', desc: 'When the playbook fires' },
    { id: 2, label: 'Action', desc: 'What it does' },
] as const;

function CreatePlaybookSheet({ open, onClose, onCreated }: {
    open: boolean; onClose: () => void; onCreated: () => void;
}) {
    const [step, setStep] = useState(0);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [triggerEvent, setTriggerEvent] = useState('ioc.created');
    const [conditionsJson, setConditionsJson] = useState('{}');
    const [actionType, setActionType] = useState<typeof ACTION_TYPES[number]>('tag');
    const [actionConfig, setActionConfig] = useState('{\n  "tags": ["auto"]\n}');
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setStep(0);
        setName(''); setDescription(''); setTriggerEvent('ioc.created');
        setConditionsJson('{}');
        setActionType('tag'); setActionConfig('{\n  "tags": ["auto"]\n}');
    };

    // Reset whenever the sheet is closed so a re-open starts fresh.
    React.useEffect(() => { if (!open) reset(); }, [open]);

    const stepValid =
        step === 0 ? Boolean(name.trim() && triggerEvent.trim())
        : step === 1 ? safeJson(conditionsJson) !== null
        : safeJson(actionConfig) !== null;

    const submit = async () => {
        const conditions = safeJson(conditionsJson);
        const config = safeJson(actionConfig);
        if (conditions === null) { toast.error('Conditions are not valid JSON'); setStep(1); return; }
        if (config === null) { toast.error('Action config is not valid JSON'); setStep(2); return; }

        setBusy(true);
        try {
            const created = await playbooks.create({
                name: name.trim(),
                description: description.trim() || undefined,
                triggerEvent: triggerEvent.trim(),
                conditions: conditions as Record<string, unknown>,
                actions: [{ type: actionType, config: config as Record<string, unknown> }],
            });
            toast.success('Playbook created', { description: created.name });
            onCreated();
        } catch (err) {
            toast.error('Create failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
            <SheetHeader className="px-6 pt-6 pb-3 border-b">
                <SheetTitle>New playbook</SheetTitle>
                <SheetDescription>
                    Fire an automated action when a platform event matches your conditions.
                </SheetDescription>

                {/* Step indicator */}
                <ol className="flex items-center gap-2 mt-4">
                    {STEPS.map((s, i) => {
                        const done = i < step;
                        const active = i === step;
                        return (
                            <li key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
                                <button
                                    type="button"
                                    onClick={() => i < step && setStep(i)}
                                    disabled={i > step}
                                    className={cn(
                                        'flex items-center gap-2 min-w-0',
                                        i > step && 'opacity-50',
                                    )}
                                >
                                    <span className={cn(
                                        'inline-flex items-center justify-center size-5 rounded-full text-[10px] font-mono shrink-0',
                                        active && 'bg-primary text-primary-foreground',
                                        done && 'bg-primary/70 text-primary-foreground',
                                        !active && !done && 'border border-border text-muted-foreground',
                                    )}>
                                        {done ? <Check className="size-3" /> : i + 1}
                                    </span>
                                    <span className={cn(
                                        'text-[11px] font-medium hidden sm:inline truncate',
                                        active ? 'text-foreground' : 'text-muted-foreground',
                                    )}>
                                        {s.label}
                                    </span>
                                </button>
                                {i < STEPS.length - 1 && (
                                    <span className={cn(
                                        'flex-1 h-px',
                                        i < step ? 'bg-primary/70' : 'bg-border',
                                    )} />
                                )}
                            </li>
                        );
                    })}
                </ol>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {step === 0 && (
                    <>
                        <div className="space-y-1.5">
                            <Label htmlFor="pb-name">Name</Label>
                            <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                                placeholder="Tag high-confidence IPs" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pb-desc">Description</Label>
                            <Textarea id="pb-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                                placeholder="What this playbook does and why." />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pb-trigger">Trigger event</Label>
                            <Input id="pb-trigger" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}
                                list="trigger-suggestions"
                                placeholder="ioc.created" />
                            <datalist id="trigger-suggestions">
                                {TRIGGER_EXAMPLES.map(t => <option key={t} value={t} />)}
                            </datalist>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Examples: <code className="font-mono">ioc.created</code>, <code className="font-mono">vulnerability.kev_added</code>, <code className="font-mono">alert.received</code>
                            </p>
                        </div>
                    </>
                )}

                {step === 1 && (
                    <>
                        <div className="space-y-1.5">
                            <Label htmlFor="pb-conditions">Conditions (JSON)</Label>
                            <Textarea
                                id="pb-conditions"
                                rows={8}
                                value={conditionsJson}
                                onChange={(e) => setConditionsJson(e.target.value)}
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Conditions narrow when the playbook fires. Leave as <code className="font-mono">{'{}'}</code> to fire on every matching trigger.
                            </p>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <div className="space-y-1.5">
                            <Label htmlFor="pb-action">Action type</Label>
                            <Select value={actionType} onValueChange={(v) => setActionType((v as typeof ACTION_TYPES[number]) ?? 'tag')}>
                                <SelectTrigger id="pb-action"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ACTION_TYPES.map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pb-config">Action config (JSON)</Label>
                            <Textarea id="pb-config" rows={6}
                                value={actionConfig}
                                onChange={(e) => setActionConfig(e.target.value)}
                                className="font-mono text-xs"
                            />
                        </div>
                    </>
                )}
            </div>

            <SheetFooter className="border-t flex flex-row items-center justify-between gap-2 p-4">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
                    disabled={busy}
                >
                    {step === 0 ? 'Cancel' : 'Back'}
                </Button>
                {step < STEPS.length - 1 ? (
                    <Button type="button" onClick={() => setStep(s => s + 1)} disabled={!stepValid || busy}>
                        Next
                    </Button>
                ) : (
                    <Button type="button" onClick={submit} disabled={!stepValid || busy}>
                        {busy ? 'Creating…' : 'Create playbook'}
                    </Button>
                )}
            </SheetFooter>
        </SheetContent>
    );
}

/** Returns parsed JSON or `null` if invalid. Empty strings → empty object. */
function safeJson(s: string): unknown | null {
    if (!s.trim()) return {};
    try { return JSON.parse(s); } catch { return null; }
}
