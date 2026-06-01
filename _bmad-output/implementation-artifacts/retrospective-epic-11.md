# Retrospective — Epic 11: Provider Fallback Chain

**Date:** 2026-06-01 · **Facilitator:** Winston (bmad-auto leader) · **Mode:** hybrid / auto-commit

## Outcome

**Epic 11 complete — all 6 stories done, committed, and validated in the real Docker runtime.**

| Story                                             | Commit                        | Tests     |
| ------------------------------------------------- | ----------------------------- | --------- |
| 11-1 parse fallback_config (no creds, D8)         | `395f908`                     | 650       |
| 11-2 authenticated-provider preflight (+R1 dedup) | `0f804fe`                     | 664       |
| 11-3 start-and-watch selector                     | `4a95c65` (+`a74b7dc` R2 fix) | 670 → 692 |
| 11-4 commit-boundary hardening                    | `e7e3bb1`                     | 674       |
| 11-5 exhaustion error & precedence (D5)           | `b5436ca`                     | 680       |
| 11-6 epic test sweep & integration                | `5eb04e5`                     | 689       |

Final: **692 unit+integration tests, coverage ~92.4% / ~85.8% branches** (above 80%/75%); fallback-config.ts 100%/100%. Lint zero, typecheck clean.

## Functional + E2E validation (real Docker container)

The decisive fallback e2e ran in-container against real auth. **PASS (after the R2 fix):**

- Chain `[openrouter (unauthenticated), github-copilot/gpt-5-mini (authed)]` → openrouter **preflight-skipped** with a titled warning → **advanced** to github-copilot → **committed** → `pong` → status=success.
- The full D2 start-of-conversation selection validated in production, exactly as the §7 spike predicted.

## Key event — funcval caught a HIGH defect (R2)

The first fallback e2e FAILED: `runSessionWithFallback` pinned `modelID: entry.model` where `entry.model` is provider-qualified (`"github-copilot/gpt-5-mini"`, the documented format) → SDK got `github-copilot/github-copilot/gpt-5-mini` → an authenticated, working provider failed at startup. **The fallback feature could not run a documented chain entry.** 692 unit tests were green — they used bare modelIDs in fixtures, so they missed it. Only the real-runtime e2e caught it. Fixed (`a74b7dc`: strip the `<provider>/` prefix) + 3 regression tests; re-ran the e2e → success. **Second epic in a row where functional validation caught a real shipping bug unit tests missed (Epic 9 = Docker symlink, Epic 11 = model double-prefix) — the "real runtime at epic close" discipline is earning its cost every time.**

## What went well

- **Spike-de-risked the hardest epic.** The §7 spike (run before any Epic 11 code) established that session.error fires before the first assistant part and that the user-prompt echo isn't progress. 11-3/11-4 built directly on that — no architectural surprises in the session-lifecycle orchestration.
- **Layered, reuse-heavy design.** 11-2 reused 10-1's provider-auth source (after the R1 dedup); 11-3 reused the existing event loop rather than duplicating it; 11-5 composed the 11-1→11-3 pipeline. The selector's commit-vs-error race was correctly guarded (resolved-flag, listener+session cleanup).
- **Two leader fix-rounds landed real value:** R1 (dedup the v2-parse — maintainability) and R2 (the HIGH model-prefix bug — correctness). Both were things the "all green" self-report would have shipped.

## What to improve — action items (gate Epic 12)

### HIGH

- **H3 — Regression test must accompany a fix, not follow it.** On the R2 fix, dev-e10 applied the code fix and reported "692/692 pass" — but had NOT added the regression test (the passing tests were the same ones that missed the bug). Required a second nudge. _For Epic 12 and beyond:_ a fix-request is not complete until BOTH the fix AND a test that would have caught the bug are present; the leader verifies the test exists (not just that the suite is green) before committing.

### MEDIUM (carried)

- **M1 (idle-on-pickup):** persisted all of Epic 11 — dev-e10 reliably needed one nudge per story/fix after an idle. Tolerable; one-nudge policy held.
- **M3 — Unit fixtures should mirror documented input formats.** The R2 bug existed because unit fixtures used bare modelIDs while the docs/config use provider-qualified ones. _For Epic 12:_ when a story's input has a documented format, at least one unit fixture should use that exact format.

### Process (confirmed working)

- C1 (git show HEAD verify), H1 (stage all dev src), L1 (funcval at epic close), M2 (no double frontmatter — held) — all good. Keep.

## Pre-flight checklist for Epic 12 (SDK Currency & Maintenance Guard — final epic, 2 stories)

- [ ] C1 / H1 / L1 / M1 / M2 (in practice)
- [ ] H3: verify the regression test exists for any fix before committing
- [ ] M3: unit fixtures use documented input formats
- [ ] Epic 12: 12-1 CI currency guard (scheduled npm-version check) + 12-2 bump @opencode-ai/sdk to latest (1.15.13 at design time; re-check current) + align the Dockerfile opencode-ai binary. Note the spike confirmed the CLI is now 1.15.13 (npm `latest`).
