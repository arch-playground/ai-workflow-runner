# Story 13.9: Webfetch Per-Domain Allowlist (via OPENCODE_PERMISSION env)

Status: ready-for-dev

## Story

As an **operator**,
I want **to allow the agent's `webfetch` for a trusted set of domains (e.g. github.com, google.com) rather than a blunt on/off**,
So that **knowledge-extraction workflows can fetch from vetted sources while attacker-chosen URLs are denied**.

## Background

13-2 set `webfetch: 'deny'` (blunt). Research (`webfetch-domain-allowlist-research-2026-06-02.md`) found a **per-domain allowlist IS achievable at runtime**, but with a catch:

- The webfetch tool submits the URL as a permission _pattern_ (`webfetch.ts:39`); the engine matches per-URL via `Wildcard.match`. So per-domain rules work.
- BUT the _documented_ `Config.permission.webfetch` is typed tri-state `Action` — an **object form crashes strict decode** (do NOT put it in `opencode_config`).
- The working lever: the **`OPENCODE_PERMISSION` env var** is `JSON.parse`'d and merged AFTER schema validation and never re-validated (`config.ts:748`), so the object form survives. The SDK spreads `...process.env` onto `opencode serve`, so the Action just sets this env var.

**This rides a type-hidden runtime behavior** → it MUST be gated by a smoke test and tied to the SDK-currency guard.

**Scope boundary:** webfetch domain allowlist ONLY (the OPENCODE_PERMISSION env injection + input + gating test). Do NOT touch other permissions, env scoping, container, baseURL, write-deny (13-10).

## Acceptance Criteria

1. **`webfetch_allowed_domains` input.** New action input (comma-separated host globs, default empty). Parsed in config.ts → `ActionInputs.webfetchAllowedDomains: string[]` (mirror existing list inputs). Threaded to `InitializeOptions`.

2. **Compile to OPENCODE_PERMISSION webfetch rules.** When `webfetch_allowed_domains` is non-empty, build a webfetch rule object: each domain → `"https://<domain>/*": "allow"` (and optionally `"https://*.<domain>/*"` for subdomains if a leading-dot/glob is given), with a final `"*": "deny"` LAST (findLast precedence — allows first, deny last). Empty input ⇒ webfetch stays fully denied (the 13-2 default; no env var needed).

3. **Inject via the env var (NOT opencode_config).** Set `OPENCODE_PERMISSION` on the spawned server's env — i.e. on `scopedEnv` in `opencode.ts:doInitialize` right where `OPENCODE_EXPERIMENTAL_LSP_TOOL` is set (l.151), so it reaches `opencode serve`. The JSON must be scoped to `webfetch` ONLY (it mergeDeeps across all permission keys — do NOT include bash/external_directory/etc., which are governed via opencode_config). Do NOT set the env var when `webfetch_allowed_domains` is empty.

