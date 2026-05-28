# Security Policy

This is the **dashboard** half of the
[CTI platform](https://github.com/rinjanianalytics/cti-platform-api). The
backend repository hosts the authoritative security policy; please read
[its `SECURITY.md`](https://github.com/rinjanianalytics/cti-platform-api/blob/master/SECURITY.md)
for the full reporting workflow and SLAs.

## Reporting a vulnerability

**Do not file a public GitHub issue.** Email
**[rinjanianalytics@gmail.com](mailto:rinjanianalytics@gmail.com)** with:

- A description of the issue
- Reproduction steps
- Affected version / commit SHA
- How you'd like to be credited

We aim to acknowledge within **2 business days** and ship a fix within
**30 days** for critical issues. See the backend policy for the full
process.

## In scope (dashboard-specific)

- Authentication flows in [src/lib/auth.tsx](src/lib/auth.tsx) and
  [src/lib/api.ts](src/lib/api.ts), including the `rinjani_token`
  cookie mirror that lets the embedded Workbench BullMQ dashboard
  authenticate same-origin
- The Next.js rewrite for `/admin/workbench/*` in
  [next.config.ts](next.config.ts) — this is a same-origin proxy and
  must stay restricted to that path
- XSS in entity-detail / runbook rendering (we surface markdown from
  upstream threat feeds; see `src/components/entity-description.tsx`)
- The Neo4j graph explorer at `/graph`

## Out of scope

- Self-XSS
- Findings against the create-next-app scaffolding or default Next.js
  behaviour (those belong upstream)

## Pairing

When reporting a chained issue that spans both repos, mention it in your
first email and we'll coordinate the fix across both.
