# Story 9.3: Transcript Writer (`conversation.json`)

Status: done

## Story

As a **GitHub Actions user**,
I want **the full AI conversation written to a JSON file after the run**,
So that **I can upload it as a workflow artifact and inspect the complete transcript (assistant text, tool inputs/outputs, reasoning, token usage) after the job finishes**.

## Acceptance Criteria

1. **Given** a completed session **When** the workflow finishes **Then** the runner fetches the full transcript via the OpenCode SDK `session.messages({ sessionID })` and writes it to a JSON file (`conversation.json` by default, under `RUNNER_TEMP`).

2. **Given** the SDK returns the messages array (`Array<{ info, parts }>` — each part may be text, reasoning, tool, step-finish, etc., with assistant messages carrying `cost` and `tokens`) **When** written **Then** the JSON preserves that structure faithfully (no lossy summarization).

3. **Given** the transcript may contain secret values (env_vars the user passed) **When** written **Then** every `env_vars` value is scrubbed from the JSON content before it hits disk — `core.setSecret()` masks the live log only, NOT files we write (NFR21). A new reusable scrubber in `security.ts` performs this.

4. **Given** transcript export is opt-in **When** the `export_transcript` input is false/absent **Then** no transcript file is written and no `session.messages` call is made (zero overhead by default). Story 9-6 adds the `action.yml` input + output wiring; for 9-3, gate on an `InitializeOptions`/runner flag so the behavior is testable now.

5. **Given** a validation-retry loop ran (multiple turns in one session) **When** the transcript is exported **Then** it contains the FULL multi-turn conversation (the final `session.messages` call returns all messages for the session, so a single post-run fetch suffices).

6. **Given** the `session.messages` call fails or returns no data **When** exporting **Then** the failure is logged via `core.warning` (run-level, titled) and the workflow result is unaffected — transcript export is best-effort, never fails the run.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] `.knowledge-base/technical/standards/backend/coding-style.md`, `error-handling.md` (Result pattern, no try-catch in use cases — but best-effort export catches and logs), `logging.md`, `global/commenting.md`, `testing/unit-testing.md`
  - [ ] Load `typescript-clean-code`, `typescript-unit-testing`

- [ ] **Task 2: Add a generic secret-scrubber to `security.ts`** (AC: 3)
  - [ ] Add `scrubSecrets(content: string, secrets: string[]): string` — replaces every occurrence of each non-empty secret value with `***`. Reuse for any file we write.
  - [ ] Keep `security.ts` a leaf module (no imports from runner/opencode) — per project-context module-boundary rule.
  - [ ] Unit-test it directly (empty secrets list → unchanged; multiple occurrences; overlapping/substring safety).

- [ ] **Task 3: Add `exportTranscript()` to `OpenCodeService`** (AC: 1, 2, 5, 6)
  - [ ] In `src/opencode.ts`, add `async exportTranscript(sessionId: string): Promise<unknown[]>` that calls `this.client.session.messages({ sessionID: sessionId })` and returns `response.data ?? []`. Mirror the existing `listModels()` wrapper style (guard `isDisposed`, guard `client` not null).
  - [ ] Do NOT throw on empty — return `[]` and let the caller decide (best-effort).

- [ ] **Task 4: New module `src/transcript-writer.ts`** (AC: 1, 2, 3, 6)
  - [ ] Mirror `debug-log-writer.ts` structure: a writer that serializes the messages array to JSON and writes with `fs.writeFileSync(path, json, { mode: 0o600 })`.
  - [ ] Signature: `writeTranscript(filePath: string, messages: unknown[], secrets: string[]): void` — `JSON.stringify(messages, null, 2)`, then `scrubSecrets(json, secrets)`, then write 0o600.
  - [ ] Depends only on `fs`, `@actions/core`, `security` (scrubSecrets) — leaf-ish, no import from runner/opencode.
  - [ ] On write failure: `core.warning('[OpenCode] Transcript write failed: ...', { title: 'Transcript export' })`, swallow (best-effort).

