# Security Hardening — Architect Design Judgement (Epic 13 input)

**Author:** Winston (Architect) via bmad-auto leader
**Date:** 2026-06-02
**Inputs:** `security-hardening-research-2026-06-01.md` (research), red-team findings (`docs/tests/test-run-redteam-2026-06-01.md`), ai-memory decisions, `architecture.md`, PRD.
**Status:** Approved design — basis for Epic 13 stories.

## Decisions taken (product calls confirmed with user 2026-06-02)

- **Tool posture (REFINED 2026-06-02 per user):** _fine-grained allowlists, not a blunt toggle._ The product purpose (read legacy source to extract knowledge/patterns) needs **safe read-only shell commands** (`grep`, `ls`, `find`, `cat`, `head`, `tail`, `wc`, `tree`, `git log/show/diff/blame`, etc.) and **websearch**, but NOT arbitrary shell or unrestricted web. Verified the SDK/opencode supports this natively (sources below):
  - **bash = command-pattern allowlist** (`bash?: { [pattern]: "allow"|"deny" }`, `gen/types.gen.d.ts:859`). opencode's shell tool _parses the command tree_ and matches each command via `Wildcard.match` (`permission/index.ts:185`), so `{ "grep*":"allow", "ls*":"allow", "find*":"allow", "cat*":"allow", "git log*":"allow", …, "*":"deny" }` allows the read-only extraction commands and denies everything else (incl. `curl|sh`, `rm`, package installs, `cat /etc/...`). Default allowlist ships curated; consumer can extend via an input.
  - **websearch = allow** by default (knowledge extraction legitimately needs it; it returns search results, not arbitrary fetch of attacker URLs).
  - **webfetch = NOT natively domain-filterable.** SDK config only exposes `webfetch: "allow"|"ask"|"deny"` — there is **no per-domain allowlist** in opencode config (verified: `gen/types.gen.d.ts:862`, only the tri-state). So "allow webfetch for github/google only" cannot be enforced purely in opencode config. Decision: **default-deny webfetch**, with an `allow_webfetch` opt-in (coarse on/off). A true trusted-domain webfetch allowlist would require the Action to run an interposing fetch proxy / MCP shim — deferred as a follow-up (documented), not in Epic 13. **Flag to user:** websearch covers most extraction needs; webfetch-by-domain is the one ask the platform can't satisfy granularly today.
- **Filesystem confinement (REFINED 2026-06-02 per user — stronger fix for AGENT-02/03):** confine the agent to the **GitHub runner working directory + tmp** only. Verified opencode enforces this via the **`external_directory` permission**: any read/bash path NOT inside the project directory (`containsPath(full, instance)`, `tool/external-directory.ts:30`) triggers `external_directory`. Set **`external_directory: "deny"`** and the agent cannot read `auth.json` (`~/.local/share/opencode/`), `/proc/*/environ`, `~/.aws/credentials`, or anything outside the workspace — this directly closes the on-disk credential reads that env-scoping alone could not (supersedes the weaker "relocate HOME/XDG" A3). The project/working dir is set to `GITHUB_WORKSPACE`; `RUNNER_TEMP` is the only other writable area the Action itself needs (not the agent). This is the cleanest, native enforcement of "only the working directory + tmp."
- **baseURL policy:** allowlist + `allowed_provider_hosts` opt-in input, https-only, block private/metadata ranges, AND refuse `auth.set` for non-allowlisted endpoints (research B1+B2).

## Alignment with ai-memory decisions (these CONSTRAIN the implementation)

