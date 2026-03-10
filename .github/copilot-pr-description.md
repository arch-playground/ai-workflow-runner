PR title MUST follow Conventional Commits format: `<type>(<optional scope>): <description>`.

This is critical because this project uses squash merges and release-please parses the merge commit message (which comes from the PR title) to determine version bumps and changelog entries.

Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

Release-triggering types:

- `feat` — minor version bump (1.x.0)
- `fix` — patch version bump (1.1.x)
- `perf` — patch version bump (1.1.x)

Non-release types (no version bump, not in changelog):

- chore, docs, refactor, test, ci, style, build

Rules:

- PR title must be 100 characters or less.
- Use imperative mood (e.g., 'add' not 'added').
- Do NOT capitalize the first letter of the description.
- Do NOT end with a period.
- For breaking changes, add `!` after type/scope or include `BREAKING CHANGE:` in the PR body.
