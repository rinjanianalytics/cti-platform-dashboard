'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    connectors as connectorsApi,
    type ConnectorEntity,
    type ConnectorFormat,
    type SuggestResult,
    type TestResult,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Sparkles, Play, Save, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const WRITE_ROLES = new Set(['admin', 'analyst', 'developer']);

const ENTITY_OPTIONS: Array<{ value: ConnectorEntity; label: string }> = [
    { value: 'ioc', label: 'IOC (indicators)' },
    { value: 'vulnerability', label: 'Vulnerability (CVE)' },
    { value: 'threat_actor', label: 'Threat actor' },
    { value: 'malware', label: 'Malware' },
    { value: 'campaign', label: 'Campaign' },
    { value: 'course_of_action', label: 'Course of action' },
    { value: 'infrastructure', label: 'Infrastructure' },
    { value: 'technique', label: 'Technique (MITRE)' },
    { value: 'tool', label: 'Tool (MITRE)' },
];

/**
 * /admin/connectors/new — Declarative feed-connector builder.
 *
 * Five-step flow (state-machine via the local `step` field):
 *   1. basics   — source name, entity, format
 *   2. sample   — paste a sample payload + optional recordsPath/csv config
 *   3. mapping  — manifest JSON editor; LLM populates via "AI suggest"
 *   4. test     — dry-run the manifest; show extracted records + errors
 *   5. save     — POST /v1/connectors + optional activate
 *
 * Operator can go backwards at any time without losing intermediate state.
 * Steps 3+ are gated on having a sample to test against (no manifest is
 * useful without one).
 */
