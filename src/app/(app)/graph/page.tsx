'use client';

/**
 * Graph explorer — Neo4j-backed CTI analysis surface.
 *
 * Four modes (all hitting endpoints that already exist on the backend):
 *
 *   - ioc-pivot      → IOC value      → IOC + Pulses + Actors + related IOCs
 *   - attack-tree    → actor name     → Actor + Techniques + Tactics
 *   - expand         → entity id      → node + N-hop neighborhood
 *   - related-actors → actor name     → other actors sharing techniques
 *
 * Click any node on the canvas to re-center on it (same mode if the
 * node type still makes sense for that mode, otherwise switch).
 *
 * Bundle note: react-force-graph-2d touches `window` at import time,
 * so we lazy-load via `next/dynamic` with ssr:false. The page itself
 * is `'use client'` because SWR + state hooks would force it anyway.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { graphApi, type GraphNode, type GraphResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Network, Search, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// react-force-graph-2d reads `window` at import time → must be client-only.
const ForceGraph2D = dynamic(
    () => import('react-force-graph-2d').then(m => m.default),
    { ssr: false, loading: () => <Skeleton className="w-full h-[600px]" /> },
);

/* -------------------------------------------------------------------------- */
/* Modes                                                                      */
/* -------------------------------------------------------------------------- */

type Mode = 'ioc-pivot' | 'attack-tree' | 'expand' | 'related-actors';

interface ModeDef {
    id: Mode;
    label: string;
    inputLabel: string;
    placeholder: string;
    description: string;
    /** Real values from the current DB — used as one-click examples in the
     *  empty state. Better than the generic "1.2.3.4" placeholder, which
     *  leads users to try unknown IPs and get a "0 nodes" result. */
    examples: string[];
    fetcher: (value: string) => Promise<GraphResult>;
}

const MODES: ModeDef[] = [
    {
        id: 'ioc-pivot',
        label: 'IOC pivot',
        inputLabel: 'IOC value',
        placeholder: '1.2.3.4   /   evil.example.com   /   <sha256>',
        description: 'Start from an IOC, traverse to pulses, actors, and other IOCs in the same neighborhood.',
        examples: ['serialmenot.com', '37.32.15.8', 'hngfbgfbfb.cyou'],
        fetcher: (v) => graphApi.iocPivot(v, 50),
    },
    {
        id: 'attack-tree',
        label: 'Attack tree',
        inputLabel: 'Actor name',
        placeholder: 'APT29 / Lazarus / FIN7',
        description: 'For a named actor, show every MITRE technique and tactic they\'re associated with.',
        examples: ['APT29', 'Lazarus Group', 'FIN7'],
        fetcher: (v) => graphApi.attackTree(v),
    },
    {
        id: 'expand',
        label: 'Neighborhood',
        inputLabel: 'Entity id',
        placeholder: 'Neo4j node id (UUID or canonical key)',
        description: 'For any node id, expand its 1-hop neighborhood. Use this after clicking a node in another mode.',
        examples: [],
        fetcher: (v) => graphApi.expand(v, 1, 50),
    },
    {
        id: 'related-actors',
        label: 'Related actors',
        inputLabel: 'Actor name',
        placeholder: 'APT29 / Lazarus / FIN7',
        description: 'Other actors that share at least one MITRE technique with the named actor.',
        examples: ['APT29', 'Lazarus Group', 'FIN7'],
        fetcher: (v) => graphApi.relatedActors(v, 1),
    },
];

/* -------------------------------------------------------------------------- */
/* Node colouring + sizing                                                    */
/* -------------------------------------------------------------------------- */

const TYPE_COLOR: Record<string, string> = {
    IOC:           '#3b82f6',   // blue
    Vulnerability: '#f59e0b',   // amber
    CVE:           '#f59e0b',
    Actor:         '#ef4444',   // red
    ThreatActor:   '#ef4444',
    Technique:     '#a855f7',   // purple
    Tactic:        '#14b8a6',   // teal
    Pulse:         '#10b981',   // emerald
    Malware:       '#f97316',   // orange
    Tool:          '#06b6d4',   // cyan
    WebSource:     '#64748b',   // slate (orphan from Nexus removal)
};

const DEFAULT_COLOR = '#94a3b8';

