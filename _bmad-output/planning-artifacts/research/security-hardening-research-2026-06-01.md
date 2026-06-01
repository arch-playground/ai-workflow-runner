# Security Hardening Research — ai-workflow-runner (Epic 13 input)

**Author:** Mary (Analyst / tech-researcher)
**Date:** 2026-06-01
**Scope:** Remediation research for verified red-team findings (RC-A, RC-B, MEDIUM-1, MEDIUM-2). Research + recommendations only — no design decisions, no code changes.
**SDK under test:** `@opencode-ai/sdk@1.15.13` (v2 API). OpenCode CLI `opencode-ai@1.15.13`.
**Docker runtime:** `debian:bookworm-slim`, Node 20.x, **runs as root** (no `USER` directive).

---

## 0. New grounding facts discovered while reading the installed SDK + opencode source

These extend (and in two places sharpen) the grounding facts supplied by the leader. Build on them.

1. **The SDK passes the whole config to the child process as an environment variable, not a CLI flag.**
   `node_modules/@opencode-ai/sdk/dist/v2/server.js` lines 12–16:

   ```js
   const proc = launch(`opencode`, args, {
     env: {
       ...process.env,
       OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
     },
   });
   ```

   **Implication:** if we sanitize `process.env` _before_ calling `createOpencode`, the SDK's own spread (`...process.env`) forwards only the sanitized set to `opencode serve`. The config is injected separately and survives sanitization. This makes **option (a) — sanitize-then-restore — viable and minimally invasive.** No fork or self-launch is required.

2. **`opencode serve` reads provider credentials from `process.env` at runtime, inside the spawned child.**
   `opencode/packages/opencode/src/provider/provider.ts` reads `env["AWS_ACCESS_KEY_ID"]`, `env["AZURE_RESOURCE_NAME"]`, `env["GOOGLE_VERTEX_PROJECT"]`, `process.env.AWS_BEARER_TOKEN_BEDROCK`, etc. (lines 181, 233, 285–310, 475–482). So env passed to the child is _functional_, not just incidental — naive env stripping can break env-authenticated providers. The allowlist must keep declared `env_vars` (which already feed provider auth today).

