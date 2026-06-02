# Retrospective — Epic 13: Security Hardening (Red-Team Remediation)

**Date:** 2026-06-02 · **Facilitator:** Winston (bmad-auto leader) · **Mode:** hybrid / auto-commit

## Outcome

**Epic 13 complete — all 10 stories done, committed, validated. Every verified red-team finding closed and re-tested PASS against the final hardened container.**

| Story                                  | Commit (feat)  | Finding closed              |
| -------------------------------------- | -------------- | --------------------------- |
| 13-1 env scoping                       | env scoping    | AGENT-01, AGENT-06          |
| 13-2 tool allowlist + FS confinement   | tool allowlist | AGENT-09 (RCE), AGENT-02/03 |
| 13-3 non-root container                | gosu drop      | AGENT-05                    |
| 13-4 baseURL allowlist + refuse-auth   | baseURL        | AGENT-04 / FINDING-1        |
| 13-5 global wall-clock timeout         | timeout        | FINDING-2                   |
| 13-6 inert summary + ambient masking   | summary        | AGENT-08 / MEDIUM-2         |
| 13-7 threat-model docs + digest-pin    | docs+pins      | FINDING-3, FINDING-4        |
| 13-9 webfetch per-domain allowlist     | webfetch       | (hardens 13-2 deny)         |
| 13-10 deny file-write + writable_paths | write-deny     | workspace-write (BE-05)     |
| 13-8 tests + epic-end re-validation    | re-validation  | all (acceptance oracle)     |

## Security outcome

- **3 verified CRITICAL exploits closed:** baseURL credential exfil (FINDING-1/AGENT-04), unscoped-agent secret theft (AGENT-01/02/03/06), prompt-driven root RCE (AGENT-09). Plus AGENT-05 (HIGH), FINDING-2 + AGENT-08 (MEDIUM), FINDING-3/4 (doc/supply-chain).
- **Epic-end re-validation** (`docs/tests/test-run-epic13-revalidation-2026-06-02.md`) re-ran the real red-team attacks against `awr:13-final` — every finding PASS. Decisive evidence: the agent's reads of `/proc/self/environ` and `auth.json` are **refused at the tool layer**; bash arbitrary commands don't execute; secrets appear only as `::add-mask::` directives.
- **Layered, secure-by-default containment** — env scoping + tool allowlist + FS confinement + non-root + baseURL allowlist each independently contributes; no single point of failure.
- **Product purpose preserved:** read-only bash + read-only git + read-family tools keep knowledge extraction working; Copilot-never-blocked held throughout.

## Test growth

692 (end of Epic 12) → **847** unit tests; 93%/87% coverage; new modules (`permissions.ts`) near 100%. New `src/permissions.ts` leaf as the single source of truth for the tool policy.

## What went well

- **Research → architect-judgement → epic** front-loading paid off: the design doc (ai-memory + second-brain aligned) meant every story was decision-complete; devs rarely hit a fork.
- **The fine-grained refinements** (bash command allowlist, read-only git incl. `.git/config` two-layer close, directory confinement, webfetch domain allowlist, write-deny) all proved natively supported by opencode — verified in source before promising, which avoided dead ends.
- **Catching the load-bearing conflicts early:** the permission-merge-direction bug and the `handlePermissionAsked` auto-approve (which would have made every deny rule theatre) were flagged in the 13-2 story spec, not discovered in code.
- **Leader independent funcval caught a false alarm (13-3):** the "auth file not found" appeared to be a non-root regression but an A/B against the pre-13-3 image proved it pre-existing (a test-harness RUNNER_TEMP path-mapping error). Verify-before-blame held.
- **Sandboxed sibling-container harness** (from the prior red-team round) reused for the baseURL exfil re-test — credential never touched the host.

## Process friction (carry forward)

- **Persistent-developer context churn:** 3 respawn-with-handover cycles across 10 stories (every ~3 stories). The handover protocol worked, but the **idle-on-pickup channel lag** (dev echoing the prior story's completion before picking up the next packet) was a steady tax — every respawn needed a confirmation nudge. The pragmatic fix that worked: **respawn with current-state-in-the-spawn-prompt** rather than waiting on a handover rewrite when the dev is lagging.
- **Working-tree audit (C1) caught a real state issue:** a terminating dev's stale session dirtied 3 already-committed files (legit 13-9 doc-completion + a stray sprint-status status-revert). Verify-from-disk before each commit surfaced it; committed the legit docs, reverted the stray status flip. **Lesson reinforced: always `git status` + diff committed files before the next commit; a terminating agent can dirty them.**
- **Funcval path-mapping:** the `RUNNER_TEMP → /github/runner_temp` Docker mount mapping + `auth_config` input (not a `/root` mount) must be replicated to avoid false failures (cost a diagnostic loop in 13-3 and again in 13-8). Documented in the re-validation report.

## Action items

- **C-NEW (carry):** when respawning a lagging persistent dev, supply current state directly in the spawn prompt — don't block on a handover rewrite. (Proven this epic.)
- **H-NEW (carry):** `git status` + `git diff` committed files before every commit — a terminating teammate can dirty already-done work. (Caught a stray status revert this epic.)
- **funcval harness note:** replicate GitHub's RUNNER_TEMP mount mapping + use `auth_config` input in container funcval. (In the re-validation report.)
- **webfetch (13-9) currency watch:** the OPENCODE_PERMISSION env approach rides a type-hidden runtime behavior — re-verify on every opencode bump via the Epic 12 currency guard; plugin fallback documented.
- Accumulated discipline (C1 verify-after-commit, H1 stage-all-dev-files, leader-reviews-every-real-diff, funcval-at-epic-close) all held and remain standard.

## Status

Epic 13 fully implemented + re-validated on `feature/harness-solution`. **Not yet merged to main, not released** — those are user decisions. The 3 CRITICAL exploits that the whitehat round found are now closed; the Action is materially safer for adopting organizations.
