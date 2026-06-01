# AI Workflow Runner — Enhancement Design (for review)

**Author:** Winston (System Architect) · **Date:** 2026-05-29 · **Status:** DRAFT — awaiting approval (decisions D1–D3 locked)
**Scope:** SDK currency, conversation logging + artifact export, model selection (disable free models), **provider fallback chain (start-of-conversation selection)**.

Grounded in: disk-level recon of the installed `@opencode-ai/sdk@1.15.12` type surface + 6-dimension web research, with every load-bearing claim adversarially fact-checked. Corrections from that fact-check are folded in below.

### Locked decisions (from review, 2026-05-29)

- **D1 — Fallback = mixed / cross-provider only.** No multi-keying of a single Copilot entitlement. The chain mixes a Copilot account with _other_ providers (Anthropic/OpenAI/etc.) as the tail. **ToS concern is fully sidestepped.**
- **D2 — Provider selection happens ONCE, at conversation start.** No mid-conversation failover. If the chosen provider fails to _start_ (auth invalid, or quota-exhausted before the first prompt lands), we advance to the next chain entry and start fresh; once a conversation is running we do **not** switch providers. → This eliminates the "can OpenCode resume a session on another provider" unknown and removes the LiteLLM-proxy option from contention.
- **D3 — Artifact = JSON only.** Export `conversation.json` (raw `messages` array). **No Markdown renderer.**

### Locked decisions round 2 (open-question defaults, 2026-06-01)

- **D4 — Free predicate includes cache-only-cost models.** A model with `cost.input===0 && cost.output===0` is "free" even if `cache.read/write > 0`. Rationale: it runs with no per-token charge for normal use; cache cost only applies to prompt-cache reuse and is negligible/edge. `disable_free_models` excludes it.
- **D5 — `fallback_config` supersedes `auth_config`+`model` when present.** Fully backward compatible: if `fallback_config` is omitted, current single-provider behavior is unchanged. Providing both `fallback_config` and `auth_config`/`model` → `fallback_config` wins, with a `core.warning` noting the override.
- **D6 — Artifact upload stays in the consuming workflow.** A Docker container action cannot self-upload artifacts. We expose `transcript_json_path` as an output and document the `actions/upload-artifact` step in examples. No composite wrapper.

### Locked decision round 3 (free vs subscription, 2026-06-01 — REVISED to NO hardcoding)

- **D7 — `disable_free_models` filters PER-MODEL by `cost==0` AND `provider.enabled.via !== "account"`. NO hardcoded provider list.** Found the authoritative mechanism by reading the OpenCode source (`~/Work/GIT/Personal/Sources/opencode`):
  - **OpenCode's own free signal is `cost.input === 0`** — literally `isFree = provider === "opencode" && (!cost || cost.input === 0)` in `packages/app/src/components/dialog-select-model.tsx:16`. (Their TUI only _labels_ the `opencode`/Zen provider, but the cost===0 test is the core of it.)
  - **The principled "is this a paid subscription?" signal is `provider.enabled.via`** — defined in `packages/core/src/provider.ts:85-99` as a union: `false | {via:"env"} | {via:"account", service} | {via:"custom"}`. A provider authenticated through a stored **account credential** (auth.json — exactly how Copilot, Anthropic, OpenAI are set up) is marked `enabled.via === "account"` by `packages/core/src/plugin/account.ts:31`. The opencode-provider plugin itself gates free-model enabling on this same `enabled.via === "account"` check (`packages/core/src/plugin/provider/opencode.ts`). **This is the non-hardcoded subscription signal we wanted.**
  - **Rule (no hardcoded names):**
    `isFilterableFree(model, provider) = model.cost?.input === 0 && model.cost?.output === 0 && provider.enabled?.via !== "account"`
    A provider with no `enabled.via` (catalog-only, not authenticated) is **not** account-authed → its free models ARE filterable. A provider you authenticated (`via: "account"`) keeps all its models.
  - **VERIFIED against your real authenticated server (2026-06-01):**
    | provider | `enabled.via` | models | cost==0 | filterableFree |
    |---|---|---|---|---|
    | `github-copilot` | **account** | 21 | 21 | **0** ✅ (subscription kept) |
    | `anthropic` | **account** | 27 | 0 | 0 |
    | `openai` | **account** | 54 | 4 | **0** ✅ (e.g. free-tier kept because account-authed) |
    | `opencode` (Zen) | _none_ (not authenticated) | 5 | 5 | **5** ✅ (free models filtered) |
  - **Implementation note (two endpoints, joined):** `enabled.via` comes from **`client.v2.provider.list()`** (provider metadata, no models); the model `cost` map comes from **`client.config.providers()`** (models, but no `enabled.via`). The filter must call both and **join by provider id**. A provider present in `config.providers()` but absent from `v2.provider.list()` (e.g. unauthenticated Zen) → treat as non-account → free models filterable. Verified this join end-to-end on the real server.
  - **Optional escape hatch:** keep a `subscription_providers` config key as a manual override for the rare provider that is a flat subscription but somehow not reported `via:"account"` — but it defaults to empty and is **not needed** for Copilot/Anthropic/OpenAI/Zen. The `enabled.via` rule covers all observed cases.

