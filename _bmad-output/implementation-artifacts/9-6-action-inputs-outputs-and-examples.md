# Story 9.6: Action Inputs/Outputs & Examples

Status: done

## Story

As a **GitHub Actions user**,
I want **action inputs to enable transcript export and the job summary, plus an output with the transcript path and an example showing artifact upload**,
So that **I can actually turn on and consume the conversation-logging features that Stories 9-3/9-4 built (they are dormant until surfaced here)**.

## Context

Stories 9-3 (transcript) and 9-4 (job summary) wired their behavior behind `inputs.exportTranscript` / `inputs.writeJobSummary` (defaulted false in `config.ts`) and a `transcriptPath` default — but the `action.yml` inputs/outputs and the real `core.getInput` parsing + path validation were deliberately deferred to THIS story. 9-6 makes the features usable end-to-end.

## Acceptance Criteria

1. **Given** `action.yml` **When** updated **Then** it declares three new inputs — `export_transcript` (bool, default `'false'`), `write_job_summary` (bool, default `'false'`), `transcript_path` (string, default `''`, doc: defaults to `$RUNNER_TEMP/conversation.json`, accepts workspace-relative or absolute under RUNNER_TEMP/tmp) — and one new output `transcript_json_path` (the resolved path the transcript was written to, empty if not exported).

2. **Given** `config.ts` `getInputs()` **When** parsing **Then** `export_transcript` and `write_job_summary` are parsed as booleans (same `trim().toLowerCase() === 'true'` pattern as `debug_log`), and `transcript_path`, when set, is validated/resolved via a path check mirroring `validateDebugLogPath` (absolute only under RUNNER_TEMP/tmp/github-runner_temp, or workspace-relative without escaping). `exportTranscript`/`writeJobSummary`/`transcriptPath` in `ActionInputs` now come from real inputs (not just hard defaults).

3. **Given** the transcript is exported **When** the run finishes **Then** the resolved transcript path is set as the `transcript_json_path` action output via `core.setOutput`; when transcript export is disabled, the output is empty string. (Set outputs before any `core.setFailed`, per project convention.)

4. **Given** the README and examples **When** updated **Then** there is an example workflow (under `examples/`) demonstrating `export_transcript: 'true'` + `write_job_summary: 'true'` and an `actions/upload-artifact` step that uploads `${{ steps.<id>.outputs.transcript_json_path }}`. The artifact upload lives in the CONSUMING workflow (a container action cannot self-upload — design D6).

5. **Given** all existing inputs **When** 9-6 lands **Then** no existing input/output behavior changes; the three new inputs default to off so current consumers are unaffected (backward compatible).

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, logging, commenting, validation, testing/unit-testing
  - [ ] Load `typescript-clean-code`, `typescript-unit-testing`

- [ ] **Task 2: Update `action.yml`** (AC: 1)
  - [ ] Add inputs `export_transcript`, `write_job_summary` (default `'false'`), `transcript_path` (default `''`) with clear descriptions (mirror the `debug_log` / `debug_log_path` wording).
  - [ ] Add output `transcript_json_path`.

- [ ] **Task 3: Parse + validate inputs in `config.ts`** (AC: 2)
  - [ ] In `getInputs()`: parse `export_transcript` / `write_job_summary` as booleans (reuse the `debug_log` boolean pattern).
  - [ ] If `transcript_path` is set, validate/resolve it — reuse or generalize `validateDebugLogPath` (the safe-prefix + no-workspace-escape logic). Consider extracting a shared `validateSafeOutputPath` helper if it avoids duplication; otherwise a parallel `validateTranscriptPath`. Keep it DRY but don't over-engineer.
  - [ ] Populate `ActionInputs.exportTranscript`, `.writeJobSummary`, `.transcriptPath` from the parsed values (replace the hard `false`/`''` defaults from 9-3/9-4 with real input reads, keeping the same default when input absent).

