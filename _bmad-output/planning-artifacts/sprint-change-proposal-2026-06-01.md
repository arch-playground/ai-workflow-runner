# Sprint Change Proposal — OpenCode Enhancement Suite

**Author:** Winston (Correct Course) · **Date:** 2026-06-01 · **For:** TanNT
**Change trigger:** `_bmad-output/planning-artifacts/research/opencode-upgrade-design-2026-05-29.md`
**Review mode:** Batch · **Status:** AWAITING APPROVAL

---

## Section 1 — Issue Summary

**What triggered the change.** A research-and-design effort (the OpenCode Upgrade Design, 2026-05-29 → 2026-06-01) produced four decision-complete, empirically-validated enhancements to the AI Workflow Runner that are **not represented in the current PRD or Epics**. The MVP (Epics 1–6) is complete; Epics 7–8 are in flight. These four enhancements are net-new scope that needs to be folded into the planning artifacts so they become tracked, sequenced work rather than living only in a research doc.

**How it was discovered.** A feature request to (1) upgrade the OpenCode SDK, (2) improve conversation logging + export a full transcript for CI artifacts, (3) add a "disable free models" option, and (4) support a multi-account/provider fallback chain. Research against the installed SDK types, the live models.dev API, the OpenCode source (`~/Work/GIT/Personal/Sources/opencode`), and **probes against the user's real authenticated server** reshaped each ask and de-risked the hard parts.

**Evidence (all verified, not assumed).**

- **SDK currency:** `@opencode-ai/sdk` latest = `1.15.13` (was 1.15.12); the project tracks latest already. "Upgrade" reframed as "adopt already-present APIs + CI currency guard."
- **Conversation export:** No native `export()` API; `session.messages()` returns the full transcript (text, tool I/O, reasoning, token/cost). Verified in installed v2 types.
- **Free-model detection:** No `free` flag exists; OpenCode derives it from `cost.input===0`. **Subscription models (Copilot) ALSO report `cost:0`** — a naive filter would delete a paid subscription. The correct, non-hardcoded signal is `provider.enabled.via === "account"` (found in OpenCode source `packages/core/src/provider.ts:85` + `plugin/account.ts:31`). **Verified on the user's real server:** all 21 Copilot models `via:"account"` → kept; OpenCode Zen's 5 free models (unauthenticated) → filtered.
- **Provider fallback:** Not natively supported. A **start-of-conversation selector** (no mid-run failover, per decision D2) was validated by a live spike: a `session.error` event fires before any assistant content, so "start-and-watch" works.

---

## Section 2 — Impact Analysis

### Epic Impact

- **No existing epic is invalidated.** The MVP and Epics 7–8 stand unchanged. This is **purely additive**.
- **Four new epics** are required (numbered after the existing 8):
  - **Epic 9 — Conversation Logging & Transcript Export** (enhancement 2)
  - **Epic 10 — Model Selection & Free-Model Filtering** (enhancement 3)
  - **Epic 11 — Provider Fallback Chain** (enhancement 4)
  - **Epic 12 — SDK Currency & Maintenance Guard** (enhancement 1)
- **No resequencing of Epics 1–8.** New epics slot after them. Internal sequencing of 9–12 below.

### Story Impact

- No existing story changes. ~17 new stories across Epics 9–12 (breakdown in Section 4).
- Epic 10 (free-model filtering) has a notable **cross-cutting interaction** with Epic 11 (fallback/auth): the `enabled.via === "account"` rule ties the two together — both read provider auth state. Sequencing accounts for this.

### Artifact Conflicts / Updates Needed