- [ ] **Task 5: Wire into `runner.ts`** (AC: 1, 4, 5, 6)
  - [ ] After the session completes and `output` is built (around `src/runner.ts:92`), if transcript export is enabled, call `opencode.exportTranscript(session.sessionId)` then `writeTranscript(transcriptPath, messages, Object.values(inputs.envVars))`.
  - [ ] Gate behind a flag. For 9-3, thread a boolean (e.g. `inputs.exportTranscript` defaulted false in types, OR a temporary param) so it's testable. Path default: `path.join(process.env.RUNNER_TEMP || '/tmp', 'conversation.json')`. (Story 9-6 finalizes the action.yml input/output + path validation — keep the path logic minimal here, reuse the `validateDebugLogPath` pattern only if trivial; otherwise default-path only and note 9-6 will harden it.)
  - [ ] Wrap the whole export in try/catch at the call site so it never fails the workflow (AC6).

- [ ] **Task 6: Unit tests** (AC: 1–6)
  - [ ] `src/security.spec.ts`: `scrubSecrets` cases (Task 2).
  - [ ] `src/transcript-writer.spec.ts` (new): writes valid JSON, scrubs secret values, 0o600 mode, best-effort on fs error (no throw), NoOp when disabled.
  - [ ] `src/opencode.spec.ts` (or session spec): `exportTranscript` returns data array; returns [] when no data; throws if disposed/no client (consistent with listModels).
  - [ ] `src/runner.spec.ts`: when enabled, exportTranscript + writeTranscript are called with scrubbed secrets; when disabled, neither is called; export failure does NOT fail the run.

- [ ] **Final Task: Quality Checks**
  - [ ] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### Design reference & verified API

- `research/opencode-upgrade-design-2026-05-29.md` §3b (D3 — JSON only, no Markdown). VERIFIED during research against the installed SDK types: `client.session.messages({ sessionID })` → `Array<{ info: Message; parts: Part[] }>`. Assistant messages carry `cost: number` and `tokens: {input,output,reasoning,cache:{read,write}}`. Tool parts carry `state.input`/`state.output`/`state.error`. There is **no** native `export()` method and `session.share()` only returns a URL — listing messages and serializing is the correct approach.
- The transcript is fetched ONCE post-run; `session.messages` returns all messages for the session including all validation-retry turns (AC5).

### Integration points (verified in current code)

- `OpenCodeService` keeps a private `client`; follow the `listModels()` wrapper pattern (src/opencode.ts:203-226) for `exportTranscript()`. The client exposes `session.messages`.
- `runner.ts:92` is where `output` is built after `runSession` + optional `runValidationLoop` — insert the export just before/after building `output`, inside the existing try block, but with its own inner try/catch so it can't fail the run.
- `security.ts` exported helpers today: `maskSecrets` (mutates env map for core.setSecret), `sanitizeErrorMessage`, `truncateString` — but NO generic content scrubber. Add `scrubSecrets`.
- `debug-log-writer.ts` is the file-writer pattern to mirror (0o600, NoOp default, core.warning on failure).

### Scope boundary (do NOT do here)

- Job summary is Story 9-4. Stop-command wrapping is 9-5. The `action.yml` input/output + full path validation is Story 9-6 — for 9-3, a default `RUNNER_TEMP/conversation.json` path behind a testable flag is enough; do NOT add the action.yml input here.
- Do NOT add Markdown rendering (D3 — JSON only).
- Keep `security.ts` a leaf (module-boundary rule).

### Project conventions (project-context.md)

- Result pattern for expected failures; throw only for unexpected. Export is best-effort (catch+warn, never throw to caller).
- `AbortSignal` last optional param for async fns that support cancellation (exportTranscript may accept `abortSignal?` for consistency, optional).
- Temp files `0o600`. Named exports. `.js` import extensions. `noUncheckedIndexedAccess`.
- `clearMocks: true` global. Coverage 80% / 75% branches. Truncate large outputs (note `MAX_OUTPUT_SIZE`); transcript file is separate from the 900KB action output limit.

