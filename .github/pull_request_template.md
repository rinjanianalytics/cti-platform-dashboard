<!--
PR title in Conventional Commits: `feat(scope): …`, `fix(scope): …`, `chore: …`, `refactor(scope): …`, `docs: …`, `security(scope): …`.
-->

## Summary

<!-- 2–4 sentences. Reviewer should be able to read this and know whether to keep going. -->

## Why

<!-- Problem solved. Link issues. -->

Closes #

## Screenshots / GIF

<!-- For any user-visible change. Before/after if you're refactoring an existing surface. -->

## Test plan

- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm exec eslint` clean (or known-warnings only)
- [ ] `pnpm run build` succeeds
- [ ] Manual: <!-- describe the manual flow you exercised — what page, what action, what you saw -->

## Backend coordination

<!-- Does this require changes to cti-platform-api? Link the paired PR if so. -->

- [ ] No backend changes needed, OR
- [ ] Paired backend PR: <link>

## Checklist

- [ ] PR title follows Conventional Commits
- [ ] Commits are scoped (no drive-by changes)
- [ ] Used shared primitives (`PageHeader`, `RowCard`, `StatField`, `StatusBadge`) instead of reinventing panel chrome
- [ ] API calls go through `src/lib/api.ts` (no direct `fetch()` in components)
- [ ] No new direct dependencies on packages with install-time scripts (post the [Shai-Hulud worm](https://github.com/advisories/GHSA-g7cv-rxg3-hmpx), we're cautious)
- [ ] No `.env*` files in the diff
