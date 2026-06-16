'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
    SidebarProvider, Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem,
    SidebarInset, SidebarGroup, SidebarGroupContent,
    useSidebar,
} from '@/components/ui/sidebar';
import {
    LayoutDashboard, Database, Radar, Shield, Users, Network,
    ServerCog, BookOpen, Workflow, Boxes, CalendarClock,
    UsersRound, ScrollText, ChevronLeft, ChevronRight,
    Globe2, AlertTriangle, FileCode2, AtSign, KeyRound, Activity, Spade, EyeOff,
    Cable, Sparkles,
} from 'lucide-react';
import { SearchPalette } from '@/components/search-palette';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { Logo } from '@/components/brand/logo';
import { BuildBadge } from '@/components/build-badge';
import { TweaksProvider } from '@/components/cc/tweaks';
import { Topbar } from '@/components/cc/topbar';
import { EntityDrawerProvider, EntityDrawer } from '@/components/cc/entity-drawer';
import { AttentionRail } from '@/components/cc/attention-rail';

/**
 * Command Center sidebar — four semantic groups instead of one flat list.
 *
 *   MONITOR     — "is anything on fire right now?"
 *   INVESTIGATE — "I have a question, where do I dig?"
 *   OPERATE     — "the platform itself needs attention"
 *   ADMIN       — "configuration / governance"
 *
 * Routes are intentionally NOT renamed. The design uses /indicators, /command,
 * etc., but the user opted to keep our existing paths so external links don't
 * break and there are no redirect hops.
 *
 * `roles` lists which user roles see the entry; absent = visible to all
 * authenticated users; `['admin']` = admins only; etc. `external: true`
 * marks routes served outside Next.js (Workbench is reverse-proxied to
 * the API) — plain <a>, since Next's <Link> would prefetch a non-existent
 * route manifest.
 */
type NavItem = {
    href: string;
    label: string;
    icon: typeof ServerCog;
    roles?: string[];
    external?: boolean;
};

const NAV_GROUPS: Array<{ heading: string; items: NavItem[] }> = [
    {
        heading: 'Monitor',
        items: [
            { href: '/',      label: 'Command', icon: LayoutDashboard },
            { href: '/feeds', label: 'Feeds',   icon: Database },
        ],
    },
    {
        heading: 'Investigate',
        items: [
            { href: '/hunt',            label: 'Hunt',            icon: Sparkles },
            { href: '/iocs',            label: 'Indicators',      icon: Radar    },
            { href: '/vulnerabilities', label: 'Vulnerabilities', icon: Shield   },
            { href: '/actors',          label: 'Threat actors',   icon: Users    },
            { href: '/ttp-changes',     label: 'TTP changelog',   icon: Activity },
            { href: '/graph',           label: 'Graph',           icon: Network  },
        ],
    },
    {
        heading: 'Surface',
        items: [
            { href: '/brand/domains',       label: 'Brand watchlist',   icon: Globe2         },
            { href: '/brand/alerts',        label: 'Brand alerts',      icon: AlertTriangle  },
            { href: '/paste/watchterms',    label: 'Paste watchterms',  icon: AtSign         },
            { href: '/paste/mentions',      label: 'Paste mentions',    icon: FileCode2      },
            { href: '/data-breaches',       label: 'Data breaches',     icon: KeyRound       },
            { href: '/dark-web/watchterms', label: 'Dark-web terms',    icon: EyeOff         },
            { href: '/dark-web/mentions',   label: 'Dark-web mentions', icon: Spade          },
        ],
    },
    {
        heading: 'Operate',
        items: [
            { href: '/admin/services',  label: 'Services',  icon: ServerCog, roles: ['admin', 'auditor'] },
            { href: '/admin/runbook',   label: 'Runbook',   icon: BookOpen,  roles: ['admin', 'auditor'] },
            { href: '/playbooks',       label: 'Playbooks', icon: Workflow },
            // Workbench is iframe-blocked (X-Frame-Options) and reverse-
            // proxied through the API; plain <a> so the browser does a
            // hard navigation and Next doesn't try to prefetch a manifest
            // that doesn't exist.
            { href: '/admin/workbench', label: 'Workbench', icon: Boxes, roles: ['admin'], external: true },
        ],
    },
    {
        heading: 'Admin',
        items: [
            { href: '/admin/feeds',      label: 'Feed config', icon: Database,      roles: ['admin', 'auditor'] },
            { href: '/admin/connectors', label: 'Connectors',  icon: Cable,         roles: ['admin', 'analyst', 'developer'] },
            { href: '/admin/schedules',  label: 'Schedules',   icon: CalendarClock, roles: ['admin'] },
            { href: '/admin/users',     label: 'Users',       icon: UsersRound,    roles: ['admin'] },
            { href: '/admin/audit',     label: 'Audit log',   icon: ScrollText,    roles: ['admin', 'auditor'] },
        ],
    },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, isLoading } = useAuth();

    const isActive = (href: string) =>
        href === '/' ? pathname === '/' : pathname.startsWith(href);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="size-2 rounded-full bg-muted-foreground animate-pulse" />
            </div>
        );
    }

    if (!user) return null; // AuthProvider redirects

    return (
        <TweaksProvider>
            <EntityDrawerProvider>
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
                        {NAV_GROUPS.map((group) => {
                            const visible = group.items.filter(item =>
                                !item.roles || item.roles.includes(user.role),
                            );
                            if (visible.length === 0) return null;
                            return (
                                <SidebarGroup key={group.heading}>
                                    <div className="eyebrow px-3 py-1 group-data-[collapsible=icon]:hidden">
                                        {group.heading}
                                    </div>
                                    <SidebarGroupContent>
                                        <SidebarMenu>
                                            {visible.map((item) => (
                                                <SidebarMenuItem key={item.href}>
                                                    <SidebarMenuButton
                                                        isActive={isActive(item.href)}
                                                        tooltip={item.label}
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
                    <Topbar />
                    <div className="flex flex-1 min-h-0">
                        <main className="flex-1 overflow-auto p-4 sm:p-6 pb-20 md:pb-6 min-w-0">
                            {children}
                        </main>
                        <AttentionRail />
                    </div>
                </SidebarInset>

                <MobileBottomNav />
                <SearchPalette />
            </SidebarProvider>
            <EntityDrawer />
            </EntityDrawerProvider>
        </TweaksProvider>
    );
}

/**
 * Floating chevron pill that hangs on the sidebar's right edge — ported from
 * v303. Circular 24px, sits half-off the boundary so it reads as "the edge
 * itself is the affordance" (Notion / Linear convention).
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
