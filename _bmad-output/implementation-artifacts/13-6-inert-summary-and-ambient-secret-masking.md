# Story 13.6: Inert Summary Rendering + Ambient-Secret Masking Backstop

---

## baseline_commit: 2a93483d55a779492d3d1a2a42f9b9ebd0fcb6d3

Status: review

## Story

As an **operator**,
I want **untrusted agent output rendered as inert text in the job summary, and the runner secrets the Action can enumerate masked even if surfaced**,
So that **a phishing link in agent output doesn't render as clickable (closes AGENT-08/MEDIUM-2), and ambient secrets like GITHUB_TOKEN or parsed auth.json values are scrubbed from artifacts as a backstop (cross-cutting C2)**.

## Background

**Red-team findings:**

- **MEDIUM-2 (AGENT-08):** `summary-writer.ts:128` uses `.addRaw(scrubbed)`. `core.summary` escapes HTML but **renders markdown** — so `[Click here](https://evil)` from agent output becomes a live phishing link in the job summary.
- **Cross-cutting (C2 backstop):** `maskSecrets` (`security.ts:208`) only masks values passed via `env_vars`. Ambient runner secrets the Action _can_ enumerate — `GITHUB_TOKEN` if present, and the credential values it parses from `auth.json` in `applyAuth` — are NOT masked, so if surfaced they appear unredacted. (Primary prevention is 13-1/13-2; this is the output-side backstop.)

**Design (MEDIUM-2 S1 + cross-cutting C2):** render the final message via `addCodeBlock` (inert preformatted — no markdown/link rendering); and feed the enumerable ambient secrets into `core.setSecret()`.

**Scope boundary:** summary rendering + ambient-secret masking ONLY. Do NOT touch permissions/env/container/baseURL/timeout (done). Token-shape heuristic redaction (C3) is OUT of scope (optional future).

## Acceptance Criteria

1. **Inert summary.** `summary-writer.ts` renders the final assistant message via `core.summary.addCodeBlock(scrubbed)` (or equivalent inert form) instead of `.addRaw(scrubbed)`. Verified: an agent message `[Click](https://evil.example)` appears as literal preformatted text in the summary, NOT a clickable link. Keep the existing `scrubSecrets` + `truncateString` pass (code-blocking is IN ADDITION to scrubbing).

2. **Summary still readable.** The rest of the summary (status, token/cost/duration table, tool activity) renders as before — only the untrusted final-message body becomes a code block. The transcript JSON (full fidelity) is unaffected.

3. **GITHUB_TOKEN masked.** If `process.env.GITHUB_TOKEN` (or `INPUT_GITHUB_TOKEN`) is present, its value is registered via `core.setSecret()` so it's redacted in logs/summary/transcript even if surfaced. (Defensive — the agent shouldn't see it post-13-1, but mask anyway.)

4. **Parsed auth.json values masked.** In `applyAuth`, after parsing the auth file, each credential value (the secret-bearing leaf values — keys/tokens) is registered via `core.setSecret()` before use, so a provider key never appears unredacted in any artifact. (Mirror how `maskSecrets` iterates `env_vars` values.)

5. **No over-masking.** Don't `setSecret` empty/whitespace/very-short values (avoid masking benign substrings). Mirror the existing `maskSecrets` guard (non-empty `value.length > 0`); consider a minimum length to avoid masking trivial values.

6. **Backward compatible.** Summary + transcript still produced; declared `env_vars` masking unchanged; the run behaves identically otherwise.

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, commenting, logging, security, unit-testing standards. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [x] Read design `security-hardening-design-2026-06-02.md` → MEDIUM-2 (S1) + Cross-cutting (C2).

