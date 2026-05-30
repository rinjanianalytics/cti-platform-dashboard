'use client';

/**
 * Tweaks — accent palette + density preferences, persisted to localStorage.
 *
 * Per the design brief, in production these are *defaults the user can
 * override* (not analyst-disruptive A/B switches). Implemented as a single
 * Context so any deeply-nested component can read/set without prop drilling.
 *
 * The actual UI lives in `<TweaksPanel/>`; this file owns state + the
 * <html>-level side effects (accent CSS vars, density class). Mounting
 * the provider is what installs the side effects, so it must wrap the
 * authenticated app shell.
 */

import {
    createContext, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from 'react';

export type AccentKey = 'signal-cyan' | 'electric-iris' | 'phosphor-amber';
export type DensityKey = 'comfortable' | 'compact';

interface Tweaks {
    accent: AccentKey;
    density: DensityKey;
    /** Severity left-edge tint on table rows (Phase 2; honoured as a stable
     *  preference now so the toggle's preference survives the rebuild). */
    sevtint: boolean;
    /** Attention rail visibility (Phase 3; same rationale). */
    rail: boolean;
}

interface TweaksAPI extends Tweaks {
    setAccent:  (a: AccentKey) => void;
    setDensity: (d: DensityKey) => void;
    setSevtint: (v: boolean) => void;
    setRail:    (v: boolean) => void;
}

const DEFAULTS: Tweaks = {
    accent:  'signal-cyan',
    density: 'comfortable',
    sevtint: true,
    rail:    true,
};

// Per the design system: accents are themeable; --brand-soft / --brand-line
// derive from --brand via relative-color syntax, so swapping the base accent
// cascades automatically. We set --brand + --brand-2 + --brand-dim; the
// alpha-derived tokens follow.
export const ACCENTS: Record<AccentKey, { label: string; base: string; hover: string; dim: string }> = {
    'signal-cyan': {
        label: 'Signal cyan',
        base:  'oklch(0.795 0.115 209)',
        hover: 'oklch(0.700 0.110 209)',
        dim:   'oklch(0.500 0.075 209)',
    },
    'electric-iris': {
        label: 'Electric iris',
        base:  'oklch(0.720 0.150 288)',
        hover: 'oklch(0.640 0.150 288)',
        dim:   'oklch(0.480 0.110 288)',
    },
    'phosphor-amber': {
        label: 'Phosphor amber',
        base:  'oklch(0.815 0.135 82)',
        hover: 'oklch(0.730 0.130 82)',
        dim:   'oklch(0.540 0.090 82)',
    },
};

const STORAGE_KEY = 'rinjani.tweaks.v1';

const TweaksContext = createContext<TweaksAPI | null>(null);

export function TweaksProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<Tweaks>(DEFAULTS);

    // Hydrate from localStorage on mount. SSR-safe: the read only runs in
    // the effect, so the server render uses DEFAULTS and the client patches
    // afterward — visually unaffected because the dark theme + comfortable
    // density match the server-side defaults.
    //
    // The setState-in-effect rule is correctly suppressed here: we're
    // synchronising with an external system (localStorage, not derivable
    // from props), which is the escape hatch React's docs leave open.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<Tweaks>;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setState(s => ({ ...s, ...parsed }));
        } catch {
            // Corrupted JSON / disabled storage: just keep defaults.
        }
    }, []);

    // Persist on every change.
    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Quota or private mode: no-op, preferences just don't survive reload.
        }
    }, [state]);

    // Side effects: paint accent CSS vars on <html>, toggle density class.
    useEffect(() => {
        const html = document.documentElement;
        const a = ACCENTS[state.accent];
        html.style.setProperty('--brand', a.base);
        html.style.setProperty('--brand-2', a.hover);
        html.style.setProperty('--brand-dim', a.dim);
    }, [state.accent]);

    useEffect(() => {
        const html = document.documentElement;
        html.classList.remove('density-compact', 'density-comfortable');
        html.classList.add(`density-${state.density}`);
    }, [state.density]);

    const api = useMemo<TweaksAPI>(() => ({
        ...state,
        setAccent:  a => setState(s => ({ ...s, accent: a })),
        setDensity: d => setState(s => ({ ...s, density: d })),
        setSevtint: v => setState(s => ({ ...s, sevtint: v })),
        setRail:    v => setState(s => ({ ...s, rail: v })),
    }), [state]);

    return <TweaksContext.Provider value={api}>{children}</TweaksContext.Provider>;
}

export function useTweaks() {
    const ctx = useContext(TweaksContext);
    if (!ctx) throw new Error('useTweaks() must be used inside <TweaksProvider>');
    return ctx;
}
