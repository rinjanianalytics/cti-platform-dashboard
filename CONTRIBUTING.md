# Contributing

Thanks for considering a contribution. This is the **dashboard** half of
the [CTI platform](https://rinjanianalytics.com) — pair it with the
[backend repo](https://github.com/rinjanianalytics/cti-platform-api) to run
the full stack.

## Quick start

```bash
# Run the backend first (separate repo):
#   git clone https://github.com/rinjanianalytics/cti-platform-api && pnpm dev

# Then the dashboard:
git clone https://github.com/rinjanianalytics/cti-platform-dashboard.git
cd cti-platform-dashboard
pnpm install
cp .env.local.example .env.local 2>/dev/null || \
  echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
pnpm dev                            # http://localhost:3000
```

Sign in with an admin OAuth account (Google or GitHub — see backend `OAUTH_*`
env vars) to access the `/admin/*` surface, including the embedded
[Workbench BullMQ dashboard](https://github.com/pontusab/workbench) at
`/admin/workbench`.

## Workflow

1. **Open an issue first** for non-trivial changes. Describe the user story
   and the proposed UX, ideally with a sketch or wireframe.
2. **Branch off `main`** — `feat/<desc>`, `fix/<desc>`, `chore/<desc>`,
   `security/<desc>` (and email per [SECURITY.md](SECURITY.md) for the last).
3. **One concern per PR.** Don't smuggle drive-by refactors into a feature.
4. **Conventional Commits** — match the backend's commit style:
   ```
   feat(admin): native /admin/schedules page paired with Workbench
   fix(overview): watchlist scoring display + four correctness bugs
   refactor(admin): shared primitives + UI consistency pass
   docs: refresh README + DEPLOY for current architecture
   ```

## Code style

- **shadcn/ui + Tailwind 4** primitives. Match the existing components in
  [src/components/](src/components/) — same densities, same tones.
- **No `tanstack` or any framework with install-time scripts** without a
  written rationale and a `pnpm.overrides` floor against future supply-chain
  worms. (We were 6 days late to the
  [CVE-2026-45321 Shai-Hulud window](https://github.com/advisories/GHSA-g7cv-rxg3-hmpx)
  by luck, not design.)
- **TypeScript strict, no `any`** without a comment explaining why.
- **API calls go through `src/lib/api.ts`** — don't `fetch()` directly from
  components.
- **Admin pages use the shared `PageHeader / RowCard / StatField / StatusBadge`
  primitives** under [src/components/admin/](src/components/admin/). Don't
  reinvent panel chrome.

## Tests

There is currently a Playwright config but the suite is thin. New features
should add at least one happy-path Playwright test under [tests/](tests/) if
they touch the rendered UI.

```bash
pnpm exec tsc --noEmit       # typecheck (CI runs this)
pnpm exec eslint              # lint
pnpm exec playwright test     # e2e (when added)
```

## Reviewing

PRs need one approving review. We look for:

- Visual consistency with the existing admin surface
- Type-safety (no escape hatches without justification)
- API client usage matches `src/lib/api.ts` conventions
- No tracked `.env*` files (the .gitignore catches them but reviewer also
  spot-checks `git diff --name-only`)

## What we want help with

[Open issues](https://github.com/rinjanianalytics/cti-platform-dashboard/issues),
particularly anything tagged `good first issue`.

## Code of conduct

Be kind, assume good faith.
[Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
applies.

## Questions

- [GitHub Discussions](https://github.com/rinjanianalytics/cti-platform-dashboard/discussions)
- [rinjanianalytics@gmail.com](mailto:rinjanianalytics@gmail.com)
