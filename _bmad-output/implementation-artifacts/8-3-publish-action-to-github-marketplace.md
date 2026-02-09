# Story 8.3: Publish Action to GitHub Marketplace

Status: ready-for-dev

## Story

As a **GitHub Actions user**,
I want **the action listed on GitHub Marketplace**,
so that **I can discover it when searching for AI workflow tools**.

## Acceptance Criteria

1. **Given** the repository on GitHub, **When** the action is published to Marketplace, **Then** it appears in GitHub Marketplace search results
2. **Given** the Marketplace listing, **When** viewed, **Then** it shows the action name "AI Workflow Runner", the description from `action.yml`, and the branding icon (play-circle, green)
3. **Given** Marketplace listing requirements, **When** verified, **Then** `action.yml` has `name`, `description`, and `branding` fields (already present), repository has a `README.md` with usage instructions (already present), repository has a `LICENSE` file (already present), and the repository is public
4. **Given** a new release is published with Marketplace checkbox selected, **When** the Marketplace listing is updated, **Then** the latest version is shown on the Marketplace page

## Tasks / Subtasks

- [ ] **Task 1: Verify Marketplace Prerequisites** (AC: 3)
  - [ ] Confirm the GitHub repository `arch-playground/ai-workflow-runner` is **public** (required for Marketplace)
  - [ ] Confirm `action.yml` has all required Marketplace fields:
    - `name: 'AI Workflow Runner'` (must be unique across Marketplace)
    - `description: 'Run AI workflows with Node.js, Python, and Java runtime support'`
    - `branding.icon: 'play-circle'`
    - `branding.color: 'green'`
  - [ ] Confirm `README.md` exists at repository root with usage instructions
  - [ ] Confirm `LICENSE` file exists at repository root
  - [ ] Confirm GitHub account has **2FA enabled** (required for Marketplace publishers)

- [ ] **Task 2: Accept GitHub Marketplace Developer Agreement** (AC: 1)
  - [ ] Navigate to the repository on GitHub.com
  - [ ] GitHub will show a banner on the `action.yml` file offering to publish to Marketplace
  - [ ] If prompted, accept the **GitHub Marketplace Developer Agreement**
  - [ ] This is a one-time account-level acceptance

- [ ] **Task 3: Create a GitHub Release with Marketplace Publishing** (AC: 1, 2, 4)
  - [ ] Navigate to the repository's **Releases** page on GitHub.com
  - [ ] Click **"Draft a new release"**
  - [ ] Check the box: **"Publish this Action to the GitHub Marketplace"**
  - [ ] GitHub will validate `action.yml` metadata in real-time — confirm "Everything looks good!" message
  - [ ] Select a **Primary Category** for the Marketplace listing (recommended: "Continuous Integration" or "Code Quality")
  - [ ] Optionally select a **Secondary Category**
  - [ ] Enter a semantic version tag (e.g., `v1.0.0` or the next appropriate version)
  - [ ] Add a release title (e.g., "AI Workflow Runner v1.0.0")
  - [ ] Add release notes describing the action's capabilities
  - [ ] Click **"Publish release"**

- [ ] **Task 4: Verify Marketplace Listing** (AC: 1, 2)
  - [ ] Search for "AI Workflow Runner" on GitHub Marketplace
  - [ ] Verify the listing appears with correct name, description, and branding
  - [ ] Verify the listing shows usage instructions from `README.md`
  - [ ] Verify the action can be found by consumers via Marketplace search
  - [ ] Test the `uses: arch-playground/ai-workflow-runner@v1` reference works for consumers

- [ ] **Task 5: Verify Future Releases Auto-Update Marketplace** (AC: 4)
  - [ ] Confirm that subsequent releases (via the existing `release.yml` workflow) can include the Marketplace checkbox
  - [ ] Note: The existing release workflow creates releases programmatically via `softprops/action-gh-release@v2` — verify if Marketplace publishing is automatically included or requires manual release creation

## Dev Notes

### Nature of This Story