- [x] **Task 2: Inert summary rendering** (AC: 1, 2)
  - [x] `summary-writer.ts`: replaced `.addRaw(scrubbed).addEOL()` with `.addCodeBlock(scrubbed)`. `addCodeBlock` already calls `addEOL()` internally so `.addEOL()` removed. Confirmed `core.summary.addCodeBlock(code, lang?)` exists in installed @actions/core.
  - [x] Heading "Final assistant message" retained; only the message body is code-blocked.

- [x] **Task 3: Ambient-secret masking backstop** (AC: 3, 4, 5)
  - [x] Added `maskAmbientSecrets()` to `security.ts` (near `maskSecrets`): checks `GITHUB_TOKEN` and `INPUT_GITHUB_TOKEN`, calls `core.setSecret` if value length >= MIN_SECRET_LENGTH (4). Called in `index.ts` `run()` early, after shutdown check, before workflow execution.
  - [x] Added `maskAuthValues(authData)` to `security.ts`: walks `authData` entries (by providerId), iterates string leaf values in each credential object, calls `core.setSecret` for values >= MIN_SECRET_LENGTH. Called in `opencode.ts` `applyAuth()` immediately after `loadJsonFile`.
  - [x] `MIN_SECRET_LENGTH = 4` guards against masking trivial values.

