# Story 11.2: Authenticated-Provider Preflight

Status: done

## Story

As the **runner**,
I want **to validate each fallback-chain provider is actually authenticated before trying to select it**,
So that **the selector (11-3) skips chain entries whose provider has no credentials — with a clear warning — instead of wasting a session-start attempt on a provider that can never work**.

## Background

11-1 gives a validated `FallbackChain` of `{provider, model}` refs. Auth lives in `auth_config` (D8). This story adds the preflight: for each chain entry, check whether its provider is authenticated (present + enabled in the SDK's provider view, i.e. `enabled !== false` / has an `enabled.via`). Unauthenticated entries are filtered out with a `core.warning` so the selector only considers viable providers. The actual start-and-watch selection is 11-3.

## Acceptance Criteria

1. **Given** a loaded `FallbackChain` and the authenticated-provider set (derived from `v2.provider.list()` — same source as 10-1's `enabledVia` map) **When** preflight runs **Then** it returns the subset of chain entries whose `provider` id is authenticated (appears in the provider list with `enabled !== false`).

2. **Given** a chain entry whose provider is NOT authenticated (absent from the provider list, or `enabled === false`) **When** preflight runs **Then** that entry is OMITTED from the viable set and a `core.warning` (titled) is logged naming the skipped provider (e.g. "Fallback provider 'foo' is not authenticated (no credentials in auth_config) — skipping").

3. **Given** ALL chain entries are unauthenticated **When** preflight runs **Then** it returns an empty viable list (the selector/11-5 will turn that into a clear chain-exhausted failure — not this story's job to fail, just to report empty).

4. **Given** the provider-list lookup itself fails (v2 call unavailable) **When** preflight runs **Then** it degrades gracefully — treat all chain providers as "assume viable" (do NOT strand a run because the auth-state probe failed) and `core.debug` a note. (Mirror 10-1's graceful-degradation stance.)

5. **Given** preflight reuses provider auth state **When** implemented **Then** it SHARES the `enabled.via` lookup with 10-1's `buildProviderAuthMap` (or an equivalent exposed helper) — do NOT duplicate the v2.provider.list parsing. Refactor 10-1's private map-builder into something 11-2 can reuse if needed (e.g. a method returning the full provider→enabled map, or a `getAuthenticatedProviderIds()` helper).

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — coding-style, error-handling (graceful degradation), logging, testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Expose authenticated-provider set from OpenCodeService** (AC: 1, 4, 5)
  - [x] Reuse/refactor 10-1's `buildProviderAuthMap()` (private, in opencode.ts). Add a public method like `getProviderAuthMap(): Promise<Map<string, 'env'|'account'|'custom'>>` (or `getAuthenticatedProviderIds(): Promise<Set<string>>`) that the preflight can call — backed by the SAME `v2.provider.list()` parsing (no duplication). Keep graceful degradation (empty map / debug on failure).

- [x] **Task 3: Preflight function** (AC: 1, 2, 3, 4)
  - [x] Add `preflightFallbackChain(chain: FallbackChain, authedProviderIds: Set<string>): FallbackChainEntry[]` — recommend in `src/fallback-config.ts` (pure, alongside the parser) — returns entries whose provider is in `authedProviderIds`; for each omitted entry, the CALLER logs the warning (keep the pure fn pure; do logging in the runner) OR pass a logger — pick the cleaner option and document.
  - [x] Graceful degradation (AC4): if `authedProviderIds` is empty BECAUSE the lookup failed (distinguish "lookup failed" from "genuinely zero authed") — recommend: the runner detects lookup-failure and passes a sentinel / skips preflight (treat all viable). Document the chosen approach.

- [x] **Task 4: Unit tests** (AC: 1–5)
  - [x] fallback-config.spec.ts (or a new preflight spec): viable subset returned; unauthenticated entry omitted; all-unauthenticated → empty; graceful path (lookup failed → all viable).
  - [x] opencode.spec.ts: the new public auth-map/ids method returns the same data as 10-1's map; degrades on v2 failure.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **Reuse, don't duplicate (AC5):** 10-1 already parses `v2.provider.list()` into a provider→enabledVia map (private `buildProviderAuthMap`). Expose it (or a derived `Set` of authed ids) and have the preflight consume it. One source of truth for provider auth state.
- "Authenticated" = present in the v2 provider list with `enabled !== false` (any `via`). A provider with `enabled === false` or absent → not authenticated → skip.
- Scope: preflight ONLY (which chain entries are viable). Do NOT implement the start-and-watch session selection (11-3), commit-boundary (11-4), or exhaustion/precedence (11-5). This story produces the viable list + warnings.
- Graceful degradation is important: a flaky v2 lookup must NOT strand an otherwise-valid run — when in doubt, treat providers as viable and let 11-3's start-and-watch be the real gate.
- Conventions: named exports, `.js` imports, noUncheckedIndexedAccess; clearMocks global; coverage 80%/75%.

### References

- [Source: epics.md#Story 11.2] · [Source: prd.md#FR60] · [Source: research/opencode-upgrade-design-2026-05-29.md §5 (preflight) + D8]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`src/opencode.ts`): Added two public methods alongside the existing private `buildProviderAuthMap()`: (1) `getProviderAuthMap()` — delegates to `buildProviderAuthMap()`, guards disposed/uninitialized, same graceful degradation (empty map on failure). (2) `getAuthenticatedProviderIds()` — own v2.provider.list() call; returns `Set<string>` of all providers with `enabled !== false/null/undefined`, or `null` on failure (the sentinel for AC4). Includes disposed/uninitialized guards. `buildProviderAuthMap()` remains private (used by `listModels()`).
- **Task 3** (`src/fallback-config.ts`): Added `PreflightResult` interface (`{viable, skipped, lookupFailed}`). Added pure `preflightFallbackChain(chain, authedProviderIds: Set<string> | null): PreflightResult`. Design: `null` = lookup failed → returns all entries as viable + `lookupFailed: true` (AC4). Non-null: partitions entries into `viable` (in set) and `skipped` (not in set). CALLER logs `core.warning` per skipped entry (pure fn stays pure).
- **Task 4**: 6 `preflightFallbackChain` tests in fallback-config.spec.ts (viable subset, skipped entries, all-unauth empty, null→all viable, all-auth, order preserved). 4 `getProviderAuthMap()` tests + 4 `getAuthenticatedProviderIds()` tests in opencode.spec.ts (valid map, v2 failure→empty/null, disposed, uninitialized).
- **Quality**: lint zero, typecheck clean, format applied (2 spec files reformatted), 664/664 tests pass (+14 new), coverage 92.65%/85.73%.

### Dev Notes

- AC4 graceful degradation approach: `getAuthenticatedProviderIds()` returns `null` (not an empty `Set`) on v2 failure. This is the sentinel that the runner uses to skip preflight entirely (treat all providers as viable). Avoids the ambiguity between "zero authenticated providers" (genuine) and "lookup failed" (degradation). Documented in JSDoc on both `getAuthenticatedProviderIds()` and `preflightFallbackChain()`.
- `getProviderAuthMap()` vs `getAuthenticatedProviderIds()`: the map variant exposes the full `via` data (for future use), the ids-set variant is what preflight needs. Both are public and independently tested.

### File List

- `src/opencode.ts` — added public `getProviderAuthMap()` + `getAuthenticatedProviderIds()` methods; new private `fetchV2Providers()` helper (R1 fix)
- `src/fallback-config.ts` — added `PreflightResult` interface + `preflightFallbackChain()` pure function
- `src/fallback-config.spec.ts` — 6 new `preflightFallbackChain` tests
- `src/opencode.spec.ts` — 8 new tests (4× `getProviderAuthMap`, 4× `getAuthenticatedProviderIds`)
- `_bmad-output/implementation-artifacts/11-2-authenticated-provider-preflight.md` — this file

### Round 1/2 Fix (R1)

- **R1 applied** (`src/opencode.ts`): Extracted `private async fetchV2Providers(): Promise<Array<{id: string; enabled: unknown}>>` — does `v2.provider.list()` + `.data` extraction + `Array.isArray` guard + cast. `buildProviderAuthMap()` now iterates `fetchV2Providers()` (same `via` rule, try/catch stays). `getAuthenticatedProviderIds()` now iterates `fetchV2Providers()` (same `enabled !== false` rule, own try/catch → null sentinel stays). Single SDK-shape parse site; both methods' semantics + return types unchanged. 664/664 still pass; lint zero; typecheck clean.

## Review Notes

**Round 1 (leader, 2026-06-01) — 1 finding, minor (maintainability / AC5):**

Finding R1 — **duplicated `v2.provider.list()` parsing** (AC5 wanted no duplication). `getAuthenticatedProviderIds()` (opencode.ts) re-implements the `v2Response.data → providers[]` extraction loop that `buildProviderAuthMap()` already contains. The two methods legitimately differ in their _inclusion rule_ (map: only `enabled` objects with a `via`; ids: any `enabled !== false`) and return type (`Map` vs `Set|null` sentinel), so they should stay separate methods — BUT the **SDK-shape coupling** (`(v2Response as {data?}).data`, `Array.isArray(rawData) ? rawData : []`, the `as {id, enabled}` cast) is duplicated in two places. A future SDK response-shape change must now update both.

**Fix (Round 1/2):** Extract ONLY the shared fetch+extract into a private helper, e.g.
`private async fetchV2Providers(): Promise<Array<{ id: string; enabled: unknown }>>` that does the `v2.provider.list()` call + `data` extraction + array guard + cast, and returns `[]` on the call itself succeeding-but-empty. Then:

- `buildProviderAuthMap()` iterates `fetchV2Providers()` applying its `via` rule.
- `getAuthenticatedProviderIds()` iterates the same helper applying its `enabled !== false` rule, and keeps its own try/catch → `null` sentinel around the helper call (the lookup-failed semantic stays here).

Keep both public methods and their distinct semantics; just remove the duplicated SDK-shape parsing. Re-run tests — all 664 should still pass (behavior unchanged), plus the existing graceful-degradation tests still cover the `null` path.

## QA Results

_(tester fills in during functional validation)_
