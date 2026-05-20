'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();
    const [apiKey, setApiKey] = useState('');
    const [busy, setBusy] = useState(false);

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

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-2 mb-6">
                    <div className="size-7 rounded-md bg-primary flex items-center justify-center">
                        <ShieldCheck className="size-4 text-primary-foreground" />
                    </div>
                    <span className="font-semibold tracking-tight">Rinjani</span>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Sign in</CardTitle>
                        <CardDescription>
                            Use the admin API key issued by your operator to access the platform.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="api-key">API key</Label>
                                <Input
                                    id="api-key"
                                    type="password"
                                    placeholder="Paste your API key"
                                    autoComplete="current-password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={busy || !apiKey.trim()}>
                                {busy ? 'Signing in…' : 'Sign in'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground text-center mt-6">
                    v304 · CTI platform
                </p>
            </div>
        </div>
    );
}
