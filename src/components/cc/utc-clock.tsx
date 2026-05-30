'use client';

/**
 * <UTCClock> — ticking UTC HH:MM:SS display next to a pulsing ok-dot.
 * Updates every 1s. Mono, tabular nums, --text-2 colour.
 *
 * SSR note: we render an em-dash placeholder until first mount so the
 * server and first client paint match (no hydration mismatch from
 * Date.now()).
 */

import { useEffect, useState } from 'react';
import { StatusDot } from './status-dot';

function fmt(d: Date): string {
    return d.toISOString().slice(11, 19);
}

export function UTCClock() {
    const [now, setNow] = useState<string | null>(null);

    useEffect(() => {
        // Bootstrap the visible time on first mount, then tick every 1s. The
        // setState-in-effect rule is correctly suppressed here: we're
        // synchronising with an external clock (the OS, not derivable from
        // props), which is exactly the escape hatch React's docs call out.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNow(fmt(new Date()));
        const id = setInterval(() => setNow(fmt(new Date())), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="flex items-center gap-2 text-text-2">
            <StatusDot status="ok" live />
            <span className="font-mono text-[12px] tnum tracking-wider">
                {now ?? '—:—:—'}
            </span>
            <span className="text-[10px] text-text-4 uppercase tracking-wider hidden sm:inline">UTC</span>
        </div>
    );
}
