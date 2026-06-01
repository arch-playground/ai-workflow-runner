# Story 12.2: Bump SDK & Align CLI Binary

Status: done

## Story

As a **maintainer**,
I want **`@opencode-ai/sdk` bumped to the current latest stable and the Dockerfile `opencode-ai` CLI pinned to the matching version**,
So that **the project runs on the current SDK and the runtime binary is deterministic and version-aligned with the SDK (FR64/FR65)**.

## Background

Verified 2026-06-01: npm `latest` for both `@opencode-ai/sdk` and `opencode-ai` is **1.15.13**; the repo is pinned at 1.15.12 (lock). The Dockerfile installs `opencode-ai` **unpinned** (`npm install -g opencode-ai`) — a reproducibility risk and a version-skew risk vs the SDK. This story bumps the SDK to 1.15.13 and pins the Docker CLI to the same version. (1.15.12→1.15.13 is one patch within the same minor — no semver-signaled breaking change, but verify the API surface the code uses is unchanged.)

## Acceptance Criteria

1. **Given** `package.json` **When** updated **Then** `@opencode-ai/sdk` is bumped to `^1.15.13` (or current latest if newer at implementation time — check `npm view @opencode-ai/sdk version` first and use that), and `package-lock.json` resolves the new version (via `npm install`).

2. **Given** the bump **When** the full unit suite runs **Then** all 692 tests still pass — the SDK API surface the code uses (createOpencode, session.promptAsync, config.providers, v2.provider.list, auth.set, session.messages, event.subscribe) is unchanged across 1.15.12→latest. If ANY test breaks or a type changes, STOP and report (do not paper over an API shift).

3. **Given** the Dockerfile **When** updated **Then** line 39 pins the CLI: `RUN npm install -g opencode-ai@1.15.13` (matching the SDK version), so the runtime `opencode` binary is deterministic and SDK-aligned (FR65).

4. **Given** the bundle **When** rebuilt **Then** `npm run bundle` succeeds against the new SDK (dist/index.js builds; dist is gitignored so not committed, but it must build clean).

5. **Given** the Docker image **When** built with the new pin **Then** it builds successfully and `opencode --version` reports the pinned version (the CI guard from 12-1 + the existing Dockerfile verify step both pass). [Leader verifies at epic-close funcval.]

6. **Given** the version is now current **When** the 12-1 currency guard runs **Then** it passes quietly (lock-file == npm latest) — no drift.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — conventions (deps/versioning), testing; load `typescript-clean-code` (light)

- [x] **Task 2: Bump the SDK** (AC: 1, 2)
  - [x] `npm view @opencode-ai/sdk version` → confirmed 1.15.13. Updated `package.json` dependency to `^1.15.13` and ran `npm install` to update the lock.
  - [x] Run `npm run typecheck` — confirmed NO type errors from the new SDK (API surface stable). Run `npm run test:unit` — all 692 pass. No breakage.

- [x] **Task 3: Pin + align the Docker CLI** (AC: 3)
  - [x] Dockerfile line 39: `npm install -g opencode-ai` → `npm install -g opencode-ai@1.15.13`.

- [x] **Task 4: Rebuild bundle** (AC: 4)
  - [x] `npm run bundle` — dist/index.js built clean (992.2kb). Not committed (gitignored).

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`. 692/692 pass, no API breakage.

## Dev Notes

- **Verify, don't assume (AC2):** 1.15.12→1.15.13 is a patch, so it SHOULD be a clean bump — but actually run typecheck + the full suite. The code uses a specific v2 API surface (createOpencode, promptAsync, config.providers, v2.provider.list, auth.set, session.messages, event.subscribe). If a type or signature shifted, that's a real finding — STOP and report, don't force it.
- **Dockerfile pin (FR65):** pinning `opencode-ai@<ver>` (currently unpinned) is the alignment + reproducibility fix. Match the SDK version exactly.
- dist is gitignored (Docker builds from source) — rebuild to confirm it builds, do NOT commit it.
- Leader will run the epic-close funcval (Docker build + opencode --version + a smoke run) — this story just needs the bump + lock + Dockerfile pin + green suite.
- Conventions: Conventional Commits; the leader owns the commit.

### References

- [Source: epics.md#Story 12.2] · [Source: prd.md#FR64, FR65] · [Source: research/opencode-upgrade-design-2026-05-29.md §2 + §7 (CLI now 1.15.13)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`package.json`, `package-lock.json`): `npm view @opencode-ai/sdk version` confirmed 1.15.13. Updated `@opencode-ai/sdk` in package.json from `^1.15.12` → `^1.15.13`. Ran `npm install` — lock resolves to exactly 1.15.13. `npm run typecheck` clean (no type errors). `npm run test:unit` 692/692 pass.
- **API surface verified (AC2)**: All used endpoints stable — `createOpencode`, `session.promptAsync`, `config.providers`, `v2.provider.list`, `auth.set`, `session.messages`, `event.subscribe`. **No breakage.**
- **Task 3** (`Dockerfile` line 39): `npm install -g opencode-ai` → `npm install -g opencode-ai@1.15.13`. SDK and CLI binary now version-aligned (FR65).
- **Task 4** (`npm run bundle`): `dist/index.js` rebuilt clean at 992.2kb in 24ms. Not committed (gitignored per project conventions).
- **Quality**: lint zero, format no changes, typecheck clean, 692/692 tests pass.

### File List

- `package.json` — bumped `@opencode-ai/sdk` to `^1.15.13`
- `package-lock.json` — resolved version updated to 1.15.13
- `Dockerfile` — line 39 pinned `opencode-ai@1.15.13`
- `_bmad-output/implementation-artifacts/12-2-bump-sdk-and-align-cli-binary.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
