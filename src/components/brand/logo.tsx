import { cn } from '@/lib/utils';

/**
 * Rinjani brand mark — ported from v303. Two interlocking curves in teal
 * (#009685). Lives at /logo.svg for browsers and as <Image>-friendly path.
 *
 * Scales cleanly from 18×18 (sidebar collapsed) through 28×28 (sidebar) to
 * 56×56 (login lockup).
 */
export function LogoMark({ className, size = 28 }: {
    className?: string;
    size?: number;
}) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src="/logo.svg"
            alt="Rinjani"
            width={size}
            height={size}
            className={cn('shrink-0 select-none', className)}
        />
    );
}

/**
 * Sidebar lockup — small mark + mixed-case wordmark.
 * Use `<LoginLockup>` for the auth screen — same brand, different scale.
 */
export function Logo({ className, size = 28, showWordmark = true }: {
    className?: string;
    size?: number;
    showWordmark?: boolean;
}) {
    return (
        <span className={cn('inline-flex items-center gap-3 select-none', className)}>
            <LogoMark size={size} />
            {showWordmark && (
                <span className="font-display text-sm font-semibold tracking-tight text-foreground">
                    Rinjani
                </span>
            )}
        </span>
    );
}

/**
 * Auth-screen lockup — larger mark with the uppercase "RINJANI" wordmark
 * and the "Command Center" tagline used by v303's auth layout.
 */
export function LoginLockup({ className }: { className?: string }) {
    return (
        <div className={cn('flex items-center gap-3', className)}>
            <LogoMark size={44} className="rounded-lg" />
            <div className="leading-none">
                <p className="font-display text-2xl font-extrabold uppercase tracking-[0.12em] text-foreground">
                    Rinjani
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                    Command Center
                </p>
            </div>
        </div>
    );
}
