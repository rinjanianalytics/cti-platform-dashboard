'use client';

/**
 * <Topbar> — the 56px header above the main scroll area.
 *
 * Layout: [mobile-sidebar-trigger] · [⌘K search button] ····· [UTCClock]
 *         [TweaksPanel] [NotificationBell] [Avatar dropdown]
 *
 * The "search button" is a styled button that *triggers* the existing
 * SearchPalette via the `rinjani:open-search` custom event (already
 * wired in palette listening code). Click or ⌘K opens.
 *
 * Per the Command Center spec the topbar's right cluster carries:
 *   - UTC clock (live, pulses ok-dot)
 *   - Vertical divider
 *   - Bell (the existing NotificationBell, soon to become the
 *     attention-rail trigger in Phase 3)
 *   - Avatar dropdown
 *
 * Tweaks panel button sits before the bell — it's a low-frequency
 * affordance so a small Sliders icon is enough.
 */

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { LogOut, Search, UserCircle2 } from 'lucide-react';
import { NotificationBell } from '@/components/notification-bell';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { UTCClock } from './utc-clock';
import { TweaksPanel } from './tweaks-panel';

export function Topbar() {
    const { user, logout } = useAuth();
    if (!user) return null;

    return (
        <header className="grid h-14 shrink-0 items-center border-b border-line-soft bg-bg-0 px-3 sm:px-4 grid-cols-[auto_1fr_auto] gap-2 sm:gap-3">
            {/* Left — mobile sidebar trigger only (desktop sidebar lives in <Sidebar/>). */}
            <div className="flex items-center">
                <SidebarTrigger className="md:hidden" />
            </div>

            {/* Centre — ⌘K search trigger, max width 460px per spec. */}
            <div className="flex items-center justify-center">
                <PaletteTriggerButton />
            </div>

            {/* Right — clock · tweaks · bell · avatar. */}
            <div className="flex items-center justify-end gap-2">
                <UTCClock />
                <span className="h-5 w-px bg-line-soft mx-0.5 hidden sm:block" />
                <TweaksPanel />
                <NotificationBell />
                <DropdownMenu>
                    <DropdownMenuTrigger
                        className={cn(
                            'inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-sm',
                            'hover:bg-bg-2 transition-colors',
                        )}
                    >
                        <Avatar className="size-6 rounded-md">
                            {user.avatarUrl && (
                                <AvatarImage
                                    src={user.avatarUrl}
                                    alt={user.name}
                                    referrerPolicy="no-referrer"
                                />
                            )}
                            <AvatarFallback className="text-[10px] rounded-md bg-brand-soft text-brand">
                                {(user.name || '?').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-xs font-normal text-text-3">
                                Signed in as<br />
                                <span className="text-text font-medium">{user.name}</span>
                            </DropdownMenuLabel>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem render={<Link href="/settings/profile" />}>
                            <UserCircle2 className="size-3.5" /> Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout}>
                            <LogOut className="size-3.5" /> Sign out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}

function PaletteTriggerButton() {
    const openPalette = () => {
        // The SearchPalette listens for this event globally.
        window.dispatchEvent(new CustomEvent('rinjani:open-search'));
    };
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
    return (
        <button
            type="button"
            onClick={openPalette}
            className={cn(
                'group flex items-center gap-2 w-full max-w-[460px] h-9 px-3 rounded-md',
                'bg-bg-1 border border-line-soft text-text-3',
                'hover:border-brand-line hover:text-text transition-colors',
            )}
            aria-label="Open search"
            title="Open search (⌘K)"
        >
            <Search className="size-3.5 shrink-0" />
            <span className="text-[13px] flex-1 text-left truncate">
                Search indicators, CVEs, actors…
            </span>
            <kbd className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-line-soft bg-bg-2 text-text-4">
                {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
        </button>
    );
}