- [ ] **Task 4: Set the `transcript_json_path` output** (AC: 3)
  - [ ] In `runner.ts` (or `index.ts` where outputs are set), capture the resolved transcript path used by `writeTranscript` and surface it so the action can `core.setOutput('transcript_json_path', resolvedPath)` (empty when not exported). Ensure outputs are set BEFORE any `core.setFailed`.
  - [ ] If `index.ts` owns `setOutput` for `status`/`result`, thread the resolved path out of `runWorkflow` (e.g. add it to `RunnerResult` or return it) so `index.ts` can set it. Pick the cleanest seam; document it.

- [ ] **Task 5: README + example workflow** (AC: 4)
  - [ ] Add a `examples/conversation-logging/` (or extend an existing example) with a `.github/workflows/run-ai.yml` showing `export_transcript: 'true'`, `write_job_summary: 'true'`, and an `actions/upload-artifact@v4` step uploading the `transcript_json_path` output. Include a short README.
  - [ ] Update the main README Inputs/Outputs tables/sections to document the three new inputs + new output, and add a "Conversation logging & artifact" subsection.

- [ ] **Task 6: Unit tests** (AC: 1–5)
  - [ ] `config.spec.ts`: new inputs parse correctly (true/false/absent); `transcript_path` validation (valid absolute under RUNNER_TEMP, valid workspace-relative, rejects escape/unsafe path).
  - [ ] `index.spec.ts` / `runner.spec.ts`: `transcript_json_path` output is set to the resolved path when exporting, empty when not; outputs set before setFailed.
  - [ ] Backward-compat: omitting the new inputs leaves behavior unchanged.

- [ ] **Final Task: Quality Checks**
  - [ ] `npm run lint` (zero warnings) · `npm run format` · `npm run typecheck` · `npm run test:unit`
  - [ ] `npm run bundle` (dist rebuilt — but dist is gitignored here; do NOT commit dist)

## Dev Notes

### Integration points (verified)

- `action.yml` inputs end at `debug_log_path`; outputs are `status`, `result`. Add the new ones there (mirror `debug_log`/`debug_log_path` wording).
- `config.ts:getInputs()` already returns `exportTranscript`/`writeJobSummary`/`transcriptPath` with hard defaults (false/false/'') from Stories 9-3/9-4. 9-6 replaces those with real `core.getInput` reads + validation.
- `validateDebugLogPath` (config.ts:120) is the path-safety pattern: absolute allowed only under RUNNER_TEMP / /tmp / /github/runner_temp; workspace-relative must not escape. Mirror it for `transcript_path`.
- Output-setting: check whether `index.ts` or `runner.ts` calls `core.setOutput` for `status`/`result` — set `transcript_json_path` in the same place, BEFORE any `setFailed` (project rule: "Set outputs before core.setFailed").

### Design references

- D3 (JSON only) — output is the JSON path. D6 (artifact upload in consuming workflow) — the example shows `actions/upload-artifact`; the action does NOT upload.
- The runner already computes `transcriptPath = inputs.transcriptPath || RUNNER_TEMP/conversation.json` (9-3). Surface THAT resolved value as the output.

### Scope boundary

- Do NOT change the logging/transcript/summary LOGIC (done in 9-1..9-5) — 9-6 is wiring + docs only.
- Epic test sweep is 9-7.

### Project conventions

- class-validator-style input validation with clear messages; booleans via `trim().toLowerCase() === 'true'`. Set outputs before setFailed. Named exports, `.js` imports. `clearMocks: true` global. Coverage 80%/75%. dist is gitignored (Docker builds from source) — rebuild but do not commit.

### References

