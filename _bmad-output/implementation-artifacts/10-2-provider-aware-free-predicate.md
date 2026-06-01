---
baseline_commit: 016feac4511c57935a49ef631b188f748435d350
---

# Story 10.2: Provider-Aware Free Predicate

Status: done

## Story

As the **runner**,
I want **a predicate that decides whether a model is "filterable free"** — free to run AND not a paid subscription —
So that **`disable_free_models` (10-3) can exclude genuinely-free models without ever touching a paid subscription like GitHub Copilot (which reports cost 0)**.

## Background

Story 10-1 added `cost?` and `enabledVia?` to `ModelListItem`. This story adds the pure decision function. The rule (design D7, validated against the real server):

> A model is **filterable free** iff `cost.input === 0 && cost.output === 0` **AND** the provider is **not** account-authenticated (`enabledVia !== 'account'`).

- `cost === 0` is necessary but NOT sufficient — Copilot reports cost 0 on all models but is `enabledVia: 'account'` → must be KEPT.
- Missing `cost` (e.g. local/Ollama providers with no pricing) → **NOT free** (unknown pricing, not a free-tier hosted model) → keep.
- Cache cost is IGNORED (D4): a model with `input/output === 0` but non-zero cache is still free.

## Acceptance Criteria

1. **Given** a `ModelListItem` with `cost.input === 0 && cost.output === 0` and `enabledVia !== 'account'` (undefined, 'env', or 'custom') **When** `isFilterableFree(model)` is called **Then** it returns `true`.

2. **Given** a model with `cost.input === 0 && cost.output === 0` but `enabledVia === 'account'` (e.g. a Copilot model) **When** evaluated **Then** it returns `false` (subscription — never filtered).

3. **Given** a model with `cost === undefined` (no pricing) **When** evaluated **Then** it returns `false` (unknown pricing ≠ free).

4. **Given** a model with non-zero `cost.input` OR `cost.output` **When** evaluated **Then** it returns `false` (paid).

5. **Given** a model with `cost.input === 0 && cost.output === 0` but non-zero cache cost (if present) **When** evaluated **Then** it returns `true` (cache cost ignored, D4). (Note: 10-1's `ModelListItem.cost` is narrowed to `{input, output}`, so cache isn't even present — this AC documents the intended semantics.)

6. **Given** an optional `subscriptionProviders` override set (forward hook for 10-5) **When** a provider id is in it **Then** the model is treated as subscription (returns false) even if `enabledVia` is not 'account'. (Implement the predicate to ACCEPT an optional extra keep-set param now so 10-5 can pass it; default empty.)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, commenting, testing/unit-testing
  - [x] Load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Implement `isFilterableFree`** (AC: 1–6)
  - [x] Add a pure function — `isFilterableFree(model: ModelListItem, subscriptionProviders?: ReadonlySet<string>): boolean`. Recommended location: a small new `src/model-filter.ts` (leaf-ish, imports only the `ModelListItem` type) OR co-located in `opencode.ts`. Prefer `src/model-filter.ts` for testability and reuse by 10-3/10-4.
  - [x] Logic: `return cost !== undefined && cost.input === 0 && cost.output === 0 && enabledVia !== 'account' && !(subscriptionProviders?.has(providerId))`.
  - [x] Read fields defensively (`noUncheckedIndexedAccess`).

- [x] **Task 3: Unit tests** (AC: 1–6)
  - [x] `src/model-filter.spec.ts` (new): table-driven cases —
    - free public (cost 0, enabledVia undefined) → true
    - free public (cost 0, enabledVia 'env') → true
    - Copilot-like (cost 0, enabledVia 'account') → false
    - no cost (undefined) → false
    - paid (cost.input 0.5) → false
    - subscriptionProviders override contains providerId → false even if enabledVia undefined
  - [x] Use the real-data shapes from the design (Copilot, OpenCode Zen `*-free`, OpenRouter) as fixtures where helpful.

- [x] **Final Task: Quality Checks**
  - [x] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### This is a pure function — keep it that way

No SDK calls, no I/O. It operates only on the `ModelListItem` from 10-1. That makes 10-3 (`disable_free_models` filtering in listModels + selection) and 10-4 (list output tagging) trivial consumers. The `subscriptionProviders` param is a forward hook for 10-5 (config override) — wire the param now, default empty; 10-5 will populate it from config.

### Verified rule (D7 / D4, real-server validated)

- `cost===0 && enabledVia!=='account'` → filterable free. Copilot (21 models, cost 0, account) → kept. OpenCode Zen `*-free` (cost 0, unauthenticated → enabledVia undefined) → filtered. (Confirmed against the real server 2026-06-01.)
- Missing cost → not free (D: unknown pricing). Cache cost ignored (D4).

### Scope boundary (do NOT do here)

- No `disable_free_models` input, no filtering applied in listModels, no list-output tagging (10-3/10-4), no config override population (10-5).
- Just the pure predicate + its tests.

### Project conventions

- Named exports, `.js` imports, `noUncheckedIndexedAccess`. `clearMocks: true` global. Coverage 80%/75%.

### References

- [Source: epics.md#Story 10.2] · [Source: prd.md#FR57] · [Source: research/opencode-upgrade-design-2026-05-29.md §4a + D4 + D7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`src/model-filter.ts` — new, 23 lines): Pure exported `isFilterableFree(model, subscriptionProviders?)`. Logic: early-return false for undefined cost, non-zero input/output, enabledVia==='account', or providerId in subscriptionProviders set. Destructures model fields; zero I/O, no SDK deps. Named export, `.js` import path, `noUncheckedIndexedAccess`-safe.
- **Task 3** (`src/model-filter.spec.ts` — new, 12 tests): Table-driven AAA. Covers AC1 (free+undefined, free+env, free+custom), AC2 (Copilot account→false), AC3 (undefined cost→false), AC4 (non-zero input, output, both), AC5 (documented semantics — cost shape has no cache field), AC6 (subscriptionProviders hit→false, miss→unchanged, empty set→unchanged). `makeModel()` helper keeps fixtures minimal.
- **Quality**: lint zero warnings, typecheck clean, format no changes, 578/578 tests pass (12 new), coverage thresholds met.

### File List

- `src/model-filter.ts` — new: `isFilterableFree` pure predicate
- `src/model-filter.spec.ts` — new: 12 tests covering AC1–6
- `_bmad-output/implementation-artifacts/10-2-provider-aware-free-predicate.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
