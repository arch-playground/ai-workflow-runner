# Retrospective — Epic 10: Model Selection & Free-Model Filtering

**Date:** 2026-06-01 · **Facilitator:** Winston (bmad-auto leader) · **Mode:** hybrid / auto-commit

## Outcome

**Epic 10 complete — all 6 stories done, committed, and validated in the real Docker runtime.**

| Story                                | Commit    | Tests |
| ------------------------------------ | --------- | ----- |
| 10-1 join provider auth + cost       | `016feac` | 566   |
| 10-2 provider-aware free predicate   | `d8361de` | 578   |
| 10-3 disable_free_models input       | `c77b0f8` | 589   |
| 10-4 enrich list_models output       | `ec92d01` | 600   |
| 10-5 subscription_providers override | `cac8f30` | 608   |
| 10-6 epic test sweep                 | `25f301a` | 629   |

Final: **629 unit+integration tests, coverage 92.47% / 85.21% branches** (above 80%/75%); `model-filter.ts` at 100%/100%. Lint zero warnings, typecheck clean.

## Functional + E2E validation (real Docker container, per validation policy)

Ran the real action in-container against real authenticated providers. **All PASS:**

- **Pricing tags on real data:** all 21 Copilot models → `[subscription]` (cost 0 + enabledVia 'account'); Anthropic/OpenAI paid → `[paid]`; `openai/gpt-image-1` → `[subscription]` (cost 0 + account — D7 correctly catches it); OpenCode Zen `*-free` → `[free]`.
- **`disable_free_models` listing:** "4 free model(s) hidden" — the exact 4 Zen `*-free` models (`mimo-v2.5-free`, `deepseek-v4-flash-free`, `nemotron-3-super-free`, `big-pickle`) omitted; all subscription/paid kept. Real free models caught, zero false positives.
- **Fail-fast guard:** `INPUT_MODEL=opencode/big-pickle` + `disable_free_models:true` → `"Model 'opencode/big-pickle' is a free model and disable_free_models is enabled..."`, status=failure, NO session created (AC4 of 10-3).
- **COPILOT-NEVER-BLOCKED invariant (the headline):** `github-copilot/gpt-5-mini` + `disable_free_models:true` → ran successfully (`pong`), status=success. The paid subscription is never blocked. ✅
- **Funcval model:** `github-copilot/gpt-5-mini` (per policy). **E2E model:** `opencode/big-pickle` free model (per policy) — ran successfully with filter off (status=success), proving free models are reachable and only blocked when asked.
- **Conservative AC6:** an unresolvable model id → guard skipped (logged), run proceeds — verified (a buggy test input that passed a whole listing line was correctly NOT blocked).

## What went well

- **Layered design paid off:** 10-1 (join) → 10-2 (pure predicate) → 10-3 (apply) → 10-4 (tag) → 10-5 (override) → 10-6 (verify). Each story a thin, testable layer; `isFilterableFree` delegating to `classifyPricing` (10-4) eliminated divergence risk structurally.
- **Real-server-validated design (D7) held in production:** the `enabled.via === 'account'` discriminator correctly distinguished subscription (Copilot, gpt-image-1) from genuinely-free (Zen `*-free`) on live data — exactly as the pre-implementation research predicted.
- **Retro lessons from Epic 9 applied cleanly:** C1 (`git show HEAD:` verify) and H1 (stage all dev-touched src) held on every commit — zero sprint-status drift, zero missed files this epic.
- **Validation policy worked:** deferring funcval/e2e to epic close (gpt-5-mini funcval, free-model e2e) kept the per-story loop fast while still proving the subsystem against reality at the boundary.

## What to improve — action items (gate Epic 11)

### MEDIUM

- **M1 — `dev-e10` idle-on-pickup lag.** The persistent developer repeatedly went idle right as it received a new packet, sometimes re-reporting the prior (committed) story before engaging the new one. One nudge always resolved it (it did NOT need a respawn, unlike Epic 9's developer). _For Epic 11:_ tolerate one idle-after-delegation (verify via story-file baseline stamp before nudging); nudge once if genuinely unstarted; respawn only if a second idle with no engagement.
- **M2 — Duplicate frontmatter artifact.** `bmad-dev-story` prepended its own `baseline_commit` frontmatter on top of the leader's, producing a double block in 10-5/10-6 story files (cosmetic; stripped at commit). _For Epic 11:_ don't add `baseline_commit` frontmatter to story files the leader authors — let the workflow own it, or expect to strip the dupe at commit.

### Process (carried forward, confirmed working)

- C1 verify-after-commit, H1 stage-all-dev-files, L1 functional-validation-at-epic-close — all held this epic. Keep.

## Pre-flight checklist for Epic 11 (Provider Fallback Chain)

- [ ] C1 / H1 / L1 (in practice)
- [ ] M1: tolerate-one-idle then single-nudge for the persistent developer
- [ ] M2: don't double-stamp story frontmatter
- [ ] Epic 11 implements the start-of-conversation provider selector (D2, spike-validated): fallback_config carries provider/model refs only, NO credentials (D8); auth stays in auth_config. The §7 spike confirmed session.error fires before the first assistant part → "start-and-watch" selection. Stories must cite D8 (no creds in chain) and the assistant-role commit-boundary.
