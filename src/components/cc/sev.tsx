/**
 * <Sev> — severity pill. The single source of truth for rendering
 * `crit / high / med / low / info` across tables, drawers, banners.
 * Renders the `.sev` utility class so unstyled HTML callers (status
 * banners, copy strings) can opt in without importing React.
 *
 * The `short` variant renders abbreviated labels (CRIT / HIGH / MED /
 * LOW / INFO) for tight columns; default renders the full word.
 *
 * Severity rank (for sorting): crit=4, high=3, med=2, low=1, info=0.
 * Map CVSS → severity with `severityFromCvss()` below — `>=9 crit,
 * >=7 high, >=4 med, else low`.
 */

import { cn } from '@/lib/utils';

export type Severity = 'crit' | 'high' | 'med' | 'low' | 'info';

const FULL: Record<Severity, string>  = { crit: 'CRITICAL', high: 'HIGH', med: 'MEDIUM', low: 'LOW', info: 'INFO' };
const SHORT: Record<Severity, string> = { crit: 'CRIT',     high: 'HIGH', med: 'MED',    low: 'LOW', info: 'INFO' };

export function Sev({
    level,
    short = false,
    className,
}: {
    level: Severity;
    short?: boolean;
    className?: string;
}) {
    return <span className={cn('sev', level, className)}>{(short ? SHORT : FULL)[level]}</span>;
}

export function severityFromCvss(score: number | null | undefined): Severity {
    if (score == null || isNaN(score)) return 'low';
    if (score >= 9) return 'crit';
    if (score >= 7) return 'high';
    if (score >= 4) return 'med';
    return 'low';
}

export const SEV_RANK: Record<Severity, number> = { crit: 4, high: 3, med: 2, low: 1, info: 0 };

/** Normalize a free-form severity string (e.g. from the backend) to our union. */
export function normalizeSeverity(raw: string | null | undefined): Severity {
    const s = (raw ?? '').toLowerCase();
    if (s.startsWith('crit')) return 'crit';
    if (s === 'high') return 'high';
    if (s === 'medium' || s === 'med') return 'med';
    if (s === 'low') return 'low';
    if (s === 'info' || s === 'informational' || s === 'unscored' || s === 'unknown') return 'info';
    return 'info';
}
