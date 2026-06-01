# Story 11.1: Parse `fallback_config` (No Credentials)

Status: done

## Story

As a **GitHub Actions user**,
I want **to declare an ordered list of provider/model references in a `fallback_config` file**,
So that **the runner can select the first healthy provider at conversation start (10-2/11-3) — with auth handled separately via `auth_config` (D8), so no credentials live in the chain**.

## Background

Design D1/D2/D8 (spike-validated). The fallback chain is a pure ordered list of `{provider, model}` references. Providers are authenticated SEPARATELY via the existing `auth_config`/auth.json — the chain config carries NO credentials. This story is just: add the input, load + validate the JSON shape, expose it on `ActionInputs`. The actual selection logic is 11-2/11-3.

## Acceptance Criteria

1. **Given** `action.yml` **When** updated **Then** it declares a new input `fallback_config` (string path, default `''`, doc: path to a JSON file with an ordered provider/model chain; auth is configured separately via `auth_config`; NO credentials in this file).

2. **Given** `config.ts` `getInputs()` **When** `fallback_config` is set **Then** the path is validated via `validateConfigPath` (same safety as `opencode_config`/`auth_config`) and stored on `ActionInputs.fallbackConfig?: string` (the resolved path; undefined when absent).

3. **Given** the fallback config JSON **When** loaded (at run time, in the runner/opencode layer) **Then** it is parsed to a typed `FallbackChain = { chain: Array<{ provider: string; model: string }> }`. Each entry MUST have non-empty `provider` and `model` strings.

4. **Given** a fallback config entry containing an `auth`, `token`, `key`, `apiKey`, or any credential-like field **When** parsed **Then** parsing FAILS with a clear error ("fallback_config must not contain credentials; configure auth via auth_config") — D8 is enforced, not just documented.

5. **Given** an empty/missing `chain`, a non-array `chain`, or an entry missing `provider`/`model` **When** parsed **Then** a clear validation error is returned (Result pattern / thrown per the existing config-load convention).

6. **Given** `fallback_config` is absent (default) **When** anything runs **Then** behavior is unchanged — the single-provider path (`inputs.model` / opencode_config) governs, fully backward compatible.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All) — coding-style, validation, error-handling, security, testing/unit-testing; load `typescript-clean-code`, `typescript-unit-testing`

- [x] **Task 2: Input + path validation** (AC: 1, 2, 6)
  - [x] action.yml: add `fallback_config` (default `''`, doc emphasizing NO credentials + auth via auth_config).
  - [x] config.ts getInputs(): if set, `validateConfigPath(workspacePath, raw)` → `fallbackConfig`. Add `fallbackConfig?: string` to `ActionInputs` in types.ts. Default undefined.

- [x] **Task 3: FallbackChain type + parser** (AC: 3, 4, 5)
  - [x] Add `FallbackChainEntry { provider: string; model: string }` and `FallbackChain { chain: FallbackChainEntry[] }` to types.ts.
  - [x] Add a parser/validator — recommend `src/fallback-config.ts` (leaf-ish: loads + validates the JSON). `loadFallbackConfig(filePath): FallbackChain` — read file, JSON.parse, validate:
    - `chain` is a non-empty array
    - each entry has non-empty string `provider` and `model`
    - NO entry contains credential-like keys (`auth`, `token`, `key`, `apiKey`, `secret`, `credentials`) → throw the D8 error
  - [x] Reuse the loadJsonFile error style from opencode.ts (file-not-found / invalid-JSON messages) or a parallel local helper.

- [x] **Task 4: Unit tests** (AC: 1–6)
  - [x] config.spec.ts: `fallback_config` path validated → `fallbackConfig` set; absent → undefined.
  - [x] fallback-config.spec.ts (new): valid chain parses; empty/non-array chain → error; entry missing provider/model → error; entry with `auth`/`token`/`key` → D8 error; invalid JSON → error; file not found → error.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **D8 is the headline:** the chain has NO credentials. Enforce it in the parser (AC4), don't just document it. Auth stays in auth_config (unchanged).
- This story is parse + validate + expose ONLY. Do NOT implement provider selection / start-and-watch (11-2/11-3), the authenticated-provider preflight (11-2), or precedence vs `model` (11-5). Just get a validated `FallbackChain` available.
- Integration pattern: `fallback_config` mirrors `opencode_config`/`auth_config` (path input → validateConfigPath → loaded at run time). The loader runs in the runner/opencode layer (not config.ts, which only validates the path) — match where opencode_config is loaded.
- Conventions: Result/throw per existing config-load style; named exports, `.js` imports, noUncheckedIndexedAccess; clearMocks global; coverage 80%/75%. Backward compatible (default absent).

### References

- [Source: epics.md#Story 11.1] · [Source: prd.md#FR59] · [Source: research/opencode-upgrade-design-2026-05-29.md §5 + D1/D2/D8]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (dev-e10 sub-agent, 2026-06-01)

### Completion Notes List

- **Task 2** (`action.yml`, `src/types.ts`, `src/config.ts`): Added `fallback_config` input to action.yml (default '', doc explicitly states NO credentials). Added `fallbackConfig?: string` to `ActionInputs`. In `getInputs()`: `fallbackConfigRaw = core.getInput('fallback_config') || undefined`; if set, `validateConfigPath(workspacePath, fallbackConfigRaw)` → `fallbackConfig` (same pattern as `opencode_config`/`auth_config`).
- **Task 3** (`src/types.ts` + new `src/fallback-config.ts`): Added `FallbackChainEntry {provider, model}` and `FallbackChain {chain: FallbackChainEntry[]}` to types.ts. New `loadFallbackConfig(filePath): FallbackChain` uses synchronous `fs.readFileSync` (matches the loader pattern for config files). Error style mirrors `loadJsonFile`: ENOENT→"Fallback config file not found: <basename>"; invalid JSON→"Invalid JSON in fallback config file: <basename>". Validates: non-array/empty chain→error; each entry checked for credential keys (case-insensitive, Set of `auth/token/key/apikey/secret/credentials`) before structure; missing/empty provider or model→error. D8_ERROR constant = the exact required message.
- **Task 4**: 2 config.spec.ts tests (path validated→fallbackConfig set; absent→undefined). 21 fallback-config.spec.ts tests: 3 valid-chain (single, multi-entry, whitespace-trim), 7 D8 credential-key tests (auth/token/key/apiKey/secret/credentials + case-insensitive APIKEY), 7 structural-validation tests (empty array, missing chain, non-array, missing provider, missing model, empty provider, empty model), 2 I/O tests (file not found, invalid JSON).
- **Quality**: lint zero, typecheck clean, format applied (prettier fixed 2 lines in fallback-config.ts), 650/650 tests pass (+21 new), coverage 92.48%/85.39%.

### File List

- `action.yml` — added `fallback_config` input
- `src/types.ts` — added `FallbackChainEntry`, `FallbackChain` interfaces; `fallbackConfig?: string` on `ActionInputs`
- `src/config.ts` — parse `fallback_config` → `fallbackConfig` via `validateConfigPath`; added to return
- `src/fallback-config.ts` — new: `loadFallbackConfig()` parser+validator (D8 enforcement)
- `src/config.spec.ts` — 2 new `fallback_config` parsing tests
- `src/fallback-config.spec.ts` — new: 21 tests (valid/D8/structural/I/O)
- `_bmad-output/implementation-artifacts/11-1-parse-fallback-config-no-credentials.md` — this file

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