function nodeColor(node: GraphNode): string {
    return TYPE_COLOR[node.type] ?? DEFAULT_COLOR;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function GraphExplorerPage() {
    const router = useRouter();
    const pathname = usePathname();
    const initialParams = useSearchParams();

    const [mode, setMode] = useState<Mode>(
        () => (initialParams.get('mode') as Mode) || 'ioc-pivot',
    );
    const [inputValue, setInputValue] = useState(() => initialParams.get('q') ?? '');
    const [submittedValue, setSubmittedValue] = useState(() => initialParams.get('q') ?? '');
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

    // Keep URL in sync so refresh + back-forward work, and graphs are shareable.
    useEffect(() => {
        const qs = new URLSearchParams();
        if (mode !== 'ioc-pivot') qs.set('mode', mode);
        if (submittedValue) qs.set('q', submittedValue);
        const s = qs.toString();
        router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }, [mode, submittedValue, pathname, router]);

    const activeMode = MODES.find(m => m.id === mode)!;

    const { data, error, isLoading, mutate } = useSWR(
        submittedValue ? ['graph', mode, submittedValue] : null,
        () => activeMode.fetcher(submittedValue),
        // Graphs don't auto-refresh — explicit Refresh button only.
        { revalidateOnFocus: false, revalidateOnReconnect: false },
    );

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const v = inputValue.trim();
        if (!v) return;
        setSubmittedValue(v);
        setSelectedNode(null);
    };

    // Click any node → if the node id is queryable in the current mode,
    // recenter; otherwise switch to neighborhood expansion on that id.
    const onNodeClick = useCallback((node: object) => {
        const n = node as GraphNode;
        setSelectedNode(n);

        // Re-centering policy: stay in current mode if the new value
        // makes sense for it (e.g. IOC-pivot can recenter on any IOC).
        // Otherwise fall through to neighborhood expansion.
        const sameModeIds: Record<Mode, (n: GraphNode) => string | null> = {
            'ioc-pivot':       (n) => n.type === 'IOC' ? String(n.label || n.id) : null,
            'attack-tree':     (n) => n.type === 'Actor' || n.type === 'ThreatActor' ? n.label : null,
            'related-actors':  (n) => n.type === 'Actor' || n.type === 'ThreatActor' ? n.label : null,
            'expand':          (n) => n.id,
        };
        const queryable = sameModeIds[mode](n);
        if (queryable) {
            setInputValue(queryable);
            setSubmittedValue(queryable);
        } else {
            setMode('expand');
            setInputValue(n.id);
            setSubmittedValue(n.id);
        }
    }, [mode]);

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Graph explorer</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Neo4j-backed CTI analysis. Pick a mode, enter a value, then click nodes to traverse.
                    </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => mutate()} disabled={isLoading || !submittedValue}>
                    <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} /> Refresh
                </Button>
            </div>

            {/* ── Control bar ────────────────────────────────────────────── */}
            <form onSubmit={onSubmit} className="flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Mode</label>
                    <Select value={mode} onValueChange={(v) => { setMode(v as Mode); setSelectedNode(null); }}>
                        <SelectTrigger className="w-44 h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MODES.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-60 max-w-xl">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
                        {activeMode.inputLabel}
                    </label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={activeMode.placeholder}
                            className="pl-8 h-9 font-mono text-sm"
                            aria-label={activeMode.inputLabel}
                        />
                    </div>
                </div>
                <Button type="submit" size="sm" disabled={!inputValue.trim()}>
                    Explore
                </Button>
            </form>
            <p className="text-xs text-muted-foreground italic -mt-3">{activeMode.description}</p>

            {/* ── Canvas + side panel ────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            <Network className="size-4 text-muted-foreground" />
                            <span>{submittedValue ? `${activeMode.label} · ${submittedValue}` : 'Graph'}</span>
                            {data && (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                    {data.nodes.length} nodes · {data.edges.length} edges
                                </Badge>
                            )}
                            {error ? (
                                <Badge variant="outline" className="text-[10px] font-mono text-red-400 border-red-400/50">
                                    error
                                </Badge>
                            ) : null}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <GraphCanvas
                            data={data}
                            loading={isLoading}
                            error={error as Error | undefined}
                            empty={!submittedValue}
                            onNodeClick={onNodeClick}
                            selectedId={selectedNode?.id}
                            examples={activeMode.examples}
                            onPickExample={(v) => {
                                setInputValue(v);
                                setSubmittedValue(v);
                                setSelectedNode(null);
                            }}
                        />
                    </CardContent>
                </Card>
                <NodeDetail node={selectedNode} mode={mode} />
            </div>

            {/* ── Type legend ────────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">Legend</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3 text-xs">
                        {Object.entries(TYPE_COLOR).map(([type, color]) => (
                            <span key={type} className="flex items-center gap-1.5">
                                <span className="size-3 rounded-full" style={{ background: color }} />
                                <span className="font-mono text-[11px]">{type}</span>
                            </span>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Canvas wrapper                                                             */
/* -------------------------------------------------------------------------- */

function GraphCanvas({
    data, loading, error, empty, onNodeClick, selectedId, examples, onPickExample,
}: {
    data?: GraphResult;
    loading: boolean;
    error?: Error;
    empty: boolean;
    onNodeClick: (n: object) => void;
    selectedId?: string;
    examples: string[];
    onPickExample: (v: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 800, h: 600 });

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const e = entries[0];
            if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // react-force-graph wants `links`, not `edges`; remap once.
    const graphData = useMemo(() => {
        if (!data) return { nodes: [], links: [] };
        return {
            nodes: data.nodes,
            links: data.edges.map(e => ({ source: e.source, target: e.target, type: e.type })),
        };
    }, [data]);

    const hasGraph = !empty && !loading && !error && data && data.nodes.length > 0;

    // Shrink the canvas when there's nothing to show, so the empty/error
    // state isn't lost in a 600px black box (previous bug: users couldn't
    // see "Empty result" because it was vertically centered below the fold).
    const heightClass = hasGraph ? 'h-[600px]' : 'h-[220px]';

    return (
        <div ref={containerRef} className={cn('w-full relative bg-muted/10', heightClass)}>
            {empty && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
                    <Network className="size-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        Enter a value above and click <span className="font-medium text-foreground">Explore</span>. Click any node on the result to traverse from there.
                    </p>
                    {examples.length > 0 && (
                        <ExampleChips examples={examples} onPick={onPickExample} />
                    )}
                </div>
            )}
            {!empty && loading && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                        <RefreshCw className="size-3.5 animate-spin" /> Loading graph…
                    </span>
                </div>
            )}
            {!empty && error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-sm text-red-400 font-mono">{error.message}</p>
                    <p className="text-xs text-muted-foreground">Check the API logs, or try a known value.</p>
                    {examples.length > 0 && (
                        <ExampleChips examples={examples} onPick={onPickExample} />
                    )}
                </div>
            )}
            {!empty && !loading && !error && data && data.nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-sm">
                        <span className="font-medium">0 nodes</span>
                        <span className="text-muted-foreground"> — this value isn&apos;t in the graph.</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Try a value that&apos;s actually been ingested.
                    </p>
                    {examples.length > 0 && (
                        <ExampleChips examples={examples} onPick={onPickExample} />
                    )}
                </div>
            )}
            {hasGraph && (
                <ForceGraph2D
                    graphData={graphData}
                    width={size.w}
                    height={size.h}
                    backgroundColor="transparent"
                    nodeRelSize={5}
                    nodeColor={(n: object) => nodeColor(n as GraphNode)}
                    nodeLabel={(n: object) => {
                        const node = n as GraphNode;
                        return `${node.type}: ${node.label}`;
                    }}
                    linkColor={() => 'rgba(148, 163, 184, 0.35)'}
                    linkWidth={1}
                    nodeCanvasObjectMode={() => 'after'}
                    nodeCanvasObject={(n: object, ctx: CanvasRenderingContext2D, scale: number) => {
                        const node = n as GraphNode & { x?: number; y?: number };
                        if (scale < 1.2) return;
                        const label = node.label?.slice(0, 24) ?? '';
                        const fontSize = 10 / scale;
                        ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
                        ctx.fillStyle = node.id === selectedId ? '#fde047' : '#cbd5e1';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        if (node.x != null && node.y != null) {
                            ctx.fillText(label, node.x, node.y + 6);
                        }
                    }}
                    onNodeClick={onNodeClick}
                    cooldownTicks={100}
                />
            )}
        </div>
    );
}