- [x] **Task 4: Unit tests** (AC: 1–6)
  - [x] `summary-writer.spec.ts`: Added `addCodeBlock` mock in `beforeEach`; updated 2 existing tests that asserted `addRaw` for message body to use `addCodeBlock`; added 3 new 13-6 tests — `addCodeBlock` called not `addRaw`; markdown link rendered as inert code block; scrubbing still applied before code-blocking.
  - [x] `security.spec.ts`: Exported `maskAmbientSecrets` and `maskAuthValues` from imports; 5 tests for `maskAmbientSecrets` (GITHUB_TOKEN masked; INPUT_GITHUB_TOKEN masked; absent → no-op; short value skipped; no throw when absent); 4 tests for `maskAuthValues` (string values masked; short values skipped; empty data no-op; non-object credential no throw).
  - [x] `opencode.spec.ts`: 2 new 13-6 tests — spies on `security.maskAuthValues`; verifies it's called with parsed auth data (used `mockReset()` on readFile spy to clear leftover queued values from prior 13-4 tests).
  - [x] `test/mocks/@actions/core.ts`: Added `addCodeBlock: jest.fn().mockReturnThis()` to summary mock.
  - [x] `index.spec.ts`: Added `maskAmbientSecrets: jest.fn()` to `./security` mock.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`
  - [x] `npm run lint` — clean (0 errors, 0 warnings)
  - [x] `npm run format` — clean (no changes)
  - [x] `npm run typecheck` — clean (0 type errors)
  - [x] `npm run test:unit` — 813/813 passing, 27 suites

## Dev Notes

- **`addCodeBlock` vs `addRaw`:** `core.summary.addCodeBlock(code, lang?)` wraps in a fenced/`<pre>` block → markdown links/images don't render. This is the lowest-risk neutralization (design S1). Verify the exact method name/signature in the installed @actions/core summary API.
- **Prevention is primary (13-1/13-2); this is the backstop (C2).** Don't try to enumerate ALL possible secrets (impossible) — only the ones the Action demonstrably holds: GITHUB_TOKEN + parsed auth.json values. That's the high-value, low-false-positive set.
- **`core.setSecret` is idempotent-ish** and additive — masking the same value twice is harmless.
- **Avoid masking short/benign values** — masking a 2-char value would redact it everywhere in output. Mirror `maskSecrets`' `value.length > 0` guard, and consider a small min length for the ambient set.
- ai-memory `comment-hygiene`: minimal comments.
- Conventions: named exports, `.js` imports; coverage ≥80%/75%. Backward compatible.
- **Test gotcha:** `opencode.spec.ts` 13-4 test at line 425 leaves an unconsumed `readFile` `once` value (because `buildSdkConfig` throws before auth is read). The 13-6 tests use `jest.spyOn(...).mockReset()` to clear the queue before adding their own values.

### References

- [Source: epics.md#Story 13.6] · [Source: prd.md#FR72, #NFR24]
- [Source: research/security-hardening-design-2026-06-02.md → MEDIUM-2 (S1), Cross-cutting (C2)]
- [Source: docs/tests/TC-REDTEAM-agent-execution.md → AGENT-08]
- Current: `src/summary-writer.ts:115-128` (scrub + addRaw), `src/security.ts:208` (maskSecrets), `src/opencode.ts:applyAuth`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (bmad-auto sub-agent)

### Completion Notes List

- AC1 ✅: `summary-writer.ts` uses `.addCodeBlock(scrubbed)` instead of `.addRaw(scrubbed).addEOL()`. Markdown links/images in agent output no longer render as clickable.
- AC2 ✅: Only the final-message body is code-blocked; status/table/tool-activity sections unchanged.
- AC3 ✅: `maskAmbientSecrets()` in `security.ts` masks GITHUB_TOKEN/INPUT_GITHUB_TOKEN (>= 4 chars). Called in `index.ts` run() early.
- AC4 ✅: `maskAuthValues(authData)` in `security.ts` masks string leaf credential values from each provider's auth object (>= 4 chars). Called in `opencode.ts` `applyAuth()` immediately after loading the auth file.
- AC5 ✅: `MIN_SECRET_LENGTH = 4` prevents over-masking trivial values.
- AC6 ✅: Summary, transcript, and declared `env_vars` masking unchanged.

### File List

- `src/summary-writer.ts` — `.addRaw(scrubbed).addEOL()` → `.addCodeBlock(scrubbed)`
- `src/security.ts` — added `maskAmbientSecrets()`, `maskAuthValues()`, `MIN_SECRET_LENGTH`
- `src/opencode.ts` — imported `maskAuthValues`; called in `applyAuth()` after loading auth file
- `src/index.ts` — imported `maskAmbientSecrets`; called early in `run()` before workflow execution
- `src/summary-writer.spec.ts` — added `addCodeBlock` mock; updated 2 tests; 3 new 13-6 tests
- `src/security.spec.ts` — imported `maskAmbientSecrets`, `maskAuthValues`; 9 new 13-6 tests
- `src/opencode.spec.ts` — imported `* as security`; 2 new 13-6 tests with mockReset fix
- `src/index.spec.ts` — added `maskAmbientSecrets: jest.fn()` to security mock
- `test/mocks/@actions/core.ts` — added `addCodeBlock: jest.fn().mockReturnThis()` to summary mock

### Change Log

- 2026-06-02: Implemented Story 13-6 — `addCodeBlock` replaces `addRaw` for final message (AC1/2); `maskAmbientSecrets` + `maskAuthValues` added to security.ts (AC3/4/5); 14 new unit tests; 813/813 passing total.

## QA Results (leader code review + light funcval, 2026-06-02)

**Code review: PASS.** summary-writer.ts `.addRaw`→`.addCodeBlock` (scrub preserved). security.ts `maskAmbientSecrets` (GITHUB_TOKEN/INPUT_GITHUB_TOKEN, MIN_SECRET_LENGTH=4 guard) + `maskAuthValues` (walks auth object, masks string leaves, length-guarded, defensive against non-object). Wired: maskAmbientSecrets at index.ts:54 (early), maskAuthValues at opencode.ts:203 (after loadJsonFile, before auth.set loop). Clean.

**Light funcval (live container awr:13-6):** agent emitted `[CLICK-TO-VERIFY](https://evil.example/phish)` → summary rendered it as `<pre><code>[CLICK-TO-VERIFY](https://evil.example/phish)</code></pre>` — **inert, not a clickable link** (AGENT-08 closed). status=success (no regression). 813/813 tests.

**AGENT-08 (MEDIUM-2) closed; C2 ambient-secret masking backstop in place.**