| Artifact               | Change                                                                                                                                                                                                               | Severity |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **PRD**                | Add FR50–FR6x (4 feature groups) + NFRs; promote 4 "Phase 2 Growth" rows to scoped epics                                                                                                                             | Additive |
| **Epics**              | Add Epic List entries 9–12 + full epic/story breakdown                                                                                                                                                               | Additive |
| **Architecture**       | Add modules: `transcript-writer`, `summary-writer`, `provider-chain`; document `enabled.via` join (v2.provider.list + config.providers); note `opencode` binary spawn dependency                                     | Additive |
| **UI/UX**              | **N/A** — this is a headless GitHub Action; "UX" = console log + job summary, covered under Epic 9                                                                                                                   | N/A      |
| **action.yml**         | New inputs: `disable_free_models`, `subscription_providers`, `fallback_config` (provider/model refs — no creds, D8), `export_transcript`; new outputs: `transcript_json_path`. Auth stays in existing `auth_config`. | Additive |
| **sprint-status.yaml** | Add epic-9..12 + story entries, status `backlog`                                                                                                                                                                     | Additive |
| **Dockerfile**         | Bump `opencode-ai` to match SDK (currency); no structural change                                                                                                                                                     | Minor    |
| **Tests**              | New `*.spec.ts` per module; e2e for transcript + selector (needs real `opencode` binary)                                                                                                                             | Additive |

### Technical Impact

- **No breaking changes.** All new inputs default to current behavior (`disable_free_models:false`, no `fallback_config` → unchanged single-provider path, per decisions D5).
- **New runtime fact to document:** `createOpencode()` spawns an external `opencode` binary (Dockerfile installs it). Affects any new real-server e2e.
- **Secret handling extends:** `core.setSecret()` masks the live log only — new file artifacts (`conversation.json`) and `fallback_config` tokens must pass through a redaction pass before write.

---

## Section 3 — Recommended Approach

**Selected path: Option 1 — Direct Adjustment (additive epics within the existing plan).**

**Rationale.** The change introduces no conflict with completed work, requires no rollback, and does not reduce MVP scope — so Options 2 (Rollback) and 3 (MVP Review) are **not viable / not needed**. The clean dependency graph (`index → runner → opencode/validation/config → security → types`) absorbs the new modules as siblings of `opencode`, depending only on `security`+`types`. The work is already decision-complete (D1–D7) and empirically de-risked, so it drops straight into the backlog as new epics.

| Option                                 | Verdict                                     | Effort | Risk |
| -------------------------------------- | ------------------------------------------- | ------ | ---- |
| 1 — Direct Adjustment (new epics 9–12) | **SELECTED**                                | Med    | Low  |
| 2 — Rollback                           | Not viable (nothing to roll back; additive) | —      | —    |
| 3 — MVP Review                         | Not needed (MVP unaffected)                 | —      | —    |

**Effort / timeline:** ~17 stories across 4 epics, independently shippable in 4 phases. Phase 1 (Epic 9 + Epic 12) is low-risk and shippable alone.

---

## Section 4 — Detailed Change Proposals

### 4.1 PRD additions

**New Functional Requirements (append to `## Functional Requirements`):**

```
### Conversation Logging & Export (FR50-FR54)
- FR50: System can render a scannable console log using GitHub Actions log groups (one group per tool call)
- FR51: System can ration GitHub annotations to run-level outcomes (stay under 10/type/step, 50/job caps)
- FR52: System can fetch the full session transcript via session.messages() after run completion
- FR53: System can write the full conversation to a JSON file (conversation.json) for artifact upload
- FR54: System can write a job summary (token/cost/duration table + final message + artifact link) via core.summary

### Model Selection & Free-Model Filtering (FR55-FR58)
- FR55: System can enrich list_models output with per-model cost and a free/paid/unknown-pricing tag
- FR56: User can disable free models via a disable_free_models input
- FR57: System can identify free models as cost.input===0 && cost.output===0 AND provider.enabled.via !== "account"
- FR58: User can extend subscription-provider protection via an optional subscription_providers config key

### Provider Fallback Chain (FR59-FR63)
- FR59: User can define an ordered, cross-provider fallback chain via a fallback_config input (provider/model references ONLY — no credentials; D8)
- FR60: System validates each chain entry's provider is authenticated (via auth_config/enabled.via) before selection, skipping unauthenticated references with a warning
- FR61: System can select the first healthy provider at conversation start by watching for session.error before the first assistant part
- FR62: System can advance to the next chain entry on a startup session.error and start fresh
- FR63: System fails with an aggregated error when the entire chain is exhausted

### SDK Currency & Maintenance (FR64-FR65)
- FR64: System tracks the @opencode-ai/sdk latest stable version and signals when the pin lags (CI guard)
- FR65: System keeps the opencode-ai CLI binary version aligned with the SDK pin
```