This is a **manual/process story**, not a code implementation story. No source code changes are required. The primary work involves:

1. Verifying prerequisites in the GitHub UI
2. Accepting the Marketplace Developer Agreement
3. Creating a release with Marketplace publishing enabled via the GitHub UI

### Current State (All Prerequisites Met)

The repository already has everything needed for Marketplace publication:

| Requirement                     | Status  | Details                                                                                   |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `action.yml` with `name`        | Present | "AI Workflow Runner"                                                                      |
| `action.yml` with `description` | Present | "Run AI workflows with Node.js, Python, and Java runtime support"                         |
| `action.yml` with `branding`    | Present | icon: play-circle, color: green                                                           |
| `README.md` at root             | Present | 13KB with usage instructions                                                              |
| `LICENSE` file at root          | Present | MIT License                                                                               |
| Single `action.yml` at root     | Present | No nested action files                                                                    |
| Docker image on GHCR            | Present | Story 8-1 added `publish-image` job to release pipeline                                   |
| Pre-built image reference       | Present | Story 8-2 updated `action.yml` to `docker://ghcr.io/arch-playground/ai-workflow-runner:1` |

### Marketplace Publishing via GitHub Releases

The Marketplace listing is tied to GitHub Releases. There are two approaches:

1. **Manual Release (First Time):** Create a release via GitHub.com UI with the "Publish this Action to the GitHub Marketplace" checkbox. This is required for the **initial** Marketplace publication.

2. **Automated Releases (Subsequent):** The existing `release.yml` workflow creates releases via `softprops/action-gh-release@v2`. By default, programmatically created releases are **not** automatically published to the Marketplace. After the initial manual Marketplace publication, subsequent releases may need the checkbox enabled manually, or the release workflow could be updated to include `makeLatest: true` to help with discoverability.

### Important: Marketplace Name Uniqueness

The `name` field "AI Workflow Runner" must be unique across the entire GitHub Marketplace. If this name is already taken, you'll need to choose an alternative. The GitHub UI will show a validation error during the release creation process if the name conflicts.

### Automated Release Workflow Context

The current `release.yml` (modified in story 8-1) has this flow:

1. `validate-tag` — validates semver format
2. `release` — builds, tests, creates GitHub Release via `softprops/action-gh-release@v2`
3. `publish-image` — builds and pushes Docker image to GHCR

The `release` job creates releases programmatically. The Marketplace checkbox is a GitHub UI-only feature — it is not available in the `softprops/action-gh-release` action. This means:

- **First release:** Must be created manually via GitHub UI with Marketplace checkbox
- **Subsequent releases:** Will be created by the workflow but may need manual Marketplace checkbox or the release can be edited post-creation to include Marketplace

### Anti-Patterns to Avoid

- DO NOT modify any source code for this story — no TypeScript changes needed
- DO NOT modify `action.yml` — all required fields are already present
- DO NOT use `latest` tag for consumer references — use major version (`@v1`)
- DO NOT skip the Marketplace Developer Agreement — it's legally required
- DO NOT assume the `name` is available — verify during release creation

### Project Structure Notes

- No files are modified in this story
- This is entirely a GitHub UI/process task
- All code prerequisites were completed in stories 8-1 and 8-2

### References

- [Source: action.yml] — Already has name, description, branding, and GHCR image reference
- [Source: README.md] — 13KB documentation with usage instructions
- [Source: LICENSE] — MIT License file at root
- [Source: .github/workflows/release.yml] — Release pipeline with Docker publish (story 8-1)
- [Source: _bmad-output/implementation-artifacts/8-1-add-docker-image-build-and-push-to-release-pipeline.md] — Docker GHCR setup context
- [Source: _bmad-output/implementation-artifacts/8-2-update-action-yml-to-reference-prebuilt-ghcr-image.md] — Pre-built image reference context
- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.3] — Epic acceptance criteria (FR48)
- [GitHub Docs: Publishing actions in GitHub Marketplace](https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace)
- [GitHub Docs: Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
