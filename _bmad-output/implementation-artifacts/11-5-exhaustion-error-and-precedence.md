# Story 11.5: Chain-Exhausted Error & Precedence

Status: done

## Story

As a **GitHub Actions user**,
I want **a clear aggregated error when every fallback provider fails, and predictable precedence between `fallback_config` and the single `model` input**,
So that **I understand why a fallback run failed (per-provider reasons) and know which model selection wins when both are set (D5: fallback_config supersedes)**.

## Background

11-3 returns a `FallbackSelectionResult` with `success:false` + `failures[]` (per-entry reasons) when all viable providers fail at startup; 11-2 may have already skipped unauthenticated entries with warnings. This story turns that into a clear runner-level failure, and settles precedence: when both `fallback_config` and `model` are set, the chain wins (D5) with a `core.warning` noting the override.

## Acceptance Criteria

1. **Given** a fallback run where ALL viable providers failed at startup (`FallbackSelectionResult.success === false`) **When** runWorkflow handles it **Then** it returns a `RunnerResult` failure whose error aggregates the per-entry reasons (e.g. "All 3 fallback providers failed: github-copilot/gpt-5 (401 invalid x-api-key); anthropic/claude-... (quota); openai/gpt-5 (...)"). Status = failure; no workflow output.

2. **Given** a `fallback_config` with entries but ALL were skipped by preflight as unauthenticated (11-2) **When** runWorkflow handles it **Then** it returns a clear failure ("No fallback providers are authenticated — configure credentials in auth_config for: <providers>") rather than a confusing empty/generic error.

3. **Given** BOTH `fallback_config` AND `model` are set **When** runWorkflow runs **Then** `fallback_config` takes precedence (D5): the chain drives selection, the single `model` input is ignored, and a `core.warning` (titled) notes "model input ignored because fallback_config is set".

4. **Given** `fallback_config` is set and `model` is NOT **When** runWorkflow runs **Then** the chain drives selection (no warning needed).

5. **Given** `fallback_config` is NOT set **When** runWorkflow runs **Then** the single-provider path governs exactly as before (`inputs.model` / opencode_config), fully backward compatible — no precedence logic engaged.

6. **Given** the aggregated error and warnings **When** emitted **Then** secret values (if any appeared in an error message) are sanitized via the existing `sanitizeErrorMessage`/scrub path before surfacing (no token/path leakage in the aggregated reasons).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — coding-style, error-handling (Result pattern), logging, security (sanitize), testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Aggregated exhaustion error** (AC: 1, 2, 6)
  - [x] In runWorkflow, when the selector returns `success:false`: build a `RunnerResult` failure aggregating `failures[]` (provider/model + reason per entry). Distinguish "all failed at startup" (AC1) from "all skipped as unauthenticated" (AC2 — when preflight produced zero viable entries) with distinct, clear messages.
  - [x] Sanitize each reason via `sanitizeErrorMessage` (or the scrub path) before joining (AC6).

- [x] **Task 3: Precedence vs `model`** (AC: 3, 4, 5)
  - [x] In runWorkflow, when `inputs.fallbackConfig` is set: drive the chain; if `inputs.model` is ALSO set, `core.warning(..., {title})` "model input ignored because fallback_config is set" and do not pass `inputs.model` to the selector (the chain entries' models govern).
  - [x] When `fallbackConfig` absent: existing path unchanged (AC5).

- [x] **Task 4: Unit tests** (AC: 1–6)
  - [x] runner.spec.ts: all-failed-at-startup → aggregated error lists each provider+reason, status failure; all-unauthenticated (preflight empty) → the AC2 message; both model+fallback_config → warning + chain used (model ignored); fallback_config only → chain used no warning; no fallback_config → single-provider path unchanged; a reason containing a fake secret/path → sanitized in the aggregated message.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **D5 precedence:** fallback_config supersedes `model`. Warn (don't error) when both set — it's a benign config overlap, the user just needs to know the chain wins.
- Two distinct failure messages: (AC1) all viable providers tried-and-failed vs (AC2) nothing was viable (all unauthenticated). The selector returns `failures[]` for AC1; an empty preflight (zero viable from 11-2) is the AC2 signal — handle both at the runner.
- Sanitize aggregated reasons (AC6) — provider errors can contain URLs/tokens; reuse `sanitizeErrorMessage`.
- Scope: finalize the exhaustion + precedence ONLY. Do NOT change the selector loop (11-3) or commit boundary (11-4). 11-6 is the epic test sweep.
- Conventions: Result pattern (return RunnerResult failure, don't throw to top); set outputs before setFailed (index.ts); named exports, `.js` imports; clearMocks global; coverage 80%/75%.

### References

- [Source: epics.md#Story 11.5] · [Source: prd.md#FR63] · [Source: research/opencode-upgrade-design-2026-05-29.md §5.2 + §5.4 + D5]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`src/runner.ts` — fallback branch): AC1 exhaustion error: `"All ${count} fallback provider${plural} failed: ${reasons}"` where each reason is `provider/model (${sanitizeErrorMessage(new Error(f.error))})`. AC2 empty-preflight message: `"No fallback providers are authenticated — configure credentials in auth_config for: ${allProviders}"` (lists provider ids from the full chain). AC6 sanitization: each reason wrapped in `sanitizeErrorMessage(new Error(...))` to redact 32+ char tokens and paths.
- **Task 3** (`src/runner.ts`): D5 precedence: when `inputs.fallbackConfig` is set AND `inputs.model` is also set → `core.warning('model input ignored because fallback_config is set', { title: 'fallback_config precedence' })`. `inputs.model` is NOT passed to `runSessionWithFallback` (chain entries govern). When `inputs.model` absent → no warning (AC4). No fallback_config → existing single-provider path (AC5).
- **Task 4** (`src/runner.spec.ts`): Added mocks for `fallback-config` module (`loadFallbackConfig`, `preflightFallbackChain`) and `runSessionWithFallback`/`getAuthenticatedProviderIds` on `mockOpenCodeService`. 6 new tests: AC1 (aggregated error with provider/reason), AC2 (all-unauth distinct message), AC3 (both set → warning + chain), AC4 (fallback-only → no warning), AC5 (no-fallback → runSession), AC6 (secret/path sanitized).
- **Quality**: lint zero, typecheck clean, format applied (runner.spec.ts), 680/680 tests pass (+6 new), coverage thresholds met.

### File List

- `src/runner.ts` — enhanced fallback branch: D5 precedence warning, AC2 distinct message, AC1 aggregated+sanitized error
- `src/runner.spec.ts` — added fallback-config mocks; 6 new `fallback chain — exhaustion error & precedence (11-5)` tests
- `_bmad-output/implementation-artifacts/11-5-exhaustion-error-and-precedence.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
