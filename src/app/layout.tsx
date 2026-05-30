import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// Command Center types: IBM Plex Sans for UI, IBM Plex Mono for *all*
// data (hashes, IOC values, CVE IDs, counts, timestamps, cron, eyebrow
// labels). Geist was the prior body face — swapping it out for Plex Sans
// gives the analyst-console feel the design calls for. Weights pinned to
// the set we actually use so we don't ship faces nobody renders.
// next/font variable names are intentionally distinct from Tailwind's
// canonical `--font-sans` / `--font-mono` tokens to avoid a recursive
// `var(--font-sans)` lookup in globals.css. The `@theme inline` block
// in globals.css binds Tailwind's tokens → these loaded variables.
const ibmPlexSans = IBM_Plex_Sans({
    variable: '--font-plex-sans',
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
});
const ibmPlexMono = IBM_Plex_Mono({
    variable: '--font-plex-mono',
    subsets: ['latin'],
    weight: ['400', '500', '600'],
});
// Display face for .h-page / h1 — kept on its own CSS var so it can
// diverge from the body face later without chasing every consumer.
const ibmPlexDisplay = IBM_Plex_Sans({
    variable: '--font-display',
    subsets: ['latin'],
    weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
    title: 'Rinjani Analytics — Threat Intelligence',
    description: 'CTI platform: indicators, vulnerabilities, threat actors, automation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html
            lang="en"
            className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${ibmPlexDisplay.variable} h-full antialiased dark density-comfortable`}
            suppressHydrationWarning
        >
            <body className="min-h-full bg-background text-foreground font-sans">
                <AuthProvider>
                    <TooltipProvider>
                        {children}
                    </TooltipProvider>
                </AuthProvider>
                <Toaster position="top-right" richColors closeButton />
            </body>
        </html>
    );
}
