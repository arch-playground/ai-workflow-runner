# Story 13.4: Provider baseURL Allowlist + Refuse-Auth

Status: ready-for-dev

## Story

As an **operator**,
I want **the Action to refuse to send my provider credentials to an endpoint I didn't vet**,
So that **a consumer-supplied `opencode_config` that redirects a provider `baseURL` to an attacker host cannot exfiltrate my API key (closes the CRITICAL AGENT-04 / FINDING-1)**.

## Background

**Red-team finding (verified, CRITICAL):** a consumer `opencode_config` can set `provider.<id>.options.baseURL`; the Action passes the config to the SDK **verbatim** (`buildSdkConfig`, `sdkConfig = loaded`) while attaching the org's credential via `applyAuth` → `client.auth.set`. A live capture proved the OpenAI key egresses as a `Bearer` token to the attacker URL, and the run reports `success` (silent). This is the classic LLM-gateway SSRF / key-exfil class.

**Design (RC-B, B1+B2):** fail-closed validation of provider base URLs + refuse to attach auth to a non-allowlisted endpoint. Enterprise gateways (Bedrock/Azure/LiteLLM) are legitimate, so an `allowed_provider_hosts` opt-in input extends the allowlist.

**ai-memory constraint (D7 / non-hardcoded-providers):** the curated host allowlist is a SECURITY control, NOT a provider-classification list — it must NOT bleed into the model-filter/free-detection logic. Keep it a small, override-able constant in `security.ts`. `api.githubcopilot.com` MUST be on the default allowlist (Copilot-never-blocked invariant — our funcval model).

**Scope boundary:** baseURL validation + auth-attachment gating ONLY. Do NOT touch permissions/env/container (13-1/2/3 done), timeout (13-5), summary (13-6).

## Acceptance Criteria

1. **Host allowlist constant.** A curated default set of known provider hosts in `security.ts` (e.g. `api.openai.com`, `api.anthropic.com`, `api.githubcopilot.com`, `generativelanguage.googleapis.com`, `openrouter.ai`, `*.cognitiveservices.azure.com`, `*.openai.azure.com`, `bedrock*.amazonaws.com`, opencode-zen / `opencode.ai` if applicable). Documented as a security control, not a pricing/subscription list. **`api.githubcopilot.com` is present** (Copilot-never-blocked).

2. **`allowed_provider_hosts` input.** New action input (comma-separated host globs, default empty) parsed in config.ts → `ActionInputs.allowedProviderHosts: string[]` (mirror `subscription_providers`). These EXTEND the default allowlist.

3. **baseURL validation in `buildSdkConfig`.** After loading consumer `opencode_config`, for every `provider.<id>.options.baseURL` (and `endpoint`, `enterpriseUrl` if present) in the **consumer-supplied** config:
   - require `https:` scheme (reject `http:` except possibly explicit localhost? — no: reject non-https outright for credentialed providers).
   - reject hosts that are/resolve to private/loopback/link-local/metadata ranges: RFC1918 (10/8, 172.16/12, 192.168/16), 127/8, `::1`, `169.254.0.0/16` (incl. `169.254.169.254`), `*.internal`, bare hostnames with no dot.
   - the host must match the allowlist (default ∪ `allowed_provider_hosts`). Glob match for wildcard entries (`*.azure.com`).
   - On mismatch: **fail-closed** — throw a clear error (`Invalid provider baseURL: <host> is not an allowed provider host (set allowed_provider_hosts to permit it)`), caught by the existing error path + sanitized. Do NOT silently proceed.

4. **Refuse auth for non-allowlisted endpoint (belt-and-suspenders).** In `applyAuth`, before `client.auth.set` for a provider, if that provider's effective baseURL (from the loaded config) is set and NOT allowlisted, SKIP the auth.set for it and `core.warning` (so the key never leaves even if B1 is somehow bypassed). Providers with no custom baseURL (default host) are unaffected.

5. **Default behavior unchanged.** With no custom baseURL (the common case — provider uses its default host), nothing changes: auth attaches, the run works, Copilot/gpt-5-mini runs. The fallback chain (Epic 11) still works for allowlisted hosts (D8 — auth still from auth_config).

