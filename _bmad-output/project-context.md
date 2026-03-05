---
project_name: 'ai-workflow-runner'
user_name: 'TanNT'
date: '2026-03-05'
sections_completed:
  [
    'technology_stack',
    'language_rules',
    'framework_rules',
    'testing_rules',
    'quality_rules',
    'workflow_rules',
    'anti_patterns',
  ]
status: 'complete'
rule_count: 42
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **TypeScript** ^5.3.0 — strict mode, NodeNext module resolution, ES2022 target
- **Node.js** 20+ — primary runtime (Linux-only Docker container)
- **esbuild** ^0.27.3 — bundler producing single `dist/index.js` for GitHub Actions
- **@opencode-ai/sdk** ^1.2.15 — ESM package; requires `moduleNameMapper` in Jest config
- **@actions/core** ^3.0.0 — ESM-only; requires `moduleNameMapper` in Jest config
- **Jest** ^30.2.0 + ts-jest ^29.1.0 — test runner
- **ESLint** ^9.39.2 — flat config format (`.eslintrc.json`)
- **Prettier** ^3.1.0 — `semi: true`, `singleQuote: true`, `printWidth: 100`, `trailingComma: 'es5'`
- **Container**: `debian:bookworm-slim` with Node.js 20, Python 3.11, Java 21 pre-installed

## Critical Implementation Rules

### Language-Specific Rules

- **`.js` extensions in all local imports** — NodeNext module resolution requires this even for `.ts` source files: `import { foo } from './bar.js'`
- **`noUncheckedIndexedAccess` is enabled** — array/object index access returns `T | undefined`; always narrow before use
- **Named exports only** — no default exports; export functions, classes, and interfaces by name
- **`AbortSignal` as last optional parameter** — all async functions that support cancellation must accept `abortSignal?: AbortSignal` as the final parameter
- **Result pattern for expected failures** — return `RunnerResult` (`{ success: false, output: '', error: '...' }`) instead of throwing for predictable error conditions (file not found, validation failed); throw only for unexpected errors
- **Sanitize errors before user output** — always call `sanitizeErrorMessage(error)` before passing to `core.setFailed()` or action outputs; never expose absolute paths
- **`as const` for constant objects** — use `as const` on `INPUT_LIMITS` and similar constant maps to get literal types
- **Private fields use `camelCase` without underscore** — `private client`, not `private _client`

### Framework-Specific Rules

**GitHub Actions:**
- **Use `core.info()` for user-visible logs, `core.debug()` for internal details** — never use `console.log` in production code
- **Set outputs before `core.setFailed()`** — once `setFailed` is called the step ends; set `status` and `result` outputs first
- **`dist/index.js` must be committed** — the bundled output is what GitHub Actions executes; always run `npm run bundle` and commit `dist/` before release
- **Action runs Linux-only** — Docker container actions are not supported on Windows or macOS runners; do not add platform-conditional code

**OpenCode SDK:**
- **Singleton pattern via `getOpenCodeService()`** — never instantiate `OpenCodeService` directly; always use the exported getter
- **`dispose()` must be idempotent** — check `this.isDisposed` at the top of `dispose()` and return immediately if already disposed
- **Type-guard all SDK events** — SDK events are `unknown`; always check `event && typeof event === 'object' && 'type' in event` before accessing properties
- **Callback maps store both `resolve` and `reject`** — when storing session callbacks, always store both so cleanup can reject pending operations on shutdown
- **Reconnection: 3 attempts with 1s delay** — the event loop reconnects on transient errors; do not add additional retry logic on top of this

### Testing Rules

**Test Organization:**
- **Unit tests are co-located** — `src/foo.spec.ts` lives next to `src/foo.ts`; never put unit tests in `test/`
- **Integration tests**: `test/integration/*.test.ts` — Docker container verification; run with `--runInBand`
- **E2E tests**: `test/e2e/*.e2e-spec.ts` — full action execution; run with `--runInBand --testTimeout=180000`
- **`src/index.ts` and `src/types.ts` are excluded from coverage** — entry point tested via E2E; types have no logic

**Coverage Thresholds:**
- Branches: 75% (async timeout/abort paths are hard to unit test)
- Functions / Lines / Statements: 80%

**Mock Conventions:**
- **`@opencode-ai/sdk` mock** lives at `test/mocks/@opencode-ai/sdk.ts` — mapped via `moduleNameMapper`
- **`@actions/core` mock** lives at `test/mocks/@actions/core.ts` — mapped via `moduleNameMapper` (ESM-only in prod)
- **`clearMocks: true`** is set globally — mocks reset between tests automatically; do not manually call `jest.clearAllMocks()` in `beforeEach`
- **Default test timeout is 60s** — override per-test only when genuinely needed
- **Integration tests require `DOCKER_IMAGE` env var** — set to a locally built image tag before running

### Code Quality & Style Rules

