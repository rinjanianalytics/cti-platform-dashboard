'use client';

/**
 * Entity drawer context — global "open this entity in the side drawer"
 * channel so any table row, any related-pivot link, or even the search
 * palette can pop the drawer without prop-drilling state down through
 * the layout.
 *
 * Mounted once at the (app)/layout root via <EntityDrawerProvider>;
 * <EntityDrawer/> reads from this context to render. Closing is on
 * Esc, backdrop click, or the X button — provider exposes `close()`
 * for action handlers that want to dismiss after success.
 */

import {
    createContext, useCallback, useContext, useMemo, useState,
    type ReactNode,
} from 'react';

export type EntityKind = 'ioc' | 'cve' | 'actor';

export interface EntityTarget {
    type: EntityKind;
    /** For IOC: id (UUID) or value. CVE: cveId (CVE-YYYY-NNNN). Actor: id or name. */
    id: string;
}

interface DrawerAPI {
    current: EntityTarget | null;
    open: (target: EntityTarget) => void;
    close: () => void;
}

const Ctx = createContext<DrawerAPI | null>(null);

export function EntityDrawerProvider({ children }: { children: ReactNode }) {
    const [current, setCurrent] = useState<EntityTarget | null>(null);
    const open = useCallback((target: EntityTarget) => setCurrent(target), []);
    const close = useCallback(() => setCurrent(null), []);
    const api = useMemo<DrawerAPI>(() => ({ current, open, close }), [current, open, close]);
    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useEntityDrawer() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useEntityDrawer() must be used inside <EntityDrawerProvider>');
    return ctx;
}