6. **Azure/Bedrock derivation accommodated.** Azure's baseURL derives from `resourceName` → `*.cognitiveservices.azure.com`/`*.openai.azure.com`; ensure those globs cover it. Bedrock host patterns covered.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, error-handling (errors bubble; throw + sanitize), commenting, validation, security, unit-testing standards.
  - [ ] Load skills: `typescript-clean-code`, `typescript-unit-testing`. Read design `security-hardening-design-2026-06-02.md` → RC-B; research `security-hardening-research-2026-06-01.md` → RC-B (B1/B2, private-range list).

- [ ] **Task 2: Host allowlist + validator in `security.ts`** (AC: 1, 3, 6)
  - [ ] `DEFAULT_PROVIDER_HOSTS` constant (curated, documented as security-not-pricing). Export `validateProviderBaseUrl(url: string, allowedHosts: string[]): void` (throws on invalid) and `isAllowedProviderHost(host, allowedHosts): boolean`. Implement: parse URL, require https, reject private/metadata ranges (literal IP checks + hostname heuristics), glob-match host against default ∪ allowed.
  - [ ] A helper to extract all `provider.*.options.{baseURL,endpoint}` from a loaded config object (defensive against nesting/missing).

- [ ] **Task 3: `allowed_provider_hosts` input** (AC: 2)
  - [ ] action.yml input + config.ts parse → `allowedProviderHosts: string[]` on ActionInputs (mirror subscription_providers). Thread to `InitializeOptions`.

- [ ] **Task 4: Wire validation into `buildSdkConfig` + refuse-auth in `applyAuth`** (AC: 3, 4, 5)
  - [ ] `buildSdkConfig`: after loading consumer config, iterate provider baseURLs and `validateProviderBaseUrl` each (throw on invalid). Only validate CONSUMER-supplied baseURLs (a default-host provider has none).
  - [ ] `applyAuth`: skip `client.auth.set` for a provider whose configured baseURL isn't allowlisted; `core.warning`. (Thread the loaded config / allowed hosts to applyAuth.)

- [ ] **Task 5: Unit tests** (AC: 1–6)
  - [ ] validator: https required (http rejected); private/loopback/link-local/metadata (incl 169.254.169.254) rejected; bare hostname rejected; allowed default host passes; `allowed_provider_hosts` extends; Azure/Bedrock globs match; `api.githubcopilot.com` passes (Copilot).
  - [ ] buildSdkConfig: consumer baseURL to attacker host → throws; default-host config → no throw; nested/missing options handled.
  - [ ] applyAuth: non-allowlisted baseURL → auth.set NOT called for that provider (mock); allowlisted/default → called.
  - [ ] config.ts: allowed_provider_hosts parsed.

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **Fail-closed:** reject the config (throw) AND refuse auth — belt-and-suspenders per the design. A warning alone does NOT stop exfiltration (the key still ships) — never warn-only.
- **Validate the NESTED value** (`provider.<id>.options.baseURL`), not just a top-level field — the SSRF write-ups show top-level-only checks get bypassed by nesting.
- **D7/non-hardcoded:** the host allowlist is security-only. Put a comment so a future reader doesn't fold it into model-filter.ts. Keep it small + override-able via the input.
- **Copilot invariant:** `api.githubcopilot.com` on the default list — funcval (gpt-5-mini) will catch a regression.
- **Private-range checks:** literal IP parsing for 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1; plus reject hostnames ending `.internal`/`.local` and bare single-label hosts. Don't do DNS resolution at validate time (a host could resolve to a private IP later — note this as a residual risk; the allowlist is the primary control, the private-range check is for literal-IP baseURLs).
- Conventions: named exports, `.js` imports, throw + `sanitizeErrorMessage`; coverage ≥80%/75%. Backward compatible (default-host providers unaffected).

### References

- [Source: epics.md#Story 13.4] · [Source: prd.md#FR70]
- [Source: research/security-hardening-design-2026-06-02.md → RC-B (B1+B2)]
- [Source: research/security-hardening-research-2026-06-01.md → RC-B, private-range/metadata list, Azure resourceName derivation]
- [Source: docs/tests/TC-REDTEAM-agent-execution.md → AGENT-04 (acceptance oracle)]
- Current: `src/opencode.ts:buildSdkConfig` (verbatim config load), `applyAuth`; `src/config.ts` (subscription_providers pattern); `src/security.ts`

## Dev Agent Record

### Agent Model Used

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
