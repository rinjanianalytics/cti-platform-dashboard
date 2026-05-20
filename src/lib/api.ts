/**
 * Lean typed API client for the Rinjani v3 backend.
 *
 * Replaces the 2,800-line god-class in v303. One function per endpoint;
 * tokens and base URL come from the env or localStorage. No envelope
 * heuristics — every endpoint returns `{ success, data }` and we extract
 * `.data` here once and only here.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BOOTSTRAP_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';

const TOKEN_KEY = 'rinjani.token';

export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
    if (typeof window === 'undefined') return;
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) {
        super(message);
        this.name = 'ApiError';
    }
}

interface RequestInit2 extends Omit<RequestInit, 'body'> {
    body?: unknown;
}

async function request<T>(path: string, init: RequestInit2 = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (BOOTSTRAP_KEY) headers['X-API-Key'] = BOOTSTRAP_KEY;

    const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const raw = await res.text();
    let parsed: unknown = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch { /* non-JSON body */ }
    }

    if (!res.ok) {
        const obj = (parsed as { error?: { message?: string } | string } | null) ?? null;
        const msg = typeof obj?.error === 'string'
            ? obj.error
            : obj?.error?.message ?? `${res.status} ${res.statusText}`;
        throw new ApiError(res.status, msg, parsed);
    }

    // Backend returns { success: true, data: <body> } for most endpoints.
    // If the response has both `success` and `data`, unwrap once.
    const unwrapped = (parsed && typeof parsed === 'object' && 'success' in parsed && 'data' in parsed)
        ? (parsed as { data: unknown }).data
        : parsed;

    return normalisePagination(unwrapped) as T;
}

/**
 * The backend pagination shape is `{ page, pageSize, totalItems, totalPages }`
 * but every list-response interface in this file (and downstream UI) expects
 * `{ page, pageSize, total, pages }`. Normalise at the boundary so the
 * contract holds for every list endpoint without per-call coercion.
 */
function normalisePagination(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    const obj = value as Record<string, unknown>;
    const pg = obj.pagination as Record<string, unknown> | undefined;
    if (pg && (pg.totalItems !== undefined || pg.totalPages !== undefined)) {
        obj.pagination = {
            page: pg.page,
            pageSize: pg.pageSize,
            total: pg.total ?? pg.totalItems ?? 0,
            pages: pg.pages ?? pg.totalPages ?? 0,
        };
    }
    return value;
}

// =============================================================================
// Auth
// =============================================================================

export interface AuthUser {
    id: string;
    name: string;
    role: string;
    method: string;
    tenantId: string | null;
    tenantRole: string | null;
    permissions: string[];
    avatarUrl: string | null;
    email: string | null;
    lastLogin: string | null;
}

export const auth = {
    async loginWithApiKey(apiKey: string): Promise<{ token: string; user: { name: string; role: string } }> {
        return request('/auth/login', { method: 'POST', body: { api_key: apiKey } });
    },
    async loginWithCredentials(username: string, password: string): Promise<{ token: string; user: { name: string; role: string } }> {
        return request('/auth/login', { method: 'POST', body: { username, password } });
    },
    async me(): Promise<AuthUser> {
        return request('/v1/users/me');
    },
    async logout() {
        setToken(null);
    },
    /** Which OAuth providers are configured on the API. */
    async oauthProviders(): Promise<{ google: boolean; github: boolean }> {
        return request('/auth/oauth/providers');
    },
    /** Full URL the user navigates to in order to start the OAuth dance. */
    oauthStartUrl(provider: 'google' | 'github'): string {
        return `${API_URL}/auth/oauth/${provider}`;
    },
};

// =============================================================================
// IOCs
// =============================================================================

