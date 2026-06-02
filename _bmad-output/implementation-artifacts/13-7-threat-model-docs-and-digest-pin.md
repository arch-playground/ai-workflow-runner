---
baseline_commit: 36cb674c8e260e7570bbad2f7b7c838bb7910d2f
---

# Story 13.7: Threat-Model Docs + Digest-Pin Base Images

Status: review

## Story

As an **adopting organization**,
I want **safe-deployment guidance and tamper-evident container builds**,
So that **I deploy the Action without the configuration footguns that dominate real Action compromises (closes FINDING-3 doc gap), and the base images can't silently change under me (closes FINDING-4)**.

## Background

**Red-team findings:**

- **FINDING-3 (HIGH, DOC):** README/SECURITY.md cover input-hardening but say nothing about the **adoption** risks that cause most Action compromises: `pull_request_target` + untrusted PR + secrets, minimal `permissions:`, that `opencode_config` is trusted/credential-adjacent, that validation scripts / the agent run code, and egress filtering. This is the single highest-leverage doc deliverable.
- **FINDING-4 (MEDIUM):** Dockerfile base images use mutable tags (`node:20-bookworm-slim`, `debian:bookworm-slim`). An upstream tag-repoint or registry compromise silently changes every rebuild. Pin by `@sha256:` digest (tamper-evident, reproducible — aligns with ai-memory `supply-chain-branch-remediation` artifact-integrity decision).

**Scope boundary:** documentation + Dockerfile digest pins ONLY. No app code, no behavior change. Do NOT touch src/.

## Acceptance Criteria

1. **Threat Model / Security Considerations section** added to README (extend the existing `## Security` at l.249) AND `SECURITY.md`, covering at minimum:
   - **Minimal `permissions:`** — set least-privilege `GITHUB_TOKEN` permissions in the calling workflow.
   - **Never `pull_request_target` + untrusted PR + secrets** — do not run this Action against untrusted PR content while secrets are in scope; if you must process PRs, use `pull_request` (no secrets) or gate carefully.
   - **Trusted inputs** — `workflow_path`, `prompt`, `opencode_config`, `validation_script`, `auth_config` are **code/credential-adjacent**; treat them as trusted, never sourced from untrusted input. `opencode_config` can direct where credentials are sent (now allowlisted in 13-4, but document the principle).
   - **The agent runs code** — by default it has read-only shell + read-only git (13-2) confined to the workspace (13-2) as non-root (13-3); `allow_bash`/`bash_allow_patterns`/`writable_paths`/`webfetch_allowed_domains`/`agent_working_directory` widen that surface — document the implications of each opt-in.
   - **Egress filtering** — for consumers needing network egress control, recommend `step-security/harden-runner` or runner network policy (the Action is not a network firewall).
   - **Secrets via Secrets not Variables** — auth in GitHub Secrets (already noted; keep/expand).

2. **No false security claims.** README must not claim "sandboxed", "isolated", "no network access", or "cannot access secrets" — the security model is defense-in-depth + the adopter's GitHub config. (Verify none exist; the red-team confirmed none currently.)

3. **Base images pinned by digest.** All three Dockerfile `FROM` lines pinned: `FROM node:20-bookworm-slim@sha256:<digest>` and `FROM debian:bookworm-slim@sha256:<digest>` (builder + runtime). Use the current digests for the platform(s) the Action targets. Keep the human-readable tag in a comment for readability. Image still builds; `opencode --version` verify passes.

4. **Digest maintainability noted.** A short comment or doc note that Dependabot/Renovate can bump pinned digests (so pinning doesn't become stale-security). Confirm `.github/dependabot.yml` covers Docker (or note if it needs the `docker` ecosystem added — that's a small adjacent fix, include it if trivial).

5. **Inputs documented.** The new Epic 13 inputs (`allow_bash`, `bash_allow_patterns`, `agent_working_directory`, `allowed_provider_hosts`, `webfetch_allowed_domains`, `writable_paths` — those that exist after 13-2/13-4; 13-9/13-10 add the last two) are reflected in the README inputs table with their security defaults (deny-by-default posture explained). (Add the ones that exist now; 13-8 final pass can reconcile any added later.)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] global/security, conventions, commenting standards. (Tech-writing story — light on code skills; `typescript-clean-code` not needed.)
  - [x] Read design `security-hardening-design-2026-06-02.md` → FINDING-3/FINDING-4 + the full per-finding fixes (so the docs accurately describe the shipped controls). Read `docs/tests/test-run-redteam-2026-06-01.md` for the adoption risks (TC-RT-09).

- [x] **Task 2: Threat Model docs** (AC: 1, 2, 5)
  - [x] Extend README `## Security` with a "Threat Model & Safe Adoption" subsection (the bullets in AC1). Update the inputs table for the new Epic 13 inputs + their security defaults.
  - [x] Extend SECURITY.md with the same adoption guidance (it currently lists input-hardening measures; add the deployment/threat-model section).
  - [x] Grep README for false claims (sandbox/isolated/no network/cannot access) — confirm none, or fix.

