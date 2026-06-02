# Story 13.2: Fine-Grained Tool Allowlist + Filesystem Confinement + Fix Permission Merge

Status: ready-for-dev

## Story

As an **operator running AI workflows over source code**,
I want **the agent restricted to safe read-only shell + read-only git, confined to the working directory, with consumer config unable to weaken these rules**,
So that **a malicious/injected prompt cannot run arbitrary commands (RCE — AGENT-09), read `auth.json`/`.git/config`/`/proc` (AGENT-02/03), while the agent can still read source and git history to extract knowledge**.

## Background

**Red-team findings (verified):** with `'*':'allow'`, the agent's `bash` ran arbitrary commands as root (AGENT-09 RCE), read the mounted `auth.json` and the `.git/config` checkout token (AGENT-02/03). Story 13-1 scoped the _env_; this story restricts the _tools_ and confines the _filesystem_.

**Product decision (user, 2026-06-02):** fine-grained allowlists, not a blunt toggle. The tool's purpose (read legacy source + git history to extract knowledge) needs read-only shell, read-only git, websearch — NOT arbitrary shell, NOT commit/push, NOT webfetch (that's 13-9).

**CRITICAL — two conflicting mechanisms must both be fixed (verified in source):**

1. **Permission config merge is backwards.** `buildPermissionConfig` does `{ ...defaults, ...existing }` so **consumer `opencode_config` overrides our rules**. OpenCode is last-match-wins; our security rules must be applied LAST.
2. **The permission _handler_ auto-approves everything.** `handlePermissionAsked` (opencode.ts ~l.768) unconditionally replies `'always'` to EVERY permission request. **This defeats config `deny` rules** — when the agent hits a denied tool, opencode raises a permission _request_, and the handler currently rubber-stamps it. **The handler MUST reject requests for tools/commands that policy denies, not blanket-approve.** Without this, all the deny rules in this story are theatre. This is the load-bearing change.

**Filesystem confinement (verified):** opencode confines reads AND bash path-args to `ctx.directory` via the `external_directory` permission (`containsPath`, `tool/shell.ts` scans path-args). Set `external_directory: "deny"`. The confinement root comes from the **client's `directory`** — but `createOpencode` builds its client with only `{ baseUrl }` and does NOT forward `directory` (verified: `sdk/dist/v2/index.js`). So the Action must set `directory` on the client itself (see Task 4).

**Scope boundary:** tool permissions + FS confinement + merge/handler fix ONLY. Webfetch domain allowlist = 13-9. Non-root container = 13-3. baseURL = 13-4. Do NOT touch the Dockerfile, entrypoint, env scoping (13-1, done), or baseURL/auth logic.

## Acceptance Criteria

1. **bash read-only allowlist.** `buildPermissionConfig` sets `bash` to an object: ALLOW `grep*`,`ls*`,`find*`,`cat*`,`head*`,`tail*`,`wc*`,`tree*`,`file*`,`rg*`; with a final `"*":"deny"`. A `bash_allow_patterns` input (comma/newline list, default empty) appends consumer patterns to the ALLOW set. Verified: `grep`/`ls`/`cat` (in-tree) allowed; `curl x | sh`, `rm -rf`, `npm install`, `bash -c …` denied.

2. **git read-only-subcommand allowlist.** ALLOW (as bash object patterns): `git log*`,`git show*`,`git diff*`,`git blame*`,`git shortlog*`,`git rev-list*`,`git status*`,`git tag*`,`git branch*`,`git describe*`,`git ls-files*`,`git ls-tree*`,`git cat-file*`,`git reflog*`,`git whatchanged*`. DENY (rely on final `"*":"deny"`, and add explicit denies to be safe): `git commit*`,`git push*`,`git pull*`,`git fetch*`,`git clone*`,`git merge*`,`git rebase*`,`git reset*`,`git checkout*`,`git remote*`,`git config*`,`git credential*`. Verified: `git log`/`show`/`blame` work; `git commit`/`push`/`config` denied.

3. **`.git/config` credential read closed (AGENT-03) at both layers.** Because `external_directory:deny` does NOT block in-tree `.git/config`, and `cat*` is allowed: add bash deny rules whose pattern matches the full command text (`source(node)`): `"*.git/config*":"deny"`, `"*.git/credentials*":"deny"`, `"*.git-credentials*":"deny"` (these win under findLast even though `cat*` allows). AND a `read`-tool path deny for `.git/config`/`.git/credentials`/`~/.git-credentials`. Verified: `cat .git/config` denied (bash), reading `.git/config` via the read tool denied, `git config --get http.<url>.extraheader` denied; a planted base64 checkout token does NOT reach the transcript.