export interface IOC {
    id: string;
    type: string;
    value: string;
    source: string;
    threatType: string | null;
    severity: string | null;
    confidence: number | null;
    tags: string[] | null;
    firstSeen: string | null;
    lastSeen: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface IOCFacets {
    types?: Record<string, number>;
    sources?: Record<string, number>;
    severities?: Record<string, number>;
}

export interface IOCListResponse {
    items: IOC[];
    pagination: { page: number; pageSize: number; total: number; pages: number };
    facets?: IOCFacets;
    took?: number;
}

export const iocs = {
    async list(opts: {
        page?: number; pageSize?: number; q?: string; type?: string; source?: string; severity?: string;
    } = {}): Promise<IOCListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.q) qs.set('q', opts.q);
        if (opts.type) qs.set('type', opts.type);
        if (opts.source) qs.set('source', opts.source);
        if (opts.severity) qs.set('severity', opts.severity);
        const query = qs.toString();
        return request(`/v1/iocs${query ? `?${query}` : ''}`);
    },
    async get(idOrValue: string): Promise<IOC & { rawData?: Record<string, unknown> | null; description?: string | null }> {
        return request(`/v1/iocs/${encodeURIComponent(idOrValue)}`);
    },
    async create(body: {
        type: string; value: string; source: string;
        severity?: string; confidence?: number; tags?: string[]; threatType?: string; notes?: string;
    }): Promise<IOC> {
        return request('/v1/iocs', { method: 'POST', body });
    },
    async update(id: string, updates: {
        severity?: string; confidence?: number; tags?: string[]; threatType?: string; notes?: string;
    }): Promise<IOC> {
        return request(`/v1/iocs/${id}`, { method: 'PUT', body: updates });
    },
    async revoke(id: string, reason: string): Promise<{ id: string; revoked: boolean; reason: string }> {
        return request(`/v1/iocs/${id}/revoke`, { method: 'POST', body: { reason } });
    },
    async expire(id: string, validUntil: string): Promise<{ id: string; validUntil: string }> {
        return request(`/v1/iocs/${id}/expire`, { method: 'POST', body: { validUntil } });
    },
    async setVerdict(id: string, verdict: 'malicious' | 'suspicious' | 'benign' | 'unknown', notes?: string) {
        return request(`/v1/iocs/${id}/verdict`, { method: 'POST', body: { verdict, notes } });
    },
};

// =============================================================================
// Stats / overview
// =============================================================================

export interface Stats {
    iocs: number;
    vulnerabilities: number;
    threatActors: number;
    pulses: number;
}

export const platform = {
    async stats(): Promise<{ counts: Stats }> {
        return request('/v1/stats');
    },
    async health(): Promise<{ services: Record<string, { status: string }> }> {
        return request('/v1/ops/system');
    },
    async mitreCoverage(): Promise<{
        tactics: Array<{ mitreId: string; name: string; shortName: string; techniqueCount: number }>;
        totalTechniques: number;
    }> {
        return request('/v1/mitre/coverage');
    },
    async activeActors(limit = 8): Promise<{
        actors: Array<{
            id: string; stixId: string | null; name: string;
            aliases: string[]; country: string | null; sophistication: string | null;
            primaryMotivation: string | null;
            firstSeen: string | null; lastSeen: string | null; updatedAt: string | null;
        }>;
    }> {
        return request(`/v1/actors/active?limit=${limit}`);
    },
    async landscape(): Promise<LandscapeOverview> {
        const raw = await request<LandscapeOverviewRaw>('/v1/landscape/overview');
        return normaliseLandscape(raw);
    },
    async sourceBreakdown(): Promise<Array<{ source: string; count: number }>> {
        const raw = await request<Array<{ source: string; count: number | string }>>('/v1/stats/source-breakdown');
        return raw.map(r => ({ source: r.source, count: Number(r.count) || 0 }));
    },
    async trendingTags(): Promise<Array<{ tag: string; count: number; hot: boolean }>> {
        return request('/v1/stats/trending-tags');
    },
    async feedMonitoring(): Promise<{
        feeds: Array<{
            feed: string;
            health: 'healthy' | 'warning' | 'error' | string;
            status: string;
            lastSync: string | null;
            itemsProcessed: number;
            itemsFailed: number;
            successRate: number;
            duration: number;
            errorMessage: string | null;
        }>;
    }> {
        return request('/v1/monitoring/feeds');
    },
};