| Memory decision                                                                                                                        | Constraint on Epic 13                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D7 — free-model detection is `cost===0 && enabledVia!=='account'`, NO hardcoded provider lists**                                     | The baseURL allowlist (RC-B) is the _one_ place we introduce a curated host list. This is acceptable and NOT a contradiction of D7: D7 forbids hardcoding _which providers are free/subscription_; the host allowlist is a _security_ control with an explicit `allowed_provider_hosts` escape hatch (mirrors the existing `subscription_providers` opt-in pattern). Keep the curated list small + override-able; never use it to infer pricing/subscription. |
| **D8 — `fallback_config` carries NO credentials; auth is separate (`auth_config`)**                                                    | RC-B's `applyAuth` change (skip auth for non-allowlisted host) must not entangle auth with fallback/config. Auth stays sourced from `auth_config`; the allowlist gates _whether_ we attach it, not _where it comes from_. The fallback chain (Epic 11) must keep working for allowlisted hosts.                                                                                                                                                               |
| **Non-hardcoded provider detection (user: "I don't want to hardcode FLAT_SUBSCRIPTION_PROVIDERS")**                                    | Same as D7 — the security host-allowlist is curated-but-overridable; it is not a provider-classification list. Document this distinction in the story so a future reader doesn't "clean it up" into the model-filter logic.                                                                                                                                                                                                                                   |
| **Validation policy — funcval+manual at epic end w/ gpt-5-mini; e2e at epic end w/ opencode free model; per-story = unit+review only** | Epic 13 follows this exactly. Each story: unit tests + leader code review. Epic-end: full functional + manual security re-run (re-run the TC-REDTEAM / TC-AGENT cases to confirm each finding now PASSES) using `github-copilot/gpt-5-mini`; e2e with opencode free model. The red-team TC files (`docs/tests/TC-REDTEAM-agent-execution.md`) become the **acceptance oracle** — every FAIL must flip to PASS.                                                |
| **Copilot-never-blocked invariant (D7 / Epic 10)**                                                                                     | The permission/env/baseURL changes must not break `github-copilot/gpt-5-mini` (our funcval model). `api.githubcopilot.com` MUST be on the default host allowlist. Funcval will catch a regression here.                                                                                                                                                                                                                                                       |

## Architecture alignment (architecture.md)

- **Reuse the existing allowlist pattern.** `validation.ts:buildChildEnv` already scopes the validation child env to an allowlist. RC-A's agent env-scoping must extract this into a **shared helper in `security.ts`** (the designated home for "path, secrets" per the module table) so the two paths can't drift. This honors the "Child processes — isolated env" row already in architecture.md's Security Architecture table.
- **`security.ts` stays a leaf module.** The new helpers (env allowlist, baseURL validation, host allowlist constant) live in `security.ts` (or a new `src/permissions.ts` leaf if `security.ts` grows too large — architect call during story creation). No new circular deps.
- **Result pattern / fail-closed.** baseURL rejection and validation failures use the existing early-return error path (`config.ts`/`security.ts` throw → caught → sanitized), consistent with the Error Handling Strategy table.
- **Layered timeouts.** MEDIUM-1's global deadline slots into the existing "Timeout Architecture" hierarchy as the missing top-level **Workflow** wall-clock enforcer (the table already lists "Workflow 30min" as a layer — it just wasn't actually enforced).

## Per-finding design (what to build, where, what to preserve)

### RC-A — agent containment (CRITICAL; covers AGENT-01/02/03/06/09, FINDING-5, HIGH root-bash, RCE)

Layered, all in scope:

