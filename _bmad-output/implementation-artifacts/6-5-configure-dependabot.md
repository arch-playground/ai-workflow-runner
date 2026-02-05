# Story 6.5: Configure Dependabot

Status: done

## Story

As a **maintainer**,
I want **automated dependency updates via Dependabot**,
So that **security vulnerabilities are addressed promptly and dependencies stay current**.

## Acceptance Criteria

1. **Given** dependabot.yml configuration
   **When** weekly schedule runs
   **Then** npm dependencies are checked for updates
   **And** pull requests are created for available updates

2. **Given** dependabot.yml configuration
   **When** weekly schedule runs
   **Then** GitHub Actions are checked for updates
   **And** pull requests are created for action version updates

3. **Given** dev dependencies
   **When** Dependabot finds updates
   **Then** dev dependencies are grouped together in single PR
   **And** group includes @types/_, eslint_, prettier, typescript, jest, etc.

4. **Given** pull request limits
   **When** many updates available
   **Then** maximum 10 open PRs allowed (open-pull-requests-limit: 10)

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing `.github/dependabot.yml` implementation

- [x] **Task 2: Verify npm Ecosystem Configuration** (AC: 1, 3, 4)
  - [x] Confirm package-ecosystem: 'npm'
  - [x] Verify directory: '/'
  - [x] Confirm schedule interval: 'weekly'
  - [x] Verify open-pull-requests-limit: 10
  - [x] Confirm dev-dependencies group configuration

- [x] **Task 3: Verify Dev Dependencies Group** (AC: 3)
  - [x] Confirm group name: dev-dependencies
  - [x] Verify patterns include @types/\*
  - [x] Verify patterns include @vercel/\*
  - [x] Verify patterns include @eslint/\*
  - [x] Verify patterns include eslint\*
  - [x] Verify patterns include prettier
  - [x] Verify patterns include typescript
  - [x] Verify patterns include jest
  - [x] Verify patterns include ts-jest
  - [x] Verify patterns include husky
  - [x] Verify patterns include lint-staged
  - [x] Verify patterns include esbuild

- [x] **Task 4: Verify GitHub Actions Ecosystem** (AC: 2)
  - [x] Confirm package-ecosystem: 'github-actions'
  - [x] Verify directory: '/'
  - [x] Confirm schedule interval: 'weekly'

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Requirements

- Dependabot config at `.github/dependabot.yml`
- Weekly schedule balances freshness with PR noise
- Dev dependency grouping reduces PR count
- Open PR limit prevents overwhelming maintainers

### Implementation Reference

The Dependabot configuration exists at `.github/dependabot.yml`:

- Two ecosystems: npm and github-actions
- Dev dependencies grouped to reduce noise
- Weekly schedule for both ecosystems
- Added @eslint/\* and esbuild patterns for completeness

### Key Patterns

```yaml
# Dependabot configuration pattern
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        patterns:
          - '@types/*'
          - '@vercel/*'
          - '@eslint/*'
          - 'eslint*'
          - 'prettier'
          - 'typescript'
          - 'jest'
          - 'ts-jest'
          - 'husky'
          - 'lint-staged'
          - 'esbuild'

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
```

### Dependency Categories

**Production Dependencies (individual PRs):**

- `@actions/core` - GitHub Actions toolkit
- `@opencode-ai/sdk` - AI SDK

**Dev Dependencies (grouped):**

- `@types/*` - TypeScript type definitions
- `@vercel/ncc` - Bundler (legacy)
- `@eslint/*` - ESLint scoped packages (v9+)
- `eslint*` - Linting tools
- `prettier` - Code formatting
- `typescript` - TypeScript compiler
- `jest`, `ts-jest` - Testing framework
- `husky`, `lint-staged` - Git hooks
- `esbuild` - Bundler

### NFR Alignment

- NFR19: Dependabot with weekly updates ✓
- Ensures security patches are applied promptly
- Keeps dependencies current for compatibility

### Project Structure Notes

- Dependabot config: `.github/dependabot.yml`
- Package definition: `package.json`
- Lock file: `package-lock.json`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Maintainability NFRs]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5]
- [Source: GitHub Dependabot documentation]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) - Code Review 2026-02-05

### Debug Log References

N/A - Verification task only

### Completion Notes List

- All acceptance criteria verified against implementation
- Added @eslint/\* pattern for ESLint v9+ scoped packages (Issue #8 fix)
- Added esbuild to dev-dependencies group

### File List

- `.github/dependabot.yml` - Dependabot configuration (verified + enhanced)
- `package.json` - Package dependencies (verified)

### Change Log

| Date       | Change                                                            | Author          |
| ---------- | ----------------------------------------------------------------- | --------------- |
| 2026-02-05 | Code review completed, all tasks verified, status updated to done | Claude Opus 4.5 |
| 2026-02-05 | Added @eslint/\* pattern for ESLint v9 compatibility              | Claude Opus 4.5 |
| 2026-02-05 | Added esbuild to dev-dependencies group                           | Claude Opus 4.5 |