export interface LandscapeOverview {
    period: string;
    iocs: { total: number; critical: number; high: number; avgScore: number };
    vulnerabilities: { total: number; critical: number; high: number };
    notifications: { total: number };
    iocTypeDistribution: Array<{ type: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
    severityDistribution: Array<{ severity: string | null; count: number }>;
}

interface LandscapeOverviewRaw {
    period: string;
    iocs: { total: string | number; critical: string | number; high: string | number; avgScore?: number; avg_score?: string };
    vulnerabilities: { total: string | number; critical: string | number; high: string | number };
    notifications: { total: string | number };
    iocTypeDistribution: Array<{ type: string; count: string | number }>;
    topSources: Array<{ source: string; count: string | number }>;
    severityDistribution: Array<{ severity: string | null; count: string | number }>;
}

function n(v: string | number | null | undefined): number {
    if (v == null) return 0;
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : 0;
}

function normaliseLandscape(r: LandscapeOverviewRaw): LandscapeOverview {
    return {
        period: r.period,
        iocs: { total: n(r.iocs.total), critical: n(r.iocs.critical), high: n(r.iocs.high), avgScore: r.iocs.avgScore ?? n(r.iocs.avg_score) },
        vulnerabilities: { total: n(r.vulnerabilities.total), critical: n(r.vulnerabilities.critical), high: n(r.vulnerabilities.high) },
        notifications: { total: n(r.notifications.total) },
        iocTypeDistribution: r.iocTypeDistribution.map(x => ({ type: x.type, count: n(x.count) })),
        topSources: r.topSources.map(x => ({ source: x.source, count: n(x.count) })),
        severityDistribution: r.severityDistribution.map(x => ({ severity: x.severity, count: n(x.count) })),
    };
}

// =============================================================================
// Vulnerabilities
// =============================================================================

export interface Vulnerability {
    id: string; cveId: string; description: string | null;
    cvssScore: number | null; severity: string | null;
    isExploited: boolean | null;
    vendorProject: string | null; product: string | null;
    publishedDate: string | null; lastModified: string | null;
}

export interface VulnListResponse {
    items: Vulnerability[];
    pagination: { page: number; pageSize: number; total: number; pages: number };
    facets?: Record<string, Record<string, number>>;
}

/** postgres numeric → node-pg string → OpenSearch _source string. Coerce here. */
function normaliseVuln<T extends { cvssScore?: unknown }>(v: T): T & { cvssScore: number | null } {
    const raw = v.cvssScore;
    let score: number | null = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) score = raw;
    else if (typeof raw === 'string' && raw.trim()) {
        const n = Number(raw);
        if (Number.isFinite(n)) score = n;
    }
    return { ...v, cvssScore: score };
}

export const vulns = {
    async list(opts: {
        page?: number; pageSize?: number; q?: string;
        severity?: string; exploited?: boolean;
        dateFrom?: string; dateTo?: string;
    } = {}): Promise<VulnListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.q) qs.set('q', opts.q);
        if (opts.severity) qs.set('severity', opts.severity);
        if (opts.exploited !== undefined) qs.set('exploited', String(opts.exploited));
        if (opts.dateFrom) qs.set('dateFrom', opts.dateFrom);
        if (opts.dateTo) qs.set('dateTo', opts.dateTo);
        const query = qs.toString();
        const res = await request<VulnListResponse>(`/v1/vulnerabilities${query ? `?${query}` : ''}`);
        return { ...res, items: res.items.map(normaliseVuln) };
    },
    async get(cveId: string): Promise<Vulnerability & { rawData?: Record<string, unknown> | null }> {
        const res = await request<Vulnerability & { rawData?: Record<string, unknown> | null }>(
            `/v1/vulnerabilities/${encodeURIComponent(cveId)}`,
        );
        return normaliseVuln(res);
    },
};

// =============================================================================
// Threat actors
// =============================================================================