**New Non-Functional Requirements:**

```
- NFR21: conversation.json and job-summary content are secret-scrubbed before write (core.setSecret masks live log only)
- NFR22: No single live-log line approaches ~6k chars (runner throughput cliff); full bodies go to the artifact/debug file
- NFR23: auth tokens (in auth_config) are masked via core.setSecret before any use (no field-level auto-redaction); fallback_config itself carries no secrets (D8)
```

**Phase 2 Growth table:** change rows "Model selection input", "List available models feature" from `Planned` → `Epic 10`; add new rows "Conversation transcript export → Epic 9", "Provider fallback chain → Epic 11", "SDK currency guard → Epic 12".

### 4.2 Epic List additions (append to `## Epic List`)

```
### Epic 9: Conversation Logging & Transcript Export
Users get a scannable GitHub Actions console (log groups, rationed annotations, job summary) and a full
conversation.json transcript exported for artifact upload.
**FRs covered:** FR50, FR51, FR52, FR53, FR54 · **NFRs:** NFR21, NFR22 · **Status:** 🔲 NOT STARTED

### Epic 10: Model Selection & Free-Model Filtering
Users can list models with cost/free tags and disable free models, while paid subscriptions (Copilot etc.)
are never mis-classified as free — via OpenCode's own enabled.via === "account" signal (no hardcoded list).
**FRs covered:** FR55, FR56, FR57, FR58 · **Status:** 🔲 NOT STARTED

### Epic 11: Provider Fallback Chain
Users can define an ordered cross-provider fallback chain; the runner selects the first healthy provider at
conversation start (no mid-run failover) and fails over on startup errors.
**FRs covered:** FR59, FR60, FR61, FR62, FR63 · **NFRs:** NFR23 · **Status:** 🔲 NOT STARTED

### Epic 12: SDK Currency & Maintenance Guard
The project stays on the latest stable @opencode-ai/sdk with a CI guard that signals when the pin lags, and
keeps the opencode-ai CLI binary aligned.
**FRs covered:** FR64, FR65 · **Status:** 🔲 NOT STARTED
```

### 4.3 Story breakdown (new)

**Epic 9 — Conversation Logging & Transcript Export**

- 9.1 Add log-group wrapping around tool calls in `handleMessagePartUpdated` (FR50)
- 9.2 Ration annotations: route routine tool errors to `core.info`/group, reserve `core.error/warning` for run-level (FR51)
- 9.3 `src/transcript-writer.ts` — fetch `session.messages()`, scrub secrets, write `conversation.json` (FR52, FR53, NFR21)
- 9.4 `src/summary-writer.ts` — token/cost/duration table + final message + artifact link via `core.summary` (FR54)
- 9.5 `::stop-commands::` wrap streamed assistant text in `handleTextPart`; long-line guard (NFR22)
- 9.6 action.yml: `export_transcript` input + `transcript_json_path` output; README + example with `actions/upload-artifact`
- 9.7 Unit + e2e tests (real-server transcript fetch)

**Epic 10 — Model Selection & Free-Model Filtering**

