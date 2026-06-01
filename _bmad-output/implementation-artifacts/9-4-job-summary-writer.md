# Story 9.4: Job Summary Writer

Status: done

## Story

As a **GitHub Actions user**,
I want **a readable run report in the GitHub job summary**,
So that **I can see the outcome, token/cost/duration totals, per-tool activity, and the final assistant message without scrolling the raw log or downloading the transcript**.

## Acceptance Criteria

1. **Given** a completed run **When** the workflow finishes **Then** a job summary is written via `core.summary` containing: a status heading (success/failure with emoji), a totals table (input/output/reasoning/cache tokens, total cost, duration), and the final assistant message.

2. **Given** the transcript messages (the same `Array<{ info, parts }>` Story 9-3 fetches via `exportTranscript`) **When** building the summary **Then** token and cost totals are aggregated from assistant messages' `tokens` (`input/output/reasoning/cache.read/cache.write`) and `cost` fields. Messages without those fields contribute 0.

3. **Given** the run used tools **When** building the summary **Then** a collapsed `<details>` section summarizes tool activity (e.g. counts per tool name) via `core.summary.addDetails(...)`. Verbose bodies are NOT inlined (they live in the transcript JSON / debug log).

4. **Given** transcript export is opt-in **When** summary writing is gated **Then** the summary is written whenever the run completes and the feature is enabled (reuse the same `exportTranscript` flag, OR a dedicated flag — see Dev Notes; default off, finalized in 9-6). It reuses the messages already fetched for 9-3 — do NOT fetch `session.messages` twice.

