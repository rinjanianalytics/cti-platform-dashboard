# V3 Rinjani CTI — Dashboard

**Operator UI for the [RinjaniAnalytics CTI platform](https://rinjanianalytics.com).** Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn/ui (base-ui flavour) · SWR · Neo4j graph explorer · embedded BullMQ pipeline UI.

Paired with [cti-platform-api](https://github.com/rinjanianalytics/cti-platform-api).

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📸 Tour

### Sign in (`/login`)
Two-pane "command identity" + "secure access" layout. Left pane carries the brand: ambient grid + animated node graph + live status strip (indicators, active feeds, UTC platform clock). Right pane is OAuth-first (Google / GitHub, discovered via `GET /auth/oauth/providers`) with an API-key fallback for service-to-service flows. Built from the Rinjani Admin Dashboard refactor handoff; design tokens mapped to the existing `--brand` (Rinjani teal) so the page stays on-palette.

![Sign in](docs/screenshots/login-page.png)

### Threat Command — analyst dashboard (`/`)
KPI tiles with rolling-window sparklines and delta %, CRIT-IOC priority triage, severity distribution, ATT&CK coverage, indicator types, trending tags, actor watchlist, and a semantic events rail on the right (KEV adds, high-CVSS CVEs, new actors, big pulses, sync failures). The 24H / 7D / 30D switcher scopes every tile and panel to the selected window.

![Threat Command — analyst dashboard](docs/screenshots/dashboard.png)

### Indicators (`/iocs`)
IPs / domains / hashes / URLs with type + severity filters, type-ahead search, sev-tinted left edge, and a click-through entity drawer with Pivot-in-graph, Copy, and Watch actions.

![Indicators](docs/screenshots/dashboard-indicators.png)

### Vulnerabilities (`/vulnerabilities`)
Vendor/product, CVSS, KEV-only toggle, published-date range filter. Each row deep-links to the CVE drawer with KEV chip, attributes, and related entities via vector similarity.

![Vulnerabilities](docs/screenshots/dashboard-vulnerabilities.png)

### Threat actors (`/actors`)
APT groups with aliases, sophistication, motivation, resource level, and a composite **activity** score (OTX pulse mentions × TTP recency × sophistication × recency bonus — not just `last_seen DESC`). "AI enrich missing" fires Gemini against blank fields.

![Threat actors](docs/screenshots/dashboard-threat-actors.png)

### Graph explorer (`/graph`)
Type a seed (IOC value, actor name, technique ID) and expand the neighbourhood via Cypher. Force-directed: actor ↔ technique ↔ malware ↔ IOC ↔ vuln.

![Graph explorer](docs/screenshots/dashboard-graph.png)

### Services (`/admin/services`)
One-pane ops health: Postgres / OpenSearch / Neo4j / Redis × 2, API + worker liveness, bootlock state, queue depths, recent feed-sync results, LLM provider + enrichment-source config.

![Services](docs/screenshots/dashboard-services.png)

### Feeds (`/feeds`)
Analyst-facing landscape rotation: live per-source counters (OTX pulses today / week / total) plus the latest pulse stream — title, description, tags, ingestion timestamp.

![Feeds](docs/screenshots/dashboard-feeds.png)

### Feed config (`/admin/feeds`)
Toggle each upstream sync on/off, set the polling interval, see the last sync's success/fail status, and **Run now** to fire an immediate sync. Writes through to the same `reconcileScheduledJob` control plane Workbench uses.

![Feed config](docs/screenshots/dashboard-feed-config.png)

---

## 🚀 What it shows

| Surface | Lives at | Renders |
|---------|----------|---------|
| **Command** | `/` | KPI strip + priority triage + severity distribution + ATT&CK coverage + actor watchlist + events stream + trending tags; everything respects a 24H/7D/30D rolling window switcher |
| **Vulnerabilities** | `/vulnerabilities` | Paginated CVE/KEV list with CVSS, severity, KEV-toggle filter, upstream first/last-seen timestamps |
| **IOCs** | `/iocs` | IPs / domains / hashes / URLs with type filter, type-ahead search, verdict pills |
| **Threat actors** | `/actors` | APT groups + composite activity-scored watchlist (feed mentions × recency × IOC count × MITRE coverage) — not just `last_seen DESC` |
| **MITRE ATT&CK** | `/tactics`, `/techniques`, `/malware`, `/tools` | Full coverage of the framework with markdown descriptions + citation rendering |
| **Graph** | `/graph` | Neo4j-backed force-directed view: actor ↔ technique ↔ malware ↔ IOC ↔ vuln |
| **Admin · Services** | `/admin/services` | Datastore probes (Postgres, OpenSearch, Neo4j, Redis × 2), BullMQ queue depths, worker liveness, bootlock state, recent feed-sync results |
| **Admin · Schedules** | `/admin/schedules` | Edit cron presets, toggle enabled, run-now — writes through to the same backend `reconcileScheduledJob` as Workbench |
| **Admin · Workbench** | `/admin/workbench` | Embedded [BullMQ ops UI](https://github.com/pontusab/workbench) (vendored fork) — Overview / Queues / Jobs / **Flows** / **Schedulers** with edit / disable / run-now actions delegating to our control plane |
| **Admin · Runbook**, **Audit**, **Feeds**, **Users** | `/admin/*` | Operator surfaces for failure triage, audit log, feed-source config, user RBAC |

---

## 🏗️ How it fits together

```
Browser
  │
  ├─→ /admin/workbench/*  → Next.js rewrite → API (3001) → /admin/workbench   (same-origin proxy)
  │                                            └─ embedded vendored Workbench
  │
  └─→ /*                  → Next.js App Router
                              ├─ SWR hooks → API (3001) /v1, /v2, /admin
                              ├─ OAuth callback → API /auth/oauth/{google,github}
                              └─ rinjani_token cookie ↔ localStorage JWT mirror
```

- **Same-origin proxy** for `/admin/workbench/*` to the API ([next.config.ts](next.config.ts)) keeps the `rinjani_token` cookie attached to embedded Workbench calls — no second login, no CORS.
- **Auth state lives in localStorage** (JWT) AND is mirrored to a `rinjani_token` cookie ([src/lib/api.ts setToken](src/lib/api.ts), [src/lib/auth.tsx](src/lib/auth.tsx)) so embedded SPAs on the same origin can ride the session.
- **Admin pages share four primitives** (`PageHeader`, `RowCard`, `StatField`, `StatusBadge`) from [src/components/admin/](src/components/admin/) — keeps the admin surface visually consistent without each page reinventing its own panel chrome.

---

## 🚦 Quick start

### Prerequisites
- Node 20+
- The backend running locally: `git clone https://github.com/rinjanianalytics/cti-platform-api && cd cti-platform-api && pnpm install && docker compose up -d && pnpm dev`

### Installation
```bash
git clone https://github.com/rinjanianalytics/cti-platform-dashboard.git
cd cti-platform-dashboard
pnpm install

# Minimal .env.local — point at your backend
cat > .env.local <<EOF
NEXT_PUBLIC_API_URL=http://localhost:3001
EOF

pnpm dev    # http://localhost:3000
```

Sign in with Google or GitHub OAuth (configure these on the backend per [its OAuth section](https://github.com/rinjanianalytics/cti-platform-api/blob/master/DEPLOY.md#oauth-sign-in-google--github)).

---

## 📁 Structure

```
cti-platform-dashboard/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (app)/                 # Authenticated layout — sidebar + admin nav
│   │   │   ├── admin/             # /admin/* — services, schedules, runbook,
│   │   │   │                      #   feeds, users, audit
│   │   │   ├── vulnerabilities/   # CVE list + detail
│   │   │   ├── iocs/              # IOC list + detail
│   │   │   ├── actors/            # threat actors + watchlist
│   │   │   ├── techniques/        # MITRE ATT&CK pages
│   │   │   └── graph/             # Neo4j force-directed explorer
│   │   ├── login/                 # OAuth + API-key sign-in
│   │   └── layout.tsx             # AuthProvider + theme
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── admin/                 # PageHeader, RowCard, StatField, …
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts                 # All backend calls — single source
│   │   ├── auth.tsx               # AuthProvider + JWT/cookie mirror
│   │   ├── tone.tsx               # StatusKind registry (success/paused/failed/…)
│   │   └── utils.ts               # cn(), relTime(), etc.
│   └── styles/
├── public/                        # static assets, favicon, og-image
├── .github/workflows/             # CI (lint + typecheck + build)
├── next.config.ts                 # incl. /admin/workbench rewrite
└── package.json
```

---

## 🧪 Tests + CI

```bash
pnpm exec tsc --noEmit       # type check (CI runs this)
pnpm exec eslint              # lint (CI runs this)
pnpm run build                # Next.js build (CI runs this)
```

CI runs all three on every push to `main` and every PR — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## 🔐 Security

Found something? Don't open a public issue. See [SECURITY.md](SECURITY.md) for the reporting channel.

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 📞 Support

- **Website**: [rinjanianalytics.com](https://rinjanianalytics.com)
- **Email**: [rinjanianalytics@gmail.com](mailto:rinjanianalytics@gmail.com)
- **Backend repo**: [cti-platform-api](https://github.com/rinjanianalytics/cti-platform-api)
- **Issues**: [GitHub Issues](https://github.com/rinjanianalytics/cti-platform-dashboard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rinjanianalytics/cti-platform-dashboard/discussions)
