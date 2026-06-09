'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Honest banner shown on every dark-web page.
 *
 * Phase 5 #4 production verification on 2026-06-09 found that Ahmia
 * moved search results to client-side JS rendering and discontinued
 * the `/search/atom/` feed (returns 404). The Cheerio-based parser
 * we ship can't recover results from the live response shape, so
 * `/v1/dark-web/scan` returns zero mentions even when results exist
 * on ahmia.fi itself.
 *
 * The watchterm CRUD + table layer ship regardless so an alternative
 * dark-web source can slot in here without UI work. Three options on
 * the table:
 *
 *   (a) Accept as a documented gap — current default
 *   (b) Route through a Tor proxy and the real Ahmia onion address
 *       (conflicts with the "no Tor on a single VPS" non-goal)
 *   (c) Replace with an alternative index (darksearch.io etc.)
 *
 * Until then the banner is the honest signal that this surface is
 * scaffolded but not producing data.
 */
export function UpstreamBannerNotice() {
    return (
        <div className="rounded border border-sev-high/30 bg-sev-high-s/40 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 text-sev-high shrink-0" />
            <div className="text-[12px] leading-relaxed text-text-2">
                <span className="font-medium text-text">Upstream parser broken since 2026-06-09.</span>
                {' '}
                Ahmia moved search results to client-side JS rendering and the
                {' '}<code className="font-mono text-[11px] text-text-3">/search/atom/</code>{' '}
                feed returns 404. Watchterm CRUD works, but scans currently return
                zero mentions. The watchlist + triage UI is ready for an alternative
                dark-web source. Tracked in the Phase 5 ROADMAP as the one open
                follow-on for this surface.
            </div>
        </div>
    );
}
