# Sprint Change Proposal — Documentation Alignment

**Date:** 2026-03-10
**Scope:** Minor (documentation-only)
**Status:** Approved

## Issue Summary

Six implementation stories had acceptance criteria and technical details that diverged from the actual code after iterative fixes during deployment testing. The code is correct and fully tested — only the story documentation needed alignment.

### Change Triggers

1. **Auth config handling** — SDK `Config` type has no auth field; auth must use `client.auth.set()` API per provider
2. **Docker image tags** — Lacked `v` prefix, causing `manifest unknown` errors since `action.yml` references `:v1`
3. **workflow_path required** — GitHub Actions enforced `required: true` at runner level, blocking `list_models` feature
4. **Stale dist/** — Docker images shipped old bundled code; added bundler stage to build from source
5. **Release workflow** — Restructured from tag-triggered to release-please + workflow_dispatch dual paths

## Artifacts Updated

| Artifact      | Key Changes                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **story-7.3** | AC2: auth via `client.auth.set()` API (not config merge). Removed `mergeConfigs()`, added `applyAuth()`. Tests in `opencode-config.spec.ts` with shared helpers. 18 unit tests. |
| **story-5.1** | AC1: 3-stage Dockerfile (bundler + builder + runtime). `dist/` no longer in git. `.dockerignore` updated.                                                                       |
| **story-6.3** | Complete restructure: release-please + workflow_dispatch → publish-image → update-major-tag (4-job pipeline).                                                                   |
| **story-8.1** | AC2: Tags include v-prefixed variants (`v1.2.3`, `v1.2`, `v1`), minor version tags, SHA tags. Dependencies updated to match new release workflow structure.                     |
| **story-8.2** | AC1: Image reference `:v1` (not `:1`). Consistent with `@v1` action convention.                                                                                                 |
| **story-7.4** | AC5: `workflow_path` made `required: false` in `action.yml`. `validateInputs()` returns early when `listModels` is true.                                                        |
| **epics.md**  | Updated implementation status, Story 5.1/6.3/7.3/8.1/8.2 acceptance criteria aligned with actual code.                                                                          |

## Impact Assessment

- **PRD/MVP:** No impact. All changes are implementation-level corrections.
- **Architecture:** Auth strategy changed from config merge to `auth.set()` API. No structural changes.
- **Code:** No code changes needed — code is already correct and tested.
- **Scope:** Documentation alignment only.

## Handoff

- **Executed by:** Correct-course workflow (automated documentation updates)
- **No further action required** — all story files and epics.md have been updated inline.
