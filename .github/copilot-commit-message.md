Follow the Conventional Commits format strictly: `<type>(<optional scope>): <description>`.

Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

Rules:

- Header must be 100 characters or less.
- Use imperative mood in the description (e.g., 'add' not 'added').
- Do NOT capitalize the first letter of the description.
- Do NOT end the description with a period.
- Use scope when the change targets a specific component (e.g., `feat(validation): add JS support`).
- For breaking changes, add `!` after the type/scope (e.g., `feat!: remove deprecated input`) or add a `BREAKING CHANGE:` footer.
- Keep the description concise — focus on WHY, not WHAT.

IMPORTANT for release-please:

- This project uses release-please to auto-create releases from conventional commits.
- Only these types trigger a release: `feat` (minor bump), `fix` (patch bump), `perf` (patch bump).
- Types like `chore`, `docs`, `refactor`, `test`, `ci`, `style`, `build` do NOT trigger a release.
- If your change should appear in the changelog and trigger a release, use `feat:` or `fix:`.
- PR titles MUST also follow this format — squash merges use the PR title as the commit message.

Examples:

- feat(runner): add timeout configuration input
- fix(security): prevent path traversal in workflow resolution
- fix(opencode): include provider ID in list models output
- docs: update README with new action inputs
- ci: add CodeQL security scanning workflow
- chore(deps): bump @actions/core to v3.1.0
- refactor: extract Docker metadata into helper function
- test(validation): add edge cases for env_vars parsing
