'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { admin, type AdminUser, type AdminRole } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, X, Users, MoreVertical, ShieldOff, ShieldCheck, UserCog, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { cn, relTime } from '@/lib/utils';
import { PageHeader } from '@/components/admin/page-header';
import { StatusBadge } from '@/lib/tone';

const PAGE_SIZE = 25;

const ROLE_TONE: Record<string, string> = {
    admin:     'bg-red-500/15 text-red-400 border-red-500/30',
    analyst:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    developer: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
    auditor:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    viewer:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function AdminUsersPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && user.role !== 'admin') router.replace('/');
    }, [user, authLoading, router]);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [page, setPage] = useState(1);

    const { data, isLoading, mutate } = useSWR(
        user?.role === 'admin' ? ['admin:users', search, roleFilter, statusFilter, page] : null,
        () => admin.listUsers({
            page,
            limit: PAGE_SIZE,
            search: search || undefined,
            role: roleFilter === 'all' ? undefined : roleFilter,
            status: statusFilter,
        }),
    );

    const { data: rolesList } = useSWR(
        user?.role === 'admin' ? 'admin:roles' : null,
        () => admin.listRoles(),
        { revalidateOnFocus: false },
    );

    const roles: AdminRole[] = rolesList?.roles ?? [];
    const users = data?.users ?? [];
    const total = data?.pagination?.total ?? 0;

    if (!user || user.role !== 'admin') {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin role required.</div>;
    }

    const columns: ColumnDef<AdminUser>[] = [
        {
            id: 'user',
            header: 'User',
            accessor: u => u.name,
            sortable: true,
            cell: u => (
                <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="size-7 shrink-0">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} referrerPolicy="no-referrer" />}
                        <AvatarFallback className="text-[10px]">{(u.name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                    </div>
                </div>
            ),
        },
        {
            id: 'role',
            header: 'Role',
            width: 'w-30',
            accessor: u => u.roles?.[0],
            sortable: true,
            cell: u => {
                const role = u.roles?.[0];
                return role
                    ? <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', ROLE_TONE[role] ?? ROLE_TONE.viewer)}>{role}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>;
            },
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-24',
            accessor: u => u.isActive ? 1 : 0,
            sortable: true,
            cell: u => u.isActive
                ? <StatusBadge kind="success">Active</StatusBadge>
                : <StatusBadge kind="idle">Disabled</StatusBadge>,
        },
        {
            id: 'lastLogin',
            header: 'Last login',
            width: 'w-28',
            align: 'right',
            accessor: u => u.lastLogin ? Date.parse(u.lastLogin) : null,
            sortable: true,
            cell: u => <span className="text-xs text-muted-foreground tabular-nums">{u.lastLogin ? relTime(u.lastLogin) : 'Never'}</span>,
        },
        {
            id: 'actions',
            header: '',
            width: 'w-12',
            cell: u => (
                <UserActionsMenu user={u} roles={roles} selfId={user.id} onChanged={() => mutate()} />
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Users"
                description={isLoading ? 'Loading…' : `${total.toLocaleString()} user${total === 1 ? '' : 's'}`}
            />

            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search by name or email…"
                        className="pl-8 pr-8 h-9"
                    />
                    {search && (
                        <button
                            onClick={() => { setSearch(''); setPage(1); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v ?? 'all'); setPage(1); }}>
                    <SelectTrigger className="w-40 h-9">
                        <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All roles</SelectItem>
                        {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter((v as 'all' | 'active' | 'inactive') ?? 'all'); setPage(1); }}>
                    <SelectTrigger className="w-32 h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Disabled</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <DataTable
                columns={columns}
                data={users}
                rowKey={u => u.id}
                isLoading={isLoading}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                density="compact"
                emptyState={
                    <EmptyState
                        icon={Users}
                        title="No users in scope"
                        description="Loosen the search or status filter, or invite someone via Google/GitHub OAuth — first sign-in creates the user automatically."
                    />
                }
            />
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Per-row actions: change role, activate/deactivate, delete                  */
/* -------------------------------------------------------------------------- */

function UserActionsMenu({
    user: u, roles, selfId, onChanged,
}: {
    user: AdminUser;
    roles: AdminRole[];
    selfId: string;
    onChanged: () => void;
}) {
    const [roleOpen, setRoleOpen] = useState(false);
    const [purgeOpen, setPurgeOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const isSelf = u.id === selfId;

    const toggleActive = async () => {
        if (isSelf) {
            toast.error('Cannot deactivate your own account');
            return;
        }
        setBusy(true);
        try {
            if (u.isActive) {
                await admin.deactivateUser(u.id);
                toast.success(`${u.name} disabled`);
            } else {
                await admin.activateUser(u.id);
                toast.success(`${u.name} re-enabled`);
            }
            onChanged();
        } catch (err) {
            toast.error('Action failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="size-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`Actions for ${u.name}`}
                >
                    <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRoleOpen(true); }}>
                        <UserCog className="size-3.5" /> Change role
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleActive(); }} disabled={isSelf || busy}>
                        {u.isActive
                            ? <><ShieldOff className="size-3.5" /> Disable</>
                            : <><ShieldCheck className="size-3.5" /> Re-enable</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); setPurgeOpen(true); }}
                        disabled={isSelf}
                        className="text-red-400"
                    >
                        <Flame className="size-3.5" /> Permanently delete…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
                <RoleDialog
                    user={u}
                    roles={roles}
                    isSelf={isSelf}
                    onClose={() => setRoleOpen(false)}
                    onChanged={() => { setRoleOpen(false); onChanged(); }}
                />
            </Dialog>

            <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
                <PurgeDialog
                    user={u}
                    onClose={() => setPurgeOpen(false)}
                    onPurged={() => { setPurgeOpen(false); onChanged(); }}
                />
            </Dialog>
        </>
    );
}