**Naming Conventions:**
- **Files**: `kebab-case.ts` — e.g., `opencode.ts`, `validation.ts`
- **Functions**: `camelCase` — e.g., `runWorkflow()`, `validateWorkspacePath()`
- **Classes / Interfaces / Type aliases**: `PascalCase` — e.g., `OpenCodeService`, `ActionInputs`
- **Constants**: `UPPER_SNAKE_CASE` — e.g., `INPUT_LIMITS`, `MAX_TIMEOUT_MINUTES`
- **Test files**: `*.spec.ts` (unit), `*.test.ts` (integration), `*.e2e-spec.ts` (e2e)

**Import Order (enforced):**
1. Node.js built-ins (`fs`, `path`, `child_process`)
2. External packages alphabetically (`@actions/core`, `@opencode-ai/sdk`)
3. Local modules with `.js` extension (`./types.js`, `./security.js`)

**Logging Prefix Conventions:**
- `[OpenCode]` — SDK operations
- `[Validation]` — script execution
- `[Shutdown]` — shutdown/cleanup
- No prefix — general runner operations

**Code Quality:**
- **Zero ESLint warnings allowed** — `--max-warnings 0` is enforced in CI
- **`npm run typecheck`** — run `tsc --noEmit` to verify type correctness without building
- **`npm run format:check`** — Prettier enforced in CI; run `npm run format` locally before committing
- **Husky pre-commit hook** runs `lint-staged` — ESLint + Prettier auto-fix on staged `.ts`/`.js` files
- **Commit messages must follow Conventional Commits** — enforced by commitlint (`feat:`, `fix:`, `chore:`, etc.)

### Development Workflow Rules

**Local Development Commands:**
- `npm run lint` — ESLint check (zero warnings)
- `npm run typecheck` — TypeScript type check without emitting
- `npm run test:unit` — unit tests with coverage
- `npm run bundle` — build `dist/index.js` via esbuild (use this, not `npm run build`)
- `docker build -t ai-workflow-runner:local .` — build Docker image for integration testing
- `DOCKER_IMAGE=ai-workflow-runner:local npm run test:integration` — run integration tests

**Branch & Release Rules:**
- Feature branches: `feature/<description>`
- `dist/` is committed to the repository — GitHub Actions reads it directly; never add `dist/` to `.gitignore`
- Releases are semver-tagged (`v1.2.3`) — CI auto-publishes Docker image to GHCR on tag push
- The `v1` floating tag is updated on every v1.x.x release for consumers using `@v1`

**CI Quality Gates (must pass before merge):**
1. `npm run lint` — zero warnings
2. `npm run typecheck` — no type errors
3. `npm run test:unit` — coverage thresholds met
4. `npm run format:check` — Prettier compliant
5. Docker build succeeds
6. Integration tests pass

### Critical Don't-Miss Rules

**Resource Cleanup Anti-Patterns:**
- **NEVER skip `clearTimeout` on success** — always clear timeouts in `finally` blocks, not just on failure
- **NEVER modify `process.env` for child processes** — pass a scoped `childEnv` object to `spawn({ env: childEnv })`; isolation is a security requirement
- **NEVER skip SIGKILL escalation** — after sending SIGTERM to a child process, always schedule a SIGKILL after `SIGKILL_GRACE_PERIOD_MS` (5s) if the process hasn't exited

**Security Rules:**
- **Mask ALL `env_vars` values before any logging** — call `core.setSecret()` on every value in `env_vars` before any `core.info()` call
- **Validate paths with `validateWorkspacePath()` before any `fs` access** — never open a user-provided path without this check
- **Temp files must use `0o600` permissions** — `fs.writeFileSync(path, content, { mode: 0o600 })`
- **Never log server URLs at `info` level** — OpenCode server URLs go to `core.debug()` only

**Output Size Limits:**
- **Truncate `lastMessage` to `MAX_LAST_MESSAGE_SIZE` (100KB)** before storing or returning
- **Truncate action `result` output to `MAX_OUTPUT_SIZE` (900KB)** — GitHub Actions has a ~1MB output limit
- **Truncate validation script stderr to `MAX_STDERR_SIZE` (10KB)** when capturing error output

**Module Boundary Rules:**
- **`security.ts` has no dependencies on other local modules** — it must stay a leaf node; never import from `runner.ts`, `opencode.ts`, etc.
- **`types.ts` has no dependencies** — constants and type definitions only; no logic, no imports from local modules
- **Circular imports will break NodeNext resolution** — follow the dependency graph: `index → runner → opencode/validation/config → security → types`

**Validation Script Rules:**
- **Validation output empty or `"true"` means success** — any other non-empty output is treated as failure feedback sent back to the AI
- **`AI_LAST_MESSAGE` env var is always set** — validation scripts always receive it even if the message is empty
- **Inline scripts use prefix detection**: `python:` → python3, `js:` → node; file-based scripts auto-detect from `.py`/`.js` extension

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge during implementation

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Review periodically to remove rules that become obvious over time

Last Updated: 2026-03-05