5. **Given** any secret values (env_vars) **When** the final assistant message or any text is placed in the summary **Then** it is scrubbed via `scrubSecrets` before being added (NFR21 — the summary file is written to `$GITHUB_STEP_SUMMARY`, a file we don't control masking on).

6. **Given** `core.summary` write fails or the step-summary env is absent (local runs) **When** writing **Then** it is best-effort: a titled `core.warning` is logged and the run result is unaffected (never throws). Stay under the 1 MiB/step summary limit (truncate the final message if huge).

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, logging, commenting, error-handling (best-effort = catch+warn), testing/unit-testing
  - [ ] Load `typescript-clean-code`, `typescript-unit-testing`

- [ ] **Task 2: Add `summary` to the `@actions/core` mock** (AC: 1, testability)
  - [ ] In `test/mocks/@actions/core.ts`, add a chainable `summary` mock: `addHeading`, `addTable`, `addRaw`, `addDetails`, `addEOL`, `addBreak`, `write` — each returns the summary object (chainable), `write` resolves. Mirror the real `@actions/core` SummaryBuilder surface used by the implementation.

- [ ] **Task 3: New module `src/summary-writer.ts`** (AC: 1, 2, 3, 5, 6)
  - [ ] `writeJobSummary(messages: unknown[], meta: { success: boolean; durationMs: number; finalMessage: string; secrets: string[] }): Promise<void>`
  - [ ] Aggregate token/cost totals by walking `messages` — narrow each message's `info` for `role === 'assistant'`, read `tokens`/`cost` defensively (treat missing as 0; respect `noUncheckedIndexedAccess`).
  - [ ] Build per-tool counts by walking `parts` where `part.type === 'tool'` (group by `part.tool`).
  - [ ] Compose with `core.summary.addHeading(...).addTable(...).addDetails('Tools', ...)` then the scrubbed, truncated final message; `await core.summary.write()`.
  - [ ] Scrub the final message and any free text via `scrubSecrets(text, secrets)` (import from security — summary-writer may depend on security; keep security a leaf).
  - [ ] Best-effort: wrap in try/catch, `core.warning('[OpenCode] Job summary write failed: ...', { title: 'Job summary' })`, never throw.
  - [ ] Truncate the final message to a sane cap (e.g. reuse `truncateString` with a summary-appropriate limit) to stay under 1 MiB.

- [ ] **Task 4: Wire into `runner.ts`** (AC: 1, 2, 4)
  - [ ] At run end (success path, near the transcript block ~line 92-105 and before `return`), reuse the `messages` already fetched for the transcript (lift the `exportTranscript` call so both 9-3's writer and 9-4's summary consume the same array — fetch ONCE).
  - [ ] Compute `durationMs` (capture a start timestamp at the top of `runWorkflow` and diff at the end).
  - [ ] Call `writeJobSummary(messages, { success: true, durationMs, finalMessage: session.lastMessage, secrets: Object.values(inputs.envVars) })` inside the existing best-effort guard.
  - [ ] On the failure path, optionally still emit a minimal failure summary (status heading + error) — keep it best-effort; acceptable to scope to success path if failure-path summary complicates the diff (note the decision in Dev Notes).

- [ ] **Task 5: Unit tests** (AC: 1–6)
  - [ ] `src/summary-writer.spec.ts` (new): token/cost aggregation correctness (incl. missing-field → 0), per-tool counts, secret scrubbing of final message, best-effort on write failure (no throw), truncation of huge final message.
  - [ ] `src/runner.spec.ts`: summary written once with aggregated data when enabled; messages fetched once (exportTranscript called once even with both transcript + summary); summary failure does NOT fail the run.

- [ ] **Final Task: Quality Checks**
  - [ ] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

### Design reference & verified API

- `research/opencode-upgrade-design-2026-05-29.md` §3b — the job summary is the human-readable surface (it's why D3 drops the Markdown transcript: the summary covers human consumption, the JSON covers machine consumption). VERIFIED: `core.summary` is a chainable builder (`addHeading(text, level)`, `addTable(rows)`, `addCodeBlock`, `addDetails(label, content)` → `<details><summary>label</summary>content</details>`, `addRaw`, `addEOL`, `write({overwrite?})` → flushes to `$GITHUB_STEP_SUMMARY`). Limit: 1 MiB/step.
- Token/cost fields VERIFIED on assistant messages: `cost: number`, `tokens: { input, output, reasoning, cache: { read, write } }` (v2 types lines 313-320, 496-502). Walk the `messages` array from `exportTranscript`.

### Synergy with Story 9-3 (fetch once)

9-3 already calls `opencode.exportTranscript(session.sessionId)` in the runner. 9-4 must REUSE that messages array — lift the single `exportTranscript` call so both `writeTranscript` (9-3) and `writeJobSummary` (9-4) consume it. Do NOT add a second `session.messages` round-trip.

### Gating decision

For 9-3 the gate was `inputs.exportTranscript`. For 9-4, the cleanest UX is: the job summary is cheap and high-value, so it could be on-by-default while the JSON file stays opt-in. BUT to avoid scope creep and keep 9-6 (action.yml) as the single place inputs are finalized: gate the summary behind the SAME run-completion path, reusing the messages fetch. If messages were only fetched because `exportTranscript` is true, and you want the summary even when transcript export is off, fetch messages when EITHER is desired. Keep it simple: for 9-4, write the summary whenever the run reaches the success path and messages are available; finalize the exact input switch in 9-6. Document whatever you choose in Dev Notes.

### Scope boundary (do NOT do here)

- Stop-command wrapping is 9-5. action.yml input/output finalization is 9-6.
- Do NOT re-fetch transcript messages (reuse 9-3's fetch).
- Keep `security.ts` a leaf; `summary-writer` may import from `security`.

### Project conventions

- Best-effort (catch+warn, never throw). `core.summary` for the report. Scrub secrets before writing any file (NFR21). `clearMocks: true` global. Coverage 80% / 75% branches. Named exports, `.js` imports, `noUncheckedIndexedAccess`.

### References

- [Source: epics.md#Story 9.4] · [Source: prd.md#FR54] · [Source: research/opencode-upgrade-design-2026-05-29.md §3b]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (developer sub-agent)

### Gating Decision (Dev Notes)

Gating strategy chosen: fetch messages when `exportTranscript || writeJobSummary`. A single `exportTranscript` call is made at the top of the post-run block, and both writers consume that array. This avoids a double SDK round-trip while keeping the flags orthogonal — users can enable transcript JSON without summary or vice versa. Both flags default `false`; Story 9-6 finalizes the action.yml inputs. The failure path (the outer `catch` in `runWorkflow`) does NOT emit a summary — scoped to success path only per Dev Notes guidance; failure case is logged by the existing error return path.

### Completion Notes List

- **Task 2 (test/mocks/@actions/core.ts)**: Added chainable `summary` mock object with `addHeading`, `addTable`, `addRaw`, `addDetails`, `addEOL`, `addBreak` (all `mockReturnThis()`), and `write` (`mockResolvedValue(undefined)`).
- **Task 3 (src/summary-writer.ts)**: New module. `aggregateMessages()` walks messages, narrows `info.role === 'assistant'` for token/cost (all fields defaulted to 0 if missing per `noUncheckedIndexedAccess`), collects tool counts from `parts[].type === 'tool'`. `writeJobSummary(messages, meta)` composes summary chain: heading → table (status, duration, cost, 6 token columns) → addDetails (tool counts) → scrubbed+truncated final message → write(). Wrapped in try/catch with `core.warning({ title: 'Job summary' })`. SUMMARY_FINAL_MESSAGE_LIMIT = 32 768 bytes.
- **Task 4 (src/runner.ts + src/types.ts + src/config.ts)**:
  - `types.ts`: added `writeJobSummary: boolean` to ActionInputs.
  - `config.ts`: added `writeJobSummary: false` default.
  - `runner.ts`: added `const startTime = Date.now()` before try block. Lifted the messages fetch: the `if (inputs.exportTranscript)` block replaced by `if (inputs.exportTranscript || inputs.writeJobSummary)` — single `exportTranscript()` call, then both `writeTranscript` (conditional on flag) and `writeJobSummary` (conditional on flag) consume the same array. `durationMs = Date.now() - startTime` computed inside the block. Also imported `writeJobSummary` from `summary-writer.js`.
- **Task 5 tests**:
  - `src/summary-writer.spec.ts` (new, 11 tests): chain called, token/cost aggregation, missing-fields→0, per-tool counts, secret scrubbing, truncation, best-effort on write failure, ❌ heading for failure, empty messages, "No tool calls recorded."
  - `src/runner.spec.ts`: 4 new tests — summary written when enabled, messages fetched once with both flags, summary failure doesn't fail run, neither called when both flags false.
  - `src/config.spec.ts` + `src/index.spec.ts`: added `writeJobSummary: false` to ActionInputs fixtures.
- **Final Task**: lint ✓ (0 warnings) · format ✓ · typecheck ✓ · test:unit ✓ (486/486 pass, 91.77%/82.92% coverage)

### File List

- `test/mocks/@actions/core.ts` — Task 2: added chainable summary mock
- `src/summary-writer.ts` — Task 3: new module
- `src/types.ts` — Task 4: added `writeJobSummary` to ActionInputs
- `src/config.ts` — Task 4: added `writeJobSummary: false` default
- `src/runner.ts` — Task 4: lifted messages fetch, added startTime, wired writeJobSummary
- `src/summary-writer.spec.ts` — Task 5: new spec (11 tests)
- `src/runner.spec.ts` — Task 5: 4 new job summary tests + mock setup
- `src/config.spec.ts` — Task 5: writeJobSummary field in fixtures
- `src/index.spec.ts` — Task 5: writeJobSummary field in createValidInputs

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