- 10.1 Join `v2.provider.list()` (enabled.via) with `config.providers()` (cost) by provider id in `listModels()` (FR57)
- 10.2 `isFilterableFree` predicate: `cost===0 && enabled.via!=="account"`; missing-cost = unknown, not free (FR57)
- 10.3 `disable_free_models` input + fail-fast if resolved model is free (FR56)
- 10.4 Enrich `list_models` output with cost + free/paid/unknown tags (FR55)
- 10.5 `subscription_providers` optional override config key (FR58)
- 10.6 Unit tests incl. the Copilot/Zen/OpenRouter cases proven in research

**Epic 11 — Provider Fallback Chain** _(auth is NOT part of this epic — D8; providers are authed via existing `auth_config`)_

- 11.1 `fallback_config` parse + validation — ordered `{provider, model}` references, NO credentials (FR59)
- 11.2 Preflight: validate each chain provider is authenticated via `v2.provider.list()`/`enabled.via`; skip+warn unauthenticated (FR60)
- 11.3 `src/provider-chain.ts` — start-and-watch selector: session.error before first assistant part → advance (FR61, FR62)
- 11.4 Commit-boundary detection scoped to assistant-role parts (spike finding) (FR61)
- 11.5 Chain-exhausted aggregated error; D5 supersede-vs-`model` precedence when `fallback_config` present (FR63)
- 11.6 Unit + e2e tests (real-server, startup fail-over across authenticated providers)

**Epic 12 — SDK Currency & Maintenance Guard**

- 12.1 CI job: `npm view @opencode-ai/sdk version` vs pin → open issue / warn if lagging (FR64)
- 12.2 Bump SDK to 1.15.13 + Dockerfile `opencode-ai` alignment (FR64, FR65)

### 4.4 Architecture updates

- Add to component list: `transcript-writer.ts`, `summary-writer.ts`, `provider-chain.ts` (siblings of `opencode`, depend on `security`+`types`).
- Document the **two-endpoint join** for model metadata (`v2.provider.list` enabled.via + `config.providers` cost).
- Document the **`opencode` binary spawn** runtime dependency.
- Note `auth.set` is **PUT** (idempotent, one credential per provider id) — basis for distinct-provider-ID fallback.

---

## Section 5 — Implementation Handoff

**Change scope classification: MODERATE** (backlog reorganization — new epics/stories — but no strategic replan; MVP intact).

| Recipient               | Responsibility                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **PM (John)**           | Apply PRD additions (FR50–FR65, NFR21–23, Phase 2 table)                                        |
| **Architect (Winston)** | Apply architecture.md module + integration additions                                            |
| **SM / PO**             | Apply Epic List + story breakdown to epics.md; update sprint-status.yaml (epic-9..12 = backlog) |
| **Dev (Amelia)**        | Implement per phase sequencing below, full tests + `dist/` rebundle per CLAUDE.md               |

**Phased sequencing (independently shippable):**

1. **Phase 1:** Epic 9 (logging + transcript) + Epic 12 (currency/bump) — low risk, high value
2. **Phase 2:** Epic 10 (free-model filtering) — small, self-contained
3. **Phase 3:** Epic 11 (fallback chain) — depends on Epic 10's `enabled.via` join; medium risk, spike-validated

**Success criteria:** each epic ships with ≥80% coverage (75% branches), `lint`/`typecheck`/`format` clean, `dist/index.js` rebundled+committed, e2e where it touches the action surface. No regression to existing single-provider behavior (default inputs unchanged).

---

## Checklist status (summary)

- §1 Trigger & context — **Done** (additive enhancement; evidence = the design doc + real-server probes)
- §2 Epic impact — **Done** (no invalidation; 4 new epics, no resequencing of 1–8)
- §3 Artifact conflicts — **Done** (PRD/Epics/Architecture/action.yml/sprint-status additive; UI/UX N/A)
- §4 Path forward — **Done** (Option 1 Direct Adjustment; 2 & 3 not viable/needed)
- §5 Proposal components — **Done** (this document)
- §6 Final review & handoff — **pending your approval**
