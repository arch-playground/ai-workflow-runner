---
baseline_commit: cac8f3005cec656178af89bb65149d6ffa82f975
---

# Story 10.6: Epic 10 Test Sweep & Integration Coverage

Status: done

## Story

As a **maintainer**,
I want **the Epic 10 free-model-filtering features verified to work together against the real-data shapes**,
So that **the subsystem ships coherent — the join (10-1), predicate (10-2), input (10-3), tagging (10-4), and override (10-5) compose correctly, and the Copilot-subscription-never-blocked guarantee holds end-to-end**.

## Context

10-1..10-5 each have unit tests (suite at 608). 10-6 is the epic sweep: confirm the full suite + coverage, and add integration tests using the REAL provider/model shapes verified during research (Copilot cost-0 account; OpenCode Zen `*-free` cost-0 unauthenticated; OpenRouter `:free`; paid models; no-cost local) so the whole filtering pipeline is proven against reality, not just synthetic fixtures.

## Acceptance Criteria

1. **Given** the full unit suite **When** run **Then** all tests pass and coverage meets thresholds (80%/75% branches). Report numbers + Epic-10 per-file coverage (model-filter.ts, opencode.ts listModels, config.ts, runner.ts).

2. **Given** real-data model fixtures (Copilot `gpt-5` cost-0 enabledVia 'account'; Zen `big-pickle`/`minimax-m3-free` cost-0 enabledVia undefined; an OpenRouter `:free`; a paid model cost>0; a no-cost local model) **When** run through `classifyPricing`/`isFilterableFree` **Then** the classifications match the design table exactly: Copilot→subscription(kept), Zen-free→free(filtered), paid→paid, no-cost→unknown(kept).

3. **Given** an end-to-end `handleListModels` with `disable_free_models: true` over a mixed provider set (Copilot + Zen-free + paid) **When** run **Then** the Zen `*-free` models are OMITTED, Copilot models are KEPT and tagged `[subscription]`, paid kept and tagged `[paid]` — the full compose of 10-1→10-5.

4. **Given** the **Copilot-never-blocked invariant** (the single most important correctness property of Epic 10) **When** a Copilot model is the resolved run model with `disable_free_models: true` **Then** `checkFreeModelGuard` does NOT block it (it's `enabledVia 'account'`). Add an explicit guard-level integration test for this.

5. **Given** the `subscription_providers` override **When** a Zen-free model's provider is in the override AND `disable_free_models: true` **Then** it is KEPT (treated subscription) — the 10-5 escape hatch verified end-to-end.

6. **Given** any coverage gap **When** found **Then** close it with a unit test (do not lower thresholds). Verification-only — if a real bug surfaces, REPORT it (don't fix silently).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — testing/unit-testing, testing/e2e-testing; load `typescript-unit-testing`

- [x] **Task 2: Sweep + baseline** (AC: 1) — run test:unit w/ coverage; record Epic-10 per-file numbers; flag any below threshold.

- [x] **Task 3: Real-data classification tests** (AC: 2) — in model-filter.spec.ts, add a fixtures block built from the actual research shapes (Copilot, Zen `*-free`, OpenRouter `:free`, paid, local-no-cost); assert classifyPricing + isFilterableFree match the design table.

- [x] **Task 4: End-to-end compose tests** (AC: 3, 4, 5) — in runner.spec.ts: handleListModels over a mixed provider set with disable_free_models on (Zen-free omitted, Copilot kept+[subscription], paid kept+[paid]); checkFreeModelGuard does NOT block a Copilot model (AC4, explicit); subscription_providers override keeps a Zen-free model (AC5).

- [x] **Task 5: Close gaps** (AC: 6) — add unit tests for any uncovered Epic-10 branches; do not lower thresholds.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- This is verification + integration coverage. Do NOT change 10-1..10-5 logic. If a test reveals a real bug, STOP and report to team-lead (leader decides 10-6 fix vs new defect story).
- Use the existing MockClient (opencode-test-helpers.ts) + @actions/core mock. Real-data fixtures = the model shapes documented in research §4 (Copilot 21 models cost-0 account; Zen `big-pickle`/`*-free` cost-0; etc.).
- The AC4 Copilot-never-blocked test is the headline invariant — make it explicit and unmistakable.
- Conventions: AAA, clearMocks global, coverage 80%/75%.

### References

- [Source: epics.md#Story 10.6] · [Source: prd.md#FR55-58] · [Source: research/opencode-upgrade-design-2026-05-29.md §4 + D4/D7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

**Task 2 — Baseline sweep (608 tests, EXIT 0):**
| File | Stmts | Branches | Funcs | Lines |
|------|-------|----------|-------|-------|
| `model-filter.ts` | 100% | 100% | 100% | 100% |
| `runner.ts` | 97.16% | 90.9% | 100% | 97.12% |
| `config.ts` | 97.7% | 96.58% | 100% | 97.7% |
| `opencode.ts` | 89.03% | 74.2% | 95.91% | 93.4% |
| **All files** | **92.47%** | **85.08%** | **95.02%** | **93.84%** |

`opencode.ts` at 74.2% branches (per-file) but global branches at 85.08% — thresholds apply globally ✅.

**Task 3 — Real-data classification tests (`model-filter.spec.ts`):** Added `Epic 10 real-data classification table` describe with 7 `classifyPricing` tests + 8 `isFilterableFree` tests using actual shapes from research §4 (Copilot gpt-5/claude-sonnet-4-6 cost-0 account→subscription; Zen big-pickle/minimax-m3-free cost-0 undefined→free; OpenRouter :free cost-0 undefined→free; Anthropic paid→paid; Ollama no-cost→unknown). Plus invariant test over all 7 fixtures.

**Task 4 — End-to-end compose tests (`runner.spec.ts`):** 6 integration tests in `Epic 10 real-data end-to-end compose` describe:

- AC3: handleListModels mixed set (Zen omitted, Copilot [subscription], paid [paid], hidden-count logged)
- AC4: **COPILOT-NEVER-BLOCKED** (by id) — explicit headline invariant test
- AC4: COPILOT-NEVER-BLOCKED (by providerId/id form)
- AC5: subscription_providers override keeps Zen-free model (tagged [subscription])
- AC5: run guard does NOT block override provider
- AC3: flag off — all 3 models present with correct tags

**Task 5 — Gap check:** `model-filter.ts` 100%/100% — no Epic-10 gaps. Uncovered lines in `opencode.ts` (187, 279, 305-308, etc.) and `runner.ts` (185-186, 369, 380) are pre-existing non-Epic-10 branches (loadJsonFile path, session loop error paths, validation retry). No new gaps introduced. No bugs found.

**Final coverage (629 tests, EXIT 0):**
| File | Stmts | Branches | Funcs | Lines |
|------|-------|----------|-------|-------|
| `model-filter.ts` | 100% | 100% | 100% | 100% |
| `runner.ts` | 97.16% | **92.2%** (+1.3pp) | 100% | 97.12% |
| `config.ts` | 97.7% | 96.58% | 100% | 97.7% |
| `opencode.ts` | 89.03% | 74.2% | 95.91% | 93.4% |
| **All files** | **92.47%** | **85.21%** (+0.13pp) | **95.02%** | **93.84%** |

**Bug found: NO**

### File List

- `src/model-filter.spec.ts` — added `Epic 10 real-data classification table` describe (15 tests)
- `src/runner.spec.ts` — added `Epic 10 real-data end-to-end compose` describe (6 tests)
- `_bmad-output/implementation-artifacts/10-6-tests.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
