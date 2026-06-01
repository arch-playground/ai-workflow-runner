# Retrospective — Epic 12: SDK Currency & Maintenance Guard

**Date:** 2026-06-01 · **Facilitator:** Winston (bmad-auto leader) · **Mode:** hybrid / auto-commit

## Outcome

**Epic 12 complete — both stories done, committed, validated. This closes ALL of Phase 2 (Epics 9–12).**

| Story                           | Commit    | Tests |
| ------------------------------- | --------- | ----- |
| 12-1 CI currency guard          | `5b007b7` | 692   |
| 12-2 bump SDK 1.15.13 + pin CLI | `7f7c3f6` | 692   |

## Functional validation (real Docker container)

- Image builds clean with pinned `opencode-ai@1.15.13`; `opencode --version` → 1.15.13 (SDK-aligned).
- Smoke run (gpt-5-mini, bumped SDK) → `pong`, status=success. No API breakage from 1.15.12→1.15.13.
- The 12-1 currency guard now passes quietly (lock == npm latest).

## What went well

- Both stories small and clean (no fix-rounds). The pre-flight retro items held: C1, H1, M2 all clean; H3 (regression-test-with-fix) wasn't triggered (no fixes needed); M3 (fixtures mirror documented formats) — n/a for these workflow/config stories.
- Verify-before-spec: confirmed actual npm latest (1.15.13) before writing 12-2 rather than trusting the design doc's snapshot.
- The currency guard (12-1) closes the loop on the design's reframing of "upgrade SDK" → "stay current + guard": we're current AND will be signaled on future drift.

## Action items

- None new. The accumulated process discipline (C1/H1/L1/M1/M2/H3/M3) is stable and worth carrying into any future epics.

---

## Phase 2 (Epics 9–12) — OVERALL WRAP-UP

**All 4 epics, 21 stories, complete and committed on `feature/harness-solution`.**

| Epic                                      | Stories | Funcval/E2E | Notable                                 |
| ----------------------------------------- | ------- | ----------- | --------------------------------------- |
| 9 Conversation Logging & Export           | 7/7     | ✅ PASS     | caught HIGH Docker symlink bug          |
| 10 Model Selection & Free-Model Filtering | 6/6     | ✅ PASS     | D7 enabled.via rule proven on real data |
| 11 Provider Fallback Chain                | 6/6     | ✅ PASS     | caught HIGH model double-prefix bug     |
| 12 SDK Currency & Maintenance Guard       | 2/2     | ✅ PASS     | currency guard + 1.15.13 bump           |

**Test growth:** 440 (pre-Phase-2 baseline) → **692** unit/integration tests. Coverage ~92%/85% throughout, new modules at/near 100%.

**Features shipped (FR50–FR65, NFR21–23):**

- Scannable GHA console (log groups, rationed annotations, stop-command injection guard)
- Full `conversation.json` transcript export + job summary (token/cost/duration), secret-scrubbed
- `disable_free_models` + `subscription_providers` + cost/free/subscription tagging (provider-aware via `enabled.via`)
- `fallback_config` provider chain with start-of-conversation selection (no credentials in chain; auth via auth_config)
- SDK currency CI guard + bump to 1.15.13 + pinned Docker CLI

**Two HIGH bugs caught by functional validation that unit tests missed** — the Docker symlink (Epic 9) and the fallback model double-prefix (Epic 11). The "real-runtime funcval at epic close" discipline (user directive) paid for itself twice.

**Process that worked:** leader-authored decision-complete stories grounded in the spike-validated design (D1–D8); per-story unit+review+commit with the leader reviewing every real diff (not self-reports); funcval/e2e deferred to epic boundaries (gpt-5-mini funcval, free-model e2e); accumulated retro lessons (C1 verify-after-commit, H1 stage-all-dev-files, H3 test-with-fix, L1 funcval-at-close) applied consistently.

**Process friction:** persistent-developer idle-on-pickup lag (one nudge per story, every story) — tolerable but a steady tax; Epic 9's first developer needed a full respawn for context drift. Note for future runs: the one-nudge-then-respawn policy worked.

**Status:** Phase 2 backlog fully implemented. Not yet merged to main (on `feature/harness-solution`) and not released — those are user decisions. The pre-built GHCR image + a release tag would ship these features to consumers.
