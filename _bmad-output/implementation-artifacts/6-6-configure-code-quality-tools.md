# Story 6.6: Configure Code Quality Tools

Status: done

## Story

As a **contributor**,
I want **consistent code style enforced by ESLint, Prettier, and TypeScript strict mode**,
So that **the codebase is maintainable and consistent across all contributors**.

## Acceptance Criteria

1. **Given** ESLint configuration
   **When** npm run lint is run
   **Then** TypeScript strict rules are enforced
   **And** no-console rule prevents accidental console.log
   **And** explicit return types are required

2. **Given** Prettier configuration
   **When** npm run format is run
   **Then** code is formatted consistently
   **And** all files match the defined style

3. **Given** TypeScript configuration
   **When** strict mode is enabled
   **Then** noImplicitReturns is enforced
   **And** noFallthroughCasesInSwitch is enforced
   **And** noUncheckedIndexedAccess is enforced

4. **Given** pre-commit hooks via Husky
   **When** code is committed
   **Then** lint-staged runs ESLint and Prettier on staged files

5. **Given** all quality tools
   **When** configured together
   **Then** ESLint extends Prettier config (no conflicts)
   **And** TypeScript and ESLint use same parser

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/code-quality.md` - Quality standards
  - [x] Review existing configuration files

- [x] **Task 2: Verify ESLint Configuration** (AC: 1, 5)
  - [x] Confirm parser: @typescript-eslint/parser
  - [x] Verify plugins include @typescript-eslint
  - [x] Confirm extends includes eslint:recommended
  - [x] Confirm extends includes plugin:@typescript-eslint/recommended
  - [x] Confirm extends includes plugin:@typescript-eslint/recommended-requiring-type-checking
  - [x] Confirm extends includes prettier (last, for override)
  - [x] Verify parserOptions.project points to tsconfig files
  - [x] Confirm @typescript-eslint/explicit-function-return-type: error
  - [x] Confirm no-console: error
  - [x] Verify ignorePatterns excludes dist/, coverage/, node_modules/

- [x] **Task 3: Verify Prettier Configuration** (AC: 2)
  - [x] Confirm semi: true
  - [x] Confirm singleQuote: true
  - [x] Confirm tabWidth: 2
  - [x] Confirm trailingComma: 'es5'
  - [x] Confirm printWidth: 100

- [x] **Task 4: Verify TypeScript Configuration** (AC: 3)
  - [x] Confirm target: ES2022
  - [x] Confirm module: NodeNext
  - [x] Confirm moduleResolution: NodeNext
  - [x] Confirm strict: true
  - [x] Confirm noImplicitReturns: true
  - [x] Confirm noFallthroughCasesInSwitch: true
  - [x] Confirm noUncheckedIndexedAccess: true
  - [x] Confirm isolatedModules: true
  - [x] Verify esModuleInterop: true

- [x] **Task 5: Verify Husky and lint-staged** (AC: 4)
  - [x] Confirm husky is installed (devDependency)
  - [x] Verify lint-staged is installed (devDependency)
  - [x] Confirm lint-staged config in package.json
  - [x] Verify \*.{ts,js} runs eslint --fix and prettier --write
  - [x] Verify \*.{json,md,yml,yaml} runs prettier --write
  - [x] Confirm prepare script: husky install
  - [x] Verify .husky/pre-commit hook runs npx lint-staged

- [x] **Task 6: Verify npm Scripts** (AC: 1, 2, 3)
  - [x] Confirm lint script: eslint src test --max-warnings 0
  - [x] Confirm format script: prettier --write src test
  - [x] Confirm format:check script: prettier --check src test
  - [x] Confirm typecheck script: tsc --noEmit

- [x] **Final Task: Quality Checks**
  - [x] Run `npm run lint` - Fix any linting issues
  - [x] Run `npm run format` - Verify code formatting
  - [x] Run `npm run typecheck` - Ensure type safety

## Dev Notes

### Architecture Requirements

- ESLint for code quality and TypeScript-specific rules
- Prettier for consistent formatting (no conflicts with ESLint)
- TypeScript strict mode for maximum type safety
- Husky + lint-staged for pre-commit enforcement

### Implementation Reference

All configuration files exist and are properly configured:

- `.eslintrc.json` - ESLint with TypeScript rules
- `.prettierrc` - Prettier formatting rules
- `tsconfig.json` - TypeScript strict configuration
- `package.json` - lint-staged configuration
- `.husky/pre-commit` - Pre-commit hook

### Key Patterns

**ESLint Config:**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "parserOptions": {
    "project": ["./tsconfig.json", "./tsconfig.test.json"]
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "error",
    "no-console": "error"
  },
  "ignorePatterns": [
    "dist/",
    "coverage/",
    "node_modules/",
    "jest.config.js",
    "test/e2e-fixtures/",
    "test/manual/"
  ]
}
```

**TypeScript Config:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "esModuleInterop": true
  }
}
```

**Prettier Config:**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**lint-staged Config:**

```json
{
  "lint-staged": {
    "*.{ts,js}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

### NFR Alignment

- NFR18: Unit test coverage >= 80% (Jest configured)
- NFR20: TypeScript strict mode enabled ✓

### Quality Rules Enforced

| Rule                          | Purpose                          |
| ----------------------------- | -------------------------------- |
| no-console                    | Prevent debug logs in production |
| explicit-function-return-type | Clear function contracts         |
| noImplicitReturns             | All code paths return            |
| noUncheckedIndexedAccess      | Safe array/object access         |
| noFallthroughCasesInSwitch    | Prevent switch bugs              |

### Project Structure Notes

- ESLint config: `.eslintrc.json`
- Prettier config: `.prettierrc`
- TypeScript config: `tsconfig.json`
- TypeScript test config: `tsconfig.test.json`
- lint-staged config: in `package.json`
- Husky hooks: `.husky/`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Quality Gates]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.6]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) - Code Review 2026-02-05

### Debug Log References

N/A - Verification task only

### Completion Notes List

- All acceptance criteria verified against implementation
- All quality tools properly configured and integrated
- Pre-commit hook verified working with npx lint-staged

### File List

- `.eslintrc.json` - ESLint configuration (verified)
- `.prettierrc` - Prettier configuration (verified)
- `tsconfig.json` - TypeScript build configuration (verified)
- `tsconfig.test.json` - TypeScript test configuration (verified)
- `package.json` - npm scripts and lint-staged config (verified)
- `.husky/pre-commit` - Git pre-commit hook (verified)

### Change Log

| Date       | Change                                                            | Author          |
| ---------- | ----------------------------------------------------------------- | --------------- |
| 2026-02-05 | Code review completed, all tasks verified, status updated to done | Claude Opus 4.5 |
