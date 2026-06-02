# Test Design — Epic 13: Security Hardening

**Date:** 2026-06-02 · **Scope:** the 9 implementation stories (13-1..13-7, 13-9, 13-10) + the epic-end re-validation (13-8).

## Coverage strategy

Two layers, per the project validation policy (per-story = unit+review; full funcval + manual at epic end):

1. **Unit (per story, in `src/*.spec.ts`):** every new function + the security-critical branches. 847 tests total (+~155 from Epic 13), 93%/87% coverage, new modules near 100%.
2. **Epic-end real-container re-validation (`docs/tests/test-run-epic13-revalidation-2026-06-02.md`):** the verified red-team attacks re-run against the final `awr:13-final` image — the acceptance oracle (every finding must flip to PASS).

## Unit coverage by story

| Story                    | Key units tested                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13-1 env scoping         | `buildScopedEnv` allowlist (undeclared secrets excluded, runtime vars kept); `buildChildEnv` regression; opencode snapshot/scope/restore (GITHUB_TOKEN restored post-init).                                           |
| 13-2 tool allowlist + FS | `permissions.ts` policy: bash read-only allowlist + read-only git, `.git/config` denies (findLast ordering), external_directory:deny, merge (consumer can't weaken), `shouldAutoApprove`; directory confinement root. |
| 13-3 non-root            | Docker build + non-root verification (entrypoint/Dockerfile — validated via the real-container funcval, not unit).                                                                                                    |
| 13-4 baseURL             | `validateProviderBaseUrl` (https, private/metadata reject, glob allowlist), `extractProviderBaseUrls`, B1 throw, B2 auth-skip; Copilot host passes; Azure/Bedrock globs.                                              |
| 13-5 timeout             | combined AbortSignal; status timeout vs cancelled; setFailed suppression; retry-loop guard (pre/mid/non-abort).                                                                                                       |
| 13-6 summary + mask      | `addCodeBlock` (not addRaw); `maskAmbientSecrets`/`maskAuthValues` (length guard, present/absent).                                                                                                                    |
| 13-7 docs + pins         | (docs/Dockerfile — verified by the digest-pinned image build, not unit.)                                                                                                                                              |
| 13-9 webfetch            | `buildWebfetchPermissionEnv` (empty→undefined, allow-first/deny-last, webfetch-scoped); OPENCODE_PERMISSION present-on-env when set / absent when empty.                                                              |
| 13-10 write-deny         | edit deny-by-default object; writable_paths allow-first/deny-last; edit removed from auto-approve + read-family; consumer can't re-enable.                                                                            |

## Epic-end re-validation (13-8) — the acceptance oracle

Every verified red-team finding re-tested against `awr:13-final`, all PASS (see the re-validation report). Plus regression: knowledge extraction (read-only bash + git log) works, Copilot runs, transcript/summary produced, non-root writes succeed, Epic 9/10/11 suites green.

## Gaps / deferred

- **webfetch live allow/deny** and **write-deny-under-writable_paths live** are documented in the re-validation as the remaining live smoke tests (the deny-by-default cases ARE verified live; the _allow-a-specific-domain/path_ positive cases are unit-verified + would need a network/edit-allowed run). Tie webfetch re-verify to the Epic 12 SDK-currency guard (it rides a type-hidden runtime behavior).
- No E2E framework change; existing e2e unaffected.