4. **Do NOT put the object in opencode_config.permission.webfetch** — strict decode crashes the server. Keep `permissions.ts` `webfetch: 'deny'` as-is (it's the baseline; the env var augments/overrides at runtime for allowed domains).

5. **Gating smoke test (MANDATORY — this feature rides type-hidden behavior).** A test (unit-level where possible, real-container at epic-end) asserting: with `webfetch_allowed_domains=github.com`, an `https://github.com/...` fetch is ALLOWED and an off-list `https://evil.example/...` fetch is DENIED (`DeniedError`/refused). The feature is gated on this — if the env-merge behavior breaks on an SDK bump, this test fails loudly.

6. **Builder unit-tested.** The domain→rules compiler: empty → no env / no rules; single domain → allow glob + deny catch-all in correct order; multiple domains; subdomain glob handling; the JSON is valid and scoped to webfetch only.

7. **SDK-currency tie-in.** A note/comment (and ideally a hook into the Epic 12 currency guard) that this behavior must be re-verified on opencode upgrades. Document the `tool.execute.before` plugin fallback (from the research) if the env-merge behavior ever breaks.

8. **Backward compatible.** Default (empty input) = webfetch denied (unchanged from 13-2). Copilot/gpt-5-mini run unaffected (webfetch isn't used by a normal model call).

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, commenting, validation, security, unit-testing. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [ ] Read `research/webfetch-domain-allowlist-research-2026-06-02.md` IN FULL (the mechanism + evidence + the plugin fallback) and design doc → webfetch bullet.

- [ ] **Task 2: Input + rule compiler** (AC: 1, 2, 6)
  - [ ] action.yml `webfetch_allowed_domains` input; config.ts parse → `webfetchAllowedDomains: string[]` on ActionInputs; thread to InitializeOptions.
  - [ ] A builder (in `permissions.ts`, near the existing policy) e.g. `buildWebfetchPermissionEnv(domains: string[]): string | undefined` → returns the JSON string `{"webfetch": { "https://<d>/*":"allow", …, "*":"deny" }}` (scoped to webfetch only), or `undefined` when domains is empty.

- [ ] **Task 3: Inject OPENCODE_PERMISSION** (AC: 3, 4)
  - [ ] In `opencode.ts:doInitialize`, after building `scopedEnv` (l.149) and near the LSP flag (l.151): `const webfetchEnv = buildWebfetchPermissionEnv(options?.webfetchAllowedDomains ?? []); if (webfetchEnv) scopedEnv['OPENCODE_PERMISSION'] = webfetchEnv;`. Confirm it survives the scopedEnv/restore bracket (it's set ON scopedEnv, so yes). Keep permissions.ts webfetch:'deny' untouched.

- [ ] **Task 4: Gating smoke test + builder tests** (AC: 5, 6)
  - [ ] permissions.spec.ts: builder — empty → undefined; single/multi domain → correct allow-first/deny-last JSON scoped to webfetch; valid JSON.
  - [ ] opencode.spec.ts: when webfetchAllowedDomains set, `OPENCODE_PERMISSION` is present on the env at server spawn (assert via the createOpencodeServer mock capturing process.env); when empty, NOT set.
  - [ ] The real-container allow/deny smoke test (off-list → denied, on-list → allowed) is documented for the epic-end funcval (13-8) since it needs a live agent + network; note it here.

- [ ] **Task 5: Docs + currency note** (AC: 7)
  - [ ] Brief comment in the builder + a note in the threat-model docs (or here) that this rides `OPENCODE_PERMISSION` post-validation merge (config.ts:748), re-verify on opencode bumps (Epic 12 guard), plugin fallback documented.

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **Why the env var, not opencode_config:** the documented `permission.webfetch` is typed `Action` (tri-state) — an object crashes strict decode (research evidence #4/#5). `OPENCODE_PERMISSION` is `JSON.parse`'d post-validation, not re-decoded (config.ts:748), so the object survives. Verified for 1.15.13.
- **Scope the JSON to webfetch ONLY** — `OPENCODE_PERMISSION` mergeDeeps across ALL permission keys, so including bash/external_directory would override what we set via opencode_config. Only `{"webfetch": {...}}`.
- **Order: allow-globs first, `"*":"deny"` last** (findLast precedence).
- **The smoke test is the safety net** — this is the one place we depend on a type-hidden runtime behavior. Gate the feature on it; if a future opencode bump breaks the merge, the test fails and we switch to the `tool.execute.before` plugin fallback (research Option B).
- The env var is set on `scopedEnv` which the 13-1 bracket assigns to `process.env` before the spawn and restores after — so OPENCODE_PERMISSION reaches the child and doesn't leak to the Action's later code. (It's Action-set, not ambient, so it needn't be in buildScopedEnv's allowlist.)
- Conventions: named exports, `.js` imports; coverage ≥80%/75%. Backward compatible (empty input = denied).

### References

- [Source: epics.md#Story 13.9] · [Source: prd.md#FR68]
- [Source: research/webfetch-domain-allowlist-research-2026-06-02.md (full — mechanism, OPENCODE_PERMISSION, plugin fallback)]
- [Source: research/security-hardening-design-2026-06-02.md → webfetch bullet]
- Current: `src/opencode.ts:149-158` (scopedEnv + LSP flag injection point), `src/permissions.ts:123` (webfetch:'deny'), `src/config.ts` (list-input parse pattern)

## Dev Agent Record

### Agent Model Used

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
