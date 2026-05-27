'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
    SidebarProvider, Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem,
    SidebarInset, SidebarGroup, SidebarGroupContent, SidebarTrigger,
    useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    LayoutDashboard, Radar, Shield, Users, Database, Workflow,
    LogOut, ChevronLeft, ChevronRight, ServerCog, UsersRound, UserCircle2, ScrollText, BookOpen, Network, Boxes,
    CalendarClock,
} from 'lucide-react';
import { SearchPalette } from '@/components/search-palette';
import { HeaderSearch } from '@/components/header-search';
import { NotificationBell } from '@/components/notification-bell';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { Logo } from '@/components/brand/logo';
import { BuildBadge } from '@/components/build-badge';

const NAV = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/iocs', label: 'Indicators', icon: Radar },
    { href: '/vulnerabilities', label: 'Vulnerabilities', icon: Shield },
    { href: '/actors', label: 'Threat actors', icon: Users },
    { href: '/feeds', label: 'Feeds', icon: Database },
    { href: '/graph', label: 'Graph', icon: Network },
    { href: '/playbooks', label: 'Playbooks', icon: Workflow },
];

// Admin entries grouped by purpose. Ten flat items broke the cognitive-load
// ceiling (≤5 per nav group); grouped into Operations / Configuration /
// Governance the sidebar reads as three small lists instead of one wall.
// `roles` lists which user roles see the entry; defaults to admin-only.
// `external: true` marks routes served outside Next.js (e.g. Workbench at
// /admin/workbench, which is reverse-proxied to the API). Those entries render
// as plain anchors so the browser does a hard navigation — Next's <Link>
// would try to prefetch a non-existent JSON manifest for the route.
type AdminNavItem = { href: string; label: string; icon: typeof ServerCog; roles?: string[]; external?: boolean };
const ADMIN_NAV_GROUPS: Array<{ heading: string; items: AdminNavItem[] }> = [
    {
        heading: 'Operations',
        items: [
            { href: '/admin/services', label: 'Services', icon: ServerCog },
            { href: '/admin/runbook',  label: 'Runbook',  icon: BookOpen },
            // Workbench replaces our former Queues / Activity / Pipeline /
            // Jobs pages — full-page takeover (not iframed; its
            // X-Frame-Options blocks framing). Browser back returns here.
            // Schedules came back as a native page (Configuration group)
            // because Workbench's Schedulers tab is view-only and we need
            // edit/disable for cron presets. Backend admin API endpoints
            // for the deleted concepts are kept so Runbook's failure-grouping
            // panel still works.
            { href: '/admin/workbench', label: 'Workbench', icon: Boxes, external: true },
        ],
    },
    {
        heading: 'Configuration',
        items: [
            { href: '/admin/feeds',     label: 'Feeds',     icon: Database,      roles: ['admin', 'auditor'] },
            // Schedules is back — Workbench's Schedulers tab is view-only and
            // can't edit cron presets / enable-disable our 13 registered jobs.
            // This page reads/writes scheduled_job_overrides via the existing
            // /admin/schedules API and reconciles BullMQ in one call.
            { href: '/admin/schedules', label: 'Schedules', icon: CalendarClock },
        ],
    },
    {
        heading: 'Governance',
        items: [
            { href: '/admin/users', label: 'Users',     icon: UsersRound },
            { href: '/admin/audit', label: 'Audit log', icon: ScrollText, roles: ['admin', 'auditor'] },
        ],
    },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, isLoading, logout } = useAuth();

    const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="size-2 rounded-full bg-muted-foreground animate-pulse" />
            </div>
        );
    }

    if (!user) return null; // AuthProvider redirects

    return (
        <SidebarProvider>
            <Sidebar collapsible="icon">
                <SidebarEdgeToggle />
                <SidebarHeader>
                    <div className="flex items-center px-2 py-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
                        <Logo
                            size={24}
                            showWordmark
                            className="group-data-[collapsible=icon]:[&_span:last-child]:hidden"
                        />
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {NAV.map((item) => (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            isActive={isActive(item.href)}
                                            tooltip={item.label}
                                            render={<Link href={item.href} />}
                                        >
                                            <item.icon />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {(user.role === 'admin' || user.role === 'auditor') && ADMIN_NAV_GROUPS.map((group) => {
                        const visible = group.items.filter(item => (item.roles ?? ['admin']).includes(user.role));
                        if (visible.length === 0) return null;
                        return (
                            <SidebarGroup key={group.heading}>
                                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                                    {group.heading}
                                </div>
                                <SidebarGroupContent>
                                    <SidebarMenu>
                                        {visible.map((item) => (
                                            <SidebarMenuItem key={item.href}>
                                                <SidebarMenuButton
                                                    isActive={isActive(item.href)}
                                                    tooltip={item.label}
                                                    // External routes (Workbench) bypass Next's <Link>
                                                    // to avoid prefetching a non-existent route manifest.
                                                    render={item.external
                                                        ? <a href={item.href} />
                                                        : <Link href={item.href} />}
                                                >
                                                    <item.icon />
                                                    <span>{item.label}</span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </SidebarMenu>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        );
                    })}
                </SidebarContent>
                <SidebarFooter>
                    <div className="px-2 group-data-[collapsible=icon]:hidden">
                        <BuildBadge variant="stacked" />
                    </div>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <header className="grid h-12 shrink-0 items-center border-b px-3 sm:px-4 grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3">
                    {/* Left zone — mobile sidebar trigger (sheet drawer); empty
                        on desktop so the centered search stays optically centered. */}
                    <div className="flex items-center">
                        <SidebarTrigger className="md:hidden" />
                    </div>

                    {/* Centered primary affordance */}
                    <HeaderSearch className="w-full max-w-md justify-self-center" />

                    {/* Right utilities, grouped */}
                    <div className="flex items-center justify-end gap-1">
                        <NotificationBell />

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className={cn(
                                'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm',
                                'hover:bg-accent hover:text-accent-foreground transition-colors'
                            )}
                        >
                            <Avatar className="size-6">
                                {user.avatarUrl && (
                                    <AvatarImage
                                        src={user.avatarUrl}
                                        alt={user.name}
                                        // Google avatar CDN refuses requests that carry a Referer
                                        // pointing at localhost / third-party origins.
                                        referrerPolicy="no-referrer"
                                    />
                                )}
                                <AvatarFallback className="text-[10px]">
                                    {(user.name || '?').slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden sm:inline">{user.name}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                    Signed in as<br />
                                    <span className="text-foreground font-medium">{user.name}</span>
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

                <main className="flex-1 overflow-auto p-4 sm:p-6 pb-20 md:pb-6">
                    {children}
                </main>
            </SidebarInset>

            <MobileBottomNav />
            <SearchPalette />
        </SidebarProvider>
    );
}

/**
 * Floating chevron pill that hangs on the sidebar's right edge, ported from
 * v303's Sidebar. Circular 24px, sits half-off the boundary so it reads as
 * "the edge itself is the affordance" — Notion / OpenCTI / Linear convention.
 */
function SidebarEdgeToggle() {
    const { state, toggleSidebar } = useSidebar();
    const isOpen = state === 'expanded';
    const Icon = isOpen ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className={cn(
                // Anchor to the right edge of the sidebar, half-off so it
                // overlaps the boundary visually. `top-4` matches v303.
                'absolute top-4 -right-3 z-30',
                'inline-flex items-center justify-center size-6 rounded-full',
                'border bg-card text-muted-foreground shadow-sm',
                'hover:bg-accent hover:text-foreground hover:border-border/80',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
        >
            <Icon className="size-3.5" />
        </button>
    );
}
