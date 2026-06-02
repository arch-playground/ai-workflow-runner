# Story 13.1: Scope the Agent Server Environment

Status: ready-for-dev

## Story

As an **operator running AI workflows in CI**,
I want **the OpenCode agent to run with a scoped, allowlisted environment instead of the full runner environment**,
So that **a malicious or injected prompt cannot make the agent dump ambient runner secrets (`GITHUB_TOKEN`, cloud credentials, anything not declared via `env_vars`) — closing red-team findings AGENT-01 and AGENT-06**.

## Background

**Red-team finding (verified):** the Action spawns `opencode serve` and the SDK forces `env: { ...process.env }` onto the child (`@opencode-ai/sdk/dist/v2/server.js`). `ServerOptions` exposes **no** env override. So the agent — and its bash tool — inherits the Action's **entire** process environment. A prompt of `bash: env | grep TOKEN` returned all ambient secrets, unmasked, in the transcript (AGENT-01); `GITHUB_TOKEN` was likewise readable (AGENT-06).

**The fix (design RC-A / A1):** because the SDK spreads `...process.env` at spawn time, we **sanitize `process.env` to an allowlist immediately before `createOpencode`, then restore it in a `finally`**. The child captures the scoped env at `cross-spawn` time; the parent (the Action's own later code) keeps working because we restore.

**Reuse the existing pattern:** `src/validation.ts` already does exactly this allowlist scoping for validation child processes (`buildChildEnv`, l.184). This story extracts that philosophy into a **shared helper in `security.ts`** so the agent path and the validation path can't drift.

**Scope boundary:** this story is env scoping ONLY. Tool permission denial, bash/git allowlists, `external_directory` confinement, and the non-root container are Stories 13-2/13-3. Do NOT touch `buildPermissionConfig`, `buildSdkConfig`, the Dockerfile, or `entrypoint.sh` here.

## Acceptance Criteria

1. **Given** `src/security.ts` **When** a shared `buildScopedEnv(envVars: Record<string, string>): Record<string, string>` (or similarly named) helper is added **Then** it returns an allowlisted env containing: the runtime essentials (`PATH`, `HOME`, `LANG`, `TERM`), the runtimes opencode/LSP need when present (`JAVA_HOME`, `GOPATH`, `GOROOT`, and any `XDG_*` that are set), `RUNNER_TEMP` when set, plus the user-declared `envVars` — and **nothing else** from `process.env`. Vars absent from `process.env` are omitted (not set to empty) unless they have a sensible default (PATH/HOME/LANG/TERM may default as `buildChildEnv` does).

2. **Given** `src/validation.ts:buildChildEnv` **When** the shared helper exists **Then** `buildChildEnv` is refactored to use it (so there is one allowlist, not two) — preserving its current behavior exactly (it adds `AI_LAST_MESSAGE` on top; keep that addition local to validation).

3. **Given** `src/opencode.ts:doInitialize` **When** `createOpencode(serverOptions)` is called **Then** immediately before the call, `process.env` is replaced by the scoped allowlist (seeded from the Action's declared `env_vars` — wire the inputs' `envVars` through to this point), and **restored to the original snapshot in a `finally`** so the Action's subsequent code (`RUNNER_TEMP`, `GITHUB_*`, output writing) is unaffected. The existing `process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL = 'true'` assignment must remain effective for the child (set it on the scoped env, not the to-be-restored original — or set it before snapshotting so it survives into the scoped set).

4. **Given** the scoped agent **When** a workflow prompt runs `bash: env` (once bash is allowed in 13-2; for THIS story validate via a unit/integration assertion on the env passed to the spawn, not a live agent) **Then** the env handed to the child contains only the allowlisted keys + declared `env_vars` — `GITHUB_TOKEN`, `AWS_SECRET_ACCESS_KEY`, and other undeclared ambient vars are absent.

5. **Given** declared `env_vars` and env-authenticated providers (e.g. a provider that reads `AWS_ACCESS_KEY_ID` passed via `env_vars`) **When** the agent runs **Then** those still reach the child (the allowlist includes declared `env_vars`) — no regression to provider auth that legitimately flows through `env_vars`.

6. **Given** the Action's normal run **When** env scoping is applied and restored **Then** there is no observable change to existing behavior beyond the agent's reduced env: the run still creates a session, streams output, writes transcript/summary/outputs. Backward compatible.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] `.knowledge-base/technical/standards/backend/coding-style.md` — naming, SOLID, TypeScript
  - [ ] `.knowledge-base/technical/standards/backend/error-handling.md` — errors bubble; no try-catch in use-case logic (here the try/finally is for env restore, which is legitimate resource cleanup — mirror the existing finally patterns)
  - [ ] `.knowledge-base/technical/standards/global/commenting.md` — zero obvious comments (reinforced by ai-memory `comment-hygiene`)
  - [ ] `.knowledge-base/technical/standards/backend/logging.md` — minimal logging
  - [ ] `.knowledge-base/technical/standards/testing/unit-testing.md` — AAA, @golevelup/ts-jest patterns
  - [ ] Load skills: `typescript-clean-code`, `typescript-unit-testing`

