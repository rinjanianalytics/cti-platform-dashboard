'use client';

/**
 * Hunt — agentic-analytics console (W2).
 *
 * Ask a question in English → the agent runs a bounded ReAct loop over the
 * read-only tool plane (graph hunt, RAG, free multi-source on-chain lookup) → we render the
 * tool-by-tool reasoning trace, the synthesized answer, and any STAGED writes
 * the agent proposed. Proposals apply only on the analyst's click — the HITL
 * gate. Recent hunts come from agent memory.
 *
 * Layout: single column. The app shell already owns the right-hand attention
 * rail, so this page must NOT add its own side rail, and every code/JSON block
 * WRAPS (break-all) — long addresses + JSON args otherwise expand the grid
 * track and overflow the main pane horizontally.
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
    agent,
    type AgentRunResult,
    type AgentProposedAction,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Markdown } from '@/components/markdown';
import { toast } from 'sonner';

const EXAMPLES = [
    'Which sim-swap fraud schemes exploit a Diameter interface?',
    'Which wallets did sim-swap fraud schemes cash out to, and at what confidence?',
    'Look up the on-chain attribution for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 and propose recording it.',
];

export default function HuntPage() {
    const [question, setQuestion] = useState('');
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<AgentRunResult | null>(null);
    const [committed, setCommitted] = useState<Set<number>>(new Set());

    const { data: runs, mutate: refreshRuns } = useSWR('agent-runs', () => agent.runs(12));

    async function run(q: string) {
        const query = q.trim();
        if (!query) return;
        setRunning(true);
        setResult(null);
        setCommitted(new Set());
        try {
            const r = await agent.run(query);
            setResult(r);
            refreshRuns();
        } catch (e) {
            toast.error(`Hunt failed: ${(e as Error).message}`);
        } finally {
            setRunning(false);
        }
    }

    async function commit(action: AgentProposedAction, idx: number) {
        try {
            await agent.commit(action.tool, action.args);
            setCommitted((s) => new Set(s).add(idx));
            toast.success(`Committed ${action.tool}`);
        } catch (e) {
            toast.error(`Commit failed: ${(e as Error).message}`);
        }
    }

    async function loadRun(id: string) {
        try {
            const rec = await agent.getRun(id);
            setResult({
                question: rec.question,
                answer: rec.answer ?? '',
                steps: rec.steps ?? [],
                proposedActions: rec.proposedActions ?? [],
                stopReason: (rec.stopReason as AgentRunResult['stopReason']) ?? 'final',
                meta: { model: rec.model ?? '', provider: rec.provider ?? '', steps: rec.stepCount },
            });
            setQuestion(rec.question);
            setCommitted(new Set());
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            toast.error(`Could not load run: ${(e as Error).message}`);
        }
    }

    return (
        <div className="min-w-0 space-y-6">
            <div>
                <h1 className="text-xl font-semibold">Hunt</h1>
                <p className="text-sm text-muted-foreground">
                    Ask in English. The agent hunts the graph, attributes on-chain, and proposes actions you approve.
                </p>
            </div>

            {/* Ask */}
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <Textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="e.g. Which sim-swap fraud schemes exploit a Diameter interface?"
                        rows={3}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(question);
                        }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                            {EXAMPLES.map((ex) => (
                                <button
                                    key={ex}
                                    onClick={() => setQuestion(ex)}
                                    className="max-w-[16rem] truncate rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                                    title={ex}
                                >
                                    {ex}
                                </button>
                            ))}
                        </div>
                        <Button onClick={() => run(question)} disabled={running || !question.trim()}>
                            {running ? 'Hunting…' : 'Run hunt'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {running && <Skeleton className="h-40 w-full" />}

            {result && (
                <div className="space-y-4">
                    {/* Answer */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                                Answer
                                <Badge variant="outline">{result.stopReason}</Badge>
                                <span className="text-xs font-normal text-muted-foreground">
                                    {result.meta.provider} · {result.meta.steps} step{result.meta.steps === 1 ? '' : 's'}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent><Markdown>{result.answer}</Markdown></CardContent>
                    </Card>

                    {/* Proposed actions (HITL) */}
                    {result.proposedActions.length > 0 && (
                        <Card className="border-amber-500/40">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Proposed actions · awaiting approval</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {result.proposedActions.map((a, i) => (
                                    <div key={i} className="flex items-start justify-between gap-3 rounded border p-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-mono text-xs text-muted-foreground">{a.tool}</div>
                                            <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{JSON.stringify(a.args, null, 2)}</pre>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant={committed.has(i) ? 'outline' : 'default'}
                                            disabled={committed.has(i)}
                                            onClick={() => commit(a, i)}
                                        >
                                            {committed.has(i) ? 'Committed' : 'Commit'}
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {/* Reasoning trace */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                                Reasoning trace · {result.steps.length} step{result.steps.length === 1 ? '' : 's'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {result.steps.length === 0 && (
                                <p className="text-sm text-muted-foreground">Answered directly — no tool calls.</p>
                            )}
                            {result.steps.map((s, i) => (
                                <div key={i} className="min-w-0 text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{i + 1}</span>
                                        {s.tool ? (
                                            <Badge variant="secondary" className="font-mono">{s.tool}</Badge>
                                        ) : (
                                            <Badge variant="outline">note</Badge>
                                        )}
                                    </div>
                                    {s.thought && <p className="mt-1 text-xs italic text-muted-foreground">{s.thought}</p>}
                                    {s.args != null && (
                                        <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(s.args)}</pre>
                                    )}
                                    <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap wrap-break-word rounded bg-muted/40 p-2 text-xs">
                                        {s.observation}
                                    </div>
                                    {i < result.steps.length - 1 && <Separator className="mt-3" />}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Recent hunts (agent memory) */}
            {runs && runs.length > 0 && (
                <div className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">Recent hunts</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {runs.map((r) => (
                            <button
                                key={r.id}
                                onClick={() => loadRun(r.id)}
                                className="min-w-0 rounded border p-2 text-left hover:bg-muted/40"
                            >
                                <div className="line-clamp-2 wrap-break-word text-xs">{r.question}</div>
                                <div className="mt-1 truncate text-[10px] text-muted-foreground">
                                    {r.status} · {r.stepCount} step{r.stepCount === 1 ? '' : 's'} · {new Date(r.createdAt).toLocaleString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