export interface ThreatActor {
    id: string;
    stixId: string | null;
    name: string;
    aliases: string[] | null;
    description: string | null;
    sophistication: string | null;
    resourceLevel: string | null;
    primaryMotivation: string | null;
    goals: string[] | null;
    labels: string[] | null;
    confidence: number | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export const actors = {
    async list(opts: {
        page?: number; pageSize?: number; q?: string;
        sophistication?: string; motivation?: string;
    } = {}): Promise<{
        items: ThreatActor[];
        pagination: { page: number; pageSize: number; total: number; pages: number };
    }> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.q) qs.set('q', opts.q);
        if (opts.sophistication) qs.set('sophistication', opts.sophistication);
        if (opts.motivation) qs.set('motivation', opts.motivation);
        const query = qs.toString();
        return request(`/v1/threats${query ? `?${query}` : ''}`);
    },
    async get(idOrName: string): Promise<ThreatActor & {
        sourceName?: string | null;
        externalReferences?: Array<{ source_name?: string; url?: string; description?: string }>;
    }> {
        return request(`/v1/threats/${encodeURIComponent(idOrName)}`);
    },
    async create(body: {
        name: string; description?: string; aliases?: string[];
        sophistication?: string; resourceLevel?: string; primaryMotivation?: string; tags?: string[];
    }): Promise<ThreatActor> {
        return request('/v1/threats/actors', { method: 'POST', body });
    },
    /** LLM-enrich a single actor — fills null/empty STIX fields from description. */
    async enrich(idOrName: string): Promise<{
        id: string;
        filled: string[];
        actor?: ThreatActor;
        message?: string;
    }> {
        return request(`/v1/threats/${encodeURIComponent(idOrName)}/enrich`, { method: 'POST' });
    },
    /** Bulk LLM enrichment — heavy operation, admin only. */
    async enrichBulk(opts: { limit?: number } = {}): Promise<{
        considered: number;
        enriched: number;
        skipped: number;
        errors: Array<{ id: string; name: string; error: string }>;
    }> {
        return request('/v1/threats/enrich/bulk', { method: 'POST', body: { limit: opts.limit } });
    },
};

// =============================================================================
// Pulses (feeds)
// =============================================================================

export interface Pulse {
    id: string;
    otxId: string | null;
    name: string;
    description: string | null;
    author: string | null;
    tlp: string | null;
    tags: string[] | null;
    targetedCountries: string[] | null;
    industries: string[] | null;
    indicatorCount: number | null;
    otxCreated: string | null;
    otxModified: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export const pulses = {
    async list(opts: { page?: number; pageSize?: number } = {}): Promise<{
        items: Pulse[];
        pagination: { page: number; pageSize: number; total: number; pages: number };
    }> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        const query = qs.toString();
        return request(`/v1/pulses${query ? `?${query}` : ''}`);
    },
    async get(idOrOtxId: string): Promise<Pulse & { relatedIOCs?: IOC[] }> {
        return request(`/v1/pulses/${encodeURIComponent(idOrOtxId)}`);
    },
};

// =============================================================================
// Playbooks
// =============================================================================

export interface PlaybookAction {
    type: string;
    [key: string]: unknown;
}