4. **websearch allow, webfetch deny.** `permission.websearch = "allow"`, `permission.webfetch = "deny"`. (Per-domain webfetch is 13-9; here it's a plain deny.)

5. **external_directory deny + settable confinement root.** `permission.external_directory = "deny"`. The agent client is created with `directory` = `GITHUB_WORKSPACE` by default, overridable via a new `agent_working_directory` input (resolved + validated to be within the workspace, reuse `validateWorkspacePath`/`validateConfigPath` style). Verified: in-tree reads/bash succeed; `cat /etc/passwd`, `grep -r /root`, `cat ~/.aws/credentials`, `cat /root/.local/share/opencode/auth.json` (outside root) all denied. Guard the non-git `worktree==='/'` case: a non-git workspace still rejects out-of-root paths.

6. **Permission merge fixed (Action rules win).** `buildPermissionConfig` applies consumer `existing` permission FIRST, then overlays the Action's security rules LAST (so under last-match-wins they win). Verified: a consumer `opencode_config` that sets `{ permission: { bash: "allow", external_directory: "allow" } }` does NOT re-enable bash/external access. The `'*':'allow'` baseline for read-family tools (read/glob/grep/list/edit?) stays — but note: keep `edit` per current behavior unless it conflicts; the focus is bash/webfetch/websearch/external_directory/git. (Architect note: read/glob/grep/list stay allowed for knowledge extraction; do NOT deny them.)

7. **Permission handler no longer rubber-stamps denied tools.** `handlePermissionAsked` must NOT reply `'always'` for a request that policy denies. Implement: when a permission request arrives, evaluate it against the configured deny rules (or, simplest robust approach: reply `'reject'`/`'once':false` for `bash`/`webfetch`/`external_directory`/denied-git requests, and `'always'` only for the allowed read-family set). The cleanest design is to drive the handler from the SAME allow/deny policy object used to build the config, so they cannot drift. Verified: a denied `bash` command stays denied at runtime (not auto-approved); allowed read commands still proceed without manual intervention (CI is headless — allowed must not block).

8. **Backward-compatible for legitimate use + knowledge extraction.** Default run (read source + git history) works: read/glob/grep/list, `git log`, in-tree `grep`/`cat` all succeed. `github-copilot/gpt-5-mini` still runs (Copilot-never-blocked). Transcript/summary still produced.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, error-handling, commenting (zero-obvious), logging, validation, unit-testing standards under `.knowledge-base/technical/standards/`
  - [ ] Load skills: `typescript-clean-code`, `typescript-unit-testing`
  - [ ] Read design: `_bmad-output/planning-artifacts/research/security-hardening-design-2026-06-02.md` (RC-A A2/A3 + git bullet) and the permission evidence in `security-hardening-research-2026-06-01.md` (fact #5) + `webfetch-domain-allowlist-research-2026-06-02.md` (permission engine mechanics).

- [ ] **Task 2: Build the permission policy (single source of truth)** (AC: 1,2,3,4,6)
  - [ ] Create the allow/deny rule set as a structured constant (recommend `src/permissions.ts` leaf, or in `security.ts` if it stays small) — the bash command allowlist (read-only + git read-only subcommands), the `.git/config` denies, `websearch:allow`, `webfetch:deny`, `external_directory:deny`. Export a builder `buildAgentPermission(consumerPermission, bashAllowPatterns): PermissionObject`.
  - [ ] Order matters (findLast): allow patterns first, then specific denies (`*.git/config*`, git mutating subcommands), then `"*":"deny"` for bash. The TOP-LEVEL merge: `{ ...defaults(read-family allow), ...consumerPermission, ...ActionSecurityRules }` — Action rules LAST.
  - [ ] Rewrite `buildPermissionConfig` to use it (and widen its return type from `Record<string,string>` to allow object-valued keys like `bash`).

- [ ] **Task 3: Fix the permission handler** (AC: 7)
  - [ ] Refactor `handlePermissionAsked` to consult the same policy: reject (reply with the deny/`once:false` equivalent — verify the SDK's `reply` accepted values: `'always'|'once'|'reject'`?) for denied permissions/commands; auto-approve only the allowed read-family + allowed bash/git patterns. Keep CI non-interactive (no hang). If the SDK's permission engine ALREADY denies before raising a request (i.e. a config `deny` short-circuits to DeniedError without asking), confirm whether the handler even receives denied requests — if opencode denies internally and only ASKS for `"ask"` rules, then the handler change is to ensure we never blanket-`'always'` an `"ask"`-classified dangerous tool. INVESTIGATE the actual event flow (does a config-`deny` raise permission.asked, or DeniedError?) and implement correctly. Document what you found.

- [ ] **Task 4: Set the confinement-root directory on the client** (AC: 5)
  - [ ] `createOpencode` builds its client with only `{ baseUrl }` (does NOT forward `directory`). Change `doInitialize` to set the client `directory`: either (a) after `createOpencode`, replace/augment the client via `createOpencodeClient({ baseUrl: server.url, directory })`, or (b) call `createOpencodeServer` + `createOpencodeClient` separately. Pick the lower-risk option; keep the env-scoping (13-1) bracket around the SERVER spawn. `directory` = resolved `agent_working_directory` input or `GITHUB_WORKSPACE`.
  - [ ] Add `agent_working_directory` input to action.yml + parse in config.ts (validate within workspace). Add `agentWorkingDirectory?: string` to `ActionInputs`; thread to `InitializeOptions`.

- [ ] **Task 5: action.yml inputs** (AC: 1,5)
  - [ ] `bash_allow_patterns` (default ''), `agent_working_directory` (default ''). Document both.

- [ ] **Task 6: Unit tests** (AC: 1–8)
  - [ ] permission policy: bash allow set, git read-only allowed + mutating/config denied, `.git/config`/credentials denies present and ordered after allows, websearch allow, webfetch deny, external_directory deny.
  - [ ] merge: consumer `{bash:'allow', external_directory:'allow'}` does NOT override Action denies (Action rules last).
  - [ ] handler: denied request → not auto-approved (rejected); allowed → approved; document/encode the event-flow finding from Task 3.
  - [ ] directory: client created with `directory` = workspace / `agent_working_directory`; input validated within workspace.
  - [ ] read-family (read/glob/grep/list) still allowed (no regression to knowledge extraction).

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **The handler fix (Task 3) is the crux.** Config deny rules are meaningless if `handlePermissionAsked` replies `'always'` to everything. FIRST investigate the real event flow: does a config-level `deny` produce a `DeniedError` internally (no `permission.asked` event), or does it raise `permission.asked` that we must reject? Read `~/Work/GIT/Personal/Sources/opencode/packages/opencode/src/permission/index.ts` (l.180-190: deny short-circuits before ask). Likely: config `deny` → `DeniedError`, NO ask event → so the handler only sees `"ask"` rules. If so, the handler fix is "stop turning every `ask` into `always` for dangerous tools" — but since we set explicit allow/deny (not ask), the main fix is the CONFIG (Task 2) and the handler should still be made policy-aware so a future `"ask"` rule isn't blanket-approved. CONFIRM empirically in funcval.
- **directory on client:** `createOpencode`'s bundled client omits `directory`. The cleanest fix is likely calling `createOpencodeServer` + `createOpencodeClient({baseUrl, directory})` yourself (you already need the server handle). Preserve the 13-1 env bracket around the server spawn.
- **findLast ordering:** allow-specific-first, deny-catch-all-last for bash. The `.git/config` denies are MORE specific than `cat*` allow and must come AFTER it to win.
- **Do NOT deny read/glob/grep/list/lsp** — knowledge extraction needs them. Keep `edit` as-is (current behavior) unless it surfaces a conflict; flag to leader if unsure rather than denying it.
- **ai-memory:** `comment-hygiene` (only non-obvious WHY); the permission policy is security-critical so a comment block explaining the allow/deny rationale + findLast ordering is warranted.
- Conventions: named exports, `.js` imports, `noUncheckedIndexedAccess`; coverage ≥80%/75%. Backward compatible (Copilot runs; read-family allowed).

### References

- [Source: epics.md#Story 13.2] · [Source: prd.md#FR67, #FR68, #NFR25]
- [Source: research/security-hardening-design-2026-06-02.md → RC-A A2/A3, git bullet, .git/config two-layer close]
- [Source: research/security-hardening-research-2026-06-01.md → fact #5 (last-match-wins merge), permission surface]
- [Source: research/webfetch-domain-allowlist-research-2026-06-02.md → permission engine: webfetch.ts:39, core/permission.ts:32, fromConfig per-pattern]
- [Source: docs/tests/TC-REDTEAM-agent-execution.md → AGENT-09, AGENT-02, AGENT-03 (acceptance oracle)]
- Current code: `src/opencode.ts:buildPermissionConfig`, `handlePermissionAsked` (reply 'always'), `doInitialize` (createOpencode client)

## Dev Agent Record

### Agent Model Used

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
