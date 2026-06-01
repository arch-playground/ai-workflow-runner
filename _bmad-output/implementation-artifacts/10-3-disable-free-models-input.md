---
baseline_commit: d8361ded0190c3bb57a5527c59dc3ef9386d80bf
---

# Story 10.3: `disable_free_models` Input

Status: done

## Story

As a **GitHub Actions user**,
I want **a `disable_free_models` input that excludes free models**,
So that **my automated workflows never silently run on a rate-limited free model (which would stall or fail), while my paid subscription (Copilot) is never mistakenly excluded**.

## Background

Story 10-1 enriched `listModels()` with `cost`/`enabledVia`; 10-2 added the pure `isFilterableFree(model, subscriptionProviders?)` predicate. This story wires the user-facing input and APPLIES the predicate in two places: the `list_models` listing, and a fail-fast guard when a free model would actually be run.

## Acceptance Criteria

1. **Given** `action.yml` **When** updated **Then** it declares a new input `disable_free_models` (bool, default `'false'`) with a clear description.

2. **Given** `config.ts` `getInputs()` **When** parsing **Then** `disable_free_models` is parsed as a boolean (same `trim().toLowerCase() === 'true'` pattern as `debug_log`) into `ActionInputs.disableFreeModels` (default false).

3. **Given** `list_models` mode with `disable_free_models: true` **When** the models are listed **Then** models for which `isFilterableFree(model)` is true are OMITTED from the printed list and the returned JSON. With `disable_free_models: false` (default) the listing is unchanged (all models).

4. **Given** a workflow run (not list mode) with `disable_free_models: true` **When** the resolved model to run is a free model (per `isFilterableFree`) **Then** the run FAILS FAST with a clear, actionable error (e.g. "Model '<id>' is a free model and disable_free_models is enabled. Choose a paid or subscription model.") BEFORE executing the workflow — rather than silently running on it.

