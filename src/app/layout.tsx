import type { Metadata } from 'next';
import { Geist, Geist_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
// Display face for h1/h2 — IBM Plex Sans carries the technical / analyst-console
// feel without the costs of a paid face. Loaded with the weights we actually use.
const ibmPlex = IBM_Plex_Sans({
    variable: '--font-display',
    subsets: ['latin'],
    weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
    title: 'Rinjani — Threat Intelligence',
    description: 'CTI platform: indicators, vulnerabilities, threat actors, automation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} ${ibmPlex.variable} h-full antialiased dark`}
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
