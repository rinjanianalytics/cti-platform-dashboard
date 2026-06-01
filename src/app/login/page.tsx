'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { auth as authApi } from '@/lib/api';
import { toast } from 'sonner';
import { BuildBadge } from '@/components/build-badge';
import { LogoMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * Login — two-pane "command identity" + "secure access" layout from the
 * Rinjani Admin Dashboard refactor handoff.
 *
 * Left pane: brand identity, ambient grid + node graph, live status strip
 * (indicators / feeds / UTC clock). Hidden under 920px.
 *
 * Right pane: OAuth providers (where available) → divider → API-key path.
 * Email/password from the handoff is collapsed into the API-key input,
 * since the backend authenticates with OAuth + API keys (no password).
 *
 * Brand discipline: every `var(--accent)` in the handoff CSS maps to
 * `var(--brand)` here so the page picks up the existing Rinjani teal,
 * not the handoff's cyan.
 */

function OAuthRedirectToasts() {
    const params = useSearchParams();
    useEffect(() => {
        const err = params.get('error');
        const reason = params.get('reason');

        if (reason === 'expired') {
            toast.info('Session expired', { description: 'Please sign in again.' });
            return;
        }

        if (!err) return;
        const human = err === 'invalid_state'
            ? 'OAuth state mismatch — please try again.'
            : err === 'oauth_failed'
                ? 'Sign-in failed — check the API logs and provider configuration.'
                : `Sign-in error: ${err}`;
        toast.error('OAuth sign-in failed', { description: human });
    }, [params]);
    return null;
}

export default function LoginPage() {
    return (
        <div
            className={cn(
                'h-screen overflow-hidden',
                'grid grid-cols-1',
                'min-[920px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]',
            )}
            style={{ background: 'var(--bg-0)' }}
        >
            <Suspense fallback={null}>
                <OAuthRedirectToasts />
            </Suspense>

            <BrandPanel />
            <FormPanel />
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  LEFT PANE — command identity                                              */
/* -------------------------------------------------------------------------- */

function BrandPanel() {
    return (
        <section
            className={cn(
                'relative overflow-hidden flex-col justify-between',
                'hidden min-[920px]:flex',
            )}
            style={{
                padding: '40px 44px',
                borderRight: '1px solid var(--line-soft)',
                background:
                    'radial-gradient(120% 90% at 18% 0%, oklch(0.225 0.022 232) 0%, transparent 55%),' +
                    'radial-gradient(100% 80% at 100% 100%, oklch(0.205 0.020 256) 0%, transparent 50%),' +
                    'var(--bg-0)',
            }}
        >
            {/* dotted grid wash, masked to the upper-left */}
            <div
                aria-hidden
                className="absolute inset-0"
                style={{
                    backgroundImage:
                        'linear-gradient(var(--line-soft) 1px, transparent 1px),' +
                        'linear-gradient(90deg, var(--line-soft) 1px, transparent 1px)',
                    backgroundSize: '46px 46px',
                    maskImage: 'radial-gradient(110% 90% at 30% 35%, #000 0%, transparent 75%)',
                    WebkitMaskImage:
                        'radial-gradient(110% 90% at 30% 35%, #000 0%, transparent 75%)',
                    opacity: 0.4,
                }}
            />

            {/* ambient node graph */}
            <svg
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                viewBox="0 0 600 800"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
            >
                <g
                    stroke="color-mix(in oklch, var(--brand) 22%, transparent)"
                    strokeWidth="1"
                >
                    <line x1="120" y1="180" x2="300" y2="120" />
                    <line x1="300" y1="120" x2="430" y2="260" />
                    <line x1="120" y1="180" x2="210" y2="360" />
                    <line x1="430" y1="260" x2="500" y2="430" />
                    <line x1="210" y1="360" x2="430" y2="260" />
                    <line x1="210" y1="360" x2="330" y2="540" />
                </g>
                <g fill="color-mix(in oklch, var(--brand) 55%, transparent)">
                    <circle cx="120" cy="180" r="4" />
                    <circle cx="430" cy="260" r="5" />
                    <circle cx="210" cy="360" r="3.5" />
                    <circle cx="330" cy="540" r="3.5" />
                </g>
                <g fill="var(--brand)">
                    <circle cx="300" cy="120" r="5.5">
                        <animate
                            attributeName="opacity"
                            values="1;0.35;1"
                            dur="2.6s"
                            repeatCount="indefinite"
                        />
                    </circle>
                    <circle cx="500" cy="430" r="4">
                        <animate
                            attributeName="opacity"
                            values="0.4;1;0.4"
                            dur="3.2s"
                            repeatCount="indefinite"
                        />
                    </circle>
                </g>
            </svg>

            {/* top: brand lockup */}
            <div className="relative flex items-center gap-3">
                <LogoMark size={38} className="rounded-[10px]" />
                <span className="text-[18px] font-semibold tracking-tight">
                    Rinjani{' '}
                    <span className="font-normal" style={{ color: 'var(--text-3)' }}>
                        Analytics
                    </span>
                </span>
            </div>

            {/* middle: positioning */}
            <div className="relative max-w-[460px]">
                <div
                    className="inline-flex items-center gap-2.5 font-mono uppercase mb-[18px]"
                    style={{
                        fontSize: '11px',
                        letterSpacing: '0.18em',
                        color: 'var(--brand)',
                    }}
                >
                    <span
                        aria-hidden
                        className="inline-block rounded-full"
                        style={{
                            width: 7,
                            height: 7,
                            background: 'var(--ok)',
                            boxShadow: '0 0 8px var(--ok)',
                            animation: 'rinjani-pulse 1.8s ease-in-out infinite',
                        }}
                    />
                    Threat Intelligence Command Center
                </div>
                <h1
                    className="font-semibold m-0 mb-[18px]"
                    style={{
                        fontSize: 40,
                        lineHeight: 1.1,
                        letterSpacing: '-0.025em',
                        textWrap: 'balance',
                    }}
                >
                    See the threat
                    <br />
                    <em className="not-italic" style={{ color: 'var(--brand)' }}>
                        before
                    </em>{' '}
                    it moves.
                </h1>
                <p
                    className="m-0"
                    style={{
                        fontSize: 14.5,
                        color: 'var(--text-2)',
                        lineHeight: 1.6,
                        maxWidth: 420,
                    }}
                >
                    Unified indicators, vulnerabilities, and adversary tracking —
                    correlated across every feed, monitored around the clock.
                </p>
            </div>

            {/* bottom: live status strip */}
            <StatusStrip />

            <style jsx>{`
                @keyframes rinjani-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.35; }
                }
            `}</style>
        </section>
    );
}

function StatusStrip() {
    const clock = useUtcClock();

    return (
        <div
            className="relative flex overflow-hidden"
            style={{
                border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-lg)',
                background: 'color-mix(in oklch, var(--bg-1) 60%, transparent)',
                backdropFilter: 'blur(4px)',
            }}
        >
            <StatCell label="Indicators" value="30,633" />
            <StatCell
                label="Active feeds"
                value={
                    <>
                        <span
                            aria-hidden
                            className="inline-block rounded-full"
                            style={{
                                width: 7,
                                height: 7,
                                background: 'var(--ok)',
                                boxShadow: '0 0 8px var(--ok)',
                                animation: 'rinjani-pulse 1.8s ease-in-out infinite',
                            }}
                        />
                        9
                    </>
                }
            />
            <StatCell label="Platform time" value={clock} mono last />
        </div>
    );
}

function StatCell({
    label,
    value,
    last,
}: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
    last?: boolean;
}) {
    return (
        <div
            className="flex-1"
            style={{
                padding: '15px 18px',
                borderRight: last ? 'none' : '1px solid var(--line-soft)',
            }}
        >
            <div
                className="font-mono uppercase"
                style={{
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    color: 'var(--text-3)',
                    marginBottom: 7,
                }}
            >
                {label}
            </div>
            <div
                className="font-mono font-semibold flex items-center gap-2"
                style={{
                    fontSize: 19,
                    letterSpacing: '-0.01em',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {value}
            </div>
        </div>
    );
}

function useUtcClock() {
    const [clock, setClock] = useState('00:00:00');
    useEffect(() => {
        const tick = () => setClock(new Date().toISOString().slice(11, 19));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
    return clock;
}

/* -------------------------------------------------------------------------- */
/*  RIGHT PANE — secure access                                                */
/* -------------------------------------------------------------------------- */

function FormPanel() {
    const { login } = useAuth();
    const [apiKey, setApiKey] = useState('');
    const [reveal, setReveal] = useState(false);
    const [busy, setBusy] = useState(false);

    const { data: providers } = useSWR(
        'auth:oauth-providers',
        () => authApi.oauthProviders(),
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    );
    const anyProvider = providers && (providers.google || providers.github);

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

    const env = process.env.NODE_ENV === 'production' ? 'cti-platform-prod' : 'cti-platform-dev';

    return (
        <section className="flex flex-col overflow-y-auto" style={{ padding: '40px 48px' }}>
            <div className="flex items-center justify-between">
                <span
                    className="font-mono"
                    style={{
                        fontSize: 11,
                        color: 'var(--text-4)',
                        letterSpacing: '0.04em',
                    }}
                >
                    SECURE ACCESS
                </span>
                <span
                    className="inline-flex items-center gap-2 font-mono"
                    style={{
                        height: 28,
                        padding: '0 11px',
                        border: '1px solid var(--line-soft)',
                        borderRadius: 999,
                        background: 'var(--bg-1)',
                        fontSize: 11,
                        color: 'var(--text-3)',
                    }}
                >
                    <span
                        aria-hidden
                        className="inline-block rounded-full"
                        style={{
                            width: 7,
                            height: 7,
                            background: 'var(--ok)',
                            boxShadow: '0 0 8px var(--ok)',
                        }}
                    />
                    {env}
                </span>
            </div>

            <div className="flex-1 flex flex-col justify-center">
                <div className="w-full mx-auto" style={{ maxWidth: 384 }}>
                    <h2
                        className="font-semibold m-0"
                        style={{
                            fontSize: 26,
                            letterSpacing: '-0.015em',
                            marginBottom: 7,
                        }}
                    >
                        Sign in
                    </h2>
                    <p
                        className="m-0"
                        style={{
                            fontSize: 13.5,
                            color: 'var(--text-3)',
                            marginBottom: 30,
                        }}
                    >
                        Authenticate to access the analyst console.
                    </p>

                    {anyProvider && (
                        <>
                            <div className="space-y-2.5">
                                {providers!.google && (
                                    <SSOButton
                                        onClick={() => {
                                            window.location.href = authApi.oauthStartUrl('google');
                                        }}
                                        icon={<GoogleIcon />}
                                        label="Continue with Google"
                                    />
                                )}
                                {providers!.github && (
                                    <SSOButton
                                        onClick={() => {
                                            window.location.href = authApi.oauthStartUrl('github');
                                        }}
                                        icon={<GitHubIcon />}
                                        label="Continue with GitHub"
                                    />
                                )}
                            </div>
                            <Divider />
                        </>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 17 }}>
                            <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                                <label
                                    htmlFor="api-key"
                                    style={{
                                        fontSize: 12.5,
                                        fontWeight: 500,
                                        color: 'var(--text-2)',
                                    }}
                                >
                                    API key
                                </label>
                                <a
                                    href="https://github.com/rinjanianalytics"
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 12, color: 'var(--brand)' }}
                                    className="hover:underline"
                                >
                                    Issue one?
                                </a>
                            </div>

                            <div className="relative">
                                <KeyIcon />
                                <input
                                    id="api-key"
                                    type={reveal ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="rnj_••••••••••••••••••••"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    required
                                    className="login-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => setReveal((v) => !v)}
                                    aria-label={reveal ? 'Hide API key' : 'Show API key'}
                                    className="reveal-btn"
                                >
                                    {reveal ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={busy || !apiKey.trim()}
                            className="signin-btn"
                        >
                            {busy ? (
                                <>
                                    <Spinner />
                                    <span>Authenticating…</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign in</span>
                                    <ArrowIcon />
                                </>
                            )}
                        </button>
                    </form>

                    <div
                        className="flex gap-[11px]"
                        style={{
                            marginTop: 28,
                            padding: '13px 14px',
                            borderRadius: 'var(--r)',
                            background: 'var(--bg-1)',
                            border: '1px solid var(--line-soft)',
                        }}
                    >
                        <ShieldIcon />
                        <p
                            className="m-0"
                            style={{
                                fontSize: 11.5,
                                color: 'var(--text-3)',
                                lineHeight: 1.55,
                            }}
                        >
                            Authorized personnel only. All access is logged and
                            monitored. Unauthorized use is prohibited.
                        </p>
                    </div>
                </div>
            </div>

            <div
                className="flex items-center justify-between"
                style={{
                    fontSize: 11.5,
                    color: 'var(--text-4)',
                    paddingTop: 24,
                }}
            >
                <span>© {new Date().getFullYear()} Rinjani Analytics</span>
                <span className="flex gap-[18px] items-center">
                    <a
                        href="https://status.rinjani.io"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--text-3)', textDecoration: 'none' }}
                        className="hover:text-[var(--text-2)]"
                    >
                        Status
                    </a>
                    <a
                        href="/security"
                        style={{ color: 'var(--text-3)', textDecoration: 'none' }}
                        className="hover:text-[var(--text-2)]"
                    >
                        Security
                    </a>
                    <BuildBadge />
                </span>
            </div>

            <style jsx>{`
                .login-input {
                    width: 100%;
                    height: 46px;
                    background: var(--bg-1);
                    border: 1px solid var(--line);
                    border-radius: var(--r);
                    color: var(--text);
                    font-family: var(--font-sans);
                    font-size: 14px;
                    padding: 0 14px 0 40px;
                    transition: border-color 0.14s, box-shadow 0.14s;
                    outline: none;
                }
                .login-input::placeholder { color: var(--text-4); }
                .login-input:focus {
                    border-color: var(--brand);
                    box-shadow: 0 0 0 3px var(--brand-soft);
                }
                .reveal-btn {
                    position: absolute;
                    right: 6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 34px;
                    height: 34px;
                    border: 0;
                    background: transparent;
                    color: var(--text-3);
                    cursor: pointer;
                    border-radius: var(--r-sm);
                    display: grid;
                    place-items: center;
                }
                .reveal-btn:hover {
                    color: var(--text);
                    background: var(--bg-3);
                }
                .signin-btn {
                    width: 100%;
                    height: 46px;
                    border: 0;
                    border-radius: var(--r);
                    cursor: pointer;
                    background: var(--brand);
                    color: var(--brand-fg);
                    font-family: var(--font-sans);
                    font-size: 14px;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 9px;
                    white-space: nowrap;
                    transition: background 0.14s, opacity 0.14s;
                }
                .signin-btn:hover:not(:disabled) { background: var(--brand-2); }
                .signin-btn:disabled { opacity: 0.7; cursor: default; }
            `}</style>
        </section>
    );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function SSOButton({
    icon,
    label,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'w-full inline-flex items-center justify-center gap-2.5',
                'transition-[background-color,border-color] duration-150',
            )}
            style={{
                height: 46,
                border: '1px solid var(--line)',
                borderRadius: 'var(--r)',
                background: 'var(--bg-1)',
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-1)')}
        >
            {icon}
            {label}
        </button>
    );
}

function Divider() {
    return (
        <div
            className="flex items-center gap-3.5"
            style={{ margin: '22px 0', color: 'var(--text-4)' }}
        >
            <span className="flex-1 h-px" style={{ background: 'var(--line-soft)' }} />
            <span
                className="font-mono uppercase"
                style={{ fontSize: 10.5, letterSpacing: '0.12em' }}
            >
                or
            </span>
            <span className="flex-1 h-px" style={{ background: 'var(--line-soft)' }} />
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Icons (inline SVG — no extra runtime cost, easy to restyle)               */
/* -------------------------------------------------------------------------- */

function KeyIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-3)',
                pointerEvents: 'none',
            }}
        >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

function EyeIcon() {
    return (
        <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
            <path d="M9.4 5.2A9.4 9.4 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3 3.9" />
            <path d="M6.1 6.1A16 16 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 3.2-.6" />
        </svg>
    );
}

function ArrowIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{ color: 'var(--text-3)', flex: 'none', marginTop: 1 }}
        >
            <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
        </svg>
    );
}

function Spinner() {
    return (
        <span
            aria-hidden
            style={{
                width: 16,
                height: 16,
                border: '2px solid oklch(0.180 0.020 240 / 0.35)',
                borderTopColor: 'var(--brand-fg)',
                borderRadius: '50%',
                animation: 'rinjani-spin 0.7s linear infinite',
                display: 'inline-block',
            }}
        >
            <style jsx>{`
                @keyframes rinjani-spin { to { transform: rotate(360deg); } }
            `}</style>
        </span>
    );
}

function GoogleIcon() {
    return (
        <svg viewBox="0 0 18 18" width={18} height={18} aria-hidden>
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
    );
}

function GitHubIcon() {
    return (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    );
}