export default function NewConnectorPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const allowed = !!user && WRITE_ROLES.has(user.role);

    useEffect(() => {
        if (!authLoading && user && !allowed) router.replace('/');
    }, [user, authLoading, allowed, router]);

    // ----- basics -----
    const [sourceName, setSourceName] = useState('');
    const [entity, setEntity] = useState<ConnectorEntity>('ioc');
    const [format, setFormat] = useState<ConnectorFormat>('json');

    // ----- sample -----
    const [sample, setSample] = useState('');
    const [recordsPath, setRecordsPath] = useState('data');

    // ----- mapping -----
    const [manifestText, setManifestText] = useState('');
    const [suggesting, setSuggesting] = useState(false);
    const [suggestResult, setSuggestResult] = useState<SuggestResult | null>(null);

    // ----- test -----
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // ----- save -----
    const [saving, setSaving] = useState(false);

    const basicsReady = sourceName.trim().length > 0 && sourceName.length <= 100;
    const sampleReady = sample.trim().length > 0;
    const manifestReady = manifestText.trim().length > 0;

    async function handleSuggest() {
        if (!sampleReady) {
            toast.error('Paste a sample payload first');
            return;
        }
        setSuggesting(true);
        try {
            const result = await connectorsApi.suggest({
                sample,
                format,
                entity,
                sourceName,
                recordsPathHint: format === 'json' ? recordsPath || undefined : undefined,
            });
            setSuggestResult(result);
            setManifestText(JSON.stringify(result.manifest, null, 2));
            if (result.status === 'ok') {
                toast.success(`AI proposed a manifest · ${result.dryRun?.ok}/${result.dryRun?.read} records extract cleanly`);
            } else {
                toast.warning(`AI couldn't fully map`, { description: result.reason });
            }
        } catch (err) {
            toast.error('AI suggest failed', { description: (err as Error).message });
        } finally {
            setSuggesting(false);
        }
    }

    async function handleTest() {
        if (!manifestReady || !sampleReady) return;
        let manifest: Record<string, unknown>;
        try {
            manifest = JSON.parse(manifestText);
        } catch (err) {
            toast.error('Manifest is not valid JSON', { description: (err as Error).message });
            return;
        }
        setTesting(true);
        try {
            const result = await connectorsApi.test({ sample, manifest });
            setTestResult(result);
            if (result.ok && result.dryRun) {
                if (result.dryRun.ok > 0) {
                    toast.success(`Test passed · ${result.dryRun.ok}/${result.dryRun.read} records extracted`);
                } else {
                    toast.warning('Test ran but extracted no records', {
                        description: result.dryRun.errors[0]?.reason,
                    });
                }
            } else {
                toast.error('Test failed', {
                    description: result.runtimeError ?? result.validationIssues?.[0]?.message,
                });
            }
        } catch (err) {
            toast.error('Test request failed', { description: (err as Error).message });
        } finally {
            setTesting(false);
        }
    }

    async function handleSave(activateAfter: boolean) {
        if (!manifestReady || !basicsReady) return;
        let manifest: Record<string, unknown>;
        try {
            manifest = JSON.parse(manifestText);
        } catch (err) {
            toast.error('Manifest is not valid JSON', { description: (err as Error).message });
            return;
        }
        setSaving(true);
        try {
            const row = await connectorsApi.create({ source: sourceName, entity, manifest });
            toast.success(`Saved v${row.version}`);
            if (activateAfter) {
                await connectorsApi.activate(row.id);
                toast.success('Activated');
            }
            router.push('/admin/connectors');
        } catch (err) {
            toast.error('Save failed', { description: (err as Error).message });
        } finally {
            setSaving(false);
        }
    }

    if (!user || !allowed) {
        return <div className="py-16 text-center text-sm text-muted-foreground">Admin / analyst / developer role required.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Link
                    href="/admin/connectors"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" /> Back
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold">New connector</h1>
                    <p className="text-sm text-muted-foreground">
                        Author a declarative feed manifest. The engine runs whatever the manifest says — no per-feed TypeScript.
                    </p>
                </div>
            </div>

            {/* Step 1 — Basics */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">1 · Basics</CardTitle>
                    <CardDescription>Source key, target entity, payload format.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="sourceName">Source name *</Label>
                        <Input
                            id="sourceName"
                            placeholder="e.g. threatfox"
                            value={sourceName}
                            onChange={(e) => setSourceName(e.target.value)}
                            maxLength={100}
                        />
                        <p className="text-xs text-muted-foreground">
                            Identifier for this feed source. Used in iocs.source + the registry key.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Target entity *</Label>
                        <Select value={entity} onValueChange={(v) => setEntity(v as ConnectorEntity)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ENTITY_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Payload format *</Label>
                        <Select value={format} onValueChange={(v) => setFormat(v as ConnectorFormat)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="json">JSON</SelectItem>
                                <SelectItem value="csv">CSV</SelectItem>
                                <SelectItem value="text">Text (line-per-record)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Step 2 — Sample */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">2 · Sample payload</CardTitle>
                    <CardDescription>
                        Paste a real response from the upstream feed. The engine will use this to learn the structure
                        {format === 'json' && ' (and the records-path tells us where the array lives)'}
                        {format === 'text' && ' (each non-blank, non-comment line becomes one record under the field `line`)'}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {format === 'json' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="recordsPath">Records path (JSON dot-path)</Label>
                            <Input
                                id="recordsPath"
                                placeholder="e.g. data, or vulnerabilities, or response.items"
                                value={recordsPath}
                                onChange={(e) => setRecordsPath(e.target.value)}
                            />
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="sample">Sample payload *</Label>
                        <Textarea
                            id="sample"
                            placeholder={format === 'json'
                                ? '{ "data": [{ "ioc": "1.2.3.4", "type": "ip", ... }] }'
                                : format === 'csv'
                                ? 'header1,header2,header3\nvalue1,value2,value3'
                                : '# optional comment\nhttp://phish.example/login\nhttp://another.example/path'}
                            value={sample}
                            onChange={(e) => setSample(e.target.value)}
                            className="font-mono text-xs min-h-50"
                            spellCheck={false}
                        />
                        <p className="text-xs text-muted-foreground">
                            {sample.length} bytes · 256 KB cap
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Step 3 — Mapping */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">3 · Manifest mapping</CardTitle>
                            <CardDescription>
                                Let the LLM propose a manifest, or paste / edit JSON by hand. The engine validates against
                                a closed transform vocab — invalid ops fail fast.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleSuggest}
                            disabled={!basicsReady || !sampleReady || suggesting}
                        >
                            {suggesting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            AI suggest
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {suggestResult && (
                        <SuggestStatus result={suggestResult} />
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="manifest">Manifest JSON</Label>
                        <Textarea
                            id="manifest"
                            placeholder='Empty until "AI suggest" runs, or paste a manifest body here.'
                            value={manifestText}
                            onChange={(e) => setManifestText(e.target.value)}
                            className="font-mono text-xs min-h-70"
                            spellCheck={false}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Step 4 — Test */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">4 · Test against sample</CardTitle>
                            <CardDescription>
                                Dry-run the manifest against the sample. Confirms the manifest produces records before saving.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleTest}
                            disabled={!manifestReady || !sampleReady || testing}
                        >
                            {testing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                            Run test
                        </Button>
                    </div>
                </CardHeader>
                {testResult && (
                    <CardContent>
                        <TestResultBlock result={testResult} />
                    </CardContent>
                )}
            </Card>

            {/* Step 5 — Save */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">5 · Save</CardTitle>
                    <CardDescription>
                        Save as a new version under <code>{sourceName || '<source>'}</code>. Activating now makes the engine
                        run this manifest on the next scheduled sync (requires FEED_ENGINE_ENABLED=true on the worker).
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => handleSave(false)}
                        disabled={!basicsReady || !manifestReady || saving}
                    >
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        Save as new version (inactive)
                    </Button>
                    <Button
                        onClick={() => handleSave(true)}
                        disabled={!basicsReady || !manifestReady || saving}
                    >
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                        Save & activate
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

function SuggestStatus({ result }: { result: SuggestResult }) {
    if (result.status === 'ok') {
        return (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2 className="size-4" />
                    <span className="font-medium">AI mapped successfully</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    {result.dryRun?.ok}/{result.dryRun?.read} records extract cleanly
                    {result.llmMeta && ` · via ${result.llmMeta.provider}/${result.llmMeta.model} · ${result.llmMeta.latencyMs}ms`}
                </p>
            </div>
        );
    }
    return (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-center gap-2 text-amber-500">
                <XCircle className="size-4" />
                <span className="font-medium">AI couldn&apos;t fully map</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{result.reason}</p>
            {result.dryRun && (
                <p className="mt-1 text-xs text-muted-foreground">
                    {result.dryRun.ok}/{result.dryRun.read} records · {result.dryRun.failed} failed
                </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
                The manifest below is the AI&apos;s best attempt (or an empty starter). Edit and re-test.
            </p>
        </div>
    );
}

function TestResultBlock({ result }: { result: TestResult }) {
    if (!result.ok) {
        return (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 text-red-500">
                    <XCircle className="size-4" />
                    <span className="font-medium">Test failed</span>
                </div>
                {result.runtimeError && (
                    <p className="mt-1 text-xs">{result.runtimeError}</p>
                )}
                {result.validationIssues && result.validationIssues.length > 0 && (
                    <ul className="mt-1 text-xs space-y-0.5">
                        {result.validationIssues.slice(0, 5).map((v, i) => (
                            <li key={i} className="font-mono">
                                <span className="text-muted-foreground">{v.path}:</span> {v.message}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }
    const dr = result.dryRun!;
    const isGreen = dr.ok > 0 && dr.failed === 0;
    return (
        <div className={`rounded border p-3 text-sm ${isGreen ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-center gap-2">
                <div className="flex gap-2">
                    <Badge variant="default">{dr.ok} ok</Badge>
                    <Badge variant="secondary">{dr.read} read</Badge>
                    {dr.failed > 0 && <Badge variant="destructive">{dr.failed} failed</Badge>}
                </div>
            </div>
            {dr.errors.length > 0 && (
                <ul className="mt-2 text-xs space-y-0.5">
                    {dr.errors.slice(0, 5).map((e, i) => (
                        <li key={i} className="font-mono">
                            <span className="text-muted-foreground">record[{e.index}]:</span> {e.reason}
                        </li>
                    ))}
                </ul>
            )}
            {result.records && result.records.length > 0 && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                        Show first {result.records.length} extracted record{result.records.length === 1 ? '' : 's'}
                    </summary>
                    <pre className="mt-1 text-xs font-mono overflow-auto max-h-64 p-2 rounded bg-background border">
                        {JSON.stringify(result.records, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    );
}