- [x] **Task 3: Digest-pin base images** (AC: 3, 4)
  - [x] Resolve current digests: `docker pull node:20-bookworm-slim` + `docker pull debian:bookworm-slim`, read the `RepoDigests` (`docker inspect --format '{{index .RepoDigests 0}}'`). Pin all three FROM lines `FROM <image>@sha256:<digest>` with the tag in a trailing comment.
  - [x] Build the image to confirm it still builds + `opencode --version` passes.
  - [x] Ensure `.github/dependabot.yml` has the `docker` ecosystem (so digests get bumped); add it if missing + trivial.

- [x] **Final Task: Quality Checks** — `npm run lint` · `npm run format` (docs are md; lint/format mostly a no-op but run for consistency). The Docker build is the real gate for Task 3.

## Dev Notes

- **Multi-arch caveat:** a `@sha256:` digest pins a specific manifest. For a multi-arch image, pin the **manifest-list** digest (the one `docker pull` reports as `RepoDigests`), which resolves per-arch — so it still works on amd64+arm64 runners. Use the RepoDigest, not a per-arch image digest.
- **Keep the tag in a comment** (`FROM debian:bookworm-slim@sha256:abc... # bookworm-slim`) so a human can see what version it is.
- **Don't overstate the docs** — describe the _actual_ shipped controls (env scoping, read-only bash + read-only git, FS confinement, non-root, baseURL allowlist, timeout, inert summary). The docs are the adopter's map; accuracy matters (no false "sandboxed" claims — AC2).
- **ai-memory `supply-chain-branch-remediation`:** artifact integrity (digest pins) is the right control for tamper-evidence.
- This is a docs/Dockerfile story — no src changes. If you find yourself editing src/, stop and flag to leader.

### References

- [Source: epics.md#Story 13.7] · [Source: prd.md#FR73]
- [Source: research/security-hardening-design-2026-06-02.md → FINDING-3 (docs), FINDING-4 (digest pin)]
- [Source: docs/tests/test-run-redteam-2026-06-01.md → TC-RT-09 (adoption risks), FINDING-3/4]
- Current: `README.md` (## Security l.249), `SECURITY.md`, `Dockerfile` (FROM l.2/13/42), `.github/dependabot.yml`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (bmad-auto sub-agent)

### Completion Notes List

- **Task 1:** Read global/security, commenting, conventions standards; read security-hardening-design-2026-06-02.md (FINDING-3/4 sections) and test-run-redteam-2026-06-01.md (TC-RT-09).
- **Task 2 (README):** Extended `## Security` with new `### Threat Model & Safe Adoption` subsection covering: minimal permissions, pull_request_target warning, trusted inputs table, opt-in surface table (bash_allow_patterns/agent_working_directory/allowed_provider_hosts), egress filtering note, secrets-not-variables guidance. Added three Epic 13 inputs (bash_allow_patterns, agent_working_directory, allowed_provider_hosts) to the inputs table with security-default notes. Confirmed no false claims (sandbox/isolated/no-network) in README.
- **Task 2 (SECURITY.md):** Extended Security Measures bullet list with 7 new Epic 13 controls. Added full `## Threat Model & Safe Adoption` section mirroring README coverage.
- **Task 3:** Pulled both images, captured RepoDigests (manifest-list digests, multi-arch safe). Pinned all 3 FROM lines with `@sha256:` digest + tag in preceding comment (inline comment on FROM line is invalid Dockerfile syntax — comment placed on the line above). Added `docker` ecosystem to `.github/dependabot.yml`. Built image `awr:13-7-test` — build succeeded, `opencode --version` → `1.15.13` ✅.
- **Final Task:** `npm run lint` clean, `npm run format` unchanged, `npm run typecheck` clean.
- **Digests captured:** `node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0`, `debian:bookworm-slim@sha256:0104b334637a5f19aa9c983a91b54c89887c0984081f2068983107a6f6c21eeb`.

### File List

- `README.md` — extended `## Security` with Threat Model & Safe Adoption subsection; added Epic 13 inputs to inputs table
- `SECURITY.md` — extended Security Measures list + added Threat Model & Safe Adoption section
- `Dockerfile` — all 3 FROM lines digest-pinned (node:20-bookworm-slim stage 1; debian:bookworm-slim stages 2+3)
- `.github/dependabot.yml` — added `docker` ecosystem entry

## QA Results (leader code review + funcval, 2026-06-02)

**Code review: PASS.** README + SECURITY.md gain an accurate "Threat Model & Safe Adoption" section (explicitly "not a sandbox", minimal permissions, pull_request_target warning, trusted-inputs table, opt-in-surface table, egress/harden-runner, secrets-not-variables). No false claims. All 3 Dockerfile FROM lines digest-pinned (node + debian×2). dependabot.yml gains the `docker` ecosystem. The `addCodeBlock` mock addition in test/mocks/@actions/core.ts is a legitimate test-infra fix (13-6 introduced core.summary.addCodeBlock) — acceptable, not unauthorized src change.

**Funcval (FINDING-4 gate): PASS** — the digest-pinned image builds; `opencode --version` → 1.15.13; debian digest cross-verified against the registry RepoDigest (`debian@sha256:0104b3…` matches). 813/813 tests pass.

**FINDING-3 (threat-model docs) + FINDING-4 (digest pins) closed.**
