'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
    SidebarProvider, Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem,
    SidebarInset, SidebarTrigger, SidebarGroup, SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    LayoutDashboard, Radar, Shield, Users, Database, Workflow,
    Bell, LogOut, ShieldCheck,
} from 'lucide-react';

const NAV = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/iocs', label: 'Indicators', icon: Radar },
    { href: '/vulnerabilities', label: 'Vulnerabilities', icon: Shield },
    { href: '/actors', label: 'Threat actors', icon: Users },
    { href: '/feeds', label: 'Feeds', icon: Database },
    { href: '/playbooks', label: 'Playbooks', icon: Workflow },
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
                <SidebarHeader>
                    <div className="flex items-center gap-2 px-2 py-1">
                        <div className="size-6 rounded-md bg-primary flex items-center justify-center">
                            <ShieldCheck className="size-3.5 text-primary-foreground" />
                        </div>
                        <span className="font-semibold text-sm tracking-tight group-data-[collapsible=icon]:hidden">
                            Rinjani
                        </span>
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
                </SidebarContent>
                <SidebarFooter>
                    <div className="text-[10px] text-muted-foreground px-2 group-data-[collapsible=icon]:hidden">
                        v304 · CTI
                    </div>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />

                    {/* Spacer so utilities go right */}
                    <div className="flex-1" />

                    <Button size="sm" variant="ghost" className="size-8 p-0">
                        <Bell className="size-4" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className={cn(
                                'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm',
                                'hover:bg-accent hover:text-accent-foreground transition-colors'
                            )}
                        >
                            <Avatar className="size-6">
                                <AvatarFallback className="text-[10px]">
                                    {(user.name || '?').slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden sm:inline">{user.name}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                Signed in as<br />
                                <span className="text-foreground font-medium">{user.name}</span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={logout}>
                                <LogOut className="size-3.5" /> Sign out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
