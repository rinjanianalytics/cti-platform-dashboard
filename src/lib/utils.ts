import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const SEVERITY_TONE: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    info: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

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
