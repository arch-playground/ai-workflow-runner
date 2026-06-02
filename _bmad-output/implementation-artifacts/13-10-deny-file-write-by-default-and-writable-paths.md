# Story 13.10: Deny File-Write by Default + Writable-Path Allowlist

Status: ready-for-dev

## Story

As an **operator running a read-only knowledge-extraction workflow**,
I want **the agent unable to write/modify files by default, with an explicit `writable_paths` opt-in for the paths it may write**,
So that **the agent reads source to extract knowledge but cannot modify the checked-out tree or drop new files unless I allow it (closes the workspace-write gap surfaced in 13-2 funcval — the BE-05 class)**.

## Background

**Surfaced in 13-2 funcval (user decision 2026-06-02):** when bash-write was blocked, the agent fell back to the `edit`/`write` tools and wrote a file into the workspace. For a read-only extraction tool that's undesirable. User chose: deny edit/write by default + a writable-path allowlist opt-in.

**Verified mechanism:** both the `write` and `edit` tools raise the **same `"edit"` permission** with the **file path as the pattern** (`tool/write.ts:55`, `tool/edit.ts:99-143`), and `edit` is object-form (`PermissionRuleConfig`). So a path allowlist works exactly like bash/external_directory: `{ "<glob>": "allow", …, "*": "deny" }`.

**Current state (from 13-2):** `permissions.ts` has `edit: 'allow'` in `READ_FAMILY_DEFAULTS` (l.131) and `'edit'` in `AUTO_APPROVE_PERMISSIONS` (l.195). Both must change.

**Scope boundary:** edit/write permission + writable_paths ONLY. Do NOT touch other permissions, env, container, baseURL, timeout, summary, webfetch.

## Acceptance Criteria

1. **Deny edit/write by default.** In `permissions.ts`, the Action security rules set `edit` to deny-by-default: with no `writable_paths`, `edit: { "*": "deny" }` (or equivalent) so the agent cannot create or modify any file. Remove/override the `edit: 'allow'` from READ_FAMILY_DEFAULTS (since Action rules are applied LAST and win, adding `edit` to `buildActionSecurityRules` achieves this; ensure the net result is deny).

2. **`writable_paths` opt-in.** New action input (comma/newline-separated workspace-relative globs, default empty) parsed in config.ts → `ActionInputs.writablePaths: string[]`, threaded to `InitializeOptions` → `buildAgentPermission`. When set, the `edit` rule object is `{ "<glob1>": "allow", "<glob2>": "allow", …, "*": "deny" }` — allow-globs first, deny catch-all last (findLast). Paths are workspace-relative (opencode submits the path relative to worktree as the pattern — `write.ts:56`/`edit.ts:100` use `path.relative(instance.worktree, filepath)`).

3. **Handler no longer auto-approves edit.** Remove `'edit'` from `AUTO_APPROVE_PERMISSIONS` so `shouldAutoApprove('edit')` is false — the handler won't rubber-stamp an edit request. (Config deny short-circuits to DeniedError per the 13-2 Task-3 finding, but the handler must not blanket-approve an edit "ask" either.)

3b. **read-family unaffected.** read/glob/grep/list/lsp stay allowed — knowledge extraction needs them. Only `edit` (write+edit tools) is denied.

4. **Merge precedence preserved.** Consumer `opencode_config` cannot re-enable edit (Action rules applied last). A consumer `{ permission: { edit: 'allow' } }` does NOT override the deny. (Mirror the 13-2 merge test.)

5. **Verified (funcval — defer live to 13-8 epic-end, unit now):** default run — agent cannot create/modify a workspace file (the BE-05 write blocked); with `writable_paths=docs/**`, edit under `docs/` allowed but elsewhere denied; reads still work everywhere in-tree. Copilot/gpt-5-mini run unaffected (a normal model call doesn't write).

6. **Backward compatible (with a noted behavior change).** This DOES change default behavior: workflows that previously relied on the agent writing files will need `writable_paths`. Documented in the threat-model docs (13-7 already describes writable_paths as an opt-in; ensure the README inputs table + the "opt-in surface" reflect it — coordinate with 13-8 doc reconciliation).

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, commenting, validation, security, unit-testing. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [ ] Read design `security-hardening-design-2026-06-02.md` (write-confinement note); epics.md Story 13.10.

- [ ] **Task 2: edit deny-by-default + writable_paths in permissions.ts** (AC: 1, 2, 3, 3b, 4)
  - [ ] In `buildActionSecurityRules`, add `edit` as an object: `{ ...writablePathAllows, '*': 'deny' }`. Pass `writablePaths` into `buildAgentPermission` (new param, mirror `bashAllowPatterns`). A `parseWritablePaths`-style helper or reuse a comma/newline splitter.
  - [ ] Remove `edit: 'allow'` from `READ_FAMILY_DEFAULTS` (or rely on actionRules-last overriding it — but cleanest is to remove it from defaults AND set it in actionRules so intent is explicit).
  - [ ] Remove `'edit'` from `AUTO_APPROVE_PERMISSIONS`.
  - [ ] Keep read/glob/grep/list/lsp allowed.

- [ ] **Task 3: `writable_paths` input + threading** (AC: 2)
  - [ ] action.yml input; config.ts parse → `writablePaths: string[]` on ActionInputs; thread through runner.ts → InitializeOptions → buildSdkConfig's `buildAgentPermission` call.

- [ ] **Task 4: Unit tests** (AC: 1–5)
  - [ ] permissions.spec.ts: default (no writable_paths) → `edit['*']==='deny'`, no allow entries; with `writable_paths=['docs/**']` → `edit['docs/**']==='allow'` AND `edit['*']==='deny'` (allow before deny); `shouldAutoApprove('edit')===false`; read-family still allowed; consumer `edit:'allow'` does NOT override (merge test).
  - [ ] config.ts: writable_paths parsed.
  - [ ] (Live "agent can't write by default / can write under docs/\*\*" test → 13-8 epic-end funcval; note here.)

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **write + edit are the same permission key (`"edit"`)** — denying `edit` covers both tools. Pattern is the worktree-relative file path (write.ts:56 / edit.ts:100), so `writable_paths` globs are workspace-relative.
- **This is a deliberate default behavior change** (per user). Don't soften it — deny by default. The escape hatch is `writable_paths`.
- **Merge order** (13-2): READ_FAMILY_DEFAULTS → consumer → ACTION_SECURITY_RULES last. Put the `edit` deny in ACTION_SECURITY_RULES so it wins over any consumer `edit:allow`. Remove the `edit:'allow'` baseline so there's no confusion.
- **shouldAutoApprove** drives the handler — dropping `edit` from it ensures a denied edit isn't auto-approved at the event layer (belt-and-suspenders with the config deny).
- ai-memory `comment-hygiene`. Conventions: named exports, `.js` imports; coverage ≥80%/75%.

### References

- [Source: epics.md#Story 13.10] · [Source: prd.md#FR67, #FR68]
- [Source: research/security-hardening-design-2026-06-02.md → write-confinement]
- [Source: 13-2 QA Results (the workspace-write observation that prompted this)]
- Current: `src/permissions.ts` (READ_FAMILY_DEFAULTS edit:'allow' l.131, AUTO_APPROVE_PERMISSIONS edit l.195, buildActionSecurityRules, buildAgentPermission), `src/config.ts` (list-input pattern), opencode tool keys (write.ts/edit.ts both → "edit")

## Dev Agent Record

### Agent Model Used

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