- **A1 env scoping** — shared `buildScopedEnv()` helper in `security.ts`; sanitize `process.env` to allowlist around `createOpencode` in `opencode.ts:doInitialize`, restore in `finally`. Allowlist: PATH/HOME/LANG/TERM + runtime vars (JAVA*HOME, GOPATH, GOROOT, XDG*\*) + declared `env_vars` + RUNNER_TEMP. **Preserve:** env-authenticated providers (fact #2) — keep declared env_vars; don't strip runtime vars or Java/Go LSP autoinstall breaks.
- **A2 fine-grained bash allowlist + websearch allow + webfetch opt-in + fix merge** — rewrite `buildPermissionConfig` to:
  - **bash = command-pattern allowlist** (object form): ship a curated default allowing read-only extraction commands (`grep*`, `ls*`, `find*`, `cat*`, `head*`, `tail*`, `wc*`, `tree*`, `file*`, `git log*`, `git show*`, `git diff*`, `git blame*`, `git status*`, `rg*`, `sed -n*`/read-only sed?, `awk*` careful) with a final `"*": "deny"`. Add an input (e.g. `bash_allow_patterns`) for consumers to extend. Deny everything not matched (blocks `curl|sh`, `rm`, installs, writes, `cat` of out-of-tree paths — the last is also caught by `external_directory`).
  - **websearch = allow** (knowledge extraction needs it).
  - **webfetch = deny by default**, `allow_webfetch` input for coarse on/off. (No native per-domain allowlist — see Decisions note; trusted-domain webfetch deferred to a documented follow-up.)
  - **Fix the merge direction** (research fact #5, latent bug): OpenCode is _last-match-wins_; today's `{...defaults, ...existing}` lets consumer config weaken our hardening. Invert: apply consumer `permission` first, overlay Action security rules last so they win. **Revisit `handlePermissionAsked`** (opencode.ts:729 auto-replies `'always'`) — it must NOT silently re-allow a tool/command that config denied; an `external_directory` or denied-bash request must resolve to reject, not `'always'`.
- **A3 filesystem confinement via `external_directory: "deny"`** (REPLACES the weaker HOME/XDG relocation) — set the agent's project/working directory to `GITHUB_WORKSPACE` and `external_directory: "deny"` so any path outside the workspace (auth.json under `~/.local/share/opencode`, `/proc/*/environ`, `~/.aws`, `/etc`) is refused by opencode's own `containsPath` check (`tool/external-directory.ts`). This is the native, direct enforcement of the user's "only allow the working directory + tmp" — and it closes the on-disk credential reads (AGENT-02/03) that env-scoping alone cannot. **Preserve:** the workspace itself stays fully readable (that's the source the agent extracts knowledge from); `RUNNER_TEMP` writes are the Action's, not the agent's.
- **A4 non-root container** — Dockerfile: create `runner` user, drop privileges. **Decision: use the root→`gosu` drop pattern in `entrypoint.sh`** (research N1 "most robust") rather than a hardcoded `USER 1001`, for resilience across runner UID variance (self-hosted may be 1000). Pre-create + chown HOME/GOPATH/XDG so LSP autoinstall + auth still work. **Flag:** verify workspace + `$GITHUB_OUTPUT` writes still work (the documented UID pitfall) — funcval must confirm on a real container run.

### RC-B — baseURL credential exfil (CRITICAL; covers AGENT-04, FINDING-1)

- **B1** validation pass in `opencode.ts:buildSdkConfig`: for every `provider.<id>.options.{baseURL,endpoint}` in consumer config — require https, block private/loopback/link-local/metadata ranges, allowlist known provider hosts + `allowed_provider_hosts` opt-in input. Fail-closed (reject). Host list lives in `security.ts` as a small curated constant (NOT a provider-classification list — see D7 note).
- **B2** `opencode.ts:applyAuth` skips `client.auth.set` for any provider whose effective baseURL isn't allowlisted (fail-closed; key never leaves). **Preserve:** Azure `resourceName`→baseURL derivation; Bedrock/Azure host patterns in the allowlist; D8 (auth still from `auth_config`).

### MEDIUM-1 — global wall-clock timeout (covers FINDING-2)

- `index.ts`: `const deadline = AbortSignal.timeout(inputs.timeoutMs); const combined = AbortSignal.any([shutdownController.signal, deadline]);` thread `combined` everywhere `shutdownController.signal` flows; guard `runValidationLoop` head with `combined.aborted`. Map `TimeoutError` reason → status `timeout` (distinct from `cancelled`). Preserve the signal path.

### MEDIUM-2 — job-summary phishing (covers AGENT-08)

- `summary-writer.ts`: replace `addRaw(scrubbed)` with `addCodeBlock(scrubbed)` (inert preformatted; neutralizes markdown links/images). Keep `scrubSecrets`+`truncateString`.

### Cross-cutting — ambient-secret masking backstop

- `security.ts`: extend the mask/scrub set with secrets the Action _can_ enumerate — `GITHUB_TOKEN` if present + the values parsed from `auth.json` in `applyAuth` — and `core.setSecret()` them so they're masked in transcript/summary even if surfaced. Prevention (RC-A) is primary; this is the backstop (research C2). Conservative token-shape redaction (C3) optional, low priority.

### Docs (covers FINDING-3, FINDING-4)

- Add a **Security Considerations / Threat Model** section to README + SECURITY.md: minimal `permissions:`, never `pull_request_target` + untrusted PR + secrets, `opencode_config` is trusted/credential-adjacent, bash opt-in implications, egress filtering (harden-runner) for consumers who need it. Pin base images by `@sha256:` digest (FINDING-4).

## Story decomposition for Epic 13 (proposed — finalize in create-epic)

1. **13-1** RC-A env scoping (shared `buildScopedEnv` helper + apply around createOpencode)
2. **13-2** RC-A tool permission default-deny + opt-in inputs + fix merge direction + permission-handler review
3. **13-3** RC-A non-root container (gosu drop) + HOME/XDG relocation (A3+A4 together — both Dockerfile/entrypoint)
4. **13-4** RC-B baseURL allowlist validation + refuse-auth + `allowed_provider_hosts` input
5. **13-5** MEDIUM-1 global wall-clock timeout
6. **13-6** MEDIUM-2 summary code-block + ambient-secret masking backstop
7. **13-7** Docs: threat-model/SECURITY.md + digest-pin base images
8. **13-8** Tests + epic-end security re-validation (flip every TC-REDTEAM/TC-AGENT FAIL → PASS)

Ordering rationale: RC-A first (biggest blast radius, shared helper other stories don't depend on), RC-B independent, MEDIUMs small, docs + test-sweep last. 13-2 depends on 13-1's helper only loosely; can parallelize if needed but default sequential per epic-order rule.

## Second-brain (`~/.jarvis/memory`) alignment — checked, reinforces design (no changes)

- **`patterns/authoritative-evidence-validation` (reinforced 2×):** "validate against the true runtime/artifact surface, not docs or local state." → Confirms the epic-end acceptance oracle: re-run the real `TC-REDTEAM-*`/`TC-AGENT-*` cases against the **live container** (every FAIL→PASS), not unit-test stand-ins. Cite in story 13-8.
- **`patterns/runner-service-install-user` + the GitHub-Actions UID pitfall:** UID/permission mismatch → "cryptic failures at job runtime." → Confirms choosing the **root→`gosu` drop** for A4 over a hardcoded `USER 1001` (resilient across runner UID variance). 13-3 must funcval real workspace + `$GITHUB_OUTPUT` writes.
- **`decisions/supply-chain-branch-remediation` + `patterns/supply-chain-malware-triage`:** reachable-history/blob integrity matters. → Reinforces FINDING-4 base-image **`@sha256:` digest pinning** (tamper-evident artifact surface) in 13-7.
- **`patterns/comment-hygiene` (reinforced 4×):** zero obvious WHAT-comments; keep only non-obvious WHY. → Applies to every dev story (already in CLAUDE.md; reinforced here for the security code).
- No second-brain entry contradicts any design choice; MCP semantic search was unreachable (offline), so files were read directly (authoritative source anyway).

## What must NOT break (regression guard for funcval)

- `github-copilot/gpt-5-mini` runs (Copilot-never-blocked; host on allowlist).
- Provider fallback chain (Epic 11) for allowlisted hosts.
- Transcript export + job summary features (Epic 9) — still produced, just code-blocked.
- Free-model filtering (Epic 10) — untouched; the host allowlist must not bleed into model-filter logic (D7).
- env-authenticated providers (declared `env_vars` still reach the agent).
- Workspace + `$GITHUB_OUTPUT` writes under non-root.
