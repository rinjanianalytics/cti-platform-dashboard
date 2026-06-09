'use client';

/**
 * Dark-web watchterms — Phase 5 #4.
 *
 * Mirror of `/paste/watchterms`. The CRUD works fine; the back-end scan
 * currently returns 0 results because Ahmia's upstream HTML markup moved
 * to client-side rendering. See <UpstreamBannerNotice />.
 */

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { darkWeb, ApiError, type DarkWebWatchterm } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { relTime } from '@/lib/utils';
import { CcDataTable, type CcColumn } from '@/components/cc/data-table';
import { UpstreamBannerNotice } from '../_components/upstream-banner';

export default function DarkWebWatchtermsPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<DarkWebWatchterm | null>(null);

    const { data: watchterms, isLoading, mutate } = useSWR(
        'darkweb.watchterms',
        () => darkWeb.listWatchterms(),
    );

    const items = watchterms ?? [];

    const handleToggle = async (w: DarkWebWatchterm, enabled: boolean) => {
        try {
            await darkWeb.updateWatchterm(w.id, { enabled });
            toast.success(enabled ? 'Enabled' : 'Paused', { description: w.term });
            mutate();
        } catch (err) {
            toast.error('Update failed', { description: (err as Error).message });
        }
    };

    const handleDelete = async (w: DarkWebWatchterm) => {
        if (!window.confirm(`Remove watchterm "${w.term}"?\n\nAll associated mentions will be deleted.`)) return;
        try {
            await darkWeb.deleteWatchterm(w.id);
            toast.success('Removed', { description: w.term });
            mutate();
        } catch (err) {
            toast.error('Delete failed', { description: (err as Error).message });
        }
    };

    const columns: CcColumn<DarkWebWatchterm>[] = [
        {
            id: 'term',
            header: 'Term',
            sortable: true,
            cell: r => <span className="font-mono text-[13px]">{r.term}</span>,
        },
        {
            id: 'kind',
            header: 'Kind',
            width: 'w-28',
            cell: r => r.kind
                ? <span className="text-[11px] uppercase tracking-wider text-text-3 font-mono">{r.kind}</span>
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
                        aria-label={`${r.enabled ? 'Pause' : 'Enable'} searching ${r.term}`}
                    />
                </div>
            ),
        },
        {
            id: 'lastSearched',
            header: 'Last searched',
            width: 'w-32',
            align: 'right',
            sortable: true,
            cell: r => <span className="text-[11px] text-text-3 font-mono tnum">{relTime(r.lastSearchedAt)}</span>,
        },
        {
            id: 'actions',
            header: '',
            width: 'w-24',
            align: 'right',
            cell: r => (
                <div onClick={(e) => e.stopPropagation()} className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(r)}>
                        <Pencil className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Delete" onClick={() => handleDelete(r)}>
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            ),
        },
    ];

    const enabled = items.filter(w => w.enabled).length;

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Honest upstream-broken banner */}
            <div className="shrink-0">
                <UpstreamBannerNotice />
            </div>

            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Dark-web watchterms</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading
                            ? 'Loading…'
                            : `${enabled.toLocaleString()} of ${items.length.toLocaleString()} terms enabled · daily Ahmia scan`}
                        {' · '}
                        <Link href="/dark-web/mentions" className="underline-offset-2 hover:underline">
                            view mentions →
                        </Link>
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" /> Add term
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
                <WatchtermDialog
                    onClose={() => setCreateOpen(false)}
                    onSaved={() => { setCreateOpen(false); mutate(); }}
                />
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
                {editing && (
                    <WatchtermDialog
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

function WatchtermDialog({
    existing, onClose, onSaved,
}: {
    existing?: DarkWebWatchterm;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = existing !== undefined;
    const [term, setTerm] = useState(existing?.term ?? '');
    const [kind, setKind] = useState(existing?.kind ?? '');
    const [owner, setOwner] = useState(existing?.owner ?? '');
    const [enabled, setEnabled] = useState(existing?.enabled ?? true);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isEdit && !term.trim()) {
            toast.error('Search term is required');
            return;
        }
        setBusy(true);
        try {
            if (isEdit) {
                await darkWeb.updateWatchterm(existing.id, {
                    kind: kind.trim() || null,
                    owner: owner.trim() || null,
                    enabled,
                });
                toast.success('Watchterm updated');
            } else {
                await darkWeb.createWatchterm({
                    term: term.trim(),
                    kind: kind.trim() || undefined,
                    owner: owner.trim() || undefined,
                    enabled,
                });
                toast.success('Watchterm added');
            }
            onSaved();
        } catch (err) {
            const msg = err instanceof ApiError && err.code === 'CONFLICT'
                ? 'That term is already watched'
                : (err as Error).message;
            toast.error(isEdit ? 'Update failed' : 'Add failed', { description: msg });
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{isEdit ? 'Edit watchterm' : 'Add dark-web watchterm'}</DialogTitle>
                <DialogDescription>
                    {isEdit
                        ? 'Update kind / owner / pause searching.'
                        : 'When the upstream Ahmia parser is restored, the scheduled daily scan will match this term against the indexed Tor hidden services.'}
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-3">
                <div className="grid gap-1.5">
                    <Label htmlFor="term">Search term</Label>
                    <Input
                        id="term"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder="rinjanianalytics"
                        autoFocus={!isEdit}
                        disabled={isEdit}
                        required
                    />
                    {isEdit && (
                        <p className="text-[11px] text-text-3">
                            Term is immutable — delete and re-add to change.
                        </p>
                    )}
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="kind">Kind</Label>
                    <Input
                        id="kind"
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                        placeholder="brand / product / actor / creds"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="owner">Owner</Label>
                    <Input
                        id="owner"
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                        placeholder="Marketing / Legal / SOC"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
                    <Label htmlFor="enabled" className="cursor-pointer">
                        Include this term in the daily scan
                    </Label>
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>
                        {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add watchterm'}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