### References

- [Source: epics.md#Story 9.3] · [Source: prd.md#FR52, FR53, NFR21] · [Source: research/opencode-upgrade-design-2026-05-29.md §3b]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (developer sub-agent, baseline: 363da6e6ef660029f40e367024f6c8488e7aa35f)

### Completion Notes List

- **Task 2 (src/security.ts)**: Added `scrubSecrets(content, secrets)` after `maskSecrets`. Pure string split-join replacement; skips empty strings. Kept security.ts a leaf — no new imports. 6 unit tests added to security.spec.ts.
- **Task 3 (src/opencode.ts)**: Added `exportTranscript(sessionId)` after `listModels()` (line ~228). Mirrors `listModels()` pattern: guards `isDisposed` + client, returns `response.data ?? []`. Never throws on empty. Also added `session.messages` mock to `opencode-test-helpers.ts` (MockClient + createMockClient). 6 unit tests added to opencode.spec.ts.
- **Task 4 (src/transcript-writer.ts)**: New module — `writeTranscript(filePath, messages, secrets)`: JSON.stringify → scrubSecrets → writeFileSync(0o600). On error: core.warning with `{ title: 'Transcript export' }`, swallowed. 7 unit tests in new `src/transcript-writer.spec.ts`. 100% coverage.
- **Task 5 (src/runner.ts + src/types.ts + src/config.ts)**:
  - `types.ts`: Added `exportTranscript: boolean`, `transcriptPath: string` to `ActionInputs`.
  - `config.ts`: Added `exportTranscript: false, transcriptPath: ''` defaults to `getInputs()` return. Added `path` import. (Story 9-6 wires the action.yml inputs.)
  - `runner.ts`: Added `path` import + `writeTranscript` import. After session (and optional validation loop), if `inputs.exportTranscript`, calls `opencode.exportTranscript(session.sessionId)` → `writeTranscript(path, messages, Object.values(inputs.envVars))` inside inner try/catch (AC6). Default path: `RUNNER_TEMP || /tmp` + `conversation.json`.
- **Task 6 tests**:
  - `src/security.spec.ts`: 6 `scrubSecrets` cases.
  - `src/transcript-writer.spec.ts` (new): 7 tests — valid JSON, 0o600 mode, scrubs single/multiple secrets, best-effort on fs error, empty array, complex nested.
  - `src/opencode.spec.ts`: 6 `exportTranscript` tests — data array, undefined→[], null→[], uninitialized, disposed, propagates errors.
  - `src/runner.spec.ts`: 5 transcript export tests — enabled calls both, disabled skips both, passes env secrets, failure doesn't fail run, RUNNER_TEMP default path.
  - `src/config.spec.ts`, `src/index.spec.ts`: Updated 5+1 object literals to include new `ActionInputs` fields for typecheck compliance.
- **Final Task**: lint ✓ (0 warnings) · format ✓ · typecheck ✓ · test:unit ✓ (471/471 pass, 91.5%/83.03% coverage)

### File List

- `src/security.ts` — Task 2: added `scrubSecrets`
- `src/opencode.ts` — Task 3: added `exportTranscript`
- `src/opencode-test-helpers.ts` — Task 3: added `session.messages` to MockClient + createMockClient
- `src/transcript-writer.ts` — Task 4: new module
- `src/types.ts` — Task 5: added `exportTranscript`, `transcriptPath` to ActionInputs
- `src/config.ts` — Task 5: added defaults for new fields in `getInputs()`
- `src/runner.ts` — Task 5: wired transcript export with inner try/catch
- `src/security.spec.ts` — Task 6: scrubSecrets tests
- `src/transcript-writer.spec.ts` — Task 6: new spec file
- `src/opencode.spec.ts` — Task 6: exportTranscript tests
- `src/runner.spec.ts` — Task 6: transcript export tests + mock setup
- `src/config.spec.ts` — Task 6: added new ActionInputs fields to object literals
- `src/index.spec.ts` — Task 6: added new ActionInputs fields to createValidInputs

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
