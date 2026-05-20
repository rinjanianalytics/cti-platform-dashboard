'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { auth as authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { LoginLockup } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

export default function LoginPage() {
    const { login } = useAuth();
    const [apiKey, setApiKey] = useState('');
    const [busy, setBusy] = useState(false);

    const params = useSearchParams();
    const { data: providers } = useSWR('auth:oauth-providers', () => authApi.oauthProviders(), {
        // Provider availability rarely changes; cache aggressively.
        revalidateOnFocus: false,
        dedupingInterval: 60_000,
    });

    // Surface OAuth callback errors from the URL exactly once.
    useEffect(() => {
        const err = params.get('error');
        if (!err) return;
        const human = err === 'invalid_state'
            ? 'OAuth state mismatch — please try again.'
            : err === 'oauth_failed'
                ? 'Sign-in failed — check the API logs and provider configuration.'
                : `Sign-in error: ${err}`;
        toast.error('OAuth sign-in failed', { description: human });
    }, [params]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim()) return;
        setBusy(true);
        try {
            await login(apiKey.trim());
            toast.success('Welcome', { description: 'Loading platform…' });
        } catch (err) {
            toast.error('Sign in failed', { description: (err as Error).message });
            setBusy(false);
        }
    };

    const anyProvider = providers && (providers.google || providers.github);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
            <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-70 pointer-events-none"
                style={{
                    background:
                        'radial-gradient(ellipse 60% 100% at 50% 0%, color-mix(in oklch, var(--brand) 16%, transparent), transparent 70%)',
                }}
            />

            <div className="w-full max-w-sm relative">
                <LoginLockup className="mb-8" />

                <Card>
                    <CardHeader>
                        <CardTitle>Sign in</CardTitle>
                        <CardDescription>
                            Use Google or GitHub for human access, or paste an API key for service-to-service automation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {anyProvider && (
                            <>
                                <div className="space-y-2">
                                    {providers!.google && (
                                        <OAuthButton
                                            provider="google"
                                            label="Continue with Google"
                                            icon={<GoogleIcon className="size-4" />}
                                        />
                                    )}
                                    {providers!.github && (
                                        <OAuthButton
                                            provider="github"
                                            label="Continue with GitHub"
                                            icon={<GitHubIcon className="size-4" />}
                                        />
                                    )}
                                </div>

                                <Divider label="or" />
                            </>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="api-key">API key</Label>
                                <Input
                                    id="api-key"
                                    type="password"
                                    placeholder="Paste your API key"
                                    autoComplete="current-password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    autoFocus={!anyProvider}
                                />
                            </div>
                            <Button type="submit" variant="outline" className="w-full" disabled={busy || !apiKey.trim()}>
                                {busy ? 'Signing in…' : 'Sign in with API key'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-[10px] text-muted-foreground text-center mt-6 font-mono uppercase tracking-wider">
                    v304 · cti platform
                </p>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function OAuthButton({
    provider, label, icon,
}: { provider: 'google' | 'github'; label: string; icon: React.ReactNode }) {
    return (
        <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-3 font-medium"
            onClick={() => { window.location.href = authApi.oauthStartUrl(provider); }}
        >
            {icon}
            {label}
        </Button>
    );
}

function Divider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="flex-1 h-px bg-border" />
            <span className={cn('text-[10px] font-medium uppercase tracking-wider text-muted-foreground')}>
                {label}
            </span>
            <span className="flex-1 h-px bg-border" />
        </div>
    );
}

/* Brand-accurate marks, single colour so they pick up `currentColor`. */
function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
    );
}

function GitHubIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
        </svg>
    );
}