function RoleDialog({
    user: u, roles, isSelf, onClose, onChanged,
}: {
    user: AdminUser;
    roles: AdminRole[];
    isSelf: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const current = u.roles?.[0] ?? 'viewer';
    const [role, setRole] = useState(current);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (role === current) { onClose(); return; }
        setBusy(true);
        try {
            await admin.updateUser(u.id, { role });
            toast.success('Role updated', { description: `${u.name} → ${role}` });
            onChanged();
        } catch (err) {
            toast.error('Role change failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Change role for {u.name}</DialogTitle>
                <DialogDescription>
                    {isSelf
                        ? 'You cannot change your own role.'
                        : `Currently ${current}. Pick the new role — takes effect on the user's next request.`}
                </DialogDescription>
            </DialogHeader>
            <Select value={role} onValueChange={(v) => setRole(v ?? current)}>
                <SelectTrigger className="w-full h-9">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {roles.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                            {r.name}{r.description ? ` — ${r.description}` : ''}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={submit} disabled={busy || isSelf || role === current}>
                    {busy ? 'Saving…' : 'Save'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

function PurgeDialog({
    user: u, onClose, onPurged,
}: { user: AdminUser; onClose: () => void; onPurged: () => void }) {
    const [busy, setBusy] = useState(false);
    const [typed, setTyped] = useState('');
    const confirmed = typed.trim().toLowerCase() === (u.email ?? '').toLowerCase() && !!u.email;

    const submit = async () => {
        if (!confirmed) return;
        setBusy(true);
        try {
            await admin.purgeUser(u.id);
            toast.success(`${u.name} permanently deleted`, {
                description: 'User row removed; audit trail preserved.',
            });
            onPurged();
        } catch (err) {
            toast.error('Purge failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-400">
                    <Flame className="size-4" /> Permanently delete {u.name}?
                </DialogTitle>
                <DialogDescription>
                    This is irreversible. The user row is removed from the database.
                    Org memberships, sessions, API keys, and OAuth identities cascade-drop.
                    Playbooks and sightings they authored are preserved (creator field nulled).
                    Audit-log entries naming them remain as a historical record.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                    Type <span className="font-mono text-foreground">{u.email}</span> to confirm:
                </label>
                <Input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={u.email ?? 'user email'}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && confirmed && !busy) submit(); }}
                />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="destructive" onClick={submit} disabled={busy || !confirmed}>
                    {busy ? 'Deleting…' : 'Permanently delete'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
