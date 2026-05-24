'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { auth as authApi, ApiError } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

/** Max edge length of the resized avatar. 256 → ~30-60KB JPEG. */
const AVATAR_EDGE = 256;
/** Server limit is ~500KB. Resize to stay well under and avoid bandwidth waste. */
const JPEG_QUALITY = 0.85;

export default function ProfileSettingsPage() {
    const { user, refreshUser } = useAuth();
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [resized, setResized] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    if (!user) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
    }

    const handleFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please choose an image file');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Image too large', { description: 'Pick something under 10MB.' });
            return;
        }
        try {
            const dataUrl = await resizeToDataUrl(file, AVATAR_EDGE, JPEG_QUALITY);
            setPreview(URL.createObjectURL(file));
            setResized(dataUrl);
        } catch (err) {
            toast.error('Could not read image', { description: (err as Error).message });
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    };

    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = '';
    };

    const cancel = () => {
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        setResized(null);
    };

    const save = async () => {
        if (!resized) return;
        setBusy(true);
        try {
            await authApi.updateAvatar(user.id, resized);
            await refreshUser();
            cancel();
            toast.success('Profile picture updated');
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : (err as Error).message;
            toast.error('Upload failed', { description: msg });
        } finally {
            setBusy(false);
        }
    };

    const removeAvatar = async () => {
        if (!user.avatarUrl) return;
        setBusy(true);
        try {
            await authApi.updateAvatar(user.id, null);
            await refreshUser();
            toast.success('Profile picture removed');
        } catch (err) {
            toast.error('Remove failed', { description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Update your profile picture and review your account details.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Profile picture</CardTitle>
                    <CardDescription>
                        Used in the topbar and on threat-actor pages you contribute to.
                        Resized to {AVATAR_EDGE}×{AVATAR_EDGE} on upload.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-6">
                        <Avatar className="size-20 ring-1 ring-border">
                            {(preview ?? user.avatarUrl) && (
                                <AvatarImage
                                    src={preview ?? user.avatarUrl ?? undefined}
                                    alt={user.name}
                                    referrerPolicy="no-referrer"
                                />
                            )}
                            <AvatarFallback className="text-lg">
                                {(user.name || '?').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>

                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={onDrop}
                            onClick={() => fileRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                            className={[
                                'flex-1 rounded-md border-2 border-dashed px-6 py-8 text-center cursor-pointer',
                                'transition-colors',
                                dragOver
                                    ? 'border-primary/60 bg-primary/5'
                                    : 'border-border hover:border-border/80 hover:bg-accent/40',
                            ].join(' ')}
                        >
                            <Upload className="size-5 mx-auto mb-2 text-muted-foreground" />
                            <div className="text-sm">
                                <span className="font-medium">Click to upload</span>
                                <span className="text-muted-foreground"> or drag &amp; drop</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                                PNG, JPG, GIF — up to 10MB
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                onChange={onPick}
                                className="hidden"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                        <div>
                            {user.avatarUrl && !preview && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={removeAvatar}
                                    disabled={busy}
                                    className="text-muted-foreground hover:text-red-400"
                                >
                                    <Trash2 className="size-3.5" /> Remove current picture
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {preview && (
                                <>
                                    <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
                                        <X className="size-3.5" /> Cancel
                                    </Button>
                                    <Button size="sm" onClick={save} disabled={busy || !resized}>
                                        {busy ? 'Saving…' : 'Save'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Account</CardTitle>
                    <CardDescription>
                        Name and email come from your OAuth provider. Contact an administrator to change them.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Display name</Label>
                            <Input value={user.name} readOnly className="bg-muted/40" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Email</Label>
                            <Input value={user.email ?? '—'} readOnly className="bg-muted/40" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Role</Label>
                            <div>
                                <Badge variant="outline" className="font-mono text-[10px] uppercase">{user.role}</Badge>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Auth method</Label>
                            <div>
                                <Badge variant="outline" className="font-mono text-[10px] uppercase">{user.method}</Badge>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * Read a File, draw it onto a square canvas with center-crop + edge cap,
 * and return a base64 data URL. JPEG since avatars don't need alpha.
 */
async function resizeToDataUrl(file: File, edge: number, quality: number): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const sourceEdge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - sourceEdge) / 2;
    const sy = (bitmap.height - sourceEdge) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, sx, sy, sourceEdge, sourceEdge, 0, 0, edge, edge);
    bitmap.close?.();

    return canvas.toDataURL('image/jpeg', quality);
}
