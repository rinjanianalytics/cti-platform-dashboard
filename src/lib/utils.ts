import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Severity → Tailwind class tone map.
 *
 * Heat gradient (most → least severe):
 *   critical = red, high = orange, medium = amber, low = emerald, info/unknown = slate.
 *
 * The previous map used blue for medium which broke the perceptual ordering
 * (medium felt colder than low). Going through the warm-to-cool spectrum so a
 * row of badges reads at a glance.
 *
 * Keys are lowercase. Use `severityTone()` instead of indexing directly —
 * it handles casing, whitespace, and synonyms.
 */
export const SEVERITY_TONE: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
    medium:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    info:     'bg-slate-500/15 text-slate-400 border-slate-500/30',
    unknown:  'bg-slate-500/15 text-slate-400 border-slate-500/30',
    none:     'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

/** Common synonyms feeds emit; collapsed to the canonical key. */
const SEVERITY_SYNONYMS: Record<string, string> = {
    informational: 'info',
    informative:   'info',
    severe:        'critical',
    moderate:      'medium',
    minor:         'low',
};

/**
 * Look up the tone classes for a severity value, tolerant of casing,
 * whitespace, and the common synonyms feeds emit. Returns the slate
 * "unknown" tone if the value is null/empty/unrecognised.
 */
export function severityTone(s: string | null | undefined): string {
    if (!s) return SEVERITY_TONE.unknown;
    const k = s.trim().toLowerCase();
    const canonical = SEVERITY_SYNONYMS[k] ?? k;
    return SEVERITY_TONE[canonical] ?? SEVERITY_TONE.unknown;
}

/**
 * Text-only colour for a severity — same palette as `severityTone()` minus
 * background/border. Use for numeric chips, inline values, or anywhere a
 * full badge would be too heavy.
 */
const SEVERITY_TEXT_TONE: Record<string, string> = {
    critical: 'text-red-400',
    high:     'text-orange-400',
    medium:   'text-amber-400',
    low:      'text-emerald-400',
    info:     'text-muted-foreground',
    unknown:  'text-muted-foreground',
    none:     'text-muted-foreground',
};

export function severityTextTone(s: string | null | undefined): string {
    if (!s) return SEVERITY_TEXT_TONE.unknown;
    const k = s.trim().toLowerCase();
    const canonical = SEVERITY_SYNONYMS[k] ?? k;
    return SEVERITY_TEXT_TONE[canonical] ?? SEVERITY_TEXT_TONE.unknown;
}

/**
 * Map a CVSS score (v2 or v3) to a canonical severity band.
 * NVD's bands: 9.0–10 critical · 7.0–8.9 high · 4.0–6.9 medium · 0.1–3.9 low · 0/null none.
 */
export function cvssToSeverity(score: number | null | undefined): string {
    if (score == null || !Number.isFinite(score)) return 'unknown';
    if (score >= 9)   return 'critical';
    if (score >= 7)   return 'high';
    if (score >= 4)   return 'medium';
    if (score > 0)    return 'low';
    return 'none';
}

/**
 * Convenience: text-only colour for a CVSS score, sharing the severity palette
 * so the numeric and the severity badge always agree visually.
 */
export function cvssTone(score: number | null | undefined): string {
    return severityTextTone(cvssToSeverity(score));
}

/**
 * Format a confidence value for display. STIX threat actors use a string
 * enum ("none" | "low" | "medium" | "high"); IOCs and LLM-enriched actors
 * store 0-100. We normalise both to a human label.
 */
export function formatConfidence(raw: string | number | null | undefined): string {
    if (raw == null || raw === '') return '—';
    const s = String(raw).trim();
    const n = Number(s);
    if (Number.isFinite(n)) {
        // Probability (0-1) vs percentage (0-100) — scale up if needed.
        const pct = n <= 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
        return `${Math.max(0, Math.min(100, pct))}%`;
    }
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Map confidence to a 0-100 number so it can drive visualizations (bars,
 * comparisons). String-enum values pin to representative percentages; the
 * exact midpoints don't matter — only the ordering does, since the bar
 * normalizes against `max` from the visible set.
 */
export function confidenceToNumber(raw: string | number | null | undefined): number {
    if (raw == null || raw === '') return 0;
    const s = String(raw).trim().toLowerCase();
    const n = Number(s);
    if (Number.isFinite(n)) {
        const pct = n <= 1 && n > 0 ? n * 100 : n;
        return Math.max(0, Math.min(100, Math.round(pct)));
    }
    if (s === 'high') return 85;
    if (s === 'medium') return 55;
    if (s === 'low') return 25;
    if (s === 'none') return 5;
    return 0;
}

export function relTime(d: string | null | undefined): string {
    if (!d) return '—';
    const t = Date.parse(d);
    if (isNaN(t)) return '—';
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
}