### Locked decision round 4 (auth separation, 2026-06-01)

- **D8 — `fallback_config` carries NO credentials; auth stays in `auth_config`.** The fallback chain is a pure ordered list of `{provider, model}` references pointing at providers authenticated separately via the existing `auth_config`/auth.json (which already holds multiple providers — verified: your auth.json has anthropic+openai+github-copilot). No `auth` field in the chain, no tokens, no `core.setSecret` on chain config (nothing secret in it). The runner applies auth from `auth_config` as today, then validates each chain entry's provider is authenticated (via `v2.provider.list()` / `enabled.via`) and skips+warns on unauthenticated references. Separation of concerns; no credential duplication.

---

## 0. TL;DR — what the research changed about the ask

| Your requirement                                | Reality found                                                                                                                                                                                                                                                                 | Net effect on design                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Upgrade to newest SDK**                    | `1.15.12` (what you have) **IS** npm `latest`. No newer stable exists; only dated `beta`/`dev` snapshots. CLI+SDK+plugin are version-locked.                                                                                                                                  | **Reframe**: not a version bump. The real win is _adopting APIs already present_ in 1.15.12 (session message export, per-message token/cost). Keep the exact pin; add a CI "is there a newer stable?" check.                                                           |
| **2. Conversation logging + file for artifact** | **No** native `export()` API. `session.share()` returns only a URL. The real mechanism is `client.session.messages({sessionID})` → full `Array<{info, parts}>` with text, reasoning, tool I/O, **token usage + cost**. You already have `tool-loggers/` + `debug-log-writer`. | **Enhance, not rebuild.** Add a post-run transcript fetch → **JSON artifact** (D3). Add GitHub log groups + a job summary. Ration annotations.                                                                                                                         |
| **3. Model selection + disable free models**    | **No** `free` flag anywhere. Free ⇔ `cost===0` — BUT subscription models (Copilot etc.) **also** report `cost:0`. OpenCode distinguishes them via **`provider.enabled.via === "account"`** (from `v2.provider.list()`), NOT a hardcoded list.                                 | Filter in `listModels()` + `disable_free_models` input: `cost===0` AND `enabled.via !== "account"`. **No hardcoded provider names** (D7).                                                                                                                              |
| **4. Provider fallback chain**                  | **Not natively supported.** `auth.set` is keyed by one provider ID (idempotent PUT — second call overwrites). No fallback/router config exists (open issues #7602/#8687). Quota = `APIError` with `statusCode 429` + Copilot body codes.                                      | **We build it — simplified per D1/D2.** A _start-of-conversation_ provider selector: register the chain, pick the first provider that's healthy at startup, run the whole conversation on it. No mid-run failover. The only genuinely new subsystem, now much smaller. |

**The headline:** three of your four asks are smaller than they sound (the SDK already exposes what we need). The fourth — provider fallback — is the real architecture work, but **D1/D2 shrink it dramatically**: a start-of-conversation provider selector instead of a runtime 429-recovery orchestrator.

---

## 1. Current architecture (grounding)

Clean dependency graph, per project-context: `index → runner → opencode/validation/config → security → types`.

- **`src/opencode.ts`** — `OpenCodeService` singleton. Spawns embedded server via `createOpencode` (`@opencode-ai/sdk/v2`), runs an event loop (`event.subscribe()`), reconstructs the live transcript from `message.part.updated` events, auto-approves permissions, detects `session.idle`. Auth applied per-provider via `client.auth.set({providerID, auth})`.
- **`src/tool-loggers/`** — factory + per-tool `IToolLogger` with `formatLog()` (one-line console summary) and `formatDebugLog()` (verbose body → file). **This split is exactly right** for the GitHub-Actions log-group pattern.
- **`src/debug-log-writer.ts`** — promise-chained `appendFile` to a `0o600` file; NoOp by default. Already the backbone of the artifact story.
- **`src/runner.ts`** — orchestration + validation retry loop. `handleListModels()` for `list_models`.
- **`src/config.ts`** — input parsing/validation, `maskSecrets()`, path safety.

Verified API facts (installed 1.15.12 v2 types):

- `client.session.messages({ sessionID })` → `Array<{ info: Message; parts: Part[] }>`. Assistant messages carry `cost: number` and `tokens: {input, output, reasoning, cache:{read,write}}`. Tool parts carry `state.input` / `state.output` / `state.error`. Reasoning parts carry `text`.
- `client.config.providers()` → `{ providers: [{ id, name, models: Record<string, Model> }] }`, each `Model` has `cost: { input, output, cache:{read,write}, ... }`.
- `client.auth.set` → **PUT** `/auth/{id}`, body = single `Auth` (`OAuth | ApiAuth | WellKnownAuth`). Second PUT with same id **overwrites**.
- Quota signal: `APIError { message, statusCode?, isRetryable, responseHeaders?, responseBody? }` on both `AssistantMessage.error` and the `session.error` event.

---

## 2. Requirement 1 — SDK currency

**Decision: keep `@opencode-ai/sdk@1.15.12` (it is latest stable). Do NOT chase `beta`/`dev`.**

Rationale (trade-offs, not verdicts): the dated snapshot tags are unversioned moving targets — adopting one trades your reproducible `dist/index.js` (committed, runs in prod) for churn risk, against no confirmed feature you need. The features you want are **already in 1.15.12**.

Proposed concrete work:

1. **Adopt present-but-unused APIs**: `session.messages()` (Req 2) and per-message token/cost (Req 2/3). No version change.
2. **Add a currency guard** (optional, low cost): a scheduled CI job runs `npm view @opencode-ai/sdk version` and opens an issue if `latest` moves past the pin. Replaces "manually chase upgrades" with a signal.
3. **Stay on the `/v2` subpath.** v1 and v2 are _different call shapes_, not aliases; all your call sites are v2 and typecheck against 1.15.12. Migrating to root import would be a real rewrite for zero gain. Note as a pinned-dependency risk for a future 2.x.

**Risk:** none material. Open question: per-patch notes 1.15.8→1.15.12 couldn't be fetched in-env, but semver (patch-level) + your call sites still typechecking means no breaking change.

---

## 3. Requirement 2 — Conversation logging + file export for artifact

Two surfaces, deliberately separated:

### 3a. Console experience (live log) — make the runner _scannable_

- **Wrap each tool call in a log group**: `core.startGroup(toolLogger.formatLog(...))` … verbose body … `core.endGroup()`, in `handleMessagePartUpdated`. Keeps the timeline readable, detail one click away. (Groups can't nest — one group per tool call, assistant narrative stays top-level.)
- **Ration annotations.** _Current bug:_ every tool error calls `core.warning` → a long run blows the **10-warning/step, 50/job** cap and buries the real failure. Fix: routine tool errors become `core.info` inside their group; reserve `core.error/warning/notice` (with `title=`) for run-level outcomes (final failure, validation-exhausted, fatal SDK error).
- **Guard long lines.** Runner throughput collapses past ~6k chars/line (a 100k line can take ~10 min and time out the step). Keep `formatLog` short; full bodies go to the file only. You already do this — preserve it.
- **`::stop-commands::` wrap** streamed assistant text so LLM output containing `::` can't inject workflow commands (not handled today in `handleTextPart`).

### 3b. Full transcript → artifact (the "save the whole conversation" ask) — **JSON only (D3)**

- **Source of truth = `client.session.messages({ sessionID })`** fetched once after the run completes (and after each validation turn). This is the complete conversation incl. tool I/O, reasoning, token usage, cost. _Not_ `session.share()` (URL only), _not_ a non-existent `export()`.
- **New module `src/transcript-writer.ts`** emits a single file:
  - `conversation.json` — the raw `messages` array (machine-readable, round-trippable, preserves exact token/cost structure). **No Markdown render (D3).**
- **Job summary** (`core.summary`, currently unused): status heading, a **token + cost + duration table**, collapsed `<details>` per tool category, final assistant message, and a link to the artifact. This is the human-readable surface — so dropping Markdown export costs nothing for human consumption. Written once at run end. (1 MiB/step limit.)
- **Secret scrubbing for files (critical):** `core.setSecret()` masks the _live log only_ — it does **not** scrub files we write. So `transcript-writer` and `debug-log-writer` must run content through a redaction pass (extend `maskSecrets`/`sanitizeErrorMessage`) before write. The `conversation.json` is raw SDK output and **must** pass through this scrubber before being written for upload.
- **Artifact upload** stays in the _consuming_ workflow (`actions/upload-artifact`) — a Docker container action can't upload artifacts itself. We document the pattern and expose the file path as an output. (Avoid citing a hard size cap — the "5 GB" figure didn't verify; use short retention + compression-level 0 for large text.)

New action outputs/inputs (proposed): output `transcript_json_path`; the existing `debug_log_path` stays.

---

## 4. Requirement 3 — Model selection + disable free models

### 4a. "Disable all free models" — grounded in live models.dev data (verified 2026-06-01)

**Why OpenCode shows "free" in its model list:** it is **derived from `cost`, not a flag.** Confirmed against the live models.dev API (137 providers — OpenCode's metadata source): the complete model field set is `attachment, cost, experimental, family, id, interleaved, knowledge, last_updated, limit, modalities, name, open_weights, provider, reasoning, release_date, status, structured_output, temperature, tool_call`. **There is no `free` field.** Where you see "(free)" in OpenCode it comes from one of two cost-derived sources:

1. **The model `name` itself** — OpenRouter's free variants are literally _named_ `"... (free)"` and carry the `:free` id suffix (e.g. `qwen/qwen3-coder:free`, name `"Qwen3 Coder 480B A35B (free)"`). OpenCode just displays the upstream name; the "(free)" is baked into the metadata string, not computed by OpenCode.
2. **`cost.input === 0 && cost.output === 0`** — the only programmatic signal. **430 of the listed models** are free by this test.

**⚠️ CRITICAL CONFLICT — subscription models report `cost: 0` too (verified 2026-06-01).** This is the trap a cost-only predicate falls into:

- **All 29 `github-copilot` models report `cost: {input:0, output:0}`** — including `gpt-5`, `claude-sonnet-4.6`. Same for **all 55 `github-models`**. Reason: models.dev reports per-_token_ cost, and a subscription has **no per-token price** — you've pre-paid a flat fee. "Per-token cost is 0" ≠ "throwaway free model."
- **A naive `cost===0` predicate would classify your entire Copilot subscription as "free" and `disable_free_models:true` would filter out the exact models you're paying for — backwards from intent.**
- **There is NO field that separates the two.** A subscription `github-copilot/gpt-5` and a truly-free `openrouter/...:free` have _identical_ `cost:{input:0,output:0}`. The only differentiator is **provider identity + auth**, not any model attribute. (Truly-free OpenRouter models do carry `:free` in the id and "(free)" in the name; Copilot models carry neither — but that only helps for OpenRouter, not as a general rule.)

So "free" splits into **three** categories, and the predicate must be **provider-aware**:

| Category                              | Signal                                                                                | Examples                                           | `disable_free_models` excludes? |
| ------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| **Truly free** (public, rate-limited) | `cost===0` **and** provider is a free/public tier (OpenRouter `:free`, iflowcn, etc.) | `openrouter/...:free`, `iflowcn/qwen3-max-preview` | **Yes**                         |
| **Subscription / included**           | `cost===0` **but** provider is a paid subscription you authenticated to               | `github-copilot/*`, `github-models/*`              | **No — never**                  |
| **Unknown pricing** (local/self-host) | `cost` missing                                                                        | `ollama-cloud/*`                                   | No                              |

Other empirical edge cases:

- **`:free` suffix ⊊ cost-zero.** All 21 OpenRouter `:free` models have cost 0, but **404 cost-zero models have no `:free` suffix** — suffix alone misses ~94%. Cost is the base test, suffix is only an OpenRouter label.
- **250 models have NO `cost` field** (`ollama-cloud/*`). A naive `m.cost.input===0` throws under `noUncheckedIndexedAccess` or mis-classifies. Treat missing cost as "unknown pricing," not free.

- **Free predicate — NO hardcoded provider list; uses OpenCode's own `enabled.via` signal (D7):**

  ```ts
  // Join two endpoints by provider id:
  //   - client.config.providers()  -> models + cost  (no enabled.via)
  //   - client.v2.provider.list()  -> provider.enabled.via  (no models)
  // A provider authenticated via a stored ACCOUNT credential (auth.json: Copilot, Anthropic,
  // OpenAI, ...) reports enabled.via === "account" -> it's a paid subscription, keep all models.
  // A provider with no enabled.via (catalog-only / unauthenticated, e.g. OpenCode Zen) -> its
  // cost:0 models are genuinely free -> filterable.
  const isAccountAuthed = (provider) =>
    provider.enabled !== undefined &&
    provider.enabled !== false &&
    provider.enabled.via === 'account';

  const isFilterableFree = (model, provider) =>
    model.cost !== undefined &&
    model.cost.input === 0 &&
    model.cost.output === 0 && // D4: cache cost ignored; missing cost => not free
    !isAccountAuthed(provider); // D7: account-authed (subscription) providers are never "free"
  ```

  This is the same rule OpenCode's core uses internally (`packages/core/src/plugin/provider/opencode.ts` gates free-model enabling on `enabled.via === "account"`). Pure app-layer change in `listModels()` (`src/opencode.ts:203-226`), now fetching `v2.provider.list()` alongside `config.providers()` and joining by id. **Zero hardcoded provider names.** Optional `subscription_providers` config key remains as a manual override but defaults empty and is unnecessary for all observed providers.

- **New input `disable_free_models` (boolean, default `false`).** When true:
  - `list_models` output omits free models (and labels free/paid/unknown-pricing when shown).
  - At run time, if the resolved model is free → fail fast with a clear error (don't silently pick a paid one).
  - Optionally inject opencode.json `provider.<name>.blacklist` / top-level `disabled_providers` for static exclusion, but **dynamic cost-based filtering is the primary mechanism** (new free models appear constantly; static lists rot).

### 4b. Model selection ergonomics (enhancement)

- Enrich `list_models` output with `cost` and a `free`/`paid` tag so users can choose deliberately.
- Keep the existing `model` input override; document the `provider/model` form.

---

## 5. Requirement 4 — Provider fallback chain (start-of-conversation selection)

**Not natively supported → built at the runner layer.** Per **D1** (mixed cross-provider, no single-entitlement multi-keying) and **D2** (selection at conversation start, no mid-run failover), this is now a _pre-flight selector_, not a runtime recovery orchestrator. Constraints, then design.

### 5.1 Hard facts & CI constraints

- **Auth is configured separately (D8).** The fallback chain does NOT carry credentials — providers are authenticated via the existing `auth_config`/auth.json, which already holds multiple providers simultaneously (verified: your real auth.json has `anthropic`, `openai`, `github-copilot`). The chain just references those provider IDs by name. `auth.set` is an idempotent **PUT** to `/auth/{id}` (one credential per id) — but the runner applies auth from `auth_config` as it does today; the chain config never touches it.
- **Distinct provider IDs.** Chain entries reference **distinct provider IDs**; under D1 the chain is naturally distinct anyway (copilot + anthropic + openai…). (If two accounts of the _same_ base provider are ever needed, they'd be distinct IDs in auth.json — e.g. `github-copilot` + `github-copilot-enterprise`, the `opencode-copilot-vscode` precedent — but that's an auth.json concern, not a chain-config one.)
- **Device-flow login is interactive → impossible in CI.** Each durable credential (GitHub `gho_`/`ghu_` for Copilot; API keys for others) is minted **once on a workstation** / from the provider dashboard and injected via GitHub Secrets into auth.json. Copilot exchanges its token for a short-lived (~30 min) opaque HMAC-signed token (_not_ a JWT) at `copilot_internal/v2/token` — OpenCode does that exchange in-process. Stateless container loses the refreshed token at run end, which is fine: the long-lived credential re-derives it each run, so **nothing needs persisting back to Secrets**.
- **Quota / failure signal:** `APIError.statusCode === 429` (and/or `responseBody` containing Copilot codes `rate_limited`, `user_weekly_rate_limited`, `user_global_rate_limited:pro_plus`). Surfaced on `session.error` / `AssistantMessage.error`. Lockouts are long (hours+), so when a provider is already exhausted, _picking a different provider_ is the right move — and D2 means we only need to do that **before** the conversation commits.

### 5.2 Design — start-of-conversation provider selector

A new **`src/provider-chain.ts`** that runs during `initialize()`/before `runSession()`:

```
fallback_config defines an ORDERED chain of providers (mixed, cross-provider per D1):
  [
    { provider: "github-copilot", model: "github-copilot/gpt-5" },
    { provider: "anthropic",      model: "anthropic/claude-sonnet-4-5" },
    { provider: "openai",         model: "openai/gpt-5" }
  ]
```

Flow (D2 — selection happens once, at the start):

1. **Apply auth from `auth_config` as today** (D8 — the chain config carries no credentials). Then **validate each chain entry's provider is authenticated** (present in `v2.provider.list()`, `enabled !== false`); skip+warn on any unauthenticated reference.
2. **Select the first healthy provider** via **approach (a) start-and-watch — validated by the §7 spike:**
   - Create the session, send the first prompt pinned to chain[i]'s model, and watch the early event stream.
   - **If a `session.error` event arrives before the first ASSISTANT part** (text/tool/reasoning), the provider can't start → abort that session, advance to chain[i+1], start fresh.
   - The fail signal is the **whole `session.error` error union** (`APIError` for auth/quota with `statusCode` 401/429, `UnknownError` for bad model, plus `ProviderAuthError` etc.), not just `APIError`. Decision = "did `session.error` fire before commit?", not "was it specifically a 429?".
   - **Commit boundary = first assistant-role part.** Scope the "has it committed?" check to assistant text/tool/reasoning parts — the server echoes the _user's own prompt_ as an early `text` part, which must NOT count as progress (spike finding #3). Once a real assistant part flows, we are committed — no further switching (D2).
   - Approach **(b) explicit preflight** is the documented fallback if a future provider proves to fail _after_ commit, but the spike showed (a) is reliable for auth/model/quota startup failures.
3. **Exhaust the chain → fail** with a clear, aggregated error listing why each provider was skipped (auth invalid / quota-exhausted / unavailable).
4. **Mid-conversation, do nothing special (D2):** a 429 _after_ commitment surfaces as today's `session.error` and ends the run. We do **not** re-drive on another provider mid-flight.

This is the LiteLLM "try deployments in order at request start" idea, minus the cooldown bookkeeping and cross-request rotation we explicitly don't need under D2.

### 5.3 Why not the LiteLLM-proxy approach

A LiteLLM sidecar would add a long-running process, port/health lifecycle, a heavier image, and an unconfirmed Copilot-token shim — its value (transparent runtime 429 rotation) is exactly what **D2 makes unnecessary**. **Dropped.**

### 5.4 Config surface (proposed) — auth is SEPARATE from the chain (D8)

**D8 — `fallback_config` carries NO credentials.** Auth is configured separately, exactly as today, via `auth_config` (the auth.json). The fallback chain is a pure **ordered list of provider/model references** that point at providers authenticated through the existing mechanism. Rationale: separation of concerns, no credential duplication across two inputs, no secret living in two files, and it composes cleanly with the `enabled.via` model — the chain references providers; _whether_ they're authenticated is the already-solved `auth_config` concern. The runner does NOT call `auth.set` from the chain config.

New input `fallback_config` (path to JSON):

```json
{
  "chain": [
    { "provider": "github-copilot", "model": "github-copilot/gpt-5" },
    { "provider": "anthropic", "model": "anthropic/claude-sonnet-4-5" },
    { "provider": "openai", "model": "openai/gpt-5" }
  ]
}
```

- Each `provider` is a distinct OpenCode provider ID **that must already be authenticated** (via `auth_config`/auth.json — your existing pattern, which can hold multiple providers at once, as your real auth.json already does: `anthropic`, `openai`, `github-copilot`).
- **No `auth` field, no tokens, no `core.setSecret` on the chain config** — there are no secrets in it. (Secret-masking still applies to `auth_config` as today.)
- **Preflight validation:** before selection, verify each referenced provider is present/authenticated (e.g. appears in `v2.provider.list()` with `enabled !== false`). A chain entry pointing at an unauthenticated provider is skipped with a clear warning — it can never start. This reuses the same `enabled.via` data as the free-model filter.
- No `trigger` block under D2 — selection is start-time health, not runtime quota-code matching (though we still detect a startup `session.error` to skip an exhausted/failed provider).

---

## 6. Module & change map

| Change                                                  | File(s)                                                          | New?     | Risk                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| Adopt `session.messages()` post-run                     | `opencode.ts` (add `exportTranscript()`), `runner.ts`            | edit     | low                                                   |
| Transcript **JSON** writer (D3 — no Markdown)           | `src/transcript-writer.ts`                                       | **new**  | low                                                   |
| Job summary builder                                     | `src/summary-writer.ts`                                          | **new**  | low                                                   |
| Log groups + annotation rationing + `::stop-commands::` | `opencode.ts` (`handleMessagePartUpdated`, `handleTextPart`)     | edit     | med (touches hot path)                                |
| File-level secret scrubbing                             | `security.ts` (+ wire into writers)                              | edit     | med (security-critical)                               |
| Free-model predicate + `disable_free_models`            | `opencode.ts` (`listModels`, selection), `config.ts`, `types.ts` | edit     | low                                                   |
| Start-of-conversation provider selector (D1/D2)         | `src/provider-chain.ts`                                          | **new**  | **med** (novel, but no mid-run failover; spike-gated) |
| New inputs/outputs                                      | `action.yml`, `config.ts`, `types.ts`, README + examples         | edit     | low                                                   |
| Tests for all of the above                              | co-located `*.spec.ts` + e2e                                     | new/edit | per CLAUDE.md skills                                  |

Respects the dependency graph: `transcript-writer`/`summary-writer`/`provider-chain` sit beside `opencode`, depend on `security`+`types` only; `security.ts` stays a leaf.

---

## 7. Pre-implementation validation — SPIKE RUN ✅ (2026-06-01)

**Executed.** Ran a real embedded OpenCode server (`createOpencode` from `@opencode-ai/sdk/v2`, with the `opencode-ai@1.15.12` CLI binary installed), registered a deliberately-invalid credential, and recorded the full timestamped event stream. Two scenarios.

**VERDICT: Approach (a) "start-and-watch" is VIABLE. ✅** In both failure scenarios the error arrived **before any real assistant content**.

| Scenario         | Error event     | Error type / shape                                                                                                                | Timing                                               |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Invalid API key  | `session.error` | `APIError { statusCode: 401, message: "invalid x-api-key", isRetryable: false, responseBody: <raw provider JSON>, metadata.url }` | error @ ~1.5s, **zero** assistant progress before it |
| Unknown model id | `session.error` | **`UnknownError { message, ref? }`** (NOT `APIError`)                                                                             | error @ ~0.9s, zero progress before it               |

**Findings folded into the design:**

1. **Failure surfaces cleanly as a `session.error` event before assistant output** — the selector can create the session, send the first prompt, and watch the early stream; a `session.error` before the first _assistant_ part = advance to the next chain entry. Confirmed empirically.
2. **The fail signal is the WHOLE `session.error` error union, not just `APIError`.** A bad model surfaced as `UnknownError`; auth/quota as `APIError` (with `statusCode` 401/429). The selector must treat _any_ `session.error` during startup as "this provider can't start → advance." Quota-specific 429 parsing is only needed for nicer skip messages, not for the decision.
3. **Progress-detection gotcha (important for implementation):** the server emits an early `message.part.updated` carrying a `text` part that is the **echo of the user's own prompt** (~+0.9s), _before_ the assistant produces anything. The selector's "has the conversation committed?" check must scope to **assistant-role** parts (and tool/reasoning parts), NOT any text part — else it false-positives on the user echo. This was the one subtlety that nearly inverted the verdict; now nailed down.
4. **Runtime dependency confirmed:** `createOpencode()` **spawns an external `opencode` binary** (`spawn opencode serve`). The SDK package has no bin; the Dockerfile installs `opencode-ai` globally (`/usr/local/bin/opencode`). Local dev/tests mock the client and never start a real server. Any new e2e that needs a real server must ensure the binary is present.
5. **Currency micro-update:** during the spike (2026-06-01), `@opencode-ai/sdk` latest moved to **1.15.13** (was 1.15.12 at research time on 05-29) — a patch bump. Confirms §2's recommendation to add a CI currency guard; fold a routine bump to 1.15.13 into Phase 1.

---

## 8. Open questions — RESOLVED (see D4–D6 above)

1. ~~Free-model edge case~~ → **D4**: cache-only-cost models count as free.
2. ~~`fallback_config` vs `auth_config`/`model`~~ → **D5**: `fallback_config` supersedes when present; omitted = unchanged.
3. ~~Artifact upload~~ → **D6**: stays in consuming workflow; expose `transcript_json_path` output.
4. **Selector probe (a) vs (b):** decided by the §7 spike below, not a user decision.

---

## 9. Proposed sequencing (if approved)

1. **Phase 1 (low risk, high value):** Req 2 console polish (log groups, annotation rationing, `::stop-commands::`) + transcript export (**JSON**, D3) + job summary + file-level scrubbing. Independently shippable.
2. **Phase 2:** Req 3 free-model filtering (`disable_free_models`) + model-selection ergonomics. Small, independent.
3. **Phase 3:** Req 4 provider fallback chain — _after_ the §7 spike. Now medium-risk (no mid-run failover), gated only on the spike outcome.
4. Req 1 currency guard folded into Phase 1 CI.

Each phase: full `*.spec.ts` coverage (≥80% / 75% branches), `lint`/`typecheck`/`format`, `dist/` rebundled and committed, e2e where it touches the action surface — per CLAUDE.md.