3. **`auth.json` lives on disk at `$XDG_DATA_HOME/opencode/auth.json` (else `~/.local/share/opencode/auth.json`).**
   `opencode/packages/core/src/global.ts` line 10: `const data = path.join(xdgData!, app)`; `auth/index.ts` line 9: `path.join(Global.Path.data, "auth.json")`.
   **Critical implication for RC-A:** env scoping changes _where_ `auth.json` resolves (via `HOME`/`XDG_DATA_HOME`), but the file still exists on disk wherever it resolves. **If the bash tool is enabled, the agent can `cat` `auth.json` regardless of env scrubbing** — it only needs the path, which is derivable from `HOME`. **Env scoping alone does NOT close the auth.json read; only denying bash (or not mounting auth.json on a path the agent's HOME can reach) does.** This is the single most important trade-off in this document.

4. **OpenCode has NO process-level bash sandbox.** `opencode/packages/opencode/src/file/protected.ts` only lists macOS TCC / Windows special dirs to avoid _watching_ — it is not a syscall/exec jail. There is a `sandboxes: string[]` field on instance state but no config-level "sandbox mode" that contains the bash tool in this version. So we cannot rely on an OpenCode-native sandbox to neutralize bash; containment must come from (a) tool permission denial and/or (b) OS/container isolation.

5. **OpenCode permission precedence is "LAST matching rule wins" — NOT "deny > ask > allow".**
   Per the official docs (https://open-code.ai/en/docs/permissions): _"Rules are evaluated by pattern match, with the last matching rule winning... a common pattern is to put the catch-all `\"_\"`rule first, and more specific rules after it."*
**This is a latent bug in the current`buildPermissionConfig`.** It does `{ ...defaults, ...existing }`, i.e. **user config overrides our defaults**, and key ordering is not guaranteed to favor our hardening. A consumer-supplied `permission` can currently weaken our intended posture. The merge order must be inverted (our security rules must win) when we harden.

6. **The full `PermissionConfig` surface** (`gen/types.gen.d.ts` ~lines 657–680) supports object-form per-tool rules:
   `bash`, `webfetch`, `websearch`, `read`, `edit`, `task`, `external_directory`, `repo_clone`, `lsp`, `skill`, plus a top-level `tools?: { [name]: boolean }` map and per-`agent` `tools`/`permission`. Bash supports the object form `{ "*": "deny", "npm test": "allow" }` (command-pattern keyed).

---

## RC-A — Agent runs with full unscoped env + `'*':'allow'` tools, as root (drives most CRITICALs)

**Codebase pointers:**

- `src/opencode.ts` → `doInitialize` (calls `createOpencode`, l.131), `buildSdkConfig` (l.164), `buildPermissionConfig` (l.184), `applyAuth` (l.146).
- `src/validation.ts` → `buildChildEnv` (l.184) is the _existing correct allowlist pattern_ to mirror.
- `Dockerfile` runtime stage — no `USER`.

This is a **defense-in-depth** problem; no single control fixes it. Recommended layering, in priority order:

### A1 (RECOMMENDED, primary): Scope the agent server's env to an allowlist — sanitize `process.env` around `createOpencode`

Because the SDK spreads `...process.env` (fact #1), wrap the `createOpencode` call:

1. Snapshot `process.env`.
2. Replace `process.env` with an allowlist: `PATH`, `HOME`, `LANG`, `TERM`, plus the runtimes opencode needs (`JAVA_HOME`, `GOPATH`, `GOROOT`, `XDG_*` if set, `OPENCODE_*` it sets itself), plus the **declared `env_vars`** (provider auth must keep working — fact #2), plus `RUNNER_TEMP`/`HOME` that opencode/LSP rely on.
3. `await createOpencode(...)` (child inherits the scoped snapshot at spawn time).
4. Restore the original `process.env` in a `finally`.

This reuses the _exact_ allowlist philosophy already shipping in `validation.ts buildChildEnv` (l.188–195) — make it a shared helper so the two paths cannot drift.

**Idempotency / what breaks:**

- Must run-and-restore synchronously around the spawn; the child captures env at `cross-spawn` time, so a `try/finally` restore right after `createOpencode` resolves is safe (server already forked). The Action's own later code (`RUNNER_TEMP`, `GITHUB_*`) keeps working because the parent env is restored.
- **What this removes from the agent:** `GITHUB_TOKEN`, cloud creds not in `env_vars`, arbitrary ambient runner secrets. `env|grep` inside agent bash no longer surfaces them.
- **What this does NOT fix:** the on-disk `auth.json` read (fact #3) and `.git/config` checkout token — both are _files_, not env. Env scoping is necessary but insufficient. Pair with A2 + A4.
- **Preserve:** any `env_vars` a workflow legitimately needs (test DB URLs, etc.) and the runtime vars (`JAVA_HOME`, Go paths) the Dockerfile sets, or Java/Go LSP autoinstall breaks.

### A2 (RECOMMENDED, primary): Default-deny `bash` and `webfetch`; opt-in via input

Current `buildPermissionConfig` sets `'*':'allow'` → bash + webfetch enabled for every run. Best practice for an **untrusted-prompt CI agent** is _default-deny, opt-in_ — "don't restrict what the agent does, restrict what it has" (Docker/Knostic/Brian Gershon, 2025). Recommended posture:

```jsonc
// conceptual target — note ordering matters (last match wins, fact #5)
"permission": {
  "*": "allow",        // file read/edit/glob/grep stay usable
  "bash": "deny",      // or "ask" is meaningless in headless CI → effectively deny
  "webfetch": "deny",
  "websearch": "deny"
}
```

Expose a new input (e.g. `allow_bash: false` default, `allow_webfetch: false` default) so workflows that legitimately run tests/build can opt in. **Fix the merge direction at the same time (fact #5):** apply consumer `permission` _first_, then overlay the Action's security rules so they win — the opposite of today's `{...defaults, ...existing}`.

**⚠ Product-constraint conflict (flag for architect):** Many real workflows _need_ bash — running `npm test`, building, git ops are common AI-workflow tasks. Denying bash by default is the strongest fix but **will break legitimate use** for a meaningful fraction of consumers. Options to resolve: (i) default-deny + `allow_bash` opt-in (recommended; secure-by-default, escape hatch exists); (ii) keep bash allowed but rely on A1+A4+A5 to contain blast radius (weaker — bash can still read auth.json). The architect should weigh this against how the product is actually used. Note: in headless CI, `"ask"` cannot be answered interactively and the Action auto-replies `"always"` to every permission prompt (`handlePermissionAsked`, opencode.ts l.729 replies `'always'`) — so `"ask"` currently degrades to `"allow"`. **If bash stays enabled, the auto-approve-everything handler must also be revisited**, else permission rules are theatre.

### A3 (RECOMMENDED, defense-in-depth): Don't mount `auth.json` where the agent's `HOME` can read it

Because auth.json is read from `$XDG_DATA_HOME/opencode/auth.json` derived from the child's env (fact #3), set the agent child's `HOME`/`XDG_DATA_HOME` to a path **outside** the workspace and outside any dir the bash tool is told to operate in, and apply auth via `client.auth.set` (already done in `applyAuth`) rather than relying on a mounted file. The credentials still reach the provider via the SDK auth call, but there's no predictable on-disk `auth.json` under the agent's working tree. (Still defeated by bash if the agent guesses the XDG path — hence A2 remains primary.)

### A4 (RECOMMENDED, container layer): Drop to non-root + restrict filesystem — see RC "Non-root" section below

Running as root means agent bash can read `/proc/*/environ` of sibling processes, the mounted `auth.json`, `.git/config`, etc. Non-root + minimal mounts shrinks the blast radius even when bash is enabled. Covered in the dedicated section.

### A5 (alternative, NOT recommended as sole fix): rely only on permission denial, keep env intact

Rejected: permission denial governs the _opencode tool layer_, but if any future tool, MCP server, or prompt-injection path reaches a shell, full env is still present. Env scoping (A1) is cheap and orthogonal — do both.

**Alternatives considered & rejected for env scoping:**

- _(b) self-launch `opencode serve` with scoped env via `createOpencodeServer` + manual client:_ more control, but re-implements server lifecycle the SDK already manages (URL parse, abort binding, heartbeat) → higher maintenance, more surface for bugs. Only worth it if A1's global-env mutation proves unacceptable (it's a known, contained pattern here).
- _(c) `OPENCODE\__` env override:\* no such env-scoping knob exists in this SDK/CLI version.

> **RC-A recommended approach (summary):** Layered. (A1) sanitize `process.env` to an allowlist around `createOpencode`, reusing the `validation.ts` allowlist pattern; (A2) flip to default-deny `bash`/`webfetch`/`websearch` with explicit opt-in inputs AND fix the permission-merge so Action rules win (last-match-wins); (A3) relocate the agent's `HOME`/XDG so auth.json isn't under the agent tree; (A4) non-root container. A1+A4 are unconditional; A2 needs an architect call on the bash-breaks-workflows trade-off. **Env scoping alone is insufficient — the auth.json/.git file reads only close under A2 (deny bash) or A4 (non-root + unreadable mounts).**

---

## RC-B — Consumer `opencode_config` can set `provider.<id>.options.baseURL`; org API key sent to attacker URL

**Codebase pointer:** `src/opencode.ts` → `buildSdkConfig` (l.164, `sdkConfig = loaded` verbatim) + `applyAuth` (l.146, `client.auth.set` per provider). The verbatim config flows to `opencode serve` via `OPENCODE_CONFIG_CONTENT`; opencode then sends the credential as a Bearer token to `options.baseURL`/`options.endpoint` (`provider.ts` l.331–334: `endpoint = options.endpoint ?? options.baseURL`).

This is the **classic LLM-gateway SSRF / key-exfil class** (LiteLLM CVE family, EdgeOne/Ollama spoofing, OWASP-LLM). Industry guidance converges on: **allowlist trusted hosts + protocol/port, block private ranges, and never send credentials to an unvetted endpoint** (Stytch, Render, escape.tech, Security Boulevard 2026).

### B1 (RECOMMENDED): Validate `provider.*.options.baseURL`/`endpoint` against an allowlist before passing config to the SDK; reject (fail-closed) on mismatch

Add a config-sanitization pass in `buildSdkConfig` that, for every `provider.<id>.options.{baseURL,endpoint,enterpriseUrl}` present in the _consumer-supplied_ config:

1. Parse the URL; **require `https:`** scheme.
2. **Reject** hosts that resolve to / are literal private, loopback, link-local, or metadata ranges: RFC1918 (10/8, 172.16/12, 192.168/16), 127/8, `::1`, `169.254.0.0/16` (incl. `169.254.169.254` cloud metadata), `*.internal`, bare hostnames. (escape.tech/LiteLLM lesson: check the _nested_ value, not just top level — fact: opencode reads it from `provider.<id>.options`, so validate there, and also any `litellm`-style nesting if MCP/providers add it.)
3. **Allowlist** the canonical host for the provider id. OpenCode resolves default provider API hosts from the **models.dev catalog** (only Azure carries an inline baseURL in `provider.ts`); there is no hardcoded per-provider host list in this repo to copy. So the allowlist should be: _(a)_ a small curated set of known provider hosts (api.openai.com, api.anthropic.com, api.githubcopilot.com, generativelanguage.googleapis.com, bedrock._.amazonaws.com, _.cognitiveservices.azure.com, openrouter.ai, etc.), maintained as a constant, **plus** _(b)_ an explicit consumer opt-in input (e.g. `allowed_provider_hosts`) for self-hosted gateways/enterprise proxies — which are a legitimate, common case (the repo already has `paid_subscription_providers` for enterprise gateways).

### B2 (RECOMMENDED companion): Refuse to attach auth when a non-allowlisted custom baseURL is set

Even if B1 is bypassed by some nesting, `applyAuth` should **skip `client.auth.set` for any provider whose effective baseURL is not on the allowlist** (fail-closed: the provider simply won't authenticate, so no key leaves). This is the "require user-supplied key for custom baseURL / don't forward server creds to custom endpoints" pattern from the SSRF write-ups. Combining B1 (reject config) + B2 (don't attach creds) is belt-and-suspenders.

### B3 (alternative, weaker): warn-only / log the custom baseURL

Rejected as a _sole_ control — a warning does not stop exfiltration (the key still ships). Acceptable only as telemetry _alongside_ B1/B2.

### B4 (alternative): block at network layer (egress allowlist)

Strong but out of scope for a Docker action that can't assume the consumer's network policy. Worth a _doc note_ recommending consumers add egress filtering, but the Action must self-defend at the config layer (B1/B2).

**What breaks / preserve:** Enterprise users with legitimate gateways (Bedrock proxies, Azure resource URLs, corporate LiteLLM) MUST have an opt-in (`allowed_provider_hosts`) or B1 will break them. Azure's baseURL is _derived_ from `resourceName` (provider.ts l.274) — ensure the allowlist accommodates `*.cognitiveservices.azure.com` and `*.openai.azure.com`.

> **RC-B recommended approach (summary):** Fail-closed validation in `buildSdkConfig`: require https, block private/metadata IP ranges, allowlist known provider hosts + an explicit `allowed_provider_hosts` opt-in for enterprise gateways (B1); and as a second gate, have `applyAuth` skip credential attachment for any provider whose baseURL isn't allowlisted (B2). Never warn-only.

---

## MEDIUM-1 — `timeout_minutes` does not bound the validation-retry loop; only SIGTERM/SIGINT abort

**Codebase pointers:** `src/index.ts` (`shutdownController` l.8, only `.abort()` on signals l.103–124); `src/runner.ts` (`runValidationLoop` l.139, per-call `timeoutMs` passed to each `runSession`/`sendFollowUp` but **no aggregate wall-clock**); `validation_retries` up to 20 (`action.yml` l.31).

Each individual call already has a `timeoutMs`, but N retries × per-call timeout can far exceed `timeout_minutes`. The idiomatic Node fix is a **single global deadline AbortSignal** combined with the existing shutdown signal.

### M1 (RECOMMENDED): Add a wall-clock `AbortSignal.timeout(timeoutMs)` and combine with `shutdownController` via `AbortSignal.any`

Node 20 (Docker runtime) supports both `AbortSignal.timeout()` and `AbortSignal.any()` (verified: present in installed Node; stable since Node 20.3 / 19). Pattern:

```js
// index.ts — one deadline for the whole run
const deadlineSignal = AbortSignal.timeout(inputs.timeoutMs);
const combined = AbortSignal.any([shutdownController.signal, deadlineSignal]);
// pass `combined` everywhere `shutdownController.signal` goes today
```

Every `runSession`/`sendFollowUp`/validation child already honors an `abortSignal` (they `addEventListener('abort', …)`), so threading the combined signal through makes the deadline propagate to in-flight provider calls and validation child processes immediately — no new plumbing. The retry loop must also check `combined.aborted` at the top of each iteration (cheap guard) so it stops spawning new attempts once the deadline passes.

**What breaks / preserve:** distinguish _timeout_ from _user-cancel_ in the result status (`action.yml` declares both `cancelled` and `timeout` statuses). `AbortSignal.timeout` aborts with a `TimeoutError` `reason`; check `signal.reason?.name === 'TimeoutError'` to map to status `timeout` vs `cancelled`. Keep `shutdownController` for the signal path; the deadline is additive.

### M1-alt: manual `setTimeout(() => controller.abort(), timeoutMs)` on a fresh controller

Functionally equivalent, slightly more code (must `clearTimeout` on normal completion to avoid a dangling timer keeping the loop alive). `AbortSignal.timeout` self-clears. Prefer M1.

> **MEDIUM-1 recommended approach (summary):** Create one `AbortSignal.timeout(timeoutMs)` deadline, merge it with `shutdownController.signal` via `AbortSignal.any`, thread the combined signal everywhere the shutdown signal currently flows, and guard the retry-loop head with `combined.aborted`. Map `TimeoutError` reason → status `timeout`.

---

## MEDIUM-2 — Agent output to job summary via `core.summary.addRaw()`; markdown links render (phishing)

**Codebase pointer:** `src/summary-writer.ts` → `writeJobSummary` l.122–130, `addRaw(scrubbed)`. `core.summary` escapes HTML but **renders markdown** — so `[Click here](https://evil.example)` and image links from untrusted agent text become live/phishing links in the job summary.

### S1 (RECOMMENDED): Render the final assistant message inside a fenced code block (`addCodeBlock`) instead of `addRaw`

`core.summary.addCodeBlock(text)` (or wrapping in <pre> via `addRaw('```\n'+text+'\n```')`) renders the agent text as **inert preformatted text** — no link/image rendering, no markdown interpretation — while staying readable. This neutralizes phishing links and rogue images with one call and is the lowest-risk fix. The transcript artifact (JSON) still preserves full fidelity for those who need it.

### S2 (alternative): sanitize markdown — strip/De-fang links & images before `addRaw`

Escape `]`/`)`/`!`, or regex-neutralize `[...](...)` and `![...](...)`. More code, easy to get wrong (markdown has many link forms: autolinks `<http://…>`, reference links, HTML `<a>` already escaped by core). Code-block (S1) is strictly simpler and more robust. Use S2 only if rendered markdown (headings/bold) in the summary is a hard product requirement.

### S3 (alternative): keep `addRaw` but prepend a visible "untrusted AI output" banner

Defense-in-awareness only; does not stop a user from clicking. Acceptable as an _addition_ to S1, not a replacement.

**Preserve:** keep the existing `scrubSecrets` + `truncateString` pass (summary-writer l.115) — code-blocking is _in addition to_ secret scrubbing, not instead of. Note the secret scrubber only knows declared `env_vars` (see cross-cutting note below).

> **MEDIUM-2 recommended approach (summary):** Replace `addRaw(scrubbed)` with a fenced code block (`addCodeBlock`) so untrusted agent markdown is rendered inert; keep secret-scrubbing + truncation. Optionally add an "untrusted output" banner.

---

## Cross-cutting — Ambient-secret scrubbing (relates to RC-A & MEDIUM-2)

**Codebase pointers:** `src/security.ts` → `maskSecrets` (l.88, only masks declared `env_vars`), `scrubSecrets` (l.124). The scrubber/masker only knows secrets it was _given_ (`inputs.envVars`). RC-A exploits surface secrets it was **not** given (GITHUB_TOKEN, auth.json contents) → they land unmasked.

### C1 (RECOMMENDED, primary): Eliminate the secrets at the source, don't chase them in output

The right fix is RC-A's env scoping + bash denial so the secrets never enter the agent's reach to begin with. Output-side scrubbing is a fragile backstop (you can't scrub what you can't enumerate). Prioritize prevention.

### C2 (RECOMMENDED, backstop): Auto-mask known runner secrets the Action _can_ enumerate

The Action _does_ know some ambient secrets it can defensively `core.setSecret()` even though they weren't passed as `env_vars`: `GITHUB_TOKEN`/`INPUT_GITHUB_TOKEN` if present, and the values it reads from the mounted `auth.json` (it parses them in `applyAuth`). Feed those into the same mask/scrub set used for transcript + summary. This closes the "auth.json provider keys appear unmasked" leak for the _output_ path even if the read happens. Low effort, high value.

### C3 (alternative, use with caution): token-shaped heuristic detection

Regex for high-entropy / known token prefixes (`ghp_`, `gho_`, `github_pat_`, `sk-`, `xox[baprs]-`, AWS `AKIA…`, JWT `eyJ…`) and redact matches in transcript/summary. **Caveats:** false positives (redacting legitimate output), false negatives (custom token formats), and it's a treadmill. Use as _extra_ defense layered on C2, never as the primary control. The existing `sanitizeErrorMessage` (security.ts l.99–105) already does crude `[A-Za-z0-9]{32,}` → `[REDACTED]` for error messages — C3 would generalize that idea but should stay conservative to avoid mangling normal output.

> **Cross-cutting recommended approach (summary):** Prevention first (RC-A) — keep secrets out of agent reach. As a backstop, auto-`setSecret` the runner secrets the Action can enumerate (GITHUB_TOKEN + parsed auth.json values) so they're masked in transcript/summary even if read; add conservative token-shape redaction only as an extra layer.

---

## Non-root container (RC-A / A4) — Docker GitHub Action

**Codebase pointer:** `Dockerfile` runtime stage (no `USER`); `WORKDIR /github/workspace`; entrypoint `entrypoint.sh` runs `node /app/dist/index.js`.

**The GitHub Actions UID pitfall (well-documented, 2025):** GitHub-hosted runners check out the workspace owned by the runner user (UID **1001** on `ubuntu-latest`); `RUNNER_TEMP` and `/__w/_temp/_runner_file_commands/` are likewise owned by that UID. A container action that drops to a _different_ non-root UID gets **`permission denied`** writing the workspace, `$GITHUB_OUTPUT`, `$GITHUB_ENV`, and temp files (actions/checkout#956, actions/runner#2411, #4302, runner-images#10915).

### N1 (RECOMMENDED): Add a non-root `USER` whose UID matches the runner (1001), creating the user in the Dockerfile

```dockerfile
# runtime stage
RUN groupadd -g 1001 runner && useradd -m -u 1001 -g 1001 runner
# ... copy app, chown as needed ...
USER 1001
```

UID 1001 matches `ubuntu-latest`, so workspace + RUNNER_TEMP writes keep working while the agent no longer runs as root. This directly shrinks RC-A blast radius: non-root bash can't read other users' `/proc/*/environ`, root-owned mounts, etc.

**What breaks / preserve / RISKS (flag for architect):**

- **UID is runner-specific.** Self-hosted runners and future GitHub image changes may use a different UID (some use 1000). A hardcoded `USER 1001` can break on non-standard runners. Mitigations: (i) document the assumption; (ii) keep an entrypoint that can `chown`/adjust before dropping privileges (but the action starts as whatever `USER` is set — can't re-escalate). The common community pattern is **build-time `ARG UID`/`GID`**, but a published Action image is built once, so a runtime approach is safer: start the entrypoint as root, `chown` what's needed, then `gosu`/`su-exec` down to a non-root user for the Node process. This keeps workspace writes working across UID variance. **This is the most robust option and the recommended one if the team wants resilience over simplicity.**
- Tool autoinstall (gopls, Java LSP) writes to `$GOPATH`/`$HOME` — ensure those dirs are writable by the chosen user (the Dockerfile sets `GOPATH=/root/go`; under non-root this must move to the new user's HOME or be pre-created + chowned).
- `git config --global --replace-all safe.directory '*'` in `entrypoint.sh` runs per-user — fine, runs as the effective user.

### N2 (alternative): keep root but add `--cap-drop`, read-only rootfs, restricted mounts

Container actions don't let the _action author_ control `docker run` flags (the runner controls them), so this is **not available** to a published Docker action. Rejected.

> **Non-root recommended approach (summary):** Run the Node process as a non-root user. Simplest: `USER 1001` (matches `ubuntu-latest`). Most robust across runner UID variance: keep `entrypoint.sh` starting as root, `chown` workspace/temp/HOME/GOPATH as needed, then drop to a non-root user via `gosu`/`su-exec` for `node`. Pre-create + chown `$HOME`, `$GOPATH`, and the opencode XDG data dir so LSP autoinstall and auth still work. Flag the UID-mismatch risk for self-hosted runners to the architect.

---

## Secondary (Q7) — OpenCode-native config that addresses several findings at once

- **`config.permission` (object form)** is the single highest-leverage native lever: setting `bash`/`webfetch`/`websearch` to `deny` (with last-match-wins ordering) addresses the RCE and the bash-driven secret/auth.json reads in one place (RC-A). This is OpenCode-native and version-correct (`PermissionConfig`, gen types).
- **`config.tools: { bash: false, webfetch: false }`** (top-level boolean tool map) is a coarser companion that disables the tools outright rather than gating them. Either works; `permission` is finer-grained (allows the opt-in story for A2).
- **No native process sandbox** exists in this version (fact #4) — do NOT plan around an OpenCode "sandbox mode"; containment must be container/permission based.
- **Per-`agent` `permission`/`tools`** could scope a dedicated CI agent, but the Action uses the default agent; not worth the complexity vs. global `config.permission`.
- **`config.experimental.policies`** (`ConfigV2ExperimentalPolicy`, gen types l.971) exists but is undocumented/experimental — do not depend on it for a security control.

> **Q7 summary:** `config.permission` (deny bash/webfetch/websearch, correct ordering) is the one native knob that covers the most ground; pair with `config.tools` if you want hard-off. No native sandbox — rely on container non-root + env scoping for the rest.

---

## Sources

**Local source (authoritative for version-correctness):**

- `node_modules/@opencode-ai/sdk/dist/v2/server.js` (env spread + `OPENCODE_CONFIG_CONTENT`)
- `node_modules/@opencode-ai/sdk/dist/v2/server.d.ts` / `gen/types.gen.d.ts` (`ServerOptions`, `PermissionConfig`, `ProviderConfig.options.baseURL`)
- `~/Work/GIT/Personal/Sources/opencode/packages/core/src/global.ts` (XDG data path)
- `~/.../opencode/packages/opencode/src/auth/index.ts` (auth.json on disk)
- `~/.../opencode/packages/opencode/src/provider/provider.ts` (env-read creds, baseURL/endpoint precedence)
- `~/.../opencode/packages/opencode/src/file/protected.ts` (no real bash sandbox)
- This repo: `src/opencode.ts`, `src/validation.ts`, `src/security.ts`, `src/summary-writer.ts`, `src/runner.ts`, `src/index.ts`, `Dockerfile`, `entrypoint.sh`, `action.yml`

**Web (current best practice, 2025–2026):**

- OpenCode Permissions docs — last-match-wins, `*` wildcard, bash/webfetch/websearch keys: https://open-code.ai/en/docs/permissions
- Docker — AI Coding Agent Horror Stories (restrict what it _has_): https://www.docker.com/blog/ai-coding-agent-horror-stories-security-risks/
- Knostic — AI Coding Agent Security threat models: https://www.knostic.ai/blog/ai-coding-agent-security
- Brian Gershon — Permission controls & credential protection: https://www.briangershon.com/blog/securing-ai-coding-tools/
- CrabTalk — Sandboxing AI agents beyond Docker/WASM: https://crabtalk.ai/blog/agent-sandbox-permissions
- escape.tech — SSRF in LiteLLM (nested-param bypass, key-exfil class): https://escape.tech/blog/how-escape-exploited-ssrf-in-litellm/
- Security Boulevard — LiteLLM SSRF pentest: https://securityboulevard.com/2026/05/how-escape-ai-pentesting-exploited-ssrf-in-litellm/
- Render — Security best practices for AI agents (deny egress by default, allowlist hosts): https://render.com/articles/security-best-practices-when-building-ai-agents
- Stytch — Securing identity APIs against SSRF (allowlist + block private ranges): https://stytch.com/blog/securing-identity-apis-against-ssrf/
- GitHub Actions non-root container UID issues: https://github.com/actions/checkout/issues/956 · https://github.com/actions/runner/issues/2411 · https://github.com/actions/runner/issues/4302 · https://github.com/actions/runner-images/issues/10915
- Splines — GitHub Actions with non-root Docker user: https://splines.me/blog/2025/github-actions-non-root
- Better Stack — Understanding AbortController in Node.js: https://betterstack.com/community/guides/scaling-nodejs/understanding-abortcontroller/
- Node.js Timers docs (`AbortSignal.timeout`): https://nodejs.org/api/timers.html

---

## One-paragraph overall recommendation

Treat Epic 13 as **layered, secure-by-default containment** rather than any single patch. The two CRITICAL root causes need different shapes of fix: **RC-A** is defense-in-depth — scope the agent server's `process.env` to an allowlist around `createOpencode` (cheap, enabled by the SDK's `...process.env` spread), flip tool permissions to **default-deny bash/webfetch/websearch with explicit opt-in inputs** (and _invert the permission-merge_ so Action rules win under OpenCode's last-match-wins semantics), and drop the container to a **non-root user (UID 1001, or root→gosu drop for runner-UID resilience)** — because env scoping alone does NOT stop the on-disk `auth.json`/`.git/config` reads, only denying bash or removing root+mounts does. **RC-B** is a textbook gateway-SSRF/key-exfil fix — fail-closed allowlist of provider `baseURL` hosts (https-only, block private/metadata ranges) in `buildSdkConfig`, plus refusing to attach credentials to any non-allowlisted endpoint in `applyAuth`, with an `allowed_provider_hosts` opt-in for legitimate enterprise gateways. The two MEDIUMs are small and unambiguous: a single `AbortSignal.timeout` merged via `AbortSignal.any` to make `timeout_minutes` a hard ceiling, and rendering the final message in an inert code block instead of `addRaw`. The one place the best fix collides with a product constraint is **denying bash by default**, which will break workflows that legitimately run tests/builds — that decision (default-deny + opt-in vs. keep-bash + rely on containment) is the architect's to make, and it should be made explicitly because the auto-approve-everything permission handler currently makes `"ask"` meaningless in CI.
