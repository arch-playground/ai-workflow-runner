---
baseline_commit: 35294e9a58935ddb7a4f1522e367548cd6861210
---

# Story 13.9: Webfetch Per-Domain Allowlist (via OPENCODE_PERMISSION env)

Status: review

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

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] coding-style, commenting, validation, security, unit-testing. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [x] Read `research/webfetch-domain-allowlist-research-2026-06-02.md` IN FULL (the mechanism + evidence + the plugin fallback) and design doc → webfetch bullet.

- [x] **Task 2: Input + rule compiler** (AC: 1, 2, 6)
  - [x] action.yml `webfetch_allowed_domains` input; config.ts parse → `webfetchAllowedDomains: string[]` on ActionInputs; thread to InitializeOptions.
  - [x] A builder (in `permissions.ts`, near the existing policy) e.g. `buildWebfetchPermissionEnv(domains: string[]): string | undefined` → returns the JSON string `{"webfetch": { "https://<d>/*":"allow", …, "*":"deny" }}` (scoped to webfetch only), or `undefined` when domains is empty.

- [x] **Task 3: Inject OPENCODE_PERMISSION** (AC: 3, 4)
  - [x] In `opencode.ts:doInitialize`, after building `scopedEnv` (l.149) and near the LSP flag (l.151): `const webfetchEnv = buildWebfetchPermissionEnv(options?.webfetchAllowedDomains ?? []); if (webfetchEnv) scopedEnv['OPENCODE_PERMISSION'] = webfetchEnv;`. Confirm it survives the scopedEnv/restore bracket (it's set ON scopedEnv, so yes). Keep permissions.ts webfetch:'deny' untouched.

- [x] **Task 4: Gating smoke test + builder tests** (AC: 5, 6)
  - [x] permissions.spec.ts: builder — empty → undefined; single/multi domain → correct allow-first/deny-last JSON scoped to webfetch; valid JSON.
  - [x] opencode.spec.ts: when webfetchAllowedDomains set, `OPENCODE_PERMISSION` is present on the env at server spawn (assert via the createOpencodeServer mock capturing process.env); when empty, NOT set.
  - [x] The real-container allow/deny smoke test (off-list → denied, on-list → allowed) is documented for the epic-end funcval (13-8) since it needs a live agent + network; note it here.

- [x] **Task 5: Docs + currency note** (AC: 7)
  - [x] Brief comment in the builder + a note in the threat-model docs (or here) that this rides `OPENCODE_PERMISSION` post-validation merge (config.ts:748), re-verify on opencode bumps (Epic 12 guard), plugin fallback documented.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

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

claude-sonnet-4-5 (bmad-auto sub-agent)

### Completion Notes List

- **Task 1:** Read webfetch research doc (full), security hardening design (webfetch bullet), unit-testing skill loaded.
- **Task 2:** Added `webfetch_allowed_domains` input to `action.yml`. Added `webfetchAllowedDomains: string[]` to `ActionInputs` in `types.ts`. Parsed in `config.ts` (comma-split/trim/filter pattern, identical to `allowedProviderHosts`). Added `buildWebfetchPermissionEnv(domains: string[]): string | undefined` to `permissions.ts` — produces `{"webfetch": {"https://<d>/*":"allow", ..., "*":"deny"}}` scoped to webfetch only; returns `undefined` for empty input. Added SDK-currency note + plugin-fallback reference in builder JSDoc comment.
- **Task 3:** Added `webfetchAllowedDomains?: string[]` to `InitializeOptions` in `opencode.ts`. Injected `OPENCODE_PERMISSION` on `scopedEnv` right after `OPENCODE_EXPERIMENTAL_LSP_TOOL` injection (l.151): `const webfetchEnv = buildWebfetchPermissionEnv(...); if (webfetchEnv) scopedEnv['OPENCODE_PERMISSION'] = webfetchEnv`. Threaded through both `initialize()` call sites in `runner.ts`. Kept `permissions.ts webfetch: 'deny'` untouched (13-2 baseline unchanged).
- **Task 4:** `permissions.spec.ts`: 6 new `buildWebfetchPermissionEnv` tests (empty/whitespace→undefined, single domain allow-first/deny-last, multi-domain, JSON scoped to webfetch only, whitespace filtering). `opencode.spec.ts`: 3 new `13-9-AC3` tests asserting OPENCODE_PERMISSION present/absent on env-at-spawn. `config.spec.ts`: 4 new `13-9-AC1` tests for domain parsing. Updated `webfetchAllowedDomains: []` in all ActionInputs fixtures in runner.spec.ts, index.spec.ts, runner-fallback-integration.spec.ts, config.spec.ts. Real-container allow/deny test documented for 13-8 epic-end funcval.
- **Task 5:** SDK-currency note + plugin-fallback (Option B) documented in builder comment. README inputs table updated with `webfetch_allowed_domains`. README + SECURITY.md opt-in surface tables updated.
- **Final Task:** lint clean, format unchanged, typecheck clean, 826 unit tests pass (up from 813).
- **AC4 note (webfetch in opencode_config crashes):** `permissions.ts webfetch:'deny'` remains a string (not object) — the env var injection is additive, not a replacement. No opencode_config change.
- **Real-container smoke test note (AC5):** The live allow/deny test (github.com URL → allowed, evil.example → DeniedError) requires a live opencode agent + network; documented for 13-8 epic-end funcval. The unit test (OPENCODE_PERMISSION present/absent on spawn env) is the unit-level gate.

### File List

- `action.yml` — added `webfetch_allowed_domains` input
- `src/types.ts` — added `webfetchAllowedDomains: string[]` to `ActionInputs`
- `src/config.ts` — parse `webfetch_allowed_domains` → `webfetchAllowedDomains`
- `src/permissions.ts` — added `buildWebfetchPermissionEnv()` builder + currency/fallback notes
- `src/opencode.ts` — added `webfetchAllowedDomains?` to `InitializeOptions`; OPENCODE_PERMISSION injection in `doInitialize`
- `src/runner.ts` — threaded `webfetchAllowedDomains` into both `initialize()` call sites
- `src/permissions.spec.ts` — 6 new `buildWebfetchPermissionEnv` tests
- `src/opencode.spec.ts` — 3 new `13-9-AC3` OPENCODE_PERMISSION env tests
- `src/config.spec.ts` — 4 new `13-9-AC1` domain-parse tests + `webfetchAllowedDomains: []` in fixtures
- `src/runner.spec.ts` — `webfetchAllowedDomains: []` in all ActionInputs fixtures
- `src/index.spec.ts` — `webfetchAllowedDomains: []` in ActionInputs fixture
- `src/runner-fallback-integration.spec.ts` — `webfetchAllowedDomains: []` in fixture
- `README.md` — added `webfetch_allowed_domains` to inputs table + opt-in surface table
- `SECURITY.md` — added `webfetch_allowed_domains` to opt-in surface table

## QA Results (leader code review + light funcval, 2026-06-02)

**Code review: PASS.** `buildWebfetchPermissionEnv` (permissions.ts): filters empty, `https://<domain>/*:allow` per domain + `*:deny` LAST (findLast), scoped to `{webfetch:...}` only, returns undefined when empty. Injection (opencode.ts:doInitialize): set on scopedEnv next to the LSP flag, inside the env bracket (reaches opencode serve, restored after); only when non-empty. permissions.ts `webfetch:'deny'` baseline untouched. Comment accurately documents the type-hidden OPENCODE_PERMISSION mechanism + webfetch-only scoping.

**Light funcval: PASS** — bundle builds; builder unit tests (empty→undefined, whitespace-filter, single/multi domain allow+deny-last, valid JSON) + OPENCODE_PERMISSION-on-env assertions present. 826/826 tests pass. The live real-container allow/deny webfetch smoke test (github allowed, off-list denied) is deferred to the 13-8 epic-end funcval per the story (needs a live agent + network) — it's the gating test for this type-hidden-behavior feature.

**Note:** leader completed the wrap-up (status→done, this QA note) — dev left it at in-progress (channel lag) but the work is complete + green + reviewed.
