'use client';

/**
 * AI incidents — the AI-threat-landscape vertical (AI Incident Database feed).
 *
 * Real-world AI harm/failure incidents from incidentdatabase.ai: the live
 * "what's actually going wrong with deployed AI" signal that complements the
 * static MITRE ATLAS technique taxonomy on /frameworks.
 *
 * Built on the Command Center design system (panel / PanelHead / tokens), and
 * the incident corpus is a compact row LIST — not a wide table — so it never
 * overflows the content column.
 */

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { aiIncidents } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { BrainCircuit, Users, Search, X } from 'lucide-react';
import { PanelHead } from '@/components/cc/panel-head';
import { MiniBars } from '@/components/cc/mini-bars';

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));

function StatsRow() {
    const { data } = useSWR('ai:stats', () => aiIncidents.stats(24));
    const timeline = data?.timeline ?? [];
    const devs = data?.topDevelopers ?? [];
    const maxDev = devs.reduce((m, d) => Math.max(m, d.count), 1);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="panel panel-pad lg:col-span-2 min-w-0">
                <PanelHead
                    icon={<BrainCircuit className="size-4" />}
                    title="Incidents over time"
                    sub={data ? `${fmt(data.total)} total · monthly, last 24 months` : 'incidentdatabase.ai'}
                />
                <div className="mt-4">
                    <MiniBars data={timeline.map(t => t.count)} height="h-28" />
                    <div className="flex justify-between mt-1.5 text-[10px] font-mono text-text-4 tnum">
                        <span>{timeline[0]?.month}</span>
                        <span>{timeline[timeline.length - 1]?.month}</span>
                    </div>
                </div>
            </div>

            <div className="panel panel-pad min-w-0">
                <PanelHead icon={<Users className="size-4" />} title="Top alleged developers" sub="across all incidents" />
                <ul className="mt-3 flex flex-col" style={{ rowGap: 9 }}>
                    {devs.length === 0 ? (
                        <li className="text-[12.5px] text-text-3">No data.</li>
                    ) : devs.slice(0, 8).map(d => (
                        <li key={d.name} className="grid grid-cols-[1fr_auto] items-center gap-2.5 min-w-0">
                            <div className="min-w-0">
                                <div className="text-[12.5px] truncate" title={d.name}>{d.name}</div>
                                <div className="mt-1 rounded" style={{ height: 4, background: 'var(--bg-3)' }}>
                                    <div className="h-full rounded" style={{ width: `${Math.max((d.count / maxDev) * 100, 4)}%`, background: 'var(--brand)' }} />
                                </div>
                            </div>
                            <span className="font-mono text-[12px] tnum text-text-2 w-10 text-right">{fmt(d.count)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function AiIncidentsPage() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(['ai:list', q], () => aiIncidents.list({ q: q || undefined, limit: 200 }));
    const incidents = useMemo(() => data ?? [], [data]);

    return (
        <div className="space-y-3">
            {/* Page head */}
            <header className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h-page">AI incidents</h1>
                    <p className="sub mt-1 max-w-2xl">
                        Real-world AI harm/failure incidents from the AI Incident Database — the live AI-threat-landscape signal alongside the MITRE ATLAS taxonomy.
                    </p>
                </div>
            </header>

            <StatsRow />

            {/* Search toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-60 max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-3" />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Filter incidents by title…"
                        className="pl-8 pr-8 h-9"
                    />
                    {q && (
                        <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text">
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
                <span className="text-[11px] text-text-3 tabular-nums">{incidents.length} shown</span>
            </div>

            {/* Incident corpus — compact row list (no wide table → no overflow) */}
            <div className="panel panel-pad">
                {isLoading ? (
                    <div className="py-10 text-center text-[12.5px] text-text-3">Loading…</div>
                ) : incidents.length === 0 ? (
                    <div className="py-10 text-center text-[12.5px] text-text-3">No incidents match this filter.</div>
                ) : (
                    <ul className="-mx-2">
                        {incidents.map((r, i) => (
                            <li key={r.id} className={i > 0 ? 'border-t border-line-soft' : undefined}>
                                <a
                                    href={r.url ?? '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="grid grid-cols-[1fr_auto] gap-3 px-2 py-2.5 rounded hover:bg-bg-2 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <div className="text-[13px] truncate">
                                            <span className="font-mono text-[11px] text-text-4 mr-1.5">#{r.incidentId}</span>
                                            {r.title}
                                        </div>
                                        <div className="text-[11px] text-text-3 truncate mt-0.5">
                                            {r.developers.length ? r.developers.join(' · ') : '—'}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 font-mono text-[11px] tnum text-text-4">
                                        <div>{r.incidentDate || '—'}</div>
                                        <div className="mt-0.5 text-text-3">{r.reportCount} rpt</div>
                                    </div>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