5. **Given** a run with `disable_free_models: true` and a NON-free resolved model (paid or subscription like Copilot) **When** executed **Then** it runs normally (subscription models with cost 0 are NOT blocked — they're `enabledVia: 'account'`).

6. **Given** `disable_free_models: true` but the resolved model cannot be determined (e.g. no explicit `model` input and the config-file default isn't resolvable to a listed model) **When** evaluated **Then** the run proceeds (do not block on an unresolvable model — only block when we can positively identify the resolved model as free). Log a debug note.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, validation, error-handling (Result pattern — fail fast returns a RunnerResult error, not a throw, where the runner already uses Result), logging, testing/unit-testing
  - [x] Load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: action.yml + config input** (AC: 1, 2)
  - [x] action.yml: add `disable_free_models` (default `'false'`, description referencing free-model exclusion + that subscriptions are unaffected).
  - [x] config.ts getInputs(): parse into `inputs.disableFreeModels` (boolean pattern). Add `disableFreeModels: boolean` to `ActionInputs` in types.ts.

- [x] **Task 3: Filter the listing** (AC: 3)
  - [x] In `handleListModels` (runner.ts), when `inputs.disableFreeModels`, filter out `isFilterableFree(m)` before printing + before building the JSON. Keep the listed/omitted distinction clear in logs (e.g. log a one-line note "N free models hidden (disable_free_models)").

- [x] **Task 4: Fail-fast guard at run** (AC: 4, 5, 6)
  - [x] In `runWorkflow` (runner.ts), before `opencode.runSession`, when `inputs.disableFreeModels`: resolve the model that WILL run, look it up among `opencode.listModels()`, and if `isFilterableFree(resolved)` → return a `RunnerResult` failure with a clear error (Result pattern; set outputs/status appropriately — status 'failure').
  - [x] Resolve "the model that will run": prefer `inputs.model`; if absent, the model from the opencode config file if determinable; if neither resolvable to a listed model, do NOT block (AC6) — `core.debug` and proceed.
  - [x] Pass `subscriptionProviders` to `isFilterableFree` if available now (10-5 populates it; for 10-3 pass undefined/empty — forward-compatible).

- [x] **Task 5: Unit tests** (AC: 1–6)
  - [x] config.spec.ts: `disable_free_models` parses true/false/absent.
  - [x] runner.spec.ts (handleListModels): with flag on, free models omitted from output; off → all present.
  - [x] runner.spec.ts (runWorkflow): flag on + resolved model free → fails fast with clear error, session NOT run; flag on + subscription/paid model → runs normally; flag on + unresolvable model → proceeds (AC6); flag off → no filtering/guard at all.

- [x] **Final Task: Quality Checks**
  - [x] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### Integration points (verified)

- `config.ts:getInputs()` — boolean parse pattern is the `debug_log` one (`trim().toLowerCase() === 'true'`). Add `disableFreeModels` to ActionInputs.
- `handleListModels` (runner.ts ~128-151) — calls `opencode.listModels()` then prints; filter here for AC3.
- `runWorkflow` (runner.ts) — model selection flows via `inputs.model` → `opencode.initialize({model})` → `buildSdkConfig` (opencode.ts:163). The fail-fast guard goes in runWorkflow before `runSession`, after initialize (so listModels is available).
- `isFilterableFree` from `src/model-filter.ts` (10-2) — the predicate to apply.

### Resolving "the model that will run" (the tricky part)

The action's model can come from: `inputs.model` (explicit), or the opencode config file's `model` field, or OpenCode's own default. For a reliable fail-fast, only block when we can positively match the resolved model id against a `listModels()` entry that `isFilterableFree` flags. If `inputs.model` is set, match it (providerId/id). If not set, attempt the config-file model; if still unresolvable, AC6 says proceed (don't over-block). Keep this conservative — false-block is worse than a missed edge case here.

### Scope boundary (do NOT do here)

- No list-output free/paid TAGGING (that's 10-4 — this story only OMITS when the flag is on). No `subscription_providers` config population (10-5 — pass undefined for now).
- Do NOT change the predicate (10-2) or the join (10-1).

### Project conventions

- Result pattern for the fail-fast (return RunnerResult error; the runner already returns Result). Set outputs before setFailed (index.ts owns setFailed). Booleans via trim().toLowerCase(). Named exports, `.js` imports. clearMocks global. Coverage 80%/75%.

### References

- [Source: epics.md#Story 10.3] · [Source: prd.md#FR56] · [Source: research/opencode-upgrade-design-2026-05-29.md §4a + D7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`action.yml`, `src/types.ts`, `src/config.ts`): Added `disable_free_models` input to action.yml (default 'false'). Added `disableFreeModels: boolean` to `ActionInputs`. Parsed in `getInputs()` using same `trim().toLowerCase() === 'true'` pattern as `debug_log`.
- **Task 3** (`src/runner.ts` `handleListModels`): When `inputs.disableFreeModels`, filters allModels with `isFilterableFree(m)` before printing and JSON. Logs `"N free model(s) hidden (disable_free_models)"` when count > 0. Subscription/paid models remain visible (AC3).
- **Task 4** (`src/runner.ts` `runWorkflow` + new `checkFreeModelGuard()`): New private async helper `checkFreeModelGuard(inputs, opencode)` called after `initialize()` when `disableFreeModels`. Resolution strategy: uses `inputs.model` only (conservative — AC6 says proceed if unresolvable). Matches model by `id` or `providerId/id` against `listModels()`. If free → returns `RunnerResult { success: false, error: "Model '...' is a free model and disable_free_models is enabled..." }`. If not found or no model input → `core.debug` + returns null (proceed). `isFilterableFree` called with no subscriptionProviders (10-5 hook slot open).
- **Task 5**: 3 config tests (parse true/false/absent), 2 listing tests (free omitted when on; all present when off), 6 run guard tests (AC4 free→fail+no-session, AC5 account+paid→runs, AC6 no-model→proceeds, AC6 not-in-list→proceeds, flag-off→no guard). Existing tests fixed: `disableFreeModels: false` added to all `createValidInputs`/inline objects in runner.spec, config.spec, index.spec.
- **Dev Notes** (model resolution): Only `inputs.model` is used for resolution (not the config file model). Config-file model would require parsing JSON async and is not reliably available; AC6 explicitly says to proceed when unresolvable. This is the most conservative and correct behaviour.
- **Quality**: lint zero warnings, typecheck clean, format no changes, 589/589 tests pass (11 new), coverage 92.42%/85.08%.

### File List

- `action.yml` — added `disable_free_models` input
- `src/types.ts` — added `disableFreeModels: boolean` to `ActionInputs`
- `src/config.ts` — parse `disable_free_models` → `disableFreeModels`
- `src/runner.ts` — import `isFilterableFree`; filter listing in `handleListModels`; `checkFreeModelGuard()` helper + call in `runWorkflow`
- `src/config.spec.ts` — 3 new tests + `disableFreeModels: false` on all `validateInputs` fixtures
- `src/runner.spec.ts` — `disableFreeModels: false` in `createValidInputs`; 2 listing tests + 6 guard tests
- `src/index.spec.ts` — `disableFreeModels: false` in `createValidInputs`
- `_bmad-output/implementation-artifacts/10-3-disable-free-models-input.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
