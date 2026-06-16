@AGENTS.md

# CTI Platform Dashboard — working reference

The admin/analyst SPA for the Rinjani CTI platform. This file is the fast path
for working in this repo; read it before adding a page or an API call.

> ⚠️ Per `AGENTS.md`: this is a **bleeding-edge Next.js** (16) + **React 19** +
> **Tailwind v4** setup — APIs and class names can differ from training data.
> When unsure about a framework API, check `node_modules/next/dist/docs/`.

## Stack

- **Next.js 16 App Router** (`next dev -p 3000`), **React 19**, **TypeScript**.
- **Tailwind v4** + **shadcn/ui** primitives (`src/components/ui/*`).
- **SWR** for data fetching, **sonner** for toasts, **next-themes**.
- Talks to the backend API (`v3-backend-api-rinjani`) over REST.

## Layout of the code

```
src/
  app/(app)/        authed pages (route group). Each dir = a route: hunt, iocs,
                    actors, vulnerabilities, graph, feeds, brand/*, paste/*,
                    dark-web/*, admin/*, …  + login (outside the group)
  app/(app)/layout.tsx   the shell: sidebar + topbar + main + attention rail.
                         NAV_GROUPS here drives the sidebar — add nav items here.
  lib/
    api.ts          THE API client — namespaced fns over request<T>() (see below)
    auth.tsx        useAuth(), token storage, route guard
    tone.tsx, utils.ts
  components/
    ui/*            shadcn primitives (button, card, badge, table, dialog, tabs,
                    input, textarea, select, skeleton, sheet, sonner, …)
    cc/*            "Command Center" bespoke kit — the house style. Prefer these:
                      data-table  (list pages), sev (severity pill),
                      conf-bar (confidence bar), tags, status-dot, panel-head,
                      segmented, entity-drawer (row→detail), attention-rail,
                      topbar, tweaks/tweaks-panel (accent + density theming)
```

## The API client (`src/lib/api.ts`)

All backend calls go through one `request<T>()` wrapper. **It already unwraps the
`{ success, data }` envelope and handles auth + 401→/login** — so your fn returns
`T` (the `data`), not the envelope.

- Base URL: `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'`.
- Auth: `Authorization: Bearer <jwt>` if logged in, else `X-API-Key:
  NEXT_PUBLIC_API_KEY`.
- Endpoints are grouped into **namespaced objects**: `iocs`, `actors`, `vulns`,
  `agent`, `admin`, `platform`, … Add new endpoints as a new `export const <ns> = {…}`.

```ts
export const things = {
  async list(opts: { limit?: number } = {}): Promise<Thing[]> {
    return request(`/v1/things?limit=${opts.limit ?? 50}`);
  },
  async create(body: NewThing): Promise<Thing> {
    return request('/v1/things', { method: 'POST', body });  // body is an object; request stringifies it
  },
};
```

Backend error responses surface as a thrown `ApiError(status, message, code)` —
catch and `toast.error(e.message)` in the page.

## Adding a page (the recipe)

1. **Client component**: file starts with `'use client';`.
2. **Data**: `useSWR('key', () => api.ns.fn())`. Mutations: call the api fn, then
   `mutate()` / refetch; `toast` the result.
3. **UI**: compose `components/ui/*`; reach for `components/cc/*` to match the
   house style (use `data-table` for list/table pages, `sev`/`conf-bar` for
   severity/confidence, `entity-drawer` for row detail).
4. **Nav**: add `{ href, label, icon, roles? }` to the right group in
   `NAV_GROUPS` (`app/(app)/layout.tsx`); import the icon from `lucide-react`.
5. **Verify**: `pnpm exec tsc --noEmit` then `pnpm exec next build` (confirm your
   route shows in the build output, e.g. `├ ○ /hunt`). Frontend behaviour is
   verified visually via `pnpm dev`.

## Layout rules — pages are FULL-BLEED (learned the hard way)

The shell renders: **sidebar (left) · `<main class="flex-1 min-w-0 overflow-auto p-4 sm:p-6">` · `<AttentionRail/>` (right)**.

- **Do NOT center pages or cap their width** (`mx-auto max-w-*`). Every page
  fills the main pane and left-aligns, like the data-table pages. A centered
  block reads off-pattern.
- **Do NOT add a page-level right side rail** — the shell already owns the
  `AttentionRail`. A second rail crowds it.
- **Overflow trap**: `main` is a flex/grid context, so children default to
  `min-width: auto`. Long unbreakable content (ETH addresses, JSON) in `<pre>`
  will **expand the track and force a horizontal scrollbar**. Fix at the source:
  put `min-w-0` on flex/grid children, and make code blocks **wrap**
  (`whitespace-pre-wrap` + **`wrap-break-word`** or `break-all`) with `max-h` +
  `overflow-y-auto` for big blobs — never cap the page width to dodge it.
  - This only shows under real data density (e.g. a populated attention rail
    narrows the pane), so test with realistic content, not an empty local DB.

## Tailwind v4 notes

- Canonical class names differ from v3: use **`wrap-break-word`** (not
  `break-words`), `wrap-anywhere`, etc. The editor's Tailwind LSP flags the
  non-canonical form — heed it.

## Auth & roles (matters for write UIs)

API keys carry a role (`API_KEYS` env on the backend is `"key:role,…"`; roles:
`admin | analyst | developer | auditor | viewer`). Backend **writes** require
`admin`/`analyst`/`developer`; **reads** need only auth. So a viewer-role
key/login renders read views fine but every mutation (create, the agent's
**Commit** button, etc.) 403s. If writes silently fail, check the role first.

## Local dev

```bash
pnpm install
pnpm dev                       # http://localhost:3000
# .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:3001   (local backend)  OR a deployed API
#   NEXT_PUBLIC_API_KEY=<an admin/analyst key>  (for writes without logging in)
```
Backend runs separately on `:3001` (`pnpm --filter @rinjani/api dev` in the API
repo, with infra via its `docker compose up -d`). A fresh local DB is empty —
seed via the API for pages to render real content.

## Conventions / gotchas

- Default branch is **`main`** (the *backend* repo uses `master` — don't mix them up).
- Branch each change/follow-up off fresh `main`; don't push new commits to an
  already-merged branch (they go nowhere reviewable).
- Routes are intentionally kept as-is (`/iocs`, `/command`, …) — don't rename.
- The `agent` namespace + `/hunt` page (the agentic-analytics console) are the
  reference example of wiring a new backend capability: `lib/api.ts` namespace +
  a `(app)/<name>/page.tsx` + a `NAV_GROUPS` entry.
