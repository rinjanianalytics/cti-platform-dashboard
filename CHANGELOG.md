# Changelog

All notable changes to **cti-platform-dashboard** are recorded here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); we use
Conventional Commits in our git log so most entries are derivable from
`git log --pretty=%s`.

This dashboard pairs with [cti-platform-api](https://github.com/rinjanianalytics/cti-platform-api).
Cross-cutting changes (auth flow, OAuth, services aggregator schema) are
released in lockstep — see the backend's CHANGELOG for the matching API-side
changes.

## [Unreleased]

_(Add entries here as work lands on `main`. Cut a new dated section when tagging a release.)_

---

## [3.0.0] — 2026-05-28

First public release. Operator UI for the Rinjani CTI platform: paginated
entity views, MITRE ATT&CK pages, Neo4j-backed graph explorer, embedded
BullMQ pipeline UI, and a unified admin surface for ops triage.

### Added
- **Embedded Workbench BullMQ dashboard** at `/admin/workbench` via a
  same-origin Next.js rewrite — operator sees BullMQ queues, jobs,
  FlowProducer flows, and editable schedulers without a second login.
  Pairs with the backend's vendored fork.
- **Native `/admin/schedules`** page — cron preset editor + run-now
  button + enabled toggle. Writes through to the same backend control
  plane as the Workbench Schedulers tab, so edits stay consistent
  whichever UI an operator uses.
- **`/admin/services` aggregator page** — one round trip renders
  datastore probes (Postgres / OpenSearch / Neo4j / Redis × 2), BullMQ
  queue depths, worker liveness, bootlock state (held / unowned /
  Redis-error), recent feed-sync results, LLM provider configuration,
  and OSV/NVD enrichment-source status.
- **Bootlock state rendering** — distinguishes "held" (green) from
  "unowned · reclaim poller will retry within 30s" (amber) from
  "Redis unreachable" (red). Hides the historical false-positive
  where transient orphaning looked identical to Redis being down.
- **Neo4j-backed graph explorer** at `/graph` — force-directed view
  of actor ↔ technique ↔ malware ↔ IOC ↔ vuln. Empty / error /
  loading states each render distinctly. Neo4j Integer / DateTime
  props humanised so they don't show as raw `{low, high}` objects.
- **Activity-scored threat-actor watchlist** display — surfaces the
  composite score (feed mentions, recency, IOC count, MITRE
  associations) the backend now computes, replacing the old
  misleading `last_seen DESC` ordering.
- **Entity descriptions rendered as markdown** with citation
  stripping — most MITRE / MISP descriptions are rich text in
  upstream feeds; previously displayed as raw text.
- **Upstream timestamps surfaced** — entity detail pages show the
  feed's `first_seen` / `last_seen` / `published` instead of the
  scheduler's sync timestamp, so operators don't mistake fresh
  scheduler runs for fresh data.
- **OAuth sign-in** for Google + GitHub, with admin role elevation
  via the backend's `ADMIN_EMAILS` env var.
- **`rinjani_token` cookie mirror** in `setToken` — lets embedded
  same-origin UIs (Workbench) ride the session without their own
  auth layer.
- **Shared admin primitives** under `src/components/admin/` —
  `PageHeader`, `RowCard`, `StatField`, `StatusBadge` (powered by
  the `StatusKind` registry in `src/lib/tone.tsx`). Three-pass
  consistency overhaul across all admin pages.
- **"Last sync" column** on `/vulnerabilities`.

### Removed
- Five duplicate admin pages — `/admin/{queues, activity, pipeline,
  jobs}` plus the `[name]` leaf — that Workbench does better. Sidebar
  Operations collapses to Services / Runbook / Workbench.

### Fixed
- **Overview correctness** — vulnerability severity case
  sensitivity, MITRE total dedup, KEV filter actually filtering,
  OAuth avatar preservation.
- **Graph explorer** — client pointed at `/v2/graph` (was `/v1/graph`,
  404 on every call), response envelope no longer double-unwrapped,
  node types lowercased, empty/error states render.

### Infrastructure
- Public-ready repo polish — added `LICENSE` (MIT), `SECURITY.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue + PR templates,
  `CODEOWNERS`. Repo renamed from `v304-dashboard-rinjani` to
  `cti-platform-dashboard`. README rewritten from the create-next-app
  boilerplate to a proper landing page.
- CI workflow added (lint + typecheck + Next.js build on push and PR).

[Unreleased]: https://github.com/rinjanianalytics/cti-platform-dashboard/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/rinjanianalytics/cti-platform-dashboard/releases/tag/v3.0.0
