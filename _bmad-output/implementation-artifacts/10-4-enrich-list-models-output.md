---
baseline_commit: c77b0f80896a8c46151daa1665bc09659fc565fe
---

# Story 10.4: Enrich `list_models` Output

Status: done

## Story

As a **GitHub Actions user listing available models**,
I want **each model annotated with its cost and a free / paid / subscription tag**,
So that **I can choose a model deliberately and understand why `disable_free_models` would or wouldn't affect it**.

## Background

10-1 gives each `ModelListItem` `cost` + `enabledVia`; 10-2 gives `isFilterableFree`. This story makes `list_models` OUTPUT informative — both the printed lines and the returned JSON. (Distinct from 10-3, which OMITS free models when `disable_free_models` is on; 10-4 is about labeling what IS shown.)

## Acceptance Criteria

1. **Given** `list_models` mode **When** each model is printed **Then** the line includes a pricing tag: `free` (isFilterableFree true), `subscription` (cost 0 AND enabledVia 'account'), `paid` (cost with non-zero input/output), or `unknown` (cost undefined). E.g. `- github-copilot/gpt-5: GPT-5 (GitHub Copilot) [subscription]`.

2. **Given** the returned JSON from `handleListModels` **When** built **Then** each model entry includes a `pricing` field with the same classification (`'free' | 'subscription' | 'paid' | 'unknown'`) plus the existing fields, so programmatic consumers can use it.

3. **Given** `disable_free_models: true` (10-3) AND list mode **When** combined **Then** the free models are still OMITTED (10-3 behavior preserved) and the remaining shown models carry their tags. The two features compose correctly.

4. **Given** the classification logic **When** implemented **Then** it lives as a small pure helper (e.g. `classifyPricing(model): 'free'|'subscription'|'paid'|'unknown'`) in `src/model-filter.ts` alongside `isFilterableFree`, reusing the same field reads (no divergent logic).

5. **Given** existing `list_models` consumers **When** this lands **Then** the printed format remains parseable and the JSON is a superset (added `pricing` field) — no breaking change to the existing output shape.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, commenting, testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: `classifyPricing` helper** (AC: 1, 2, 4)
  - [x] In `src/model-filter.ts`, add pure `classifyPricing(model: ModelListItem, subscriptionProviders?: ReadonlySet<string>): 'free' | 'subscription' | 'paid' | 'unknown'`:
    - `cost === undefined` → `'unknown'`
    - `cost.input === 0 && cost.output === 0`: if `enabledVia === 'account'` or `subscriptionProviders?.has(providerId)` → `'subscription'`, else → `'free'`
    - otherwise → `'paid'`
  - [x] Keep it consistent with `isFilterableFree` (free ⇔ classifyPricing === 'free').

- [x] **Task 3: Apply in `handleListModels`** (AC: 1, 2, 3, 5)
  - [x] Append the tag to each printed line: `  - ${providerId}/${id}: ${name} (${provider}) [${pricing}]`.
  - [x] Add `pricing` to each model object in the returned JSON.
  - [x] Order: apply 10-3 omission FIRST (if disableFreeModels), THEN tag the survivors (AC3).

- [x] **Task 4: Unit tests** (AC: 1–5)
  - [x] model-filter.spec.ts: `classifyPricing` truth table (unknown/free/subscription/paid; subscriptionProviders override → subscription).
  - [x] runner.spec.ts: printed lines include the tag; JSON entries include `pricing`; with disableFreeModels on, free omitted + survivors tagged (compose).

- [x] **Final Task: Quality Checks**
  - [x] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- `classifyPricing` and `isFilterableFree` must agree: `isFilterableFree(m) === (classifyPricing(m) === 'free')` for the no-override case. Consider implementing `isFilterableFree` in terms of `classifyPricing` if cleaner, but do NOT change 10-2's exported signature/behavior — additive only.
- Scope: only the list_models OUTPUT (lines + JSON). No new inputs. No change to the run path. `subscription_providers` population is still 10-5 — accept the optional param, default undefined.
- Conventions: pure helper, named exports, `.js` imports, noUncheckedIndexedAccess; clearMocks global; coverage 80%/75%.

### References

- [Source: epics.md#Story 10.4] · [Source: prd.md#FR55] · [Source: research/opencode-upgrade-design-2026-05-29.md §4a]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`src/model-filter.ts`): Added exported `PricingCategory` type alias and pure `classifyPricing(model, subscriptionProviders?)`. Logic: undefined cost→'unknown'; non-zero cost→'paid'; cost 0 + (account || override)→'subscription'; cost 0 otherwise→'free'. Refactored `isFilterableFree` to delegate: `return classifyPricing(model, subscriptionProviders) === 'free'` — identical behaviour, zero divergence risk. Signature unchanged.
- **Task 3** (`src/runner.ts` `handleListModels`): Added `classifyPricing` to import. After 10-3 omission filter, maps survivors to `{ ...model, pricing }` via `classifyPricing(model)`. Prints `[${model.pricing}]` at end of each line. Returns `taggedModels` in JSON (superset — existing fields unchanged, `pricing` added).
- **Task 4**: 8 `classifyPricing` tests in `model-filter.spec.ts` (unknown, paid×2, subscription×account, free×undefined, free×env, subscription×override, invariant assertion). 3 runner tests: AC1 (all 4 tags in lines), AC2 (JSON pricing fields), AC3 (compose: free omitted, subscription tagged). Updated `7.4-UNIT-003` (expected `[unknown]` in lines) and `7.4-UNIT-004` (use `toMatchObject` for pricing superset).
- **Quality**: lint zero, typecheck clean, format (runner.spec auto-reformatted), 600/600 tests pass (+11 new), coverage 92.44%/85.08%.

### File List

- `src/model-filter.ts` — added `PricingCategory` type, `classifyPricing()`, refactored `isFilterableFree` to delegate
- `src/model-filter.spec.ts` — added `classifyPricing` import + 8 new tests
- `src/runner.ts` — added `classifyPricing` to import; `handleListModels` now tags lines+JSON
- `src/runner.spec.ts` — updated `7.4-UNIT-003`, `7.4-UNIT-004`; added 3 new 10-4 tests
- `_bmad-output/implementation-artifacts/10-4-enrich-list-models-output.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
