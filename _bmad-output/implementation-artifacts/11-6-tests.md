# Story 11.6: Epic 11 Test Sweep & Integration Coverage

Status: done

## Story

As a **maintainer**,
I want **the Epic 11 provider-fallback pipeline verified end-to-end (parse → preflight → select → commit/advance → exhaust/precedence)**,
So that **the fallback feature ships coherent — the full runWorkflow path with a fallback_config behaves correctly across the success, advance, exhaustion, and precedence scenarios**.

## Context

11-1..11-5 each have unit tests (suite at 680). 11-6 is the epic sweep: confirm the full suite + coverage, and add runWorkflow-level integration tests that exercise the whole chain wiring (loadFallbackConfig → getAuthenticatedProviderIds → preflightFallbackChain → runSessionWithFallback → aggregation/precedence) via the MockClient + eventControl harness, so the pipeline is proven composed, not just per-unit.

## Acceptance Criteria

1. **Given** the full unit suite **When** run **Then** all tests pass and coverage meets thresholds (80%/75% branches). Report numbers + Epic-11 per-file coverage (fallback-config.ts, opencode.ts, runner.ts).

2. **Given** a runWorkflow with a 2-entry fallback_config where the FIRST provider errors at startup and the SECOND commits **When** run end-to-end (mock session.error for p0, assistant part for p1) **Then** the run succeeds on p1, p0's failure is logged, and the result reflects the winning session.

3. **Given** a runWorkflow where the FIRST provider commits **When** run **Then** p1 is never attempted, even if a later session.error occurs (D2 — no mid-run failover) — verified at the runWorkflow level.

4. **Given** a runWorkflow where ALL chain providers fail at startup **When** run **Then** the aggregated exhaustion error (11-5) is returned with each provider's reason, status failure, no session.

5. **Given** a runWorkflow with an unauthenticated chain (preflight empty) **When** run **Then** the AC2-of-11-5 "no providers authenticated" message is returned.

6. **Given** the D8 invariant **When** a fallback_config containing credentials is loaded in the runWorkflow path **Then** it fails with the D8 error (credentials rejected) — end-to-end, not just at the parser unit level.

7. **Given** any Epic-11 coverage gap **When** found **Then** close it with a test (do not lower thresholds). Verification-only — if a real bug surfaces, REPORT it (don't fix silently).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — testing/unit-testing, testing/e2e-testing; load `typescript-unit-testing`

- [x] **Task 2: Sweep + baseline** (AC: 1) — run test:unit w/ coverage; record Epic-11 per-file numbers; flag any below threshold.

- [x] **Task 3: runWorkflow fallback integration tests** (AC: 2, 3, 4, 5, 6) — in runner.spec.ts (or a fallback-integration spec), drive the full path with a real loaded chain + MockClient + eventControl:
  - p0 errors → p1 commits → success on p1 (advance path).
  - p0 commits → p1 never tried, later error doesn't switch (D2).
  - all error → aggregated exhaustion error (per-provider reasons), status failure.
  - unauthenticated chain (authedIds excludes all) → AC5 message.
  - fallback_config with a credential key → D8 error at the runWorkflow level.

- [x] **Task 4: Close gaps** (AC: 7) — add tests for any uncovered Epic-11 branches; do not lower thresholds.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- Verification + integration coverage. Do NOT change 11-1..11-5 logic. If a test reveals a real bug, STOP and report to team-lead.
- Reuse MockClient (opencode-test-helpers.ts), the eventControl emit harness, and a temp fallback_config file (or mock loadFallbackConfig) for the runWorkflow path.
- The pipeline under test: loadFallbackConfig → getAuthenticatedProviderIds → preflightFallbackChain → runSessionWithFallback → aggregation/precedence (11-5). AC2/AC3 are the headline (advance + D2-no-switch).
- Conventions: AAA, clearMocks global, coverage 80%/75%.

### References

- [Source: epics.md#Story 11.6] · [Source: prd.md#FR59-63] · [Source: research/opencode-upgrade-design-2026-05-29.md §5 + D1/D2/D5/D8 + §7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

**Task 2 — Baseline sweep (680 tests, EXIT 0):**
| File | Stmts | Branches | Funcs | Lines |
|------|-------|----------|-------|-------|
| `fallback-config.ts` | 94% | 90% | 100% | 93.75% |
| `opencode.ts` | 88.53% | 75.56% | 92.3% | 92.92% |
| `runner.ts` | 97.53% | 93.25% | 100% | 97.48% |
| **All files** | **92.24%** | **85.5%** | **94.08%** | **93.75%** |

**Task 3 — Integration tests** (`src/runner-fallback-integration.spec.ts` — new, 5 tests):
New spec with `jest.mock('@opencode-ai/sdk/v2')` but NO mock for `fallback-config` or `opencode` module — exercises the real pipeline. Uses real `loadFallbackConfig` (reads temp files), real `preflightFallbackChain`, real `OpenCodeService.runSessionWithFallback` wired to `MockClient`+`eventControl`:

- AC2: p0-errors→p1-commits→success-on-p1 (full advance path through runWorkflow).
- AC3: p0-commits→p1-never-tried + output contains session-1-not-session-2 (D2).
- AC4: both-error→aggregated-exhaustion-error-with-per-provider-reasons.
- AC5: no-authed-providers (v2.provider.list returns []) → AC2-of-11-5 unauthenticated message.
- AC6: fallback_config with "token" key → D8 error at runWorkflow level (real parser rejects).

**Task 4 — Gap closure** (`src/fallback-config.spec.ts`): 4 new gap tests: non-ENOENT re-throw (line 29); JSON top-level array (line 40); JSON top-level null (line 40); chain entry not an object (line 56). `fallback-config.ts` coverage: 94%/90% → **100%/100%**.

**Final coverage (689 tests, EXIT 0):**
| File | Stmts | Branches | Funcs | Lines |
|------|-------|----------|-------|-------|
| `fallback-config.ts` | **100%** | **100%** | **100%** | **100%** |
| `opencode.ts` | 88.53% | 75.56% | 92.3% | 92.92% |
| `runner.ts` | 97.53% | 93.25% | 100% | 97.48% |
| **All files** | **92.45%** | **85.84%** | **94.08%** | **93.97%** |

Uncovered branches in `opencode.ts` are pre-existing non-Epic-11 paths (session reconnect, heartbeat, edge cases). **Bug found: NO.**

### File List

- `src/runner-fallback-integration.spec.ts` — new: 5 end-to-end integration tests (AC2–AC6)
- `src/fallback-config.spec.ts` — 4 new gap tests (non-ENOENT, null, array, entry-non-object)
- `_bmad-output/implementation-artifacts/11-6-tests.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
