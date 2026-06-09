'use client';

/**
 * Brand watchlist — Phase 5 #1.
 *
 * Operator-curated list of apex domains the scheduled sweep watches.
 * Each row → CRUD (label / owner / enabled), plus a "Sweep now" button
 * that triggers an out-of-cycle scan and refreshes the alerts table on
 * the next render.
 *
 * Counter-pattern note: unlike `/iocs` and `/vulnerabilities` this is a
 * full CRUD page, not a triage queue — that's `/brand/alerts`. The two
 * are paired conceptually but kept separate so the table density and
 * affordances match each surface's job.
 */

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { brand, ApiError, type MonitoredDomain } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Play, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';

// Domains list returns all rows (the watchlist is typically <50 entries —
// no pagination needed). When the list grows past, say, 200 entries we'd
// add server-side pagination here.

export default function BrandDomainsPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<MonitoredDomain | null>(null);
    const [sweepingIds, setSweepingIds] = useState<Set<string>>(new Set());

    const { data: domains, isLoading, mutate } = useSWR(
        'brand.domains',
        () => brand.listDomains(),
    );

    const items = domains ?? [];

    /* ── Per-row ad-hoc sweep ─────────────────────────────────────── */
    const handleSweep = async (d: MonitoredDomain) => {
        if (sweepingIds.has(d.id)) return; // double-click guard
        setSweepingIds(prev => new Set(prev).add(d.id));
        try {
            const summary = await brand.sweep(d.id);
            toast.success(`${d.apexDomain} swept`, {
                description: `${summary.permutationsChecked} permutations · ${summary.hitsCreated} new, ${summary.hitsUpdated} updated`,
            });
            mutate(); // refresh lastSweptAt
        } catch (err) {
            toast.error('Sweep failed', { description: (err as Error).message });
        } finally {
            setSweepingIds(prev => {
                const next = new Set(prev);
                next.delete(d.id);
                return next;
            });
        }
    };

    /* ── Enable/disable toggle on the row ─────────────────────────── */
    const handleToggle = async (d: MonitoredDomain, enabled: boolean) => {
        try {
            await brand.updateDomain(d.id, { enabled });
            toast.success(enabled ? 'Enabled' : 'Paused', {
                description: d.apexDomain,
            });
            mutate();
        } catch (err) {
            toast.error('Update failed', { description: (err as Error).message });
        }
    };

    /* ── Delete with confirm ──────────────────────────────────────── */
    const handleDelete = async (d: MonitoredDomain) => {
        if (!window.confirm(`Remove "${d.apexDomain}" from the watchlist?\n\nAll associated brand alerts will be deleted.`)) return;
        try {
            await brand.deleteDomain(d.id);
            toast.success('Removed from watchlist', { description: d.apexDomain });
            mutate();
        } catch (err) {
            toast.error('Delete failed', { description: (err as Error).message });
        }
    };

    const columns: CcColumn<MonitoredDomain>[] = [
        {
            id: 'apex',
            header: 'Apex',
            sortable: true,
            cell: r => (
                <span className="font-mono text-[13px]">{r.apexDomain}</span>
            ),
        },
        {
            id: 'label',
            header: 'Label',
            width: 'w-40',
            cell: r => r.label
                ? <span className="text-[12px] text-text-2">{r.label}</span>
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'owner',
            header: 'Owner',
            width: 'w-32',
            cell: r => r.owner
                ? <span className="text-[12px] text-text-2">{r.owner}</span>
                : <span className="text-text-4">—</span>,
        },
        {
            id: 'enabled',
            header: 'Enabled',
            width: 'w-24',
            align: 'right',
            cell: r => (
                <div onClick={(e) => e.stopPropagation()} className="inline-flex">
                    <Switch
                        checked={r.enabled}
                        onCheckedChange={(checked) => handleToggle(r, checked)}
                        aria-label={`${r.enabled ? 'Pause' : 'Enable'} sweeping ${r.apexDomain}`}
                    />
                </div>
            ),
        },
        {
            id: 'lastSwept',
            header: 'Last swept',
            width: 'w-28',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11px] text-text-3 font-mono tnum">{relTime(r.lastSweptAt)}</span>,
        },
        {
            id: 'actions',
            header: '',
            width: 'w-32',
            align: 'right',
            cell: r => (
                <div onClick={(e) => e.stopPropagation()} className="inline-flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        title={sweepingIds.has(r.id) ? 'Sweeping…' : 'Sweep now'}
                        disabled={sweepingIds.has(r.id)}
                        onClick={() => handleSweep(r)}
                    >
                        <Play className="size-3.5" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        title="Edit"
                        onClick={() => setEditing(r)}
                    >
                        <Pencil className="size-3.5" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        title="Delete"
                        onClick={() => handleDelete(r)}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            ),
        },
    ];

    const enabled = items.filter(d => d.enabled).length;

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Brand watchlist</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading
                            ? 'Loading…'
                            : `${enabled.toLocaleString()} of ${items.length.toLocaleString()} apexes enabled`}
                        {' · '}
                        <Link href="/brand/alerts" className="underline-offset-2 hover:underline">
                            view alerts →
                        </Link>
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" /> Add apex
                </Button>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0">
                <CcDataTable
                    columns={columns}
                    data={items}
                    rowKey={r => r.id}
                    isLoading={isLoading}
                    onRowClick={() => undefined}
                />
            </div>

            {/* Create dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DomainDialog
                    onClose={() => setCreateOpen(false)}
                    onSaved={() => { setCreateOpen(false); mutate(); }}
                />
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
                {editing && (
                    <DomainDialog
                        existing={editing}
                        onClose={() => setEditing(null)}
                        onSaved={() => { setEditing(null); mutate(); }}
                    />
                )}
            </Dialog>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Create / Edit dialog                                                       */
/* -------------------------------------------------------------------------- */

function DomainDialog({
    existing, onClose, onSaved,
}: {
    existing?: MonitoredDomain;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = existing !== undefined;
    const [apexDomain, setApexDomain] = useState(existing?.apexDomain ?? '');
    const [label, setLabel] = useState(existing?.label ?? '');
    const [owner, setOwner] = useState(existing?.owner ?? '');
    const [enabled, setEnabled] = useState(existing?.enabled ?? true);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isEdit && !apexDomain.trim()) {
            toast.error('Apex domain is required');
            return;
        }
        setBusy(true);
        try {
            if (isEdit) {
                await brand.updateDomain(existing.id, {
                    label: label.trim() || null,
                    owner: owner.trim() || null,
                    enabled,
                });
                toast.success('Watchlist entry updated');
            } else {
                await brand.createDomain({
                    apexDomain: apexDomain.trim(),
                    label: label.trim() || undefined,
                    owner: owner.trim() || undefined,
                    enabled,
                });
                toast.success('Added to watchlist');
            }
            onSaved();
        } catch (err) {
            const msg = err instanceof ApiError && err.code === 'CONFLICT'
                ? 'Apex already on the watchlist'
                : (err as Error).message;
            toast.error(isEdit ? 'Update failed' : 'Add failed', { description: msg });
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{isEdit ? 'Edit watchlist entry' : 'Add apex to watchlist'}</DialogTitle>
                <DialogDescription>
                    {isEdit
                        ? 'Update display label, owner, or pause sweeps.'
                        : 'The scheduled sweep will generate dnstwist-style permutations of this apex and DNS-resolve each one every 6 hours.'}
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-3">
                <div className="grid gap-1.5">
                    <Label htmlFor="apex">Apex domain</Label>
                    <Input
                        id="apex"
                        value={apexDomain}
                        onChange={(e) => setApexDomain(e.target.value)}
                        placeholder="rinjanianalytics.com"
                        autoFocus={!isEdit}
                        disabled={isEdit}
                        required
                    />
                    {isEdit && (
                        <p className="text-[11px] text-text-3">
                            Apex is immutable — delete and re-add to change.
                        </p>
                    )}
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="label">Display label</Label>
                    <Input
                        id="label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Marketing brand"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="owner">Owner</Label>
                    <Input
                        id="owner"
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                        placeholder="Legal / Marketing / SOC"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
                    <Label htmlFor="enabled" className="cursor-pointer">
                        Sweep this apex on the 6-hour schedule
                    </Label>
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>
                        {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add to watchlist'}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
