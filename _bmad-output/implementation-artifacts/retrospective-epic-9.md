# Retrospective — Epic 9: Conversation Logging & Transcript Export

**Date:** 2026-06-01 · **Facilitator:** Winston (bmad-auto leader) · **Mode:** hybrid / auto-commit

## Outcome

**Epic 9 complete — all 7 stories done, committed, validated.**

| Story                                | Commit                 | Tests |
| ------------------------------------ | ---------------------- | ----- |
| 9-1 log-group wrapping               | `9093df6`              | 445   |
| 9-2 ration annotations               | `363da6e`              | 447   |
| 9-3 transcript writer                | `6d5d836` (+`b1d4173`) | 471   |
| 9-4 job summary writer               | `32a5e99`              | 486   |
| 9-5 stop-command + long-line guard   | `aeec4be`              | 491   |
| 9-6 action inputs/outputs + examples | `ee51c21` (+`283b465`) | 545   |
| 9-7 epic test sweep                  | `2094dc3`              | 561   |

Final: **561 unit+integration tests, coverage 92.24% stmts / 84.74% branches** (both above 80%/75%). Lint zero warnings, typecheck clean, bundle builds.

## What went well

- **Design doc as ground truth.** Every story traced to the OpenCode Upgrade Design (§3, D3/D6) and the verified SDK API. No story stalled on "what should this do?" — the spec was decision-complete before delegation.
- **Verify-before-spec caught a hallucination risk.** For 9-5, the leader confirmed `core.stopCommands` does NOT exist and `core.info` writes raw stdout BEFORE writing the story, directing the developer to the real `issue`/stdout mechanism. Saved a wasted round.
- **Fetch-once synergy (9-3/9-4) designed up front** — one `session.messages` call feeds both transcript + summary; 9-7 integration-verified it end-to-end.
- **Adversarial-style leader review** — every diff reviewed against ACs + the real code, not the developer's self-report; tests independently re-run before each commit. Caught real gaps.

## What to improve — action items (gate Epic 10)

### CRITICAL

- **C1 — Verify `git show HEAD:` after every commit.** A staging-order race with the husky/lint-staged pre-commit hook captured `9-3` sprint-status as `ready-for-dev` despite the edit (fixed in `b1d4173`). _Pre-flight for Epic 10:_ after each story commit, confirm `git show HEAD:sprint-status.yaml` shows the intended status. **Adopted mid-Epic-9; held for 9-4..9-7.**

### HIGH

- **H1 — Stage dev-touched files, not a fixed list.** The `ee51c21` commit's explicit `git add <list>` missed `examples.spec.ts` (6 tests the developer wrote), requiring follow-up `283b465`. _Pre-flight for Epic 10:_ after staging, run `git status` and include any unstaged tracked `src/` changes (or `git add -u src/`) before committing.
- **H2 — Respawn a persistent developer when it re-reports completed work.** The original `developer` looped on stale context (re-reporting 9-1/9-3/9-5 instead of engaging new packets). Respawning fresh (`developer-2`) for 9-6 resolved it immediately and it engaged cleanly through 9-7. _Pre-flight for Epic 10:_ if an agent idles post-delegation AND its next message echoes a completed story, respawn fresh rather than nudging repeatedly (1 nudge max, then respawn).

### MEDIUM

- **M1 — RESOLVED: Docker functional validation run, caught a HIGH bug.** Initially logged PARTIAL (no local docker). When docker became available, the full container validation was run and **caught a real pre-existing HIGH defect**: the Dockerfile symlinked `opencode` → `bin/opencode` but the `opencode-ai` package binary is `bin/opencode.exe` (per its `package.json` "bin"), so the image **failed to build** and the action would have been broken at runtime in production (it spawns `opencode serve`). Pre-existing since the SDK-v2 migration (`1256eaa`); NOT introduced by Epic 9. **Fixed** (symlink → `opencode.exe`) + **CI guard added** (explicit "verify runtime binaries resolve in image" step in `ci.yml` after the docker build — hard gate on `opencode/node/python3/java --version`). After the fix, the full Epic 9 feature set was validated end-to-end in the real container against github-copilot: assistant returned `pong`, `conversation.json` written (valid JSON, 0600, secret scrubbed to 0 raw occurrences), job summary rendered (token table + final message), stop-commands bracketed, titled annotations, success/error paths both correct. **This is the strongest evidence the epic works — and validates the "always run functional + manual tests after an epic" discipline.**

### Lesson (process)

- **L1 — Functional/container validation is mandatory at epic close, not "deferred to CI".** 561 green unit tests (which mock the SDK, fs, and @actions/core) did NOT catch a broken Docker image. Running the real action in its real runtime did. For every epic going forward: build the image, run the action end-to-end, verify real artifacts on disk — before declaring the epic done.

## Pre-flight checklist for Epic 10 (Model Selection & Free-Model Filtering)

- [ ] C1: verify `git show HEAD:` after each commit (already in practice)
- [ ] H1: stage all dev-touched tracked `src/` files (check `git status` pre-commit)
- [ ] H2: respawn-fresh policy for a drifting persistent developer (1 nudge → respawn)
- [ ] Epic 10 leverages the `enabled.via === "account"` rule (D7) validated against the real server — ensure stories cite the verified two-endpoint join (`v2.provider.list` + `config.providers`)
