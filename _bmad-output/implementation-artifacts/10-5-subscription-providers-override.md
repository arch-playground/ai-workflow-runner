---
baseline_commit: ec92d01ef4b5c5674302a09ea0cd9a45f2fc4c39
---

# Story 10.5: `subscription_providers` Override

Status: done

## Story

As a **user with a flat-subscription provider that OpenCode does not report as `enabled.via === 'account'`** (e.g. an enterprise gateway, Bedrock-included, or a custom provider),
I want **to declare those provider IDs as subscriptions**,
So that **`disable_free_models` does not mistakenly treat their cost-0 models as free and exclude/block them**.

## Background

10-2's `isFilterableFree` and 10-4's `classifyPricing` already ACCEPT an optional `subscriptionProviders?: ReadonlySet<string>` param (forward hook). This story POPULATES it from a new `subscription_providers` input and threads it through to both the listing filter/tags and the run guard. Default empty — the `enabled.via === 'account'` rule already covers Copilot/Anthropic/OpenAI, so this is an escape hatch, not a requirement.

## Acceptance Criteria

1. **Given** `action.yml` **When** updated **Then** it declares `subscription_providers` (string, default `''`, doc: comma-separated provider IDs to always treat as paid subscriptions — their cost-0 models are never classified free).

2. **Given** `config.ts` `getInputs()` **When** parsing **Then** `subscription_providers` is parsed into `ActionInputs.subscriptionProviders: string[]` — split on commas, trim each, drop empties. Default `[]`.

3. **Given** a provider id listed in `subscription_providers` **When** `disable_free_models` filtering/guarding or list tagging runs **Then** that provider's cost-0 models are classified `'subscription'` (not `'free'`), so they are NOT omitted, NOT blocked, and tagged `[subscription]` — even when `enabledVia !== 'account'`.

4. **Given** the override threads through **When** `handleListModels` and the run guard (`checkFreeModelGuard`) call `isFilterableFree`/`classifyPricing` **Then** they pass `new Set(inputs.subscriptionProviders)` as the `subscriptionProviders` arg.

5. **Given** `subscription_providers` is empty (default) **When** anything runs **Then** behavior is identical to before this story (the `enabled.via` rule alone governs) — backward compatible.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — coding-style, validation, testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: action.yml + config parse** (AC: 1, 2)
  - [x] action.yml: add `subscription_providers` (default `''`, clear comma-separated doc).
  - [x] config.ts getInputs(): parse to `subscriptionProviders: string[]` (split ',', trim, filter empty). Add field to `ActionInputs` in types.ts.

- [x] **Task 3: Thread the override** (AC: 3, 4)
  - [x] In `handleListModels` (runner.ts): build `const subs = new Set(inputs.subscriptionProviders)` and pass it to BOTH the `isFilterableFree(m, subs)` omission filter (10-3) AND the `classifyPricing(m, subs)` tagging (10-4).
  - [x] In `checkFreeModelGuard` (runner.ts): pass `new Set(inputs.subscriptionProviders)` to `isFilterableFree(resolvedModel, subs)`.

- [x] **Task 4: Unit tests** (AC: 1–5)
  - [x] config.spec.ts: parse cases — single, comma list, spaces, empty → []; trailing commas dropped.
  - [x] runner.spec.ts: a provider in subscription_providers with cost-0 non-account model → NOT omitted (list), tagged [subscription], and NOT blocked by the run guard. Empty override → unchanged behavior.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- The predicate/classifier already take the param (10-2/10-4) — this story is purely: add input → parse → thread `new Set(...)` at the two call sites. No new logic in model-filter.ts.
- Scope: do NOT touch the predicate logic, the join (10-1), or add the e2e/test-sweep (10-6).
- Conventions: comma-split parse, named exports, `.js` imports; clearMocks global; coverage 80%/75%. Backward compatible (default empty).

### References

- [Source: epics.md#Story 10.5] · [Source: prd.md#FR58] · [Source: research/opencode-upgrade-design-2026-05-29.md §4a + D7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`action.yml`, `src/types.ts`, `src/config.ts`): Added `subscription_providers` input to action.yml (default ''). Added `subscriptionProviders: string[]` to `ActionInputs`. Parsed in `getInputs()`: `core.getInput('subscription_providers').split(',').map(s => s.trim()).filter(s => s.length > 0)` — handles single, multi, spaces, trailing commas, empty string.
- **Task 3** (`src/runner.ts`): In `handleListModels`, built `const subs = new Set(inputs.subscriptionProviders)` once and passed to both `isFilterableFree(m, subs)` (omission) and `classifyPricing(m, subs)` (tagging). In `checkFreeModelGuard`, built `const subs = new Set(inputs.subscriptionProviders)` and passed to `isFilterableFree(resolvedModel, subs)`. No logic change in model-filter.ts — pure threading.
- **Task 4**: 5 config parse tests (single/comma-list/spaces/trailing-comma/empty). 2 listing tests (override provider kept+tagged [subscription]; empty override unchanged). 1 guard test (override provider not blocked). Existing fixtures in runner.spec, config.spec, index.spec updated with `subscriptionProviders: []`.
- **Quality**: lint zero, typecheck clean, format no changes, 608/608 tests pass (+8 new), coverage 92.47%/85.08%.

### File List

- `action.yml` — added `subscription_providers` input
- `src/types.ts` — added `subscriptionProviders: string[]` to `ActionInputs`
- `src/config.ts` — parse `subscription_providers` → `subscriptionProviders`; added to return object
- `src/runner.ts` — thread `new Set(inputs.subscriptionProviders)` to both call sites
- `src/config.spec.ts` — 5 new parse tests + `subscriptionProviders: []` on all `validateInputs` fixtures
- `src/runner.spec.ts` — `subscriptionProviders: []` in `createValidInputs`; 2 listing + 1 guard tests
- `src/index.spec.ts` — `subscriptionProviders: []` in `createValidInputs`
- `_bmad-output/implementation-artifacts/10-5-subscription-providers-override.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
