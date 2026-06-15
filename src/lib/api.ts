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
const TOKEN_COOKIE = 'rinjani_token';
// 24h to match the JWT's exp. The backend will reject an expired cookie
// regardless; this is just so the browser eventually GCs it.
const TOKEN_COOKIE_TTL_S = 24 * 60 * 60;

export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
    if (typeof window === 'undefined') return;
    if (t) {
        window.localStorage.setItem(TOKEN_KEY, t);
        writeAuthCookie(t);
    } else {
        window.localStorage.removeItem(TOKEN_KEY);
        clearAuthCookie();
    }
}

/**
 * Mirror the JWT into a cookie on the dashboard's own origin so embedded
 * same-origin UIs (Workbench at /admin/workbench, proxied through Next's
 * rewrite) can ride our session without a second auth layer. The cookie
 * cannot be httpOnly because it's set from JS — but it offers no less
 * security than the localStorage entry it shadows, since both are
 * readable by any script in this origin. Defense-in-depth (httpOnly via
 * a server-set cookie) is a separate slice if XSS protection becomes a
 * concern beyond what our React tree already guarantees.
 *
 * `SameSite=Lax` so navigations from external sites won't carry the
 * cookie, but our own same-origin fetches and rewrites do.
 * `Secure` is added automatically on https origins.
 */
