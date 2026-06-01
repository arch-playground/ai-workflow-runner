---
baseline_commit: b398715c87cb015f190b905e7677792940bb9be2
---

# Story 10.1: Join Provider Auth State With Model Cost

Status: done

## Story

As the **runner**,
I want **`listModels()` to expose each model's cost AND its provider's auth state (`enabled.via`)**,
So that **downstream free-model filtering (10-2/10-3) can distinguish a genuinely-free model from a subscription model that merely reports cost 0 (e.g. GitHub Copilot)**.

## Background / verified facts

- VERIFIED against the installed `@opencode-ai/sdk@1.15.12` v2 types: `client.v2.provider.list` exists ("List v2 providers") and a provider's `enabled` field is the union `false | { via: "env" } | { via: "account"; service } | { via: "custom" }` (types.gen.d.ts ~line 3032-3039).
- VERIFIED against the user's REAL authenticated server (2026-06-01): `github-copilot`, `anthropic`, `openai` all report `enabled.via === "account"`, and all 21 Copilot models report `cost: { input: 0, output: 0 }`. A cost-only "free" rule would wrongly classify the paid Copilot subscription as free — `enabled.via` is the discriminator (design decision D7).
- The model `cost` lives on `client.config.providers()` (today's `listModels()` source) — that response carries per-model cost but NOT `enabled.via`. So the two must be **joined by provider id**.
- Current `listModels()` (src/opencode.ts ~203-226) returns `{ id, name, provider, providerId }` and ignores both `cost` and `enabled.via`.

## Acceptance Criteria

1. **Given** `listModels()` **When** called **Then** it calls BOTH `client.config.providers()` (models + cost) and `client.v2.provider.list()` (provider `enabled.via`) and joins them by provider id, returning for each model: `{ id, name, provider, providerId, cost?, enabledVia? }` where `cost` is the per-model cost object (or undefined if absent) and `enabledVia` is `'env' | 'account' | 'custom' | undefined` (undefined when the provider is not in the v2 list / not authenticated / `enabled === false`).

2. **Given** a provider present in `config.providers()` but ABSENT from `v2.provider.list()` (e.g. an unauthenticated catalog provider like OpenCode Zen) **When** joined **Then** its models get `enabledVia: undefined` (treated as not-account-authed downstream).

3. **Given** the `v2.provider.list()` call fails or is unavailable **When** joining **Then** `listModels()` degrades gracefully — it still returns models from `config.providers()` with `enabledVia: undefined` (best-effort; do not fail the whole listing because the auth-state lookup failed). Log a debug note.

4. **Given** the existing `listModels()` callers (`handleListModels` in runner.ts) **When** this lands **Then** they still work — the return type is a superset (added optional fields), so existing behavior (printing models) is unaffected. The richer fields are consumed by 10-2/10-3/10-4, not here.

5. **Given** the cost object shape **When** read **Then** it is read defensively (cost may be absent on some models, e.g. local providers; `noUncheckedIndexedAccess` respected).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, error-handling (best-effort degradation), logging, commenting, testing/unit-testing
  - [x] Load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Define the enriched model type** (AC: 1)
  - [x] In `src/types.ts` (or inline on the method return), define the listModels item: `{ id: string; name: string; provider: string; providerId: string; cost?: { input: number; output: number; ... }; enabledVia?: 'env' | 'account' | 'custom' }`. Keep it minimal — only fields downstream stories need (id, name, provider, providerId, cost, enabledVia). A named exported interface (e.g. `ModelListItem`) is preferred for reuse in 10-2..10-4.

- [x] **Task 3: Build the provider auth-state map** (AC: 1, 2, 3)
  - [x] In `src/opencode.ts` `listModels()`, after fetching `config.providers()`, also call `this.client.v2.provider.list(...)` and build a `Map<providerId, enabledVia>` from each provider's `enabled` (extract `.via` when `enabled` is an object; skip when `enabled === false`).
  - [x] Wrap the v2 call in its own try/catch — on failure, use an empty map and `core.debug` a note (AC3 graceful degradation). Do NOT let it throw out of listModels.
  - [x] Verify the exact v2 call signature/return against the installed types (sdk.gen.d.ts ~line 1389 "List v2 providers"); the response is an array of provider info objects each with `id` and `enabled`.

- [x] **Task 4: Join and enrich** (AC: 1, 5)
  - [x] In the existing loop over `config.providers()` providers/models, attach `cost: model.cost` (read defensively) and `enabledVia: authMap.get(provider.id)`.
  - [x] Return the enriched array.

- [x] **Task 5: Unit tests** (AC: 1–5)
  - [x] Extend the opencode-test-helpers MockClient to include `v2.provider.list` (returning an array of `{ id, enabled }`).
  - [x] Test: models enriched with cost + enabledVia from the join (account provider → 'account'; model cost present).
  - [x] Test: provider in config but absent from v2 list → enabledVia undefined (AC2).
  - [x] Test: v2.provider.list throws → listModels still returns config models with enabledVia undefined, debug logged (AC3).
  - [x] Test: model with no cost → cost undefined, no crash (AC5).
  - [x] Test: existing handleListModels path still prints models (AC4 — superset return, no regression).

- [x] **Final Task: Quality Checks**
  - [x] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### This is the FOUNDATION for Epic 10

10-2 (free predicate), 10-3 (`disable_free_models`), 10-4 (enriched list output) all consume the `cost` + `enabledVia` fields this story adds. Get the join right and minimal; do NOT implement the filtering itself here (that's 10-2/10-3).

### Verified API (do not guess)

- `client.config.providers()` → `{ data: { providers: Array<{ id, name, models: Record<string, {id,name,cost,...}> }> } }` (already used in listModels today).
- `client.v2.provider.list(...)` → array of provider info, each with `id` and `enabled: false | {via:'env',name} | {via:'account',service} | {via:'custom',data}`. Confirm the exact param shape (likely an optional `{ location?: {...} }` or no-arg) against `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts`.
- The leader validated on the real server that copilot/anthropic/openai report `via:'account'`; Zen (unauthenticated) is absent from the v2 list → undefined.

### Scope boundary (do NOT do here)

- No filtering, no `disable_free_models` input, no list-output formatting (10-2/10-3/10-4).
- Do NOT change runSession / auth / event paths.

### Project conventions

- Best-effort degradation (catch + core.debug, don't throw) for the v2 lookup. Named exports, `.js` imports, `noUncheckedIndexedAccess` (narrow cost/enabled before use). `clearMocks: true` global. Coverage 80%/75%.

### References

- [Source: epics.md#Story 10.1] · [Source: prd.md#FR57] · [Source: research/opencode-upgrade-design-2026-05-29.md §4 + D7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`src/types.ts`): Added `ModelCost` interface (input/output numbers) and `ModelListItem` interface (id, name, provider, providerId, cost?, enabledVia?). Both exported for reuse in 10-2..10-4.
- **Task 3** (`src/opencode.ts` ~242-262): New private `buildProviderAuthMap()` method calls `this.client.v2.provider.list()`. Returns `Map<providerId, 'env'|'account'|'custom'>`. Reads `.data` from the `RequestResult` response. Wraps in try/catch → on failure logs `core.debug('[OpenCode] v2.provider.list() failed ...')` and returns empty map (AC3 graceful degradation). `enabled === false` providers are skipped (not added to map).
- **Task 4** (`src/opencode.ts` ~208-240): `listModels()` return type changed to `Promise<ModelListItem[]>`. After config.providers(), calls `buildProviderAuthMap()`. In model loop: `cost` extracted defensively (null/undefined check on `model.cost` before reading `.input`/`.output`); `enabledVia` from `authMap.get(provider.id)` (undefined when absent). AC5: cost undefined for models without cost; AC2: enabledVia undefined for providers absent from v2 list.
- **Task 5** (`src/opencode-test-helpers.ts` + `src/opencode.spec.ts`): `MockClient` extended with `v2.provider.list: jest.Mock` defaulting to `{ data: [] }`. Five new tests added: AC1 (enrichment with account+cost), AC2 (absent-from-v2 → undefined), AC3 (v2 throws → graceful degradation + debug log), AC5 (no cost → undefined), AC3b (enabled:false → excluded). All 59 runner.ts tests still pass (AC4 regression).
- **Quality**: lint zero warnings, typecheck clean, format applied, 566/566 tests pass, coverage 92.34% stmts / 84.7% branches (thresholds 80%/75% ✅).

### Dev Notes

- SDK `v2.provider.list()` returns `Promise<{ data: Array<ProviderV2Info>; ... } | { data: undefined; error: ... }>` (ThrowOnError=false default). Response accessed via `.data`. Confirmed against `sdk.gen.d.ts` ~1389 and `types.gen.d.ts` ~3032 (`ProviderV2Info.enabled` union).
- `Model.cost` in `config.providers()` response (`Provider.models[key]`) is `{ input: number; output: number; cache: ... }` per SDK types — `as number` casts are unnecessary (ESLint caught them). Defensive null check on `model.cost` handles AC5 (local providers may have no cost field at runtime despite SDK types).
- `buildProviderAuthMap()` is a private helper method (not inlined in `listModels`) for single-responsibility and testability.

### File List

- `src/types.ts` — added `ModelCost`, `ModelListItem` interfaces
- `src/opencode.ts` — enriched `listModels()` return type + body; added private `buildProviderAuthMap()`
- `src/opencode-test-helpers.ts` — added `v2.provider.list` mock to `MockClient` interface + `createMockClient()`
- `src/opencode.spec.ts` — 5 new tests (10-1-AC1, AC2, AC3 ×2, AC5)
- `_bmad-output/implementation-artifacts/10-1-join-provider-auth-state-with-model-cost.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
