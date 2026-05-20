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
    if (parsed && typeof parsed === 'object' && 'success' in parsed && 'data' in parsed) {
        return (parsed as { data: T }).data;
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
};

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

export const vulns = {
    async list(opts: { page?: number; pageSize?: number; severity?: string; q?: string } = {}): Promise<{
        items: Vulnerability[];
        pagination: { page: number; pageSize: number; total: number; pages: number };
    }> {
        const qs = new URLSearchParams();
        if (opts.page) qs.set('page', String(opts.page));
        if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
        if (opts.severity) qs.set('severity', opts.severity);
        if (opts.q) qs.set('q', opts.q);
        const query = qs.toString();
        return request(`/v1/vulnerabilities${query ? `?${query}` : ''}`);
    },
};