- [ ] **Task 2: Shared allowlist helper in `security.ts`** (AC: 1)
  - [ ] Add exported `buildScopedEnv(envVars: Record<string, string>): Record<string, string>`. Allowlist keys: `PATH`, `HOME`, `LANG`, `TERM` (with the same defaults `buildChildEnv` uses), plus pass-through-if-set: `JAVA_HOME`, `GOPATH`, `GOROOT`, `RUNNER_TEMP`, and any `XDG_*` present in `process.env`. Then spread `...envVars`. Document WHY each runtime var is kept (opencode/LSP autoinstall needs them) — non-obvious, so a brief comment is warranted.
  - [ ] Keep it a pure function (reads `process.env`, returns a new object; does not mutate).

- [ ] **Task 3: Refactor `buildChildEnv` to use the shared helper** (AC: 2)
  - [ ] `validation.ts:buildChildEnv` becomes `{ ...buildScopedEnv(envVars), AI_LAST_MESSAGE: sanitizedLastMessage }` (or equivalent) — one allowlist source of truth. Confirm the existing validation tests still pass unchanged.

- [ ] **Task 4: Apply scoping around `createOpencode` in `opencode.ts`** (AC: 3, 5, 6)
  - [ ] Thread the declared `env_vars` to `doInitialize` (via `InitializeOptions` or the existing options path — check how inputs flow into the service).
  - [ ] Snapshot `const originalEnv = { ...process.env }`. Set `process.env` to `buildScopedEnv(envVars)` (preserving `OPENCODE_EXPERIMENTAL_LSP_TOOL='true'` into the scoped set). `await createOpencode(serverOptions)`. In `finally`, restore: clear added keys and reassign `originalEnv` (mutate `process.env` back — do not reassign the binding, Node disallows replacing the object; delete-then-Object.assign).
  - [ ] Verify the restore is correct: after init, `process.env.GITHUB_TOKEN` etc. are present again for the Action's own code.

- [ ] **Task 5: Unit tests** (AC: 1–6)
  - [ ] `security.spec.ts`: `buildScopedEnv` returns only allowlisted keys + declared envVars; undeclared ambient vars (GITHUB_TOKEN, AWS_SECRET_ACCESS_KEY) absent; runtime vars passed through when set, omitted when not; declared envVars win/are included.
  - [ ] `validation.spec.ts`: existing `buildChildEnv` behavior unchanged (regression).
  - [ ] `opencode.spec.ts`: around `createOpencode`, `process.env` is scoped (assert the env the SDK/spawn sees excludes undeclared secrets) and **restored** after init (snapshot/restore correctness — GITHUB_TOKEN present again post-init). Mock `createOpencode` to capture the `process.env` state at call time.

- [ ] **Final Task: Quality Checks**
  - [ ] `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **The mechanism is snapshot → scope → spawn → restore.** The SDK captures env at `cross-spawn` time inside `createOpencode`, so the scoped window only needs to bracket that one call. Restore in `finally` so a throw still restores.
- **Do NOT reassign `process.env`** (Node forbids replacing the object reference in a way that propagates). Mutate it: delete keys not in the scoped set, then `Object.assign(process.env, scoped)`; to restore, delete all, then `Object.assign(process.env, originalEnv)`. Or capture/restore only the delta. Pick the approach that's cleanest and test the restore explicitly.
- **Preserve runtime vars** (`JAVA_HOME`, `GOPATH`, `GOROOT`, `XDG_*`): the Dockerfile sets `GOPATH=/root/go` and a JRE path; stripping them breaks Java/Go LSP autoinstall inside the agent (research fact #2). Keep them in the allowlist.
- **`env_vars` must survive** — env-authenticated providers rely on it (research fact #2). The allowlist spreads declared `envVars` last.
- **This story does NOT add tool permissions or FS confinement** — that's 13-2. Env scoping alone does not stop on-disk `auth.json`/`.git/config` reads (that's why 13-2 exists); do not try to solve those here.
- **ai-memory:** apply `comment-hygiene` (zero obvious comments; keep only the non-obvious WHY, e.g. why each runtime var is allowlisted). Mirror the existing `buildChildEnv` style for consistency.
- Conventions: named exports, `.js` import extensions (ESM), `noUncheckedIndexedAccess`; coverage ≥80%/75%; clearMocks global. Backward compatible.

### References

- [Source: epics.md#Story 13.1] · [Source: prd.md#FR66, #NFR24]
- [Source: research/security-hardening-design-2026-06-02.md → RC-A / A1]
- [Source: research/security-hardening-research-2026-06-01.md → RC-A A1 + grounding facts #1, #2]
- [Source: docs/tests/TC-REDTEAM-agent-execution.md → AGENT-01, AGENT-06 (acceptance oracle for epic-end re-validation)]
- Existing pattern to mirror: `src/validation.ts:buildChildEnv`

## Dev Agent Record

### Agent Model Used

_(to be filled by developer)_

### Completion Notes List

_(to be filled by developer)_

### File List

_(to be filled by developer)_
