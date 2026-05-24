'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Radar, Shield, Users, Menu } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * Mobile bottom-tab navigation — hybrid pattern (Linear / GitHub mobile).
 *
 *   [Overview] [Indicators] [Vulns] [Actors] [More]
 *
 * The four most-used routes get a dedicated tab; everything else (Feeds,
 * Playbooks, Notifications, all admin pages) lives behind the "More" tab,
 * which opens the existing Sheet sidebar via `useSidebar().setOpenMobile`.
 *
 * Visible only below `md:` — desktop continues to use the persistent sidebar.
 *
 * Safe area: pads bottom with `env(safe-area-inset-bottom)` so the bar sits
 * above the iPhone home indicator without overlapping it.
 */

const TABS = [
    { href: '/',                label: 'Overview',  icon: LayoutDashboard },
    { href: '/iocs',            label: 'Indicators', icon: Radar },
    { href: '/vulnerabilities', label: 'Vulns',     icon: Shield },
    { href: '/actors',          label: 'Actors',    icon: Users },
] as const;

export function MobileBottomNav() {
    const pathname = usePathname();
    const { setOpenMobile, openMobile } = useSidebar();

    const isActive = (href: string) =>
        href === '/' ? pathname === '/' : pathname.startsWith(href);

    return (
        <nav
            aria-label="Primary navigation"
            className={cn(
                'md:hidden fixed inset-x-0 bottom-0 z-40',
                'border-t border-border bg-card/95 backdrop-blur-md',
                'pb-[env(safe-area-inset-bottom)]',
            )}
        >
            <ul className="grid grid-cols-5 h-14">
                {TABS.map((tab) => {
                    const active = isActive(tab.href);
                    return (
                        <li key={tab.href}>
                            <Link
                                href={tab.href}
                                onClick={() => { if (openMobile) setOpenMobile(false); }}
                                className={cn(
                                    'relative h-full flex flex-col items-center justify-center gap-0.5',
                                    'text-[10px] font-medium transition-colors',
                                    active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                                )}
                                aria-current={active ? 'page' : undefined}
                            >
                                {active && (
                                    <span
                                        aria-hidden
                                        className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-10 rounded-b-full bg-brand"
                                    />
                                )}
                                <tab.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                                <span className="leading-none">{tab.label}</span>
                            </Link>
                        </li>
                    );
                })}
                <li>
                    <button
                        type="button"
                        onClick={() => setOpenMobile(true)}
                        aria-label="Open menu"
                        aria-expanded={openMobile}
                        className={cn(
                            'w-full h-full flex flex-col items-center justify-center gap-0.5',
                            'text-[10px] font-medium transition-colors',
                            openMobile
                                ? 'text-brand'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Menu className="size-5" strokeWidth={openMobile ? 2.2 : 1.8} />
                        <span className="leading-none">More</span>
                    </button>
                </li>
            </ul>
        </nav>
    );
}
