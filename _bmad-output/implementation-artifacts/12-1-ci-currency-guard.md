# Story 12.1: CI Currency Guard

Status: done

## Story

As a **maintainer**,
I want **a scheduled CI job that flags when a newer stable `@opencode-ai/sdk` is published past our pin**,
So that **we get a signal to upgrade instead of silently drifting behind (the design reframed "upgrade SDK" as "stay current + guard" since we were already on latest)**.

## Background

Design §2: the SDK was already at npm `latest`, so the real deliverable is a currency guard, not a one-time bump. This story adds a scheduled GitHub Actions workflow that compares the npm `latest` `@opencode-ai/sdk` version against the version pinned in `package.json` and signals (issue or workflow failure/annotation) when `latest` is ahead. 12-2 does the actual bump + Dockerfile alignment.

## Acceptance Criteria

1. **Given** a new workflow `.github/workflows/sdk-currency.yml` **When** it runs **Then** it fetches the npm `latest` version of `@opencode-ai/sdk` (`npm view @opencode-ai/sdk version`) and compares it to the version resolved/pinned in this repo (package.json / package-lock).

2. **Given** npm `latest` is AHEAD of the pinned version **When** the job runs **Then** it surfaces the drift clearly — recommended: a titled `core`-style annotation / step summary AND a non-zero signal (either fail the job or open/update a tracking issue). Pick the lowest-friction reliable signal (a job that fails with a clear message is acceptable; opening an issue is nicer but needs `issues: write` perms — document the choice).

3. **Given** the pinned version is current (== latest) **When** the job runs **Then** it passes quietly (no drift, no noise).

4. **Given** the workflow trigger **When** configured **Then** it runs on a `schedule` (weekly cron, mirroring scorecard.yml's pattern) AND supports `workflow_dispatch` for manual runs. Minimal `permissions` (read-all, plus `issues: write` only if the issue-opening path is chosen).

5. **Given** the comparison logic **When** implemented **Then** it handles the `^`-prefixed pin (compare against the resolved/installed or the bare pinned version sensibly) and does not false-positive on a patch within range. Document the comparison basis (e.g. compare npm latest vs the exact version in package-lock).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — conventions (CI/workflows), security (workflow permissions); (no app-code skills needed — this is a workflow file)

- [x] **Task 2: Add `.github/workflows/sdk-currency.yml`** (AC: 1, 2, 3, 4, 5)
  - [x] Trigger: `schedule` (weekly cron, e.g. `'0 6 * * 1'` like scorecard) + `workflow_dispatch`. `permissions:` minimal.
  - [x] Step: `LATEST=$(npm view @opencode-ai/sdk version)`; read the pinned/resolved version (from package-lock.json `node_modules/@opencode-ai/sdk` entry, or `package.json` stripped of `^`). Compare.
  - [x] If `LATEST` > pinned → emit a clear `::warning::`/`::error::` (titled) + `$GITHUB_STEP_SUMMARY` line, and signal drift (fail the step OR open/update an issue — document). If equal → pass quietly.
  - [x] Keep it self-contained (no app build needed — just npm view + a version compare in bash/node).

- [x] **Task 3: Verification (no app unit tests — it's a workflow)**
  - [x] Validate the YAML parses (the existing CI/e2e job patterns or a local `yaml.load` check). Confirm the cron + dispatch + permissions are well-formed.
  - [x] Manually reason through both branches (drift / current) — include the exact compare command so it's reviewable. (Optional: a tiny node script under scripts/ that the workflow calls, IF that's cleaner to unit-test — but a self-contained workflow step is acceptable and simpler.)

- [x] **Final Task: Quality Checks** — `npm run lint` / `format` / `typecheck` (will be no-ops if no .ts changed); ensure the YAML is valid.

## Dev Notes

- **No app code** — this is a CI workflow file. Mirror `scorecard.yml` for the scheduled-workflow shape (on.schedule.cron + permissions). Keep the version-compare simple and self-contained.
- **Signal choice (AC2):** failing the scheduled job with a clear annotation is the simplest reliable signal and needs only read perms. Opening an issue is friendlier but needs `issues: write` + dedup logic — only do it if trivial; otherwise document "fails with a drift message; maintainer upgrades via Story-12-2-style bump". Pick one, document why.
- **Compare basis (AC5):** compare npm `latest` against the EXACT resolved version in package-lock.json (not the `^`-range), so a newer published `latest` that the caret would also accept still flags as "a newer stable exists" — that's the intent (signal to re-pin/re-bundle, since dist is built from a specific resolution).
- Scope: the guard workflow ONLY. The actual version bump + Dockerfile binary alignment is 12-2.
- Conventions: minimal workflow permissions; mirror existing workflow style.

### References

- [Source: epics.md#Story 12.1] · [Source: prd.md#FR64] · [Source: research/opencode-upgrade-design-2026-05-29.md §2]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`.github/workflows/sdk-currency.yml`): Self-contained scheduled workflow. Trigger: `schedule: cron '0 6 * * 1'` + `workflow_dispatch` (mirrors scorecard.yml). `permissions: read-all` (top-level). Single job `check-sdk-currency` with checkout + node:20 setup + compare step.
- **Compare logic (AC5)**: `LATEST=$(npm view @opencode-ai/sdk version)`. Reads exact resolved version from `package-lock.json` via inline `node -e` (`.packages['node_modules/@opencode-ai/sdk'].version` with lockfile-v2 fallback). Semver compare via pure arithmetic (split on `.`, compare each segment) — no external dependency. Compares npm latest vs lock-file resolution, not the `^` range, so any newer stable published (even a patch within range) is flagged.
- **Signal choice (AC2): fail-job** — simplest reliable signal; needs only `read-all` (no `issues:write`). Emits `::error title=SDK Drift Detected::` annotation + `$GITHUB_STEP_SUMMARY` table with both versions + instruction to run `npm install @opencode-ai/sdk@latest` (Story 12-2). Quiet pass (AC3): prints current + adds summary `✅ SDK Currency: current`.
- **Branches verified manually**: `1.16.0 > 1.15.12 = yes` (drift→fail); `1.15.12 == 1.15.12 = no` (current→pass); `1.15.13 > 1.15.12 = yes`; `2.0.0 > 1.15.12 = yes`; `1.15.11 < 1.15.12 = no`.
- **YAML validated**: `js-yaml` parse returns expected keys: jobs `['check-sdk-currency']`, triggers `['schedule','workflow_dispatch']`.
- **Quality**: lint zero, typecheck clean, format no changes (no .ts touched).

### File List

- `.github/workflows/sdk-currency.yml` — new: scheduled SDK currency guard
- `_bmad-output/implementation-artifacts/12-1-ci-currency-guard.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