- [Source: epics.md#Story 9.6] · [Source: prd.md#FR53 (output), FR50-54] · [Source: research/opencode-upgrade-design-2026-05-29.md §3b (D3, D6)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (developer sub-agent)

### Output seam + validator extraction decisions (Dev Notes)

**Output seam**: Added `transcriptJsonPath?: string` to `RunnerResult` (types.ts). The runner resolves the path and returns it; `index.ts` calls `core.setOutput('transcript_json_path', result.transcriptJsonPath ?? '')` immediately after setting `status` and `result`, before any `setFailed` — satisfying the "outputs before setFailed" project rule.

**Validator extraction**: Extracted shared `validateSafeOutputPath(workspacePath, outputPath, inputName)` helper from the existing `validateDebugLogPath` body. The `inputName` parameter customizes error messages (e.g. "Invalid debug_log_path" vs "Invalid transcript_path"). `validateDebugLogPath` is kept as a thin wrapper calling `validateSafeOutputPath('debug_log_path')` — backward-compatible, no duplication.

**transcript_path parsing**: Only resolved (and validated) when `exportTranscript` is true — mirrors how `debugLogPath` is only computed when `debugLog` is true. When `exportTranscript` is false, `transcriptPath = ''` is returned (no path validation needed).

### Completion Notes List

- **Task 2 (action.yml)**: Added 3 inputs (`export_transcript`, `write_job_summary`, `transcript_path`) and 1 output (`transcript_json_path`). Descriptions mirror `debug_log`/`debug_log_path` pattern.
- **Task 3 (src/config.ts)**:
  - Extracted `validateSafeOutputPath(workspacePath, outputPath, inputName)` shared helper.
  - `validateDebugLogPath` now delegates to `validateSafeOutputPath` with `inputName = 'debug_log_path'`.
  - `getInputs()`: replaced hard `false`/`''` defaults with real `core.getInput` reads for `export_transcript`, `write_job_summary`, `transcript_path`. Path validated via `validateSafeOutputPath` when `exportTranscript` is true and path is provided; else defaults to `RUNNER_TEMP/conversation.json`.
- **Task 4 (src/types.ts + src/runner.ts + src/index.ts)**:
  - `RunnerResult`: added `transcriptJsonPath?: string`.
  - `runner.ts`: renamed local variable to `resolvedTranscriptPath`, assigns to `transcriptJsonPath` in returned `RunnerResult` (empty string when not exported).
  - `index.ts`: `core.setOutput('transcript_json_path', result.transcriptJsonPath ?? '')` added alongside `status`/`result` outputs, before `setFailed`.
- **Task 5 (examples/ + README.md)**:
  - New `examples/conversation-logging/` with `.github/workflows/run-ai.yml` (export_transcript/write_job_summary + upload-artifact), `workflow.md`, and `README.md`.
  - `README.md`: updated inputs table (added `debug_log`, `debug_log_path`, 3 new inputs), outputs table (added `transcript_json_path`), and "Conversation Logging & Artifacts" section with usage example and `examples/` link.
- **Task 6 tests**:
  - `src/config.spec.ts`: import updated to include `validateSafeOutputPath`; 4 `validateSafeOutputPath` tests; 8 `getInputs — new conversation-logging inputs` tests (true/false/absent for both booleans, path validated/defaulted, unsafe path rejected, backward compat).
  - `src/runner.spec.ts`: 3 `transcriptJsonPath` tests — set to resolved path, empty when disabled, RUNNER_TEMP default.
  - `src/index.spec.ts`: 4 `transcript_json_path output` tests — set when exported, empty when not, undefined→empty, set before setFailed.
- **Final Task**: lint ✓ (0 warnings) · format ✓ · typecheck ✓ · test:unit ✓ (536/536 pass) · bundle ✓ (978 KB)

### File List

- `action.yml` — Task 2: 3 new inputs + 1 new output
- `src/config.ts` — Task 3: `validateSafeOutputPath`, refactored `validateDebugLogPath`, real input parsing
- `src/types.ts` — Task 4: `transcriptJsonPath` in RunnerResult
- `src/runner.ts` — Task 4: resolve and return transcriptJsonPath
- `src/index.ts` — Task 4: set transcript_json_path output
- `examples/conversation-logging/README.md` — Task 5: new example README
- `examples/conversation-logging/workflow.md` — Task 5: new example workflow
- `examples/conversation-logging/.github/workflows/run-ai.yml` — Task 5: example Actions workflow
- `README.md` — Task 5: inputs/outputs tables + Conversation Logging section
- `src/config.spec.ts` — Task 6: validateSafeOutputPath + new input tests
- `src/runner.spec.ts` — Task 6: transcriptJsonPath tests
- `src/index.spec.ts` — Task 6: transcript_json_path output tests

## Review Notes

_(leader fills in during code review, if any)_

## QA Results

_(tester fills in during functional validation)_
