'use client';

/**
 * Paste-site watchterms — Phase 5 #5.
 *
 * Operator-curated terms the GitHub Gist firehose scanner matches against
 * gist filenames + descriptions every 30 minutes. Same structural pattern
 * as `/brand/domains` — watchlist CRUD, inline enable/disable, ad-hoc
 * "Scan now" button.
 *
 * One scope difference vs brand: scans are GLOBAL (one /v1/paste/scan call
 * walks the firehose once and matches every enabled watchterm), so the
 * "Scan now" button lives in the page header, not per-row.
 */

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { paste, ApiError, type PasteWatchterm } from '@/lib/api';
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

export default function PasteWatchtermsPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<PasteWatchterm | null>(null);
    const [scanning, setScanning] = useState(false);

    const { data: watchterms, isLoading, mutate } = useSWR(
        'paste.watchterms',
        () => paste.listWatchterms(),
    );

    const items = watchterms ?? [];

    /* ── Ad-hoc firehose scan (global, not per-row) ───────────────── */
    const handleScan = async () => {
        if (scanning) return;
        setScanning(true);
        try {
            const summary = await paste.scan();
            if (summary.error) {
                toast.error('Scan completed with errors', { description: summary.error });
            } else {
                toast.success(`Scanned ${summary.gistsScanned} gists`, {
                    description: `${summary.matchesCreated} new matches, ${summary.matchesUpdated} updated · ${summary.watchtermsActive} terms active`,
                });
            }
            mutate();
        } catch (err) {
            toast.error('Scan failed', { description: (err as Error).message });
        } finally {
            setScanning(false);
        }
    };

    const handleToggle = async (w: PasteWatchterm, enabled: boolean) => {
        try {
            await paste.updateWatchterm(w.id, { enabled });
            toast.success(enabled ? 'Enabled' : 'Paused', { description: w.term });
            mutate();
        } catch (err) {
            toast.error('Update failed', { description: (err as Error).message });
        }
    };

    const handleDelete = async (w: PasteWatchterm) => {
        if (!window.confirm(`Remove watchterm "${w.term}"?\n\nAll associated paste mentions will be deleted.`)) return;
        try {
            await paste.deleteWatchterm(w.id);
            toast.success('Removed', { description: w.term });
            mutate();
        } catch (err) {
            toast.error('Delete failed', { description: (err as Error).message });
        }
    };

    const columns: CcColumn<PasteWatchterm>[] = [
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
                        aria-label={`${r.enabled ? 'Pause' : 'Enable'} matching ${r.term}`}
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
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
                <div>
                    <h1 className="h-page">Paste watchterms</h1>
                    <p className="sub tabular-nums mt-1">
                        {isLoading
                            ? 'Loading…'
                            : `${enabled.toLocaleString()} of ${items.length.toLocaleString()} terms enabled · scans every 30 min`}
                        {' · '}
                        <Link href="/paste/mentions" className="underline-offset-2 hover:underline">
                            view mentions →
                        </Link>
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={handleScan} disabled={scanning}>
                        <Play className="size-4" />
                        {scanning ? 'Scanning…' : 'Scan now'}
                    </Button>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="size-4" /> Add term
                    </Button>
                </div>
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
    existing?: PasteWatchterm;
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
                await paste.updateWatchterm(existing.id, {
                    kind: kind.trim() || null,
                    owner: owner.trim() || null,
                    enabled,
                });
                toast.success('Watchterm updated');
            } else {
                await paste.createWatchterm({
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
                <DialogTitle>{isEdit ? 'Edit watchterm' : 'Add paste watchterm'}</DialogTitle>
                <DialogDescription>
                    {isEdit
                        ? 'Update kind / owner / pause matching against the gist firehose.'
                        : 'The scheduled scan matches this term against the most recent ~90 public GitHub gists every 30 minutes — both filenames and descriptions.'}
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
                    <p className="text-[11px] text-text-3">
                        Free-form classification — used to group the triage view.
                    </p>
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
                        Match this term on the 30-minute schedule
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