export interface Playbook {
    id: string;
    name: string;
    description: string | null;
    triggerEvent: string;
    conditions: Record<string, unknown> | null;
    actions: PlaybookAction[];
    enabled: boolean;
    createdBy: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface PlaybookExecution {
    id: string;
    playbookId: string;
    status: 'queued' | 'running' | 'success' | 'failed' | string;
    triggerData: Record<string, unknown> | null;
    results: unknown;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
}

export const playbooks = {
    async list(opts: { enabledOnly?: boolean } = {}): Promise<{ items: Playbook[]; count: number }> {
        const qs = new URLSearchParams();
        if (opts.enabledOnly) qs.set('enabled', 'true');
        const query = qs.toString();
        return request(`/v1/playbooks${query ? `?${query}` : ''}`);
    },
    async get(id: string): Promise<Playbook> {
        return request(`/v1/playbooks/${id}`);
    },
    async create(body: {
        name: string; description?: string; triggerEvent: string;
        conditions?: Record<string, unknown>; actions: PlaybookAction[];
    }): Promise<Playbook> {
        return request('/v1/playbooks', { method: 'POST', body });
    },
    async update(id: string, body: Partial<Pick<Playbook, 'name' | 'description' | 'triggerEvent' | 'conditions' | 'actions' | 'enabled'>>): Promise<Playbook> {
        return request(`/v1/playbooks/${id}`, { method: 'PUT', body });
    },
    async remove(id: string): Promise<{ success: true }> {
        return request(`/v1/playbooks/${id}`, { method: 'DELETE' });
    },
    async execute(id: string, triggerData: Record<string, unknown> = {}): Promise<PlaybookExecution> {
        return request(`/v1/playbooks/${id}/execute`, { method: 'POST', body: { triggerData } });
    },
    async executions(id: string, opts: { limit?: number; offset?: number } = {}): Promise<{
        items: PlaybookExecution[]; total: number; limit: number; offset: number;
    }> {
        const qs = new URLSearchParams();
        if (opts.limit) qs.set('limit', String(opts.limit));
        if (opts.offset) qs.set('offset', String(opts.offset));
        const query = qs.toString();
        return request(`/v1/playbooks/${id}/executions${query ? `?${query}` : ''}`);
    },
};

// =============================================================================
// Search (unified text + vector + similar)
// =============================================================================

export type SearchEntityType = 'ioc' | 'vulnerability' | 'threat_actor' | 'pulse';

export interface SearchHit {
    id: string;
    entityType: SearchEntityType | string;
    value?: string;
    title?: string;
    name?: string;
    cveId?: string;
    description?: string | null;
    severity?: string | null;
    source?: string | null;
    type?: string | null;
    updatedAt?: string | null;
    _score?: number;
}

export const search = {
    async unified(opts: {
        q: string; page?: number; pageSize?: number; type?: SearchEntityType;
    }): Promise<{
        query: string;
        items: SearchHit[];
        pagination: { page: number; pageSize: number; total: number; pages: number };
        facets?: Record<string, Record<string, number>>;
        took?: number;
    }> {
        const qs = new URLSearchParams({ q: opts.q });
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.type) qs.set('type', opts.type);
        return request(`/v1/search?${qs.toString()}`);
    },
    async vector(opts: { q: string; k?: number; type?: SearchEntityType }): Promise<{
        items: SearchHit[]; total: number; took: number;
    }> {
        const qs = new URLSearchParams({ q: opts.q });
        if (opts.k) qs.set('k', String(opts.k));
        if (opts.type) qs.set('type', opts.type);
        return request(`/v1/search/vector?${qs.toString()}`);
    },
    async similar(docId: string, opts: { k?: number; type?: SearchEntityType } = {}): Promise<{
        items: SearchHit[]; total: number; took: number;
    }> {
        const qs = new URLSearchParams();
        if (opts.k) qs.set('k', String(opts.k));
        if (opts.type) qs.set('type', opts.type);
        const query = qs.toString();
        return request(`/v1/search/similar/${encodeURIComponent(docId)}${query ? `?${query}` : ''}`);
    },
};

/**
 * Best-effort link generator for a search hit.
 * Falls back to /search?q=... if we can't route to a typed page.
 */
export function hitHref(hit: SearchHit): string {
    switch (hit.entityType) {
        case 'ioc':
            return `/iocs/${encodeURIComponent(hit.id)}`;
        case 'vulnerability':
            return `/vulnerabilities/${encodeURIComponent(hit.cveId ?? hit.id)}`;
        case 'threat_actor':
            return `/actors/${encodeURIComponent(hit.id)}`;
        case 'pulse':
            return `/feeds/${encodeURIComponent(hit.id)}`;
        default:
            return `/iocs/${encodeURIComponent(hit.id)}`;
    }
}

export function hitLabel(hit: SearchHit): string {
    return hit.title ?? hit.name ?? hit.value ?? hit.cveId ?? hit.id;
}