function writeAuthCookie(token: string) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_COOKIE_TTL_S}; SameSite=Lax${secure}`;
}
function clearAuthCookie() {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * Canonical envelope shapes — match `apps/api/src/middleware/error.ts` and
 * `apps/api/src/lib/errors.ts`. The server emits exactly one of these for
 * every JSON response. Adding a third shape is a bug.
 */
interface SuccessEnvelope<T> {
    success: true;
    data: T;
}
interface ErrorEnvelope {
    success: false;
    error: {
        code: string;
        message: string;
        statusCode?: number;
        details?: unknown;
    };
}

/**
 * Thrown for any non-2xx response. Carries the machine-readable `code`
 * (e.g. `'NOT_FOUND'`, `'VALIDATION_ERROR'`) so callers can branch without
 * parsing the message. `body` keeps the full envelope for diagnostics.
 */
export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public code: string,
        public body?: unknown,
    ) {
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
        const env = parsed as Partial<ErrorEnvelope> | null;
        const err = env?.error;

        // 401 means the token is expired/invalid (24h JWT lifetime). Clear
        // it so the AuthProvider's route guard kicks in and bounces the
        // user to /login on the next render. We do NOT redirect from here
        // directly — leaving routing to the React layer keeps the auth
        // flow consistent regardless of whether the 401 came from a SWR
        // background poll, a user-triggered POST, or a SSE reconnection.
        //
        // The first 401 of a session triggers a one-shot redirect via the
        // AuthProvider. Subsequent calls (e.g. SWR retrying) will keep
        // getting 401 silently — that's fine, they unmount once routing
        // lands on /login.
        if (res.status === 401 && typeof window !== 'undefined') {
            setToken(null);
            // Only navigate if we're not already on the login page —
            // prevents an infinite loop if the login flow itself 401s.
            if (!window.location.pathname.startsWith('/login')) {
                window.location.assign('/login?reason=expired');
            }
        }

        throw new ApiError(
            res.status,
            err?.message ?? `${res.status} ${res.statusText}`,
            err?.code ?? `HTTP_${res.status}`,
            parsed,
        );
    }

    // Standard envelope: { success: true, data: T }. A small number of
    // info endpoints (/v2, /opengate root, swagger) return raw JSON — we
    // fall through and return parsed as-is for those.
    if (parsed && typeof parsed === 'object' && 'success' in parsed && 'data' in parsed) {
        return (parsed as SuccessEnvelope<T>).data;
    }
    return parsed as T;
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
    /**
     * Update the current user's avatar. `avatarUrl` is a base64 data URI
     * (≤500KB after encoding) or null to clear.
     */
    async updateAvatar(id: string, avatarUrl: string | null): Promise<AdminUser> {
        return request(`/admin/users/${id}/avatar`, { method: 'POST', body: { avatarUrl } });
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

/* ---------------------------------------------------------------------- */
/* Admin                                                                  */
/* ---------------------------------------------------------------------- */

export interface AdminServicesReport {
    process: {
        bootlockOwner: string | null;
        bootlockHeldByThisProcess: boolean;
        /**
         * Distinguishes "no holder" from "Redis unreachable" — set since
         * the backend's services audit (2026-05-28). Optional for forward-
         * compat with older API instances.
         */
        bootlockState?: 'held' | 'unowned' | 'error';
        bootlockError?: string;
        workerActive: boolean;
        totalConnectedWorkers: number;
        workersByQueue: Array<{ queue: string; workerCount: number }>;
    };
    datastores: {
        postgres: { connected: boolean; latencyMs?: number; error?: string };
        opensearch: { connected: boolean; latencyMs?: number; status?: string; error?: string };
        redis: { queue: { connected: boolean; latency?: number }; cache: { connected: boolean; latency?: number } };
        neo4j: { connected: boolean; latencyMs?: number; serverInfo?: string; error?: string };
    };
    llm: {
        gemini: { configured: boolean };
        openrouter: { configured: boolean };
        ollama: { available: boolean };
    };
    optionalServices: Record<string, { available: boolean; configured: boolean }>;
    /**
     * Enrichment data sources used by the CVE enrichment pipeline.
     * Currently: OSV (primary, public) + NVD (fallback, rate-limited).
     * Pipeline tries them in that order; falls back NVD if OSV doesn't
     * have a given CVE.
     */
    enrichmentSources: Record<string, {
        available: boolean;
        configured: boolean;
        latencyMs?: number;
        note?: string;
        error?: string;
    }>;
    queues: Array<{ name: string; waiting: number; active: number; completed: number; failed: number; delayed: number }>;
    feeds: Array<{
        feed: string;
        /** Registry key the manual-sync endpoint accepts; null = no known handler. */
        registryKey: string | null;
        lastSync: string | null;
        status: string;
        itemsProcessed: number;
        itemsFailed: number;
        errorMessage: string | null;
    }>;
    timestamp: string;
}

export interface QueueStats {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    isPaused: boolean;
}

export interface QueueJob {
    id: string;
    name: string;
    state: string;
    data: Record<string, unknown>;
    result: unknown;
    failedReason: string | null;
    attemptsMade: number;
    timestamp: number;
    processedOn: number | null;
    finishedOn: number | null;
    progress: number | object;
}

export interface QueueJobDetail extends QueueJob {
    queue: string;
    stacktrace: string[] | null;
}

export type QueueJobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export const admin = {
    async services(): Promise<AdminServicesReport> {
        return request('/admin/services');
    },
    /** Queue an immediate sync for a given feed. Returns the BullMQ job id. */
    async syncFeed(source: string): Promise<{ jobId: string; queue: string; source: string; status: string }> {
        return request('/admin/jobs/feed-sync', { method: 'POST', body: { source } });
    },
    /* Queue control ------------------------------------------------------ */
    async queueStats(): Promise<{ queues: QueueStats[]; timestamp: string }> {
        return request('/admin/stats');
    },
    async pauseQueue(name: string): Promise<{ queue: string; status: string }> {
        return request(`/admin/queue/${encodeURIComponent(name)}/pause`, { method: 'POST' });
    },
    async resumeQueue(name: string): Promise<{ queue: string; status: string }> {
        return request(`/admin/queue/${encodeURIComponent(name)}/resume`, { method: 'POST' });
    },
    async drainQueue(name: string): Promise<{ queue: string; action: string }> {
        return request(`/admin/queue/${encodeURIComponent(name)}/drain`, { method: 'POST' });
    },
    async retryAllFailed(name: string): Promise<{ queue: string; retried: number; totalFailed: number }> {
        return request(`/admin/queue/${encodeURIComponent(name)}/retry-all`, { method: 'POST' });
    },
    /** state: 'completed' | 'failed' | 'delayed' | 'wait' | 'active' */
    async cleanQueue(name: string, state: string, opts: { grace?: number; limit?: number } = {}): Promise<{
        queue: string; state: string; removed: number;
    }> {
        const qs = new URLSearchParams();
        if (opts.grace !== undefined) qs.set('grace', String(opts.grace));
        if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
        return request(
            `/admin/queue/${encodeURIComponent(name)}/clean/${state}${qs.toString() ? `?${qs}` : ''}`,
            { method: 'POST' },
        );
    },
    async listQueueJobs(name: string, opts: {
        state?: QueueJobState; start?: number; limit?: number;
    } = {}): Promise<{ queue: string; state: string; start: number; limit: number; jobs: QueueJob[] }> {
        const qs = new URLSearchParams();
        if (opts.state) qs.set('state', opts.state);
        if (opts.start !== undefined) qs.set('start', String(opts.start));
        if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
        return request(`/admin/queue/${encodeURIComponent(name)}/jobs${qs.toString() ? `?${qs}` : ''}`);
    },
    async getQueueJob(queue: string, jobId: string): Promise<QueueJobDetail> {
        return request(`/admin/queue/${encodeURIComponent(queue)}/job/${encodeURIComponent(jobId)}`);
    },
    async retryQueueJob(queue: string, jobId: string): Promise<{ queue: string; jobId: string; action: string }> {
        return request(`/admin/queue/${encodeURIComponent(queue)}/job/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
    },
    /** Force a delayed job to run now (moves delayed → waiting). */
    async promoteQueueJob(queue: string, jobId: string): Promise<{ queue: string; jobId: string; action: string }> {
        return request(`/admin/queue/${encodeURIComponent(queue)}/job/${encodeURIComponent(jobId)}/promote`, { method: 'POST' });
    },
    async removeQueueJob(queue: string, jobId: string): Promise<{ queue: string; jobId: string; action: string }> {
        return request(`/admin/queue/${encodeURIComponent(queue)}/job/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
    },
    /* Job runners (one-click bulk ops) ----------------------------------- */
    async runCvssBackfill(): Promise<{ status: string; jobId?: string; message: string }> {
        return request('/admin/jobs/cvss-backfill', { method: 'POST' });
    },
    async runIocEnrichSweep(): Promise<{ status: string; enqueued: number; message: string }> {
        return request('/admin/jobs/ioc-enrich-sweep', { method: 'POST' });
    },
    /* Live job activity feed -------------------------------------------- */
    async recentActivity(opts: {
        limit?: number;
        queue?: string;
        sinceSeq?: number;
    } = {}): Promise<{ events: ActivityEvent[]; count: number }> {
        const qs = new URLSearchParams();
        if (opts.limit) qs.set('limit', String(opts.limit));
        if (opts.queue) qs.set('queue', opts.queue);
        if (opts.sinceSeq !== undefined) qs.set('sinceSeq', String(opts.sinceSeq));
        const q = qs.toString();
        return request(`/admin/activity/recent${q ? `?${q}` : ''}`);
    },
    async activityThroughput(): Promise<{ queues: ActivityThroughput[] }> {
        return request('/admin/activity/throughput');
    },
    async activityFailures(): Promise<{ groups: ActivityFailureGroup[] }> {
        return request('/admin/activity/failures');
    },
    /* Feed-centric management ------------------------------------------- */
    async listFeeds(): Promise<{ feeds: FeedScheduleEntry[]; count: number }> {
        return request('/admin/feeds');
    },
    async feedHistory(feedId: string, limit = 20): Promise<{
        feedId: string;
        runs: FeedSyncRun[];
        count: number;
    }> {
        return request(`/admin/feeds/${encodeURIComponent(feedId)}/history?limit=${limit}`);
    },
    /** URL for SSE; consumer should new EventSource(url) with cookie/auth. */
    activityStreamUrl(): string {
        // Token must travel as query param — EventSource can't set headers.
        const token = getToken();
        const base = `${API_URL}/admin/activity/stream`;
        return token ? `${base}?api_key=${encodeURIComponent(token)}` : base;
    },
    async runNvdSync(): Promise<{ status: string; cves: number; processed: number; errors: string[] }> {
        return request('/admin/jobs/nvd-sync', { method: 'POST' });
    },
    /**
     * Trigger a Neo4j graph sync. Sync types match the worker's switch in
     * apps/api/src/queues/workers/neo4jSyncWorker.ts — passing anything else
     * makes the job fail with "Unknown sync type".
     */
    async runNeo4jSync(
        syncType: 'full' | 'actors' | 'techniques' | 'malware' | 'tools' |
            'relationships' | 'pulses-iocs' | 'all-iocs' | 'cves' | 'similarity'
            = 'actors',
    ): Promise<{ jobId: string }> {
        return request('/admin/jobs/neo4j-sync', { method: 'POST', body: { syncType } });
    },
    async runVulnEnrichBulk(limit?: number): Promise<{
        considered: number; enriched: number; notFound: number; errors: Array<{ cveId: string; error: string }>;
    }> {
        return request('/v1/vulnerabilities/enrich/bulk', { method: 'POST', body: { limit } });
    },
    async runActorEnrichBulk(limit?: number): Promise<{
        considered: number; enriched: number; skipped: number; errors: Array<{ id: string; name: string; error: string }>;
    }> {
        return request('/v1/threats/enrich/bulk', { method: 'POST', body: { limit } });
    },
    /* Scheduled-job control --------------------------------------------- */
    async listSchedules(): Promise<{
        jobs: ScheduledJob[];
        intervalPresets: Record<IntervalPreset, string>;
        count: number;
    }> {
        return request('/admin/schedules');
    },
    async updateSchedule(key: string, patch: {
        enabled?: boolean;
        intervalPreset?: IntervalPreset | null;
        payload?: Record<string, unknown> | null;
    }): Promise<{
        override: ScheduledJobOverride;
        reconciled: { key: string; status: 'enabled' | 'disabled'; cron?: string };
    }> {
        return request(`/admin/schedules/${encodeURIComponent(key)}`, { method: 'PATCH', body: patch });
    },
    async runScheduleNow(key: string): Promise<{ jobId: string; queue: string; key: string }> {
        return request(`/admin/schedules/${encodeURIComponent(key)}/run-now`, { method: 'POST' });
    },
    /* Audit log inspection ---------------------------------------------- */
    async listAudit(opts: {
        entityType?: AuditEntityType; action?: string; from?: string; to?: string;
        page?: number; limit?: number;
    } = {}): Promise<{ entries: AuditEntry[]; total: number; page: number; limit: number }> {
        const qs = new URLSearchParams();
        if (opts.entityType) qs.set('entityType', opts.entityType);
        if (opts.action) qs.set('action', opts.action);
        if (opts.from) qs.set('from', opts.from);
        if (opts.to) qs.set('to', opts.to);
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.limit) qs.set('limit', String(opts.limit));
        return request(`/admin/audit${qs.toString() ? `?${qs}` : ''}`);
    },
    async auditStats(days = 30): Promise<{
        total: number; days: number;
        byAction: Array<{ action: string; count: number }>;
        byEntity: Array<{ entityType: string; count: number }>;
    }> {
        return request(`/admin/audit/stats?days=${days}`);
    },
    async getAuditEntry(id: string): Promise<AuditEntry> {
        return request(`/admin/audit/${encodeURIComponent(id)}`);
    },
    /* User management ---------------------------------------------------- */
    async listUsers(opts: {
        page?: number; limit?: number; search?: string;
        role?: string; status?: 'active' | 'inactive' | 'all';
    } = {}): Promise<{
        users: AdminUser[];
        pagination: { page: number; pageSize: number; total: number; pages: number };
    }> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.limit) qs.set('limit', String(opts.limit));
        if (opts.search) qs.set('search', opts.search);
        if (opts.role) qs.set('role', opts.role);
        if (opts.status && opts.status !== 'all') qs.set('status', opts.status);
        const query = qs.toString();
        return request(`/admin/users${query ? `?${query}` : ''}`);
    },
    async listRoles(): Promise<{ roles: AdminRole[]; permissionModules: Array<{ id: string; name: string }> }> {
        return request('/admin/users/roles/list');
    },
    async updateUser(id: string, body: {
        name?: string; email?: string; role?: string; permissions?: string[];
    }): Promise<AdminUser> {
        return request(`/admin/users/${id}`, { method: 'PUT', body });
    },
    async activateUser(id: string): Promise<AdminUser> {
        return request(`/admin/users/${id}/activate`, { method: 'POST' });
    },
    async deactivateUser(id: string): Promise<AdminUser> {
        return request(`/admin/users/${id}/deactivate`, { method: 'POST' });
    },
    async deleteUser(id: string): Promise<{ message: string }> {
        return request(`/admin/users/${id}`, { method: 'DELETE' });
    },
    /**
     * Hard-delete: removes the user row. Irreversible.
     * Cascades org memberships, sessions, API keys, OAuth identities.
     * Severs created_by on playbooks/sightings (rows preserved).
     */
    async purgeUser(id: string): Promise<{ message: string }> {
        return request(`/admin/users/${id}/purge`, { method: 'DELETE' });
    },
};

export interface AdminUser {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    roles: string[];
    permissions: string[];
    isActive: boolean;
    lastLogin: string | null;
    apiToken: string | null;
    createdAt: string;
    updatedAt: string;
}

export type ActivityKind = 'active' | 'completed' | 'failed' | 'progress';

export interface ActivityEvent {
    ts: string;
    queue: string;
    jobId: string;
    kind: ActivityKind;
    result?: unknown;
    error?: string;
    progress?: unknown;
    seq: number;
}

export interface ActivityThroughput {
    queue: string;
    total: number;
    byKind: Record<ActivityKind, number>;
    lastAt: string | null;
}

export interface ActivityFailureGroup {
    signature: string;
    sample: string;
    count: number;
    queues: string[];
    firstSeen: string;
    lastSeen: string;
}

export interface FeedSyncRun {
    id: string;
    feedId: string;
    status: 'running' | 'completed' | 'failed' | string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    itemsIngested: number;
    errors: number;
    errorDetails: string | null;
    triggeredBy: 'scheduler' | 'manual' | string;
}

export interface FeedScheduleEntry {
    key: string;            // registry key (e.g. 'otxSync')
    source: string;         // feed_sync_runs.feed_id (e.g. 'otx')
    name: string;
    description: string;
    defaultCron: string;
    effectiveCron: string | null;
    enabled: boolean;
    override: {
        enabled: boolean;
        intervalPreset: IntervalPreset | null;
        payload: Record<string, unknown> | null;
        updatedAt: string;
        updatedBy: string | null;
    } | null;
    lastRun: {
        status: 'completed' | 'failed' | string;
        startedAt: string;
        completedAt: string | null;
        durationMs: number | null;
        itemsIngested: number;
        errors: number;
        errorDetails: string | null;
        triggeredBy: string;
    } | null;
}

export type IntervalPreset = '15m' | '30m' | '1h' | '4h' | '6h' | 'daily' | 'weekly';

export interface ScheduledJobOverride {
    jobKey: string;
    enabled: boolean;
    intervalPreset: IntervalPreset | null;
    payload: Record<string, unknown> | null;
    updatedAt: string;
    updatedBy: string | null;
}

export interface ScheduledJob {
    key: string;
    jobId: string;
    name: string;
    description: string;
    defaultCron: string;
    queueName: string;
    payload: Record<string, unknown>;
    override: {
        enabled: boolean;
        intervalPreset: IntervalPreset | null;
        payload: Record<string, unknown> | null;
        updatedAt: string;
        updatedBy: string | null;
    } | null;
    enabled: boolean;
    effectiveCron: string | null;
}

export type AuditEntityType =
    | 'ioc' | 'vulnerability' | 'threat_actor' | 'pulse'
    | 'indicator' | 'malware' | 'user';

export type AuditAction = 'create' | 'update' | 'delete' | 'merge' | 'enrich';

export interface AuditEntry {
    id: string;
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    userId: string | null;
    apiKeyId: string | null;
    source: string | null;
    changes: {
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        diff?: Array<{ field: string; old: unknown; new: unknown }>;
    } | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

export interface AdminRole {
    id: string;
    name: string;
    description?: string;
    permissions?: string[];
}

/* ---------------------------------------------------------------------- */
/* Notifications                                                          */
/* ---------------------------------------------------------------------- */

export type NotificationKind = 'info' | 'warning' | 'error' | 'success' | string;

export interface AppNotification {
    id: string;
    type: NotificationKind;
    title: string;
    message: string;
    source: string;
    read: boolean;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

export const notifications = {
    async list(opts: { limit?: number; offset?: number } = {}): Promise<AppNotification[]> {
        const qs = new URLSearchParams();
        if (opts.limit) qs.set('limit', String(opts.limit));
        if (opts.offset) qs.set('offset', String(opts.offset));
        const query = qs.toString();
        return request(`/v1/notifications${query ? `?${query}` : ''}`);
    },
    async unreadCount(): Promise<number> {
        const res = await request<{ count: number }>('/v1/notifications/unread-count');
        return res.count;
    },
    /** Pass an id to mark one read; omit to mark all read. */
    async markRead(id?: string): Promise<void> {
        await request('/v1/notifications/mark-read', {
            method: 'POST',
            body: id ? { id } : {},
        });
    },
};

export const platform = {
    /**
     * `?days=N` opt-in (rolling-window switcher on the command page).
     * When passed, the API returns an additional `windowCounts` object
     * with arrivals in the last N days; `counts` is always total-of-
     * record. Backend: apps/api/src/routes/v1/stats.ts.
     */
    async stats(opts: { days?: number } = {}): Promise<{
        counts: Stats;
        windowCounts?: Stats;
        windowDays?: number;
    }> {
        const qs = opts.days != null ? `?days=${opts.days}` : '';
        return request(`/v1/stats${qs}`);
    },
    /**
     * Daily-bucketed counts for the four overview KPI tiles — drives the
     * Workbench-style sparkline next to each headline number on `/`.
     * See `apps/api/src/routes/v1/stats.ts` for the backend; zero-filled so
     * arrays are always length `days` regardless of activity.
     */
    async sparklines(days = 7): Promise<{
        days: number;
        iocs: number[];
        vulnerabilities: number[];
        threatActors: number[];
        feedSyncs: number[];
    }> {
        return request(`/v1/stats/sparklines?days=${days}`);
    },
    async health(): Promise<{ services: Record<string, { status: string }> }> {
        return request('/v1/ops/system');
    },
    async mitreCoverage(): Promise<{
        tactics: Array<{ mitreId: string; name: string; shortName: string; techniqueCount: number }>;
        totalTechniques: number;
        /**
         * ISO timestamp of the most recent MITRE sync (MAX(updated_at) over
         * the techniques table — the sync upsert bumps updated_at on every
         * conflict). Used by the ATT&CK coverage card to render a "Last
         * synced 3h ago" sub-line so operators can tell at a glance whether
         * the heatmap reflects current upstream state. Null if the sync has
         * never run on this database.
         */
        lastSyncedAt: string | null;
    }> {
        return request('/v1/mitre/coverage');
    },
    async activeActors(limit = 8, days?: number): Promise<{
        actors: Array<{
            id: string; stixId: string | null; name: string;
            aliases: string[]; country: string | null; sophistication: string | null;
            primaryMotivation: string | null;
            firstSeen: string | null; lastSeen: string | null; updatedAt: string | null;
            /** Composite activity score (see backend route for the formula). */
            score: number;
            /** Per-signal contribution to `score`, surfaced so the dashboard can
             *  show "why this scored high" on hover. */
            breakdown: {
                pulses: number;          // OTX pulse mentions in last 7d
                ttps: number;            // TTP relationship rows in last 30d
                sophistication: number;  // 0–3 by tier
                recency: number;         // 0 or 2 (last_seen within 7d)
            };
        }>;
        /** Count of actors with last_seen in the past 7 days. Distinct
         *  from `actors.length` — the array is capped at `limit` (top by
         *  score), while `total` is the real "active this week" count
         *  used by the Threat Actors KPI tile's sub-line. */
        total: number;
    }> {
        const daysQs = days != null ? `&days=${days}` : '';
        return request(`/v1/actors/active?limit=${limit}${daysQs}`);
    },
    /**
     * `period` opt-in (rolling-window switcher). The backend supports
     * '24h' | '7d' | '30d' | '90d'. When omitted, the API picks its
     * own default.
     */
    async landscape(opts: { period?: '24h' | '7d' | '30d' | '90d' } = {}): Promise<LandscapeOverview> {
        const qs = opts.period ? `?period=${opts.period}` : '';
        return request(`/v1/landscape/overview${qs}`);
    },
    async sourceBreakdown(): Promise<Array<{ source: string; count: number }>> {
        return request('/v1/stats/source-breakdown');
    },
    /**
     * `?hours=N` for sub-day windows (6h / 24h toggles on the feeds page);
     * `?days=N` for everything else. Backend prefers `hours` when both are
     * set; default behaviour with neither is the previous 30-day window.
     */
    async trendingTags(opts: { hours?: number; days?: number } = {}): Promise<Array<{ tag: string; count: number; hot: boolean }>> {
        const qs = new URLSearchParams();
        if (opts.hours != null) qs.set('hours', String(opts.hours));
        else if (opts.days != null) qs.set('days', String(opts.days));
        const s = qs.toString();
        return request(`/v1/stats/trending-tags${s ? `?${s}` : ''}`);
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
    /**
     * Per-entity activity timeline used by the entity drawer's
     * Sighting Trend section. Daily-bucketed signal of length `days`:
     *
     *   actor → distinct pulses mentioning the actor by name/alias
     *   cve   → distinct pulses with the CVE id in name/description
     *   ioc   → distinct sightings (currently empty in dev; series is
     *           all zeros until sightings populate)
     *
     * `signal` is one of 'pulse_mentions' | 'sightings' so the drawer
     * can pick a copy that matches the source ("pulse mentions" for
     * actor/cve, "sightings" for ioc).
     *
     * Backend: apps/api/src/routes/v1/timeline.ts. `days` clamps to
     * [1, 90]; defaults to 14 server-side to match the drawer's "14d"
     * header.
     */
    async entityTimeline(
        type: 'ioc' | 'cve' | 'actor',
        id: string,
        opts: { days?: number } = {},
    ): Promise<{
        type: 'ioc' | 'cve' | 'actor';
        id: string;
        days: number;
        signal: 'pulse_mentions' | 'sightings';
        series: number[];
    }> {
        const qs = opts.days != null ? `?days=${opts.days}` : '';
        return request(`/v1/timeline/${type}/${encodeURIComponent(id)}${qs}`);
    },
};

/* ============================================================================
   Platform events — semantic "what changed" stream for the attention rail.
   Distinct from `notifications` (the per-user inbox). Read-only, polled
   every 60s by the rail.
   ========================================================================= */

export type EventKind = 'kev' | 'cve' | 'actor' | 'pulse' | 'sync';

export interface PlatformEvent {
    id: string;
    kind: EventKind;
    title: string;
    meta: string;
    /** ISO timestamp — the rail sorts by this and renders relTime from it. */
    timestamp: string;
    /** Optional deep-link target so clicking the row jumps to the entity. */
    href?: string;
}

export const events = {
    async list(opts: { limit?: number } = {}): Promise<{
        events: PlatformEvent[];
        /** Total number of events surfaced across all kinds before the
         *  request's `limit` was applied. Used by the rail's header
         *  "N items" counter. */
        total: number;
    }> {
        const qs = new URLSearchParams();
        if (opts.limit) qs.set('limit', String(opts.limit));
        const query = qs.toString();
        return request(`/v1/events${query ? `?${query}` : ''}`);
    },
};

/* ============================================================================
   Personal watch — pinned entities (IOC / CVE / actor).
   Distinct from notifications (the per-user inbox) and from "watchlists"
   (named curated lists of IOC observables). This is the simple primitive
   that backs the Watch button on entity drawers and the Indicators bulk
   action bar.
   ========================================================================= */

export type WatchEntityType = 'ioc' | 'cve' | 'actor';

export interface WatchItem {
    id: string;
    entityType: WatchEntityType;
    entityId: string;
    note: string | null;
    createdAt: string;
}

export const watch = {
    /** Pin an entity. Idempotent — re-calling for an already-pinned entity
     *  succeeds and refreshes the note. */
    async pin(opts: {
        entityType: WatchEntityType;
        entityId: string;
        note?: string;
    }): Promise<WatchItem> {
        return request('/v1/watch', { method: 'POST', body: opts });
    },

    /** Unpin. Idempotent — succeeds even when the entity wasn't pinned. */
    async unpin(entityType: WatchEntityType, entityId: string): Promise<{ removed: boolean }> {
        return request(`/v1/watch/${entityType}/${encodeURIComponent(entityId)}`, { method: 'DELETE' });
    },

    /** List the current user's watched entities, optionally filtered by
     *  type. Used by ActorWatchlistPanel on the Command screen. */
    async list(opts: { type?: WatchEntityType; limit?: number } = {}): Promise<{
        items: WatchItem[];
    }> {
        const qs = new URLSearchParams();
        if (opts.type) qs.set('type', opts.type);
        if (opts.limit) qs.set('limit', String(opts.limit));
        const query = qs.toString();
        return request(`/v1/watch${query ? `?${query}` : ''}`);
    },

    /** Single-entity check — backs the drawer's initial Watch button state
     *  without paginating the full list. */
    async check(entityType: WatchEntityType, entityId: string): Promise<{
        watched: boolean;
        createdAt: string | null;
    }> {
        return request(`/v1/watch/check/${entityType}/${encodeURIComponent(entityId)}`);
    },
};

export interface LandscapeOverview {
    period: string;
    iocs: { total: number; critical: number; high: number; avgScore: number };
    /** `inKev` is the count of CVEs in the window also on CISA's Known
     *  Exploited Vulnerabilities catalog — drives the Vulnerabilities tile
     *  sub-line. Older API revs that predate cti-platform-api PR #43 omit
     *  the field; the UI treats `undefined` as "no signal" and hides the
     *  KEV chip rather than rendering "0 KEV" misleadingly. */
    vulnerabilities: { total: number; critical: number; high: number; inKev?: number };
    notifications: { total: number };
    iocTypeDistribution: Array<{ type: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
    severityDistribution: Array<{ severity: string | null; count: number }>;
}

// =============================================================================
// Vulnerabilities
// =============================================================================

export interface Vulnerability {
    id: string; cveId: string; description: string | null;
    cvssScore: number | null; severity: string | null;
    isExploited: boolean | null;
    vendorProject: string | null; product: string | null;
    /** NVD's publication timestamp for the CVE. */
    publishedDate: string | null;
    /** NVD's lastModified timestamp. Null when the OpenSearch row was
     *  indexed with the value stored only as `updatedAt`. */
    lastModified: string | null;
    /** Indexer's updatedAt — set to `lastModified` at index time, so use
     *  this as the canonical "last touched" timestamp for the row. */
    updatedAt: string | null;
    /**
     * EPSS — FIRST.org daily exploit-prediction score. Both fields are
     * 0–1 floats; null until the daily EPSS sync has scored this CVE.
     * Refreshed within 24h of new CVEs hitting the corpus.
     */
    epssScore: number | null;
    epssPercentile: number | null;
    epssUpdatedAt: string | null;
}

export interface VulnListResponse {
    items: Vulnerability[];
    pagination: { page: number; pageSize: number; total: number; pages: number };
    facets?: Record<string, Record<string, number>>;
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
        return request(`/v1/vulnerabilities${query ? `?${query}` : ''}`);
    },
    async get(cveId: string): Promise<Vulnerability & { rawData?: Record<string, unknown> | null }> {
        return request(`/v1/vulnerabilities/${encodeURIComponent(cveId)}`);
    },
    /** Fetch CVSS from NVD for a single CVE; skipped if already scored. */
    async enrich(cveId: string): Promise<{
        cveId: string;
        applied: boolean;
        reason?: 'already-scored' | 'no-nvd-data';
        score?: number;
        vector?: string;
        severity?: string;
        version?: 'v3.1' | 'v3.0' | 'v2';
        /** Which data source served the enrichment. */
        source?: 'osv' | 'nvd';
    }> {
        return request(`/v1/vulnerabilities/${encodeURIComponent(cveId)}/enrich`, { method: 'POST' });
    },
    /** Bulk back-fill CVSS for every vulnerability with NULL cvssScore. Admin only. */
    async enrichBulk(opts: { limit?: number } = {}): Promise<{
        considered: number; enriched: number; notFound: number;
        errors: Array<{ cveId: string; error: string }>;
    }> {
        return request('/v1/vulnerabilities/enrich/bulk', { method: 'POST', body: { limit: opts.limit } });
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
    /**
     * `threat_actors.confidence` is `varchar(20)` — STIX uses a string enum
     * ("none" | "low" | "medium" | "high"). LLM-enriched actors and some
     * STIX implementations write a 0–100 number instead. Render via
     * `formatConfidence` / `confidenceToNumber` in `@/lib/utils` to handle
     * both shapes uniformly.
     */
    confidence: string | number | null;
    country: string | null;
    /** When the upstream source first observed this actor. */
    firstSeen: string | null;
    /** When the upstream source last observed activity. This is the
     *  canonical "freshness" signal for analysts — use this, not
     *  `updatedAt`, when displaying recency on actor lists. */
    lastSeen: string | null;
    /** When the upstream STIX record was last edited (separate from
     *  observed activity). Useful fallback when `lastSeen` is null. */
    stixModified: string | null;
    /** When our DB row was last written by the scheduler/sync. Internal
     *  — do not display as a freshness indicator. */
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
    /** Named adversary (group / actor) when the analyst attributed one. */
    adversary: string | null;
    /** Malware families called out in the pulse, e.g. "Emotet", "Lumma". */
    malwareFamilies: string[] | null;
    /** MITRE ATT&CK technique IDs the pulse maps to, e.g. ["T1059.001", "T1566"]. */
    attackIds: string[] | null;
    /** URLs to source articles + vendor write-ups OTX bundled with the pulse. */
    references: string[] | null;
    /** OTX community subscribers — light signal for pulse impact. */
    subscriberCount: number | null;
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

/**
 * The backend's `type` query param on `/v1/search` and `/v1/search/vector`
 * matches the **indexed `entityType` value**, which uses a hyphen for
 * threat actors (`'threat-actor'`) — not the underscore form (`'threat_actor'`)
 * we use canonically elsewhere in the dashboard. We accept `string` here
 * rather than a tight union so callers can pass either wire form without
 * an `as` cast; `searchTypeWire()` below converts from the canonical
 * dashboard form to the wire form.
 */
type SearchWireType = string;

/**
 * Convert a canonical dashboard entity key to the wire form the backend's
 * `?type=` filter expects. Specifically rewrites `'threat_actor'` →
 * `'threat-actor'`. Other forms pass through.
 */
function searchTypeWire(t: SearchWireType | undefined): SearchWireType | undefined {
    if (!t) return undefined;
    return t === 'threat_actor' ? 'threat-actor' : t;
}

export const search = {
    async unified(opts: {
        q: string; page?: number; pageSize?: number; type?: SearchWireType;
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
        const wire = searchTypeWire(opts.type);
        if (wire) qs.set('type', wire);
        return request(`/v1/search?${qs.toString()}`);
    },
    async vector(opts: { q: string; k?: number; type?: SearchWireType }): Promise<{
        items: SearchHit[]; total: number; took: number;
    }> {
        const qs = new URLSearchParams({ q: opts.q });
        if (opts.k) qs.set('k', String(opts.k));
        const wire = searchTypeWire(opts.type);
        if (wire) qs.set('type', wire);
        return request(`/v1/search/vector?${qs.toString()}`);
    },
    async similar(docId: string, opts: { k?: number; type?: SearchWireType } = {}): Promise<{
        items: SearchHit[]; total: number; took: number;
    }> {
        const qs = new URLSearchParams();
        if (opts.k) qs.set('k', String(opts.k));
        const wire = searchTypeWire(opts.type);
        if (wire) qs.set('type', wire);
        const query = qs.toString();
        return request(`/v1/search/similar/${encodeURIComponent(docId)}${query ? `?${query}` : ''}`);
    },
};

/**
 * Normalize the backend's `entityType` field (which uses `'threat-actor'`
 * with a hyphen for actors, matching the OpenSearch index) to the canonical
 * underscore form (`'threat_actor'`) the rest of the dashboard uses for
 * route segments, prop types, and tone-map lookups.
 *
 * Why this exists: `hitHref` used to do `case 'threat_actor':` against the
 * raw value. Actors are indexed as `'threat-actor'`, so the case never
 * matched, threat-actor hits fell through to the default `/iocs/{id}`
 * branch, and the IOC detail route 404'd because the UUID belonged to an
 * actor — not an IOC. SimilarPanel had the same bug.
 *
 * Apply this once, at the boundary where you read `hit.entityType`.
 */
export function normalizeEntityType(raw: string): string {
    const s = raw.toLowerCase();
    if (s === 'threat-actor' || s === 'threatactor') return 'threat_actor';
    return s;
}

/**
 * Best-effort link generator for a search hit.
 * Falls back to /iocs/{id} if we can't route to a typed page (which is
 * still wrong for unknown types — log a warning if we ever see one in
 * production so we can add a case).
 */
export function hitHref(hit: SearchHit): string {
    switch (normalizeEntityType(hit.entityType)) {
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

/* ---------------------------------------------------------------------- */
/* Graph exploration (Neo4j)                                              */
/* ---------------------------------------------------------------------- */

export interface GraphNode {
    id: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
}

export interface GraphEdge {
    source: string;
    target: string;
    type: string;
    properties: Record<string, unknown>;
}

export interface GraphResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
    meta?: Record<string, unknown>;
}

// Graph endpoints live at /v2/graph (see apps/api/src/routes/v2.ts:26).
// There's an older /v1/graph/neo4j/* set with the same shape, but v2 is the
// canonical surface: full mode set, no `neo4j` infix, easier to reason about.
//
// `request<T>()` already unwraps the `{ success, data }` envelope (see the
// auto-unwrap at line ~121 above) and returns the inner `data` directly.
// Earlier this file double-wrapped with a `GraphEnvelope` type then
// re-accessed `.data` — every call returned undefined, and the graph
// page rendered nothing (no data, no loading, no error) because SWR
// resolved with `data: undefined`.
const GRAPH_BASE = '/v2/graph';

export const graphApi = {
    /** IOC → Pulse → Actor → related IOCs. Pass the raw IOC value. */
    iocPivot(value: string, limit = 50): Promise<GraphResult> {
        return request<GraphResult>(
            `${GRAPH_BASE}/ioc-pivot/${encodeURIComponent(value)}?limit=${limit}`,
        );
    },
    /** Actor → Techniques → Tactics (MITRE chain). Pass the actor name. */
    attackTree(actor: string): Promise<GraphResult> {
        return request<GraphResult>(
            `${GRAPH_BASE}/attack-tree/${encodeURIComponent(actor)}`,
        );
    },
    /** N-hop neighborhood of any node. Pass the Neo4j-side node id (UUID or canonical key). */
    expand(id: string, depth = 1, limit = 50): Promise<GraphResult> {
        return request<GraphResult>(
            `${GRAPH_BASE}/expand/${encodeURIComponent(id)}?depth=${depth}&limit=${limit}`,
        );
    },
    /** Actors sharing >= `minShared` techniques with the named actor. */
    relatedActors(actor: string, minShared = 1): Promise<GraphResult> {
        return request<GraphResult>(
            `${GRAPH_BASE}/related-actors/${encodeURIComponent(actor)}?minShared=${minShared}`,
        );
    },
};

// =============================================================================
// Brand / typo-squat monitoring (Phase 5 #1)
// =============================================================================

export interface MonitoredDomain {
    id: string;
    apexDomain: string;
    label: string | null;
    owner: string | null;
    enabled: boolean;
    lastSweptAt: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export type BrandAlertDnsState = 'active' | 'mx_only' | 'nx' | 'error';
export type BrandAlertStatus = 'new' | 'triaging' | 'escalated' | 'benign' | 'blocked';
export type BrandAlgorithm =
    | 'bitsquat' | 'homoglyph' | 'insertion' | 'omission' | 'substitution'
    | 'transposition' | 'vowel-swap' | 'hyphenation' | 'subdomain';

export interface BrandAlert {
    id: string;
    monitoredDomainId: string;
    permutation: string;
    algorithm: BrandAlgorithm;
    dnsState: BrandAlertDnsState;
    ipAddresses: string | null;
    score: number;
    status: BrandAlertStatus;
    firstSeenAt: string;
    lastCheckedAt: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface BrandSweepSummary {
    monitoredDomainId: string;
    apex: string;
    permutationsGenerated: number;
    permutationsChecked: number;
    hitsCreated: number;
    hitsUpdated: number;
    durationMs: number;
}

export interface BrandAlertListResponse {
    items: BrandAlert[];
    pagination: { page: number; pageSize: number; total: number };
}

export const brand = {
    /** Watchlist CRUD. */
    listDomains(): Promise<MonitoredDomain[]> {
        return request('/v1/brand/domains');
    },
    getDomain(id: string): Promise<MonitoredDomain & { recentAlerts: BrandAlert[] }> {
        return request(`/v1/brand/domains/${encodeURIComponent(id)}`);
    },
    createDomain(body: {
        apexDomain: string;
        label?: string;
        owner?: string;
        enabled?: boolean;
    }): Promise<MonitoredDomain> {
        return request('/v1/brand/domains', { method: 'POST', body });
    },
    updateDomain(id: string, body: {
        label?: string | null;
        owner?: string | null;
        enabled?: boolean;
    }): Promise<MonitoredDomain> {
        return request(`/v1/brand/domains/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    deleteDomain(id: string): Promise<{ id: string; deleted: true }> {
        return request(`/v1/brand/domains/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    /** Sweep one apex now (don't wait for the 6h cron). */
    sweep(id: string): Promise<BrandSweepSummary> {
        return request(`/v1/brand/domains/${encodeURIComponent(id)}/sweep`, { method: 'POST' });
    },
    /** Sweep all enabled apexes. */
    sweepAll(): Promise<{
        domainsSwept: number;
        totalPermutations: number;
        totalHitsCreated: number;
        totalHitsUpdated: number;
        summaries: BrandSweepSummary[];
    }> {
        return request('/v1/brand/sweep', { method: 'POST' });
    },

    /** Triage queue. */
    listAlerts(opts: {
        page?: number;
        pageSize?: number;
        monitoredDomainId?: string;
        status?: BrandAlertStatus;
        dnsState?: BrandAlertDnsState;
        minScore?: number;
    } = {}): Promise<BrandAlertListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.monitoredDomainId) qs.set('monitoredDomainId', opts.monitoredDomainId);
        if (opts.status) qs.set('status', opts.status);
        if (opts.dnsState) qs.set('dnsState', opts.dnsState);
        if (typeof opts.minScore === 'number') qs.set('minScore', String(opts.minScore));
        const query = qs.toString();
        return request(`/v1/brand/alerts${query ? `?${query}` : ''}`);
    },
    updateAlert(id: string, body: {
        status?: BrandAlertStatus;
        notes?: string;
    }): Promise<BrandAlert> {
        return request(`/v1/brand/alerts/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
};

// =============================================================================
// Paste-site monitoring — GitHub Gist firehose (Phase 5 #5)
// =============================================================================

export interface PasteWatchterm {
    id: string;
    term: string;
    kind: string | null;
    owner: string | null;
    enabled: boolean;
    lastSearchedAt: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export type PasteSource = 'github_gist';
export type PasteMentionStatus = 'new' | 'triaging' | 'escalated' | 'benign' | 'blocked';

export interface PasteMention {
    id: string;
    watchtermId: string;
    source: PasteSource;
    author: string | null;
    filename: string | null;
    title: string | null;
    externalUrl: string;
    externalId: string;
    snippet: string | null;
    score: number;
    status: PasteMentionStatus;
    firstSeenAt: string;
    lastSeenAt: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface PasteMentionListResponse {
    items: PasteMention[];
    pagination: { page: number; pageSize: number; total: number };
}

export interface PasteScanSummary {
    pagesFetched: number;
    gistsScanned: number;
    watchtermsActive: number;
    matchesCreated: number;
    matchesUpdated: number;
    durationMs: number;
    error?: string;
}

export const paste = {
    listWatchterms(): Promise<PasteWatchterm[]> {
        return request('/v1/paste/watchterms');
    },
    getWatchterm(id: string): Promise<PasteWatchterm & { recentMentions: PasteMention[] }> {
        return request(`/v1/paste/watchterms/${encodeURIComponent(id)}`);
    },
    createWatchterm(body: {
        term: string;
        kind?: string;
        owner?: string;
        enabled?: boolean;
    }): Promise<PasteWatchterm> {
        return request('/v1/paste/watchterms', { method: 'POST', body });
    },
    updateWatchterm(id: string, body: {
        kind?: string | null;
        owner?: string | null;
        enabled?: boolean;
    }): Promise<PasteWatchterm> {
        return request(`/v1/paste/watchterms/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    deleteWatchterm(id: string): Promise<{ id: string; deleted: true }> {
        return request(`/v1/paste/watchterms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    /** Trigger an ad-hoc Gist firehose scan across every enabled watchterm. */
    scan(): Promise<PasteScanSummary> {
        return request('/v1/paste/scan', { method: 'POST' });
    },
    listMentions(opts: {
        page?: number;
        pageSize?: number;
        watchtermId?: string;
        status?: PasteMentionStatus;
        minScore?: number;
    } = {}): Promise<PasteMentionListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.watchtermId) qs.set('watchtermId', opts.watchtermId);
        if (opts.status) qs.set('status', opts.status);
        if (typeof opts.minScore === 'number') qs.set('minScore', String(opts.minScore));
        const query = qs.toString();
        return request(`/v1/paste/mentions${query ? `?${query}` : ''}`);
    },
    updateMention(id: string, body: {
        status?: PasteMentionStatus;
        notes?: string;
    }): Promise<PasteMention> {
        return request(`/v1/paste/mentions/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
};

// =============================================================================
// HIBP breach catalog (Phase 5 #3) — read-only
// =============================================================================

export interface DataBreach {
    id: string;
    name: string;
    title: string;
    domain: string | null;
    breachDate: string | null;
    addedDate: string | null;
    modifiedDate: string | null;
    pwnCount: number;
    dataClasses?: string[];
    description?: string | null;
    isVerified: boolean;
    isFabricated?: boolean;
    isSensitive: boolean;
    isRetired: boolean;
    isSpamList?: boolean;
    logoPath: string | null;
}

export interface DataBreachListResponse {
    items: DataBreach[];
    pagination: { page: number; pageSize: number; total: number };
}

export const breaches = {
    list(opts: {
        page?: number;
        pageSize?: number;
        domain?: string;
        name?: string;
        addedSince?: string;
        breachSince?: string;
        includeRetired?: boolean;
        includeSpamList?: boolean;
        includeFabricated?: boolean;
    } = {}): Promise<DataBreachListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.domain) qs.set('domain', opts.domain);
        if (opts.name) qs.set('name', opts.name);
        if (opts.addedSince) qs.set('addedSince', opts.addedSince);
        if (opts.breachSince) qs.set('breachSince', opts.breachSince);
        if (opts.includeRetired) qs.set('includeRetired', 'true');
        if (opts.includeSpamList) qs.set('includeSpamList', 'true');
        if (opts.includeFabricated) qs.set('includeFabricated', 'true');
        const query = qs.toString();
        return request(`/v1/data-breaches${query ? `?${query}` : ''}`);
    },
    get(name: string): Promise<DataBreach> {
        return request(`/v1/data-breaches/${encodeURIComponent(name)}`);
    },
    /** Admin-only ad-hoc resync. */
    sync(): Promise<{ totalEntries: number; added: number; updated: number; errors: string[] }> {
        return request('/v1/data-breaches/sync', { method: 'POST' });
    },
};

// =============================================================================
// Threat-actor TTP changelog (Phase 5 #2) — read-only
// =============================================================================

export type TtpChangeType = 'added' | 'removed';

export interface ActorTtpChange {
    id: string;
    actorId: string;
    techniqueId: string;
    changeType: TtpChangeType;
    detectedAt: string;
    note: string | null;
    /**
     * Resolved via LEFT JOIN against threat_actors.real_stix_id. Null when
     * the catalog row hasn't caught up to a relationship's actor reference
     * (rare — usually a freshly-ingested STIX object whose intrusion-set
     * row hasn't been upserted yet). UI falls back to the raw actorId.
     */
    actorName: string | null;
    actorAliases: string[] | null;
    /** Human-readable MITRE id (`T1059.001`) from the techniques catalog. */
    techniqueMitreId: string | null;
    techniqueName: string | null;
}

export interface ActorTtpChangeListResponse {
    items: ActorTtpChange[];
    pagination: { page: number; pageSize: number; total: number };
}

export const ttps = {
    list(opts: {
        page?: number;
        pageSize?: number;
        actorId?: string;
        techniqueId?: string;
        changeType?: TtpChangeType;
        /** ISO-8601 cutoff; only entries with detected_at >= since are returned. */
        since?: string;
    } = {}): Promise<ActorTtpChangeListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.actorId) qs.set('actorId', opts.actorId);
        if (opts.techniqueId) qs.set('techniqueId', opts.techniqueId);
        if (opts.changeType) qs.set('changeType', opts.changeType);
        if (opts.since) qs.set('since', opts.since);
        const query = qs.toString();
        return request(`/v1/ttp-changes${query ? `?${query}` : ''}`);
    },
    forActor(actorId: string, opts: {
        page?: number;
        pageSize?: number;
        changeType?: TtpChangeType;
        since?: string;
    } = {}): Promise<ActorTtpChangeListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.changeType) qs.set('changeType', opts.changeType);
        if (opts.since) qs.set('since', opts.since);
        const query = qs.toString();
        return request(`/v1/actors/${encodeURIComponent(actorId)}/ttp-changes${query ? `?${query}` : ''}`);
    },
};

// =============================================================================
// Dark-web monitoring — Ahmia indexed search (Phase 5 #4)
//
// Honest scope: as of 2026-06-09 the Ahmia HTML scraper is broken-by-
// upstream — Ahmia moved results to client-side JS rendering and their
// /search/atom feed returns 404. The watchterm CRUD + table layer ship
// regardless (so an alternative dark-web source can slot in later
// without UI work), but `scan()` currently returns zero results.
// =============================================================================

export interface DarkWebWatchterm {
    id: string;
    term: string;
    kind: string | null;
    owner: string | null;
    enabled: boolean;
    lastSearchedAt: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export type DarkWebSource = 'ahmia';
export type DarkWebMentionStatus = 'new' | 'triaging' | 'escalated' | 'benign' | 'blocked';

export interface DarkWebMention {
    id: string;
    watchtermId: string;
    source: DarkWebSource;
    title: string;
    onionUrl: string;
    snippet: string | null;
    score: number;
    status: DarkWebMentionStatus;
    firstSeenAt: string;
    lastSeenAt: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface DarkWebMentionListResponse {
    items: DarkWebMention[];
    pagination: { page: number; pageSize: number; total: number };
}

export const darkWeb = {
    listWatchterms(): Promise<DarkWebWatchterm[]> {
        return request('/v1/dark-web/watchterms');
    },
    getWatchterm(id: string): Promise<DarkWebWatchterm & { recentMentions: DarkWebMention[] }> {
        return request(`/v1/dark-web/watchterms/${encodeURIComponent(id)}`);
    },
    createWatchterm(body: {
        term: string;
        kind?: string;
        owner?: string;
        enabled?: boolean;
    }): Promise<DarkWebWatchterm> {
        return request('/v1/dark-web/watchterms', { method: 'POST', body });
    },
    updateWatchterm(id: string, body: {
        kind?: string | null;
        owner?: string | null;
        enabled?: boolean;
    }): Promise<DarkWebWatchterm> {
        return request(`/v1/dark-web/watchterms/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    deleteWatchterm(id: string): Promise<{ id: string; deleted: true }> {
        return request(`/v1/dark-web/watchterms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    /** Ad-hoc per-term scan. Currently returns 0 results — Ahmia HTML scraper broken upstream. */
    scanOne(id: string): Promise<{ term: string; results: number; created: number; updated: number }> {
        return request(`/v1/dark-web/watchterms/${encodeURIComponent(id)}/scan`, { method: 'POST' });
    },
    /** Sweep every enabled term. */
    scanAll(): Promise<{ termsScanned: number; resultsTotal: number; mentionsCreated: number; mentionsUpdated: number; durationMs: number }> {
        return request('/v1/dark-web/scan', { method: 'POST' });
    },
    listMentions(opts: {
        page?: number;
        pageSize?: number;
        watchtermId?: string;
        status?: DarkWebMentionStatus;
        minScore?: number;
    } = {}): Promise<DarkWebMentionListResponse> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.watchtermId) qs.set('watchtermId', opts.watchtermId);
        if (opts.status) qs.set('status', opts.status);
        if (typeof opts.minScore === 'number') qs.set('minScore', String(opts.minScore));
        const query = qs.toString();
        return request(`/v1/dark-web/mentions${query ? `?${query}` : ''}`);
    },
    updateMention(id: string, body: {
        status?: DarkWebMentionStatus;
        notes?: string;
    }): Promise<DarkWebMention> {
        return request(`/v1/dark-web/mentions/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
};

// ============================================================================
// Feed Connectors — declarative feed-engine manifest CRUD + builder support
// ============================================================================

export type ConnectorEntity =
    | 'ioc' | 'vulnerability' | 'threat_actor' | 'malware' | 'campaign'
    | 'course_of_action' | 'infrastructure' | 'technique' | 'tool';

export type ConnectorFormat = 'json' | 'csv';

export interface ConnectorRow {
    id: string;
    source: string;
    version: number;
    entity: ConnectorEntity;
    manifest: Record<string, unknown>;
    isActive: boolean;
    createdBy: string;
    createdAt: string;
    lastValidatedAt: string | null;
    lastValidationErrors: unknown;
}

export interface SuggestResult {
    status: 'ok' | 'couldnt_map';
    manifest: Record<string, unknown>;
    dryRun?: {
        read: number;
        ok: number;
        failed: number;
        errors: Array<{ index: number; reason: string }>;
    };
    reason?: string;
    llmMeta?: { provider: string; model: string; latencyMs: number; tokensUsed?: number };
}

export interface PreviewResult {
    ok: boolean;
    records: Record<string, unknown>[];
    fields: string[];
    totalCount: number;
    reason?: string;
}

export interface TestResult {
    ok: boolean;
    dryRun?: {
        read: number;
        ok: number;
        failed: number;
        errors: Array<{ index: number; reason: string }>;
    };
    records?: unknown[];
    validationIssues?: Array<{ path: string; message: string }>;
    runtimeError?: string;
}

export const connectors = {
    async list(filters: {
        source?: string;
        entity?: ConnectorEntity;
        activeOnly?: boolean;
    } = {}): Promise<{ data: ConnectorRow[]; count: number }> {
        const qs = new URLSearchParams();
        if (filters.source) qs.set('source', filters.source);
        if (filters.entity) qs.set('entity', filters.entity);
        if (filters.activeOnly !== undefined) qs.set('activeOnly', String(filters.activeOnly));
        const query = qs.toString();
        // The route returns `{ success, data: [...], count }` but the request<>
        // helper extracts data[0]. We want the whole envelope (rows + count) so
        // we have to ask the helper for the unwrapped shape and rebuild.
        return request<{ data: ConnectorRow[]; count: number }>(
            `/v1/connectors${query ? `?${query}` : ''}`,
        );
    },
    async get(id: string): Promise<ConnectorRow> {
        return request(`/v1/connectors/${encodeURIComponent(id)}`);
    },
    async create(body: {
        source: string;
        entity: ConnectorEntity;
        manifest: Record<string, unknown>;
    }): Promise<ConnectorRow> {
        return request('/v1/connectors', { method: 'POST', body });
    },
    async activate(id: string): Promise<ConnectorRow> {
        return request(`/v1/connectors/${encodeURIComponent(id)}/activate`, { method: 'POST' });
    },
    async deactivate(id: string): Promise<{ id: string; isActive: false }> {
        return request(`/v1/connectors/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async suggest(body: {
        sample: string;
        format: ConnectorFormat;
        entity: ConnectorEntity;
        sourceName: string;
        recordsPathHint?: string;
        provider?: 'gemini' | 'openrouter' | 'ollama';
    }): Promise<SuggestResult> {
        return request('/v1/connectors/suggest', { method: 'POST', body });
    },
    async preview(body: {
        sample: string;
        format: ConnectorFormat;
        recordsPath?: string;
        csv?: { delimiter: string; hasHeader: boolean };
        limit?: number;
    }): Promise<PreviewResult> {
        return request('/v1/connectors/preview', { method: 'POST', body });
    },
    async test(body: {
        sample: string;
        manifest: Record<string, unknown>;
        limit?: number;
    }): Promise<TestResult> {
        return request('/v1/connectors/test', { method: 'POST', body });
    },
};