/** One-click example chips for empty/error states. Pulls real values from
 *  the current DB so users hit data on first try instead of guessing IPs. */
function ExampleChips({ examples, onPick }: { examples: string[]; onPick: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">try</span>
            {examples.map(v => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onPick(v)}
                    className="font-mono text-[11px] px-2 py-0.5 rounded border bg-muted/40 hover:bg-muted/70 hover:border-primary/50 transition-colors"
                >
                    {v}
                </button>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Side panel                                                                 */
/* -------------------------------------------------------------------------- */

function NodeDetail({ node, mode: _mode }: { node: GraphNode | null; mode: Mode }) {
    if (!node) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Node detail</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground italic">
                    Click a node on the graph to see its details and traverse from it.
                </CardContent>
            </Card>
        );
    }

    const href = entityHref(node);

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: nodeColor(node) }} />
                    {node.type}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Label</div>
                    <div className="font-mono text-xs break-all">{node.label || '—'}</div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">ID</div>
                    <div className="font-mono text-[11px] text-muted-foreground break-all">{node.id}</div>
                </div>
                {Object.keys(node.properties ?? {}).length > 0 && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Properties</div>
                        <pre className="text-[10px] font-mono bg-muted/40 rounded p-2 overflow-auto max-h-48">
                            {JSON.stringify(node.properties, null, 2)}
                        </pre>
                    </div>
                )}
                {href && (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                        Open in entity page <ExternalLink className="size-3" />
                    </a>
                )}
                <p className="text-[11px] text-muted-foreground/70 italic pt-2 border-t">
                    Tip: click this node again on the graph to recenter the view on it.
                </p>
            </CardContent>
        </Card>
    );
}

/** Best-effort link to the existing entity page for a node. */
function entityHref(node: GraphNode): string | null {
    switch (node.type) {
        case 'IOC':
            return `/iocs?q=${encodeURIComponent(node.label || node.id)}`;
        case 'CVE':
        case 'Vulnerability':
            return `/vulnerabilities/${encodeURIComponent(node.label || node.id)}`;
        case 'Actor':
        case 'ThreatActor':
            return `/actors?q=${encodeURIComponent(node.label || node.id)}`;
        default:
            return null;
    }
}
