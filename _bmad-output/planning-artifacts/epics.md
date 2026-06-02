---
stepsCompleted:
  [
    'step-01-validate-prerequisites',
    'step-02-design-epics',
    'step-03-create-stories',
    'step-04-final-validation',
  ]
validationStatus: 'PASSED - All requirements covered, stories ready for development'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - 'docs/index.md'
  - '_bmad-output/implementation-artifacts/tech-spec-opencode-sdk-runner.md'
  - '_bmad-output/implementation-artifacts/tech-spec-ai-workflow-runner-init.md'
implementationStatus: 'MVP Complete - Epic 7 (Stories 7.1-7.4 done, 7.5-7.6 pending) and Epic 8 (Stories 8.1-8.2 done, 8.3 pending). Phase 2 enhancement Epics 9-12 done (Sprint Change Proposal 2026-06-01). Epic 13 Security Hardening added to backlog 2026-06-02 (red-team remediation: 3 CRITICAL, 2 HIGH, 2 MEDIUM, 2 doc).'
lastUpdated: '2026-06-02'
---

# AI Workflow Runner - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for AI Workflow Runner, decomposing the requirements from the PRD, Architecture, and Tech Specs into implementable stories.

**Implementation Status:** MVP Complete (Epics 1-6). Epic 7: Stories 7.1-7.4 done, 7.5-7.6 pending. Epic 8: Stories 8.1-8.2 done, 8.3 pending.

## Requirements Inventory

### Functional Requirements

**Workflow Execution (FR1-FR7):**

- FR1: User can specify a workflow file path relative to the repository root
- FR2: User can provide an optional text prompt to pass to the workflow
- FR3: User can provide environment variables as a JSON object
- FR4: User can configure execution timeout in minutes
- FR5: System can read and parse workflow file content
- FR6: System can combine workflow content with user prompt for AI execution
- FR7: System can execute agentic AI workflow via OpenCode SDK

**Session Management (FR8-FR12):**

- FR8: System can create an OpenCode session for workflow execution
- FR9: System can send prompts to an active session
- FR10: System can detect when a session becomes idle (completion)
- FR11: System can handle session timeout gracefully
- FR12: System can dispose of sessions and resources on shutdown

**Output & Streaming (FR13-FR16):**

- FR13: System can stream AI output to GitHub Actions console in real-time
- FR14: System can capture the last assistant message for validation
- FR15: System can return execution status (success, failure, cancelled, timeout)
- FR16: System can return execution result as JSON string

**Validation & Retry (FR17-FR26):**

- FR17: User can specify a validation script (file path or inline code)
- FR18: User can specify validation script type (python or javascript)
- FR19: User can configure maximum validation retry attempts
- FR20: System can execute Python validation scripts via python3
- FR21: System can execute JavaScript validation scripts via node
- FR22: System can pass AI_LAST_MESSAGE environment variable to validation scripts
- FR23: System can pass user-provided environment variables to validation scripts
- FR24: System can interpret validation output (empty/true = success, other = retry)
- FR25: System can send validation output as follow-up prompt for retry
- FR26: System can fail after maximum retry attempts with last validation output

**Security (FR27-FR30):**

- FR27: System can validate workflow path is within repository workspace
- FR28: System can detect and reject path traversal attempts
- FR29: System can mask all environment variable values as secrets
- FR30: System can sanitize error messages to remove sensitive paths

**Lifecycle Management (FR31-FR38):**

- FR31: System can handle SIGTERM signal for graceful shutdown
- FR32: System can handle SIGINT signal for graceful shutdown
- FR33: System can abort running operations when shutdown is initiated
- FR34: System can clean up resources (sessions, event loops) on disposal
- FR35: System can return clear error messages for missing workflow files
- FR36: System can return clear error messages for invalid input configuration
- FR37: System can return clear error messages for validation script failures
- FR38: System can distinguish runner errors from workflow/AI errors

**Distribution & Publishing (FR45-FR49):**

- FR45: System can publish pre-built Docker image to GitHub Container Registry (GHCR)
- FR46: System can automatically build and push Docker image on release/tag
- FR47: Action references pre-built GHCR image instead of building from Dockerfile at consumer runtime
- FR48: Action is listed on GitHub Marketplace as a free action
- FR49: System can tag Docker images with semver versions matching GitHub release tags

### NonFunctional Requirements

**Performance (NFR1-NFR4):**

- NFR1: Pre-built Docker image pull < 2 minutes on CI
- NFR2: Runner startup < 30 seconds
- NFR3: Console streaming latency < 1 second
- NFR4: Graceful shutdown < 10 seconds

**Security (NFR5-NFR9):**

- NFR5: All env_vars masked via core.setSecret() before logging
- NFR6: Path traversal rejected before file access
- NFR7: Error messages sanitized (no absolute paths)
- NFR8: Temp files created with 0o600 permissions
- NFR9: No secrets logged at any verbosity level

**Reliability (NFR10-NFR13):**

- NFR10: 0% runner-caused failures
- NFR11: SIGTERM/SIGINT handled without resource leaks
- NFR12: Event loop reconnects on transient errors (3 attempts)
- NFR13: Validation script timeout 60s with SIGKILL escalation

**Integration (NFR14-NFR17):**

- NFR14: Compatible with ubuntu-latest, ubuntu-22.04
- NFR15: Compatible with self-hosted Linux + Docker
- NFR16: OpenCode SDK version pinned
- NFR17: Outputs parseable by subsequent steps

**Maintainability (NFR18-NFR20):**

- NFR18: Unit test coverage >= 80% on validation logic
- NFR19: Dependabot with weekly updates
- NFR20: TypeScript strict mode enabled

### Additional Requirements

**From Architecture - Technical Patterns:**

- Result Pattern for expected failures (RunnerResult)
- Event-driven architecture for SDK integration
- Layered validation (path → file → content)
- Graceful degradation with retry mechanisms
- Defense-in-depth security architecture
- Module boundaries: index, runner, config, security, opencode, validation, types

**From Architecture - Module Structure:**

- Flat module structure with clear responsibilities
- Co-located unit tests (\*.spec.ts)
- ESM imports with .js extensions
- Singleton pattern for OpenCodeService

**From Tech Specs - Implementation Details:**

- OpenCode SDK lazy singleton initialization
- Session completion via callback Map + session.idle event
- Permission auto-approval via event.subscribe() stream
- Message accumulation for complete assistant responses
- Script type detection by extension or prefix
- AbortController for graceful shutdown propagation
- child_process.spawn() with manual timeout for validation scripts

**From docs/index.md - Infrastructure:**

- Multi-runtime Docker environment (Node.js 20+, Python 3.11, Java 21)
- esbuild bundling to single file
- Jest testing with 80% coverage threshold

### FR Coverage Map

| FR   | Epic   | Description                     |
| ---- | ------ | ------------------------------- |
| FR1  | Epic 1 | Workflow path specification     |
| FR2  | Epic 1 | Optional prompt input           |
| FR3  | Epic 1 | Environment variables JSON      |
| FR4  | Epic 1 | Timeout configuration           |
| FR5  | Epic 1 | Workflow file reading           |
| FR6  | Epic 2 | Combine workflow + prompt       |
| FR7  | Epic 2 | Execute via OpenCode SDK        |
| FR8  | Epic 2 | Create OpenCode session         |
| FR9  | Epic 2 | Send prompts to session         |
| FR10 | Epic 2 | Detect session idle             |
| FR11 | Epic 2 | Handle session timeout          |
| FR12 | Epic 4 | Dispose sessions on shutdown    |
| FR13 | Epic 2 | Stream output to console        |
| FR14 | Epic 2 | Capture last message            |
| FR15 | Epic 2 | Return execution status         |
| FR16 | Epic 2 | Return result as JSON           |
| FR17 | Epic 3 | Validation script input         |
| FR18 | Epic 3 | Validation script type          |
| FR19 | Epic 3 | Max retry configuration         |
| FR20 | Epic 3 | Execute Python scripts          |
| FR21 | Epic 3 | Execute JavaScript scripts      |
| FR22 | Epic 3 | AI_LAST_MESSAGE env var         |
| FR23 | Epic 3 | Pass user env vars              |
| FR24 | Epic 3 | Interpret validation output     |
| FR25 | Epic 3 | Send output as follow-up        |
| FR26 | Epic 3 | Fail after max retries          |
| FR27 | Epic 1 | Validate path in workspace      |
| FR28 | Epic 1 | Reject path traversal           |
| FR29 | Epic 1 | Mask env var secrets            |
| FR30 | Epic 1 | Sanitize error messages         |
| FR31 | Epic 4 | Handle SIGTERM                  |
| FR32 | Epic 4 | Handle SIGINT                   |
| FR33 | Epic 4 | Abort running operations        |
| FR34 | Epic 4 | Clean up resources              |
| FR35 | Epic 1 | Error for missing files         |
| FR36 | Epic 1 | Error for invalid config        |
| FR37 | Epic 3 | Error for validation failures   |
| FR38 | Epic 4 | Distinguish runner vs AI errors |
| FR39 | Epic 7 | OpenCode config.json input      |
| FR40 | Epic 7 | OpenCode auth.json input        |
| FR41 | Epic 7 | Model selection input           |
| FR42 | Epic 7 | List models mode                |
| FR43 | Epic 7 | Load and pass config to SDK     |
| FR44 | Epic 7 | Query and display models        |
| FR45 | Epic 8 | Publish Docker image to GHCR    |
| FR46 | Epic 8 | Auto build/push on release      |
| FR47 | Epic 8 | Reference pre-built GHCR image  |
| FR48 | Epic 8 | GitHub Marketplace listing      |
| FR49 | Epic 8 | Semver Docker image tags        |

## Epic List

### Epic 1: Project Foundation & Core Runner Infrastructure

Developers can install the GitHub Action and run basic workflow files with input configuration and security hardening.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR27, FR28, FR29, FR30, FR35, FR36
**Status:** ✅ IMPLEMENTED

### Epic 2: OpenCode SDK Integration & AI Workflow Execution

Developers can execute actual agentic AI workflows and see real-time streaming output in their GitHub Actions logs.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR13, FR14, FR15, FR16
**Status:** ✅ IMPLEMENTED

### Epic 3: Validation & Retry System

Developers can add validation scripts to verify AI workflow outputs and automatically retry if validation fails.
**FRs covered:** FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR37
**Status:** ✅ IMPLEMENTED

### Epic 4: Lifecycle Management & Graceful Shutdown

The action handles CI/CD lifecycle events gracefully, ensuring no resource leaks or orphaned processes.
**FRs covered:** FR12, FR31, FR32, FR33, FR34, FR38
**Status:** ✅ IMPLEMENTED

### Epic 5: Docker Container & Multi-Runtime Environment

Developers can run workflows that use Node.js, Python, or Java without additional setup.
**NFRs addressed:** NFR1, NFR2, NFR14, NFR15
**Status:** ✅ IMPLEMENTED

### Epic 6: CI/CD & Release Automation

Contributors can confidently develop, test, and release the action with automated quality gates.
**NFRs addressed:** NFR16, NFR18, NFR19, NFR20
**Status:** ✅ IMPLEMENTED

### Epic 7: Configuration Customization & Examples

Users can customize OpenCode SDK configuration (providers, auth, models) and have complete example workflows for onboarding.
**FRs covered:** FR39, FR40, FR41, FR42, FR43, FR44
**Status:** 🔲 NOT STARTED

### Epic 8: Distribution & Marketplace Publishing

The action is distributed via pre-built Docker image on GHCR and listed on GitHub Marketplace for discoverability.
**FRs covered:** FR45, FR46, FR47, FR48, FR49
**Status:** 🔲 NOT STARTED

### Epic 9: Conversation Logging & Transcript Export

Users get a scannable GitHub Actions console (log groups, rationed annotations, job summary) and a full `conversation.json` transcript exported for artifact upload.
**FRs covered:** FR50, FR51, FR52, FR53, FR54 · **NFRs:** NFR21, NFR22
**Status:** 🔲 NOT STARTED

### Epic 10: Model Selection & Free-Model Filtering

Users can list models with cost/free tags and disable free models, while paid subscriptions (Copilot etc.) are never mis-classified as free — via OpenCode's own `enabled.via === "account"` signal (no hardcoded list).
**FRs covered:** FR55, FR56, FR57, FR58
**Status:** 🔲 NOT STARTED

### Epic 11: Provider Fallback Chain

Users can define an ordered cross-provider fallback chain (provider/model references; auth stays in `auth_config`); the runner selects the first healthy provider at conversation start (no mid-run failover) and fails over on startup errors.
**FRs covered:** FR59, FR60, FR61, FR62, FR63 · **NFRs:** NFR23
**Status:** 🔲 NOT STARTED

### Epic 12: SDK Currency & Maintenance Guard

The project stays on the latest stable `@opencode-ai/sdk` with a CI guard that signals when the pin lags, and keeps the `opencode-ai` CLI binary aligned.
**FRs covered:** FR64, FR65
**Status:** 🔲 NOT STARTED

---

## Epic 1: Project Foundation & Core Runner Infrastructure

**Goal:** Developers can install the GitHub Action and run basic workflow files with input configuration and security hardening.

**Implementation Files:**

- `src/types.ts` - Type definitions and constants
- `src/config.ts` - Input parsing and validation
- `src/security.ts` - Path validation and secret masking
- `src/runner.ts` - Workflow file reading
- `action.yml` - Action metadata and inputs
- `src/config.spec.ts` - Unit tests
- `src/security.spec.ts` - Unit tests

### Story 1.1: Define TypeScript Types and Constants

As a **developer**,
I want **well-defined TypeScript types and constants**,
So that **the codebase has type safety and consistent limits**.

**Acceptance Criteria:**

**Given** a new TypeScript project
**When** types.ts is created
**Then** it defines ActionInputs interface with workflowPath, prompt, envVars, timeoutMs, validationScript, validationScriptType, validationMaxRetry
**And** it defines RunnerResult interface with success, output, error, exitCode
**And** it defines ActionStatus type as 'success' | 'failure' | 'cancelled' | 'timeout'
**And** it defines INPUT_LIMITS constant with MAX_WORKFLOW_PATH_LENGTH (1024), MAX_PROMPT_LENGTH (100KB), MAX_ENV_VARS_SIZE (64KB), MAX_ENV_VARS_COUNT (100), MAX_OUTPUT_SIZE (900KB)

### Story 1.2: Create Action Metadata

As a **GitHub Actions user**,
I want **a properly configured action.yml file**,
So that **the action can be discovered and used in workflows**.

**Acceptance Criteria:**

**Given** the action.yml file
**When** it is parsed by GitHub Actions
**Then** it defines input workflow_path as required
**And** it defines input prompt as optional with empty default
**And** it defines input env_vars as optional with '{}' default
**And** it defines input timeout_minutes as optional with '30' default
**And** it defines outputs status and result
**And** it specifies Docker container execution using Dockerfile
**And** it includes branding with play-circle icon and green color

### Story 1.3: Implement Input Configuration Parsing

As a **developer**,
I want **robust input parsing with validation**,
So that **invalid inputs are rejected early with clear error messages**.

**Acceptance Criteria:**

**Given** action inputs are provided
**When** getInputs() is called
**Then** workflow_path is parsed as required string
**And** prompt is parsed with empty string default
**And** env_vars is parsed as JSON object with validation
**And** timeout_minutes is parsed and converted to milliseconds
**And** all env_var values are masked as secrets before any logging

**Given** env_vars contains invalid JSON
**When** getInputs() is called
**Then** error is thrown with message 'env_vars must be a valid JSON object'

**Given** env_vars exceeds 64KB
**When** getInputs() is called
**Then** error is thrown with size limit message

**Given** env*vars contains reserved key (PATH, NODE_OPTIONS, GITHUB*\*)
**When** getInputs() is called
**Then** error is thrown indicating reserved variable cannot be overridden

### Story 1.4: Implement Path Security Validation

As a **security-conscious developer**,
I want **path traversal prevention**,
So that **workflow files outside the workspace cannot be accessed**.

**Acceptance Criteria:**

**Given** a relative workflow path within workspace
**When** validateWorkspacePath() is called
**Then** the resolved absolute path is returned

**Given** a path containing '../' traversal
**When** validateWorkspacePath() is called
**Then** error is thrown with 'path escapes workspace' message

**Given** an absolute path
**When** validateWorkspacePath() is called
**Then** error is thrown indicating absolute paths not allowed

**Given** a symlink pointing outside workspace
**When** validateRealPath() is called
**Then** error is thrown with 'symlink target escapes workspace' message

### Story 1.5: Implement Secret Masking

As a **security-conscious developer**,
I want **all environment variable values masked**,
So that **secrets are not exposed in GitHub Actions logs**.

**Acceptance Criteria:**

**Given** env_vars with multiple key-value pairs
**When** maskSecrets() is called
**Then** core.setSecret() is called for each non-empty value
**And** empty string values are skipped

### Story 1.6: Implement Error Message Sanitization

As a **security-conscious developer**,
I want **error messages sanitized**,
So that **sensitive paths and data are not leaked in logs**.

**Acceptance Criteria:**

**Given** an error with absolute file paths
**When** sanitizeErrorMessage() is called
**Then** absolute paths are replaced with '[PATH]'

**Given** an error with long alphanumeric strings (potential secrets)
**When** sanitizeErrorMessage() is called
**Then** strings of 32+ characters are replaced with '[REDACTED]'

### Story 1.7: Implement Basic Workflow File Reading

As a **GitHub Actions user**,
I want **the runner to read and validate workflow files**,
So that **I get clear errors for missing or invalid files**.

**Acceptance Criteria:**

**Given** a valid workflow path
**When** runWorkflow() is called
**Then** the file is read and validated for UTF-8 encoding

**Given** a non-existent workflow file
**When** runWorkflow() is called
**Then** error is returned with 'Workflow file not found: {path}'

**Given** a workflow file with invalid UTF-8
**When** runWorkflow() is called
**Then** error is returned with 'File is not valid UTF-8'

### Story 1.8: Unit Tests for Configuration and Security

As a **maintainer**,
I want **comprehensive unit tests**,
So that **configuration and security logic is thoroughly validated**.

**Acceptance Criteria:**

**Given** config.spec.ts
**When** tests are run
**Then** getInputs() is tested for valid inputs, invalid JSON, size limits, reserved vars
**And** validateInputs() is tested for empty path, path length, prompt size

**Given** security.spec.ts
**When** tests are run
**Then** validateWorkspacePath() is tested for valid paths, traversal, absolute paths
**And** validateRealPath() is tested for symlink escape
**And** maskSecrets() is tested for secret masking
**And** sanitizeErrorMessage() is tested for path and secret removal

---

## Epic 2: OpenCode SDK Integration & AI Workflow Execution

**Goal:** Developers can execute actual agentic AI workflows and see real-time streaming output in their GitHub Actions logs.

**Implementation Files:**

- `src/opencode.ts` - OpenCode SDK service
- `src/runner.ts` - Workflow execution with SDK
- `src/opencode.spec.ts` - Unit tests

### Story 2.1: Create OpenCode Service Singleton

As a **developer**,
I want **a singleton OpenCode service**,
So that **the SDK is initialized once and reused across operations**.

**Acceptance Criteria:**

**Given** the OpenCodeService class
**When** getOpenCodeService() is called multiple times
**Then** the same instance is returned

**Given** hasOpenCodeServiceInstance()
**When** called before any getOpenCodeService()
**Then** it returns false

**Given** resetOpenCodeService()
**When** called with existing instance
**Then** the instance is disposed and cleared

### Story 2.2: Implement SDK Initialization

As a **developer**,
I want **lazy SDK initialization with retry support**,
So that **the SDK starts only when needed and can recover from transient failures**.

**Acceptance Criteria:**

**Given** a new OpenCodeService
**When** initialize() is called
**Then** createOpencode() is called with hostname '127.0.0.1' and port 0
**And** client and server references are stored
**And** event loop is started
**And** '[OpenCode] Server started on localhost' is logged

**Given** initialize() is called while already initializing
**When** the same promise is awaited
**Then** it reuses the existing initialization promise

**Given** initialization fails with transient error
**When** initialize() is called again
**Then** retry is allowed (initializationPromise cleared)

### Story 2.3: Implement Session Creation and Prompt Execution

As a **GitHub Actions user**,
I want **sessions created and prompts executed**,
So that **AI workflows are run via the OpenCode SDK**.

**Acceptance Criteria:**

**Given** an initialized OpenCodeService
**When** runSession(prompt, timeoutMs) is called
**Then** a new session is created with title 'AI Workflow'
**And** session ID is logged
**And** prompt is sent via promptAsync()
**And** '[OpenCode] Prompt sent, waiting for completion...' is logged

**Given** session creation fails
**When** runSession() is called
**Then** error is thrown with 'Failed to create OpenCode session'

**Given** prompt send fails
**When** runSession() is called
**Then** error is thrown with failure details
**And** callback is cleaned up

### Story 2.4: Implement Session Idle Detection

As a **developer**,
I want **session completion detected via events**,
So that **the runner knows when the AI workflow is done**.

**Acceptance Criteria:**

**Given** an active session
**When** session.idle event is received
**Then** the session completion callback is resolved
**And** the session is marked complete

**Given** an active session
**When** session.status event with type 'idle' is received
**Then** the session completion callback is resolved

**Given** an active session
**When** session.status event with type 'error' or 'disconnected' is received
**Then** the session completion callback is rejected with error

**Given** timeout is reached before idle
**When** waitForSessionIdle() times out
**Then** error is thrown with timeout message

### Story 2.5: Implement Real-Time Output Streaming

As a **GitHub Actions user**,
I want **AI output streamed to the console**,
So that **I can see what the AI is doing in real-time**.

**Acceptance Criteria:**

**Given** message.part.updated event with type='text'
**When** handleEvent() processes it
**Then** core.info('[OpenCode] {text}') is called
**And** text is accumulated in messageBuffer

**Given** message.part.updated event with type='tool'
**When** handleEvent() processes it
**Then** core.info('[OpenCode] Tool: {tool} - {status}') is called

**Given** multiple text parts for same message
**When** accumulated
**Then** parts with matching messageID are appended to buffer

### Story 2.6: Implement Message Capture for Validation

As a **developer**,
I want **the last assistant message captured**,
So that **it can be passed to validation scripts**.

**Acceptance Criteria:**

**Given** message.updated event with role='assistant'
**When** handleEvent() processes it
**Then** currentMessageId is updated
**And** previous buffer is saved as lastCompleteMessage

**Given** getLastMessage(sessionId) is called
**When** session has accumulated message
**Then** the complete message is returned

**Given** message exceeds MAX_LAST_MESSAGE_SIZE (100KB)
**When** getLastMessage() is called
**Then** message is truncated with '...[truncated]'
**And** warning is logged

### Story 2.7: Implement Permission Auto-Approval

As a **developer**,
I want **permissions auto-approved**,
So that **AI workflows can run without human intervention**.

**Acceptance Criteria:**

**Given** permission.updated event
**When** handleEvent() processes it
**Then** permission is approved with response 'always'

**Given** permission approval fails
**When** error occurs
**Then** warning is logged (not thrown)

### Story 2.8: Implement Event Loop with Reconnection

As a **developer**,
I want **the event loop to reconnect on errors**,
So that **transient network issues don't break the workflow**.

**Acceptance Criteria:**

**Given** event loop encounters error
**When** attempt < maxReconnectAttempts (3)
**Then** reconnection is attempted after 1 second delay

**Given** event loop fails all reconnection attempts
**When** max attempts exceeded
**Then** all pending callbacks are rejected
**And** error is logged

### Story 2.9: Implement Follow-Up Messages

As a **developer**,
I want **follow-up messages sent to existing sessions**,
So that **validation feedback can continue the conversation**.

**Acceptance Criteria:**

**Given** an active session
**When** sendFollowUp(sessionId, message) is called
**Then** message is sent via promptAsync()
**And** message buffer is reset for new response

**Given** message exceeds MAX_VALIDATION_OUTPUT_SIZE
**When** sendFollowUp() is called
**Then** message is truncated with '...[truncated]'

**Given** service is disposed
**When** sendFollowUp() is called
**Then** error is thrown 'OpenCode service disposed - cannot send follow-up'

### Story 2.10: Combine Workflow Content with Prompt

As a **GitHub Actions user**,
I want **workflow content combined with my prompt**,
So that **the AI receives full context**.

**Acceptance Criteria:**

**Given** workflow file content and user prompt
**When** runWorkflow() composes the prompt
**Then** format is '{workflowContent}\n\n---\n\nUser Input:\n{userPrompt}'

**Given** workflow file content without user prompt
**When** runWorkflow() composes the prompt
**Then** only workflow content is used

---

## Epic 3: Validation & Retry System

**Goal:** Developers can add validation scripts to verify AI workflow outputs and automatically retry if validation fails.

**Implementation Files:**

- `src/validation.ts` - Validation script executor
- `src/config.ts` - Validation input parsing
- `src/runner.ts` - Validation retry loop
- `src/validation.spec.ts` - Unit tests

### Story 3.1: Parse Validation Inputs

As a **GitHub Actions user**,
I want **validation script configuration parsed**,
So that **I can configure validation behavior**.

**Acceptance Criteria:**

**Given** validation_script input
**When** getInputs() is called
**Then** script path or inline code is captured

**Given** validation_script_type input
**When** getInputs() is called
**Then** type is validated as 'python' or 'javascript'

**Given** validation_script_type without validation_script
**When** getInputs() is called
**Then** error is thrown 'validation_script_type requires validation_script to be set'

**Given** validation_max_retry input
**When** getInputs() is called
**Then** value is validated between 1 and 20
**And** default is 5

### Story 3.2: Implement Script Type Detection

As a **developer**,
I want **script type auto-detected**,
So that **users don't need to specify type for file-based scripts**.

**Acceptance Criteria:**

**Given** script ending with '.py' (case-insensitive)
**When** detectScriptType() is called
**Then** type 'python' is returned with isInline=false

**Given** script ending with '.js' (case-insensitive)
**When** detectScriptType() is called
**Then** type 'javascript' is returned with isInline=false

**Given** script starting with 'python:'
**When** detectScriptType() is called
**Then** type 'python' is returned with code after prefix and isInline=true

**Given** script starting with 'javascript:' or 'js:'
**When** detectScriptType() is called
**Then** type 'javascript' is returned with code after prefix and isInline=true

**Given** empty code after prefix (e.g., 'python:')
**When** detectScriptType() is called
**Then** error is thrown 'Empty inline script'

**Given** unsupported extension (.sh, .bash, .ts)
**When** detectScriptType() is called
**Then** clear error is thrown with supported alternatives

### Story 3.3: Implement Interpreter Availability Check

As a **developer**,
I want **interpreter availability checked**,
So that **clear errors are shown when Python or Node is missing**.

**Acceptance Criteria:**

**Given** python3 or node command
**When** checkInterpreterAvailable() is called
**Then** '{command} --version' is executed
**And** true is returned if exit code is 0

**Given** interpreter check hangs
**When** 5 seconds elapse
**Then** check times out and returns false
**And** warning is logged

### Story 3.4: Implement Validation Script Execution

As a **GitHub Actions user**,
I want **validation scripts executed**,
So that **I can verify AI workflow outputs**.

**Acceptance Criteria:**

**Given** file-based validation script
**When** executeValidationScript() is called
**Then** script path is validated within workspace
**And** script is executed with appropriate interpreter

**Given** inline validation script
**When** executeValidationScript() is called
**Then** temp file is created with randomUUID name
**And** file has 0o600 permissions (owner read/write only)
**And** temp file is cleaned up after execution

**Given** AI_LAST_MESSAGE
**When** script executes
**Then** env var is passed with last AI message
**And** null bytes are stripped from message

**Given** user envVars
**When** script executes
**Then** envVars are passed to child process
**And** process.env is not polluted

### Story 3.5: Implement Script Output Parsing

As a **developer**,
I want **validation output interpreted**,
So that **success or retry is determined correctly**.

**Acceptance Criteria:**

**Given** script outputs empty string (after trim)
**When** parseValidationOutput() is called
**Then** success=true is returned

**Given** script outputs 'true' (case-insensitive)
**When** parseValidationOutput() is called
**Then** success=true is returned

**Given** script outputs any other string
**When** parseValidationOutput() is called
**Then** success=false is returned
**And** continueMessage contains the output

### Story 3.6: Implement Script Timeout and Kill

As a **developer**,
I want **hung scripts killed**,
So that **workflows don't hang indefinitely**.

**Acceptance Criteria:**

**Given** script execution
**When** 60 seconds elapse without completion
**Then** SIGTERM is sent

**Given** SIGTERM sent but process not exited
**When** 5 more seconds elapse
**Then** SIGKILL is sent
**And** warning is logged

**Given** abort signal triggered
**When** script is running
**Then** script is killed
**And** error is thrown 'Validation script aborted'

### Story 3.7: Implement Output Size Limits

As a **developer**,
I want **output size limited**,
So that **huge outputs don't cause memory issues**.

**Acceptance Criteria:**

**Given** script output exceeds MAX_VALIDATION_OUTPUT_SIZE (100KB)
**When** output is captured
**Then** output is truncated
**And** warning is logged

### Story 3.8: Implement Validation Retry Loop

As a **GitHub Actions user**,
I want **validation to retry on failure**,
So that **AI can fix issues based on feedback**.

**Acceptance Criteria:**

**Given** validation returns success=false
**When** retry attempt < validationMaxRetry
**Then** continueMessage is sent as follow-up prompt
**And** '[Validation] Retry - sending feedback to OpenCode' is logged

**Given** validation fails validationMaxRetry times
**When** max retries exceeded
**Then** error is thrown with last validation output

**Given** validation returns success=true
**When** any attempt
**Then** '[Validation] Success - workflow complete' is logged
**And** workflow completes

---

## Epic 4: Lifecycle Management & Graceful Shutdown

**Goal:** The action handles CI/CD lifecycle events gracefully, ensuring no resource leaks or orphaned processes.

**Implementation Files:**

- `src/index.ts` - Main entry with signal handling
- `src/opencode.ts` - Dispose method

### Story 4.1: Implement Main Entry Point

As a **developer**,
I want **a clean main entry point**,
So that **the action orchestrates all components correctly**.

**Acceptance Criteria:**

**Given** action starts
**When** run() is called
**Then** inputs are parsed via getInputs()
**And** inputs are validated via validateInputs()
**And** workflow is executed via runWorkflow()
**And** outputs are set via core.setOutput()

**Given** validation fails
**When** inputs are invalid
**Then** errors are logged via core.error()
**And** action fails via core.setFailed()

### Story 4.2: Implement SIGTERM/SIGINT Handling

As a **developer**,
I want **graceful shutdown on signals**,
So that **resources are cleaned up properly**.

**Acceptance Criteria:**

**Given** SIGTERM signal received
**When** handleShutdown() is called
**Then** 'Received SIGTERM, initiating graceful shutdown...' is logged
**And** shutdownController.abort() is called

**Given** SIGINT signal received
**When** handleShutdown() is called
**Then** 'Received SIGINT, initiating graceful shutdown...' is logged
**And** shutdownController.abort() is called

### Story 4.3: Implement OpenCode Service Disposal

As a **developer**,
I want **OpenCode service disposed on shutdown**,
So that **SDK resources are released**.

**Acceptance Criteria:**

**Given** shutdown initiated
**When** hasOpenCodeServiceInstance() returns true
**Then** getOpenCodeService().dispose() is called

**Given** disposal fails
**When** error occurs
**Then** warning is logged but shutdown continues

**Given** dispose() called on already disposed service
**When** called again
**Then** it returns immediately (idempotent)

### Story 4.4: Implement Abort Signal Propagation

As a **developer**,
I want **abort signal propagated through the system**,
So that **all operations can be cancelled**.

**Acceptance Criteria:**

**Given** shutdownController.abort() called
**When** runWorkflow() is executing
**Then** abortSignal propagates to OpenCodeService
**And** abortSignal propagates to validation scripts

**Given** abort signal triggered during session wait
**When** waitForSessionIdle() is waiting
**Then** error is thrown 'Session aborted'
**And** abort listener is removed to prevent memory leak

### Story 4.5: Implement Resource Cleanup

As a **developer**,
I want **all resources cleaned up**,
So that **no leaks occur**.

**Acceptance Criteria:**

**Given** dispose() is called
**When** service has active sessions
**Then** all pending callbacks are rejected with 'OpenCode service disposed'
**And** sessionCompletionCallbacks map is cleared

**Given** dispose() is called
**When** event loop is running
**Then** eventLoopAbortController.abort() is called

**Given** dispose() is called
**When** server is running
**Then** server.close() is called
**And** '[OpenCode] Shutting down server...' is logged

### Story 4.6: Implement Forced Exit Timeout

As a **developer**,
I want **forced exit if graceful shutdown takes too long**,
So that **the action doesn't hang indefinitely**.

**Acceptance Criteria:**

**Given** shutdown initiated
**When** graceful shutdown takes > 10 seconds
**Then** 'Graceful shutdown timed out, forcing exit' is logged
**And** process.exit(1) is called

**Given** shutdown completes before timeout
**When** runPromise resolves
**Then** timeout is cleared
**And** process.exit(0) is called

---

## Epic 5: Docker Container & Multi-Runtime Environment

**Goal:** Developers can run workflows that use Node.js, Python, or Java without additional setup.

**Implementation Files:**

- `Dockerfile` - Multi-stage container build
- `entrypoint.sh` - Signal forwarding

### Story 5.1: Create Multi-Stage Dockerfile

As a **developer**,
I want **an optimized Docker image**,
So that **build time and image size are minimized**.

**Acceptance Criteria:**

**Given** Dockerfile
**When** built
**Then** bundler stage (`node:20-bookworm-slim`) builds `dist/index.js` from TypeScript source
**And** builder stage installs system runtimes (Node.js, Python, Java, OpenCode CLI)
**And** runtime stage copies from both bundler and builder
**And** final image is smaller than single-stage build
**And** `dist/` is not committed to git (Docker builds from source)

### Story 5.2: Install Node.js 20+

As a **GitHub Actions user**,
I want **Node.js 20+ available**,
So that **JavaScript-based workflows work**.

**Acceptance Criteria:**

**Given** Docker image
**When** node --version is run
**Then** version 20.x or higher is returned

**Given** NodeSource repository
**When** added to apt
**Then** GPG verification is used for security

### Story 5.3: Install Python 3.11

As a **GitHub Actions user**,
I want **Python 3.11 available**,
So that **Python-based workflows work**.

**Acceptance Criteria:**

**Given** Docker image
**When** python3.11 --version is run
**Then** version 3.11.x is returned

### Story 5.4: Install Java 21

As a **GitHub Actions user**,
I want **Java 21 available**,
So that **Java-based workflows work**.

**Acceptance Criteria:**

**Given** Docker image
**When** java --version is run
**Then** version 21 is returned

**Given** Adoptium Temurin JRE
**When** installed
**Then** headless JRE is used (not full JDK) to save space

### Story 5.5: Install OpenCode CLI

As a **developer**,
I want **OpenCode CLI globally installed**,
So that **the SDK can spawn the CLI**.

**Acceptance Criteria:**

**Given** Docker image
**When** opencode --version is run
**Then** version is returned

### Story 5.6: Create Signal-Forwarding Entrypoint

As a **developer**,
I want **signals forwarded to Node.js**,
So that **graceful shutdown works in Docker**.

**Acceptance Criteria:**

**Given** entrypoint.sh
**When** SIGTERM is sent to container
**Then** signal is forwarded to node process

**Given** entrypoint.sh
**When** SIGINT is sent to container
**Then** signal is forwarded to node process

**Given** node process exits
**When** exit code captured
**Then** entrypoint exits with same code

---

## Epic 6: CI/CD & Release Automation

**Goal:** Contributors can confidently develop, test, and release the action with automated quality gates.

**Implementation Files:**

- `.github/workflows/ci.yml` - CI pipeline
- `.github/workflows/release.yml` - Release automation
- `.github/workflows/test-action.yml` - E2E tests
- `.github/dependabot.yml` - Dependency updates

### Story 6.1: Create CI Workflow

As a **contributor**,
I want **automated CI on PRs**,
So that **code quality is enforced**.

**Acceptance Criteria:**

**Given** push to main or PR
**When** CI runs
**Then** npm ci installs dependencies
**And** npm run lint checks code style
**And** npm run format:check verifies formatting
**And** npm run typecheck validates types
**And** npm run test:unit runs unit tests
**And** npm run bundle creates dist/index.js

### Story 6.2: Create Docker Build Verification

As a **contributor**,
I want **Docker build tested in CI**,
So that **container issues are caught early**.

**Acceptance Criteria:**

**Given** CI workflow
**When** Docker steps run
**Then** image is built successfully
**And** node, python3.11, java versions are verified
**And** image is cleaned up after tests

### Story 6.3: Create Release Workflow

As a **maintainer**,
I want **automated releases**,
So that **publishing is consistent and reliable**.

**Acceptance Criteria:**

**Given** push to main branch
**When** release workflow runs
**Then** `release-please` creates/updates a release PR via `googleapis/release-please-action@v4`
**And** when PR is merged, GitHub Release is created with auto-generated notes

**Given** `workflow_dispatch` trigger
**When** release workflow runs
**Then** `resolve-version` extracts version from `package.json`
**And** downstream `publish-image` and `update-major-tag` jobs proceed

**Given** a successful release (from either path)
**When** `publish-image` runs
**Then** Docker image is pushed to GHCR with v-prefixed and non-prefixed tags
**And** `update-major-tag` force-updates the `v{MAJOR}` floating git tag

**Given** concurrent releases
**When** triggered
**Then** concurrency group prevents race conditions

### Story 6.4: Create E2E Test Workflow

As a **contributor**,
I want **E2E tests for the action**,
So that **real-world usage is validated**.

**Acceptance Criteria:**

**Given** test-action.yml workflow
**When** run
**Then** action is tested with valid workflow path
**And** action is tested with missing workflow path (should fail)
**And** action is tested with invalid env_vars JSON (should fail)
**And** action is tested with path traversal (should fail)

### Story 6.5: Configure Dependabot

As a **maintainer**,
I want **automated dependency updates**,
So that **security vulnerabilities are addressed promptly**.

**Acceptance Criteria:**

**Given** dependabot.yml
**When** weekly schedule runs
**Then** npm dependencies are checked for updates
**And** GitHub Actions are checked for updates
**And** dev dependencies are grouped together

### Story 6.6: Configure Code Quality Tools

As a **contributor**,
I want **consistent code style enforced**,
So that **the codebase is maintainable**.

**Acceptance Criteria:**

**Given** ESLint configuration
**When** npm run lint is run
**Then** TypeScript strict rules are enforced
**And** no-console rule prevents accidental logs
**And** explicit return types are required

**Given** Prettier configuration
**When** npm run format is run
**Then** code is formatted consistently

**Given** TypeScript configuration
**When** strict mode is enabled
**Then** noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedIndexedAccess are enforced

---

## Epic 7: Configuration Customization & Examples

**Goal:** Users can customize OpenCode SDK configuration (providers, auth, models) and have complete example workflows for onboarding.

**FRs covered:** FR39, FR40, FR41, FR42, FR43, FR44
**Status:** 🔲 NOT STARTED

**Implementation Files:**

- `action.yml` - New inputs
- `src/types.ts` - Extended ActionInputs
- `src/config.ts` - Parse new inputs
- `src/opencode.ts` - Load config files, list models
- `src/runner.ts` - Handle list_models mode
- `examples/` - Example workflows

### Story 7.1: Add Configuration Inputs to Action

As a **GitHub Actions user**,
I want **to specify OpenCode config and auth file paths**,
So that **I can use my own API keys and provider settings**.

**Acceptance Criteria:**

**Given** action.yml file
**When** updated
**Then** input `opencode_config` is defined as optional string
**And** input `auth_config` is defined as optional string
**And** input `model` is defined as optional string
**And** input `list_models` is defined as optional boolean with default 'false'

### Story 7.2: Parse Configuration Inputs

As a **developer**,
I want **new inputs parsed and validated**,
So that **config paths are validated before use**.

**Acceptance Criteria:**

**Given** opencode_config input provided
**When** getInputs() is called
**Then** path is captured in ActionInputs
**And** path is validated within workspace using validateWorkspacePath()

**Given** auth_config input provided
**When** getInputs() is called
**Then** path is captured in ActionInputs
**And** path is validated within workspace

**Given** model input provided
**When** getInputs() is called
**Then** model string is captured in ActionInputs

**Given** list_models is 'true'
**When** getInputs() is called
**Then** listModels boolean is set to true

### Story 7.3: Load Config Files and Pass to SDK

As a **developer**,
I want **config files loaded and passed to OpenCode SDK**,
So that **users can customize provider settings**.

**Acceptance Criteria:**

**Given** opencode_config path provided
**When** OpenCodeService.initialize() is called
**Then** config file is read as JSON
**And** config is passed to createOpencode() options

**Given** auth_config path provided
**When** OpenCodeService.initialize() is called
**Then** auth file is read as JSON
**And** each provider entry is passed to `client.auth.set()` API after SDK initialization

**Given** model input provided
**When** initialize() is called
**Then** model is set in config object (`config.model`) passed to `createOpencode()`

**Given** config file does not exist
**When** initialize() is called
**Then** clear error is returned: 'Config file not found: {path}'

**Given** config file is invalid JSON
**When** initialize() is called
**Then** clear error is returned: 'Invalid JSON in config file'

### Story 7.4: Implement List Models Feature

As a **GitHub Actions user**,
I want **to see available models**,
So that **I can choose the right model for my workflow**.

**Acceptance Criteria:**

**Given** list_models is true
**When** action runs
**Then** SDK is initialized with provided config/auth
**And** available models are queried from SDK
**And** models are printed to console in format:

```
=== Available Models ===
  - {model_id}: {model_name} ({provider})
========================
```

**And** action exits with status 'success'
**And** workflow execution is skipped

**Given** list_models is true but SDK initialization fails
**When** action runs
**Then** error is logged and action fails

### Story 7.5: Create Example Workflows

As a **GitHub Actions user**,
I want **complete example workflows**,
So that **I can quickly set up AI workflows in my repository**.

**Acceptance Criteria:**

**Given** examples/basic-workflow/
**When** user copies files
**Then** README.md explains setup steps
**And** workflow.md contains simple AI workflow
**And** .github/workflows/run-ai.yml shows action usage

**Given** examples/with-validation/
**When** user copies files
**Then** README.md explains validation setup
**And** validate.py shows Python validation script
**And** workflow demonstrates retry behavior

**Given** examples/github-copilot/
**When** user copies files
**Then** README.md explains Copilot token setup
**And** workflow shows auth_config usage with Copilot provider
**And** clear instructions for generating personal Copilot token

**Given** examples/custom-model/
**When** user copies files
**Then** README.md explains model selection
**And** workflow shows model input usage
**And** demonstrates list_models feature

### Story 7.6: Update Documentation

As a **GitHub Actions user**,
I want **README updated with configuration options**,
So that **I understand how to customize the action**.

**Acceptance Criteria:**

**Given** README.md
**When** updated
**Then** new inputs are documented in inputs table
**And** configuration section explains GitHub Variables/Secrets setup
**And** examples section links to examples/ folder
**And** Copilot setup is documented with token generation link

---

## Epic 8: Distribution & Marketplace Publishing

**Goal:** The action is distributed via pre-built Docker image on GHCR and listed on GitHub Marketplace for discoverability, eliminating per-run Docker builds for consumers.

**FRs covered:** FR45, FR46, FR47, FR48, FR49
**Status:** 🔲 NOT STARTED

**Implementation Files:**

- `.github/workflows/release.yml` - Add Docker build & push job
- `action.yml` - Update image reference to GHCR

### Story 8.1: Add Docker Image Build & Push to Release Pipeline

As a **maintainer**,
I want **Docker images automatically built and pushed to GHCR on release**,
So that **consumers pull a pre-built image instead of building from Dockerfile**.

**Acceptance Criteria:**

**Given** a release is created (via release-please or workflow_dispatch)
**When** the release workflow's `publish-image` job runs
**Then** it authenticates to GHCR using `GITHUB_TOKEN`
**And** it builds the Docker image from `Dockerfile` (3-stage: bundler + builder + runtime)
**And** it pushes the image to `ghcr.io/arch-playground/ai-workflow-runner`
**And** the image is tagged with both v-prefixed and non-prefixed variants: `1.2.3`, `v1.2.3`, `1.2`, `v1.2`, `1`, `v1`, `latest`, `sha-{short}`

**Given** the release workflow has `release-please` and `resolve-version` jobs
**When** the Docker publish job runs
**Then** it runs after either upstream job creates a release
**And** it requires `packages: write` permission (job-level)

**Given** the Docker build fails
**When** the release workflow runs
**Then** the failure is reported clearly
**And** the GitHub Release is still created (Docker publish is non-blocking)

### Story 8.2: Update action.yml to Reference Pre-built GHCR Image

As a **GitHub Actions user**,
I want **the action to use a pre-built Docker image**,
So that **my workflows start faster without building the image**.

**Acceptance Criteria:**

**Given** `action.yml` file
**When** updated
**Then** `runs.image` is changed from `'Dockerfile'` to `'docker://ghcr.io/arch-playground/ai-workflow-runner:v1'`
**And** the `v`-prefixed major version tag is used (not `latest`) for stability and consistency with `@v1` convention
**And** all existing inputs and outputs remain unchanged

**Given** a consumer uses `arch-playground/ai-workflow-runner@v1`
**When** the action runs
**Then** GitHub pulls the pre-built image from GHCR
**And** no Docker build step occurs
**And** startup time is reduced to image pull time only

### Story 8.3: Publish Action to GitHub Marketplace

As a **GitHub Actions user**,
I want **the action listed on GitHub Marketplace**,
So that **I can discover it when searching for AI workflow tools**.

**Acceptance Criteria:**

**Given** the repository on GitHub
**When** the action is published to Marketplace
**Then** it appears in GitHub Marketplace search results
**And** the listing shows the action name "AI Workflow Runner"
**And** the listing shows the description from `action.yml`
**And** the listing shows the branding icon (play-circle, green)

**Given** Marketplace listing requirements
**When** verified
**Then** `action.yml` has `name`, `description`, and `branding` fields
**And** repository has a `README.md` with usage instructions
**And** repository has a `LICENSE` file
**And** repository is public

**Given** a new release is published
**When** the Marketplace listing is updated
**Then** the latest version is shown on the Marketplace page

---

## Epic 9: Conversation Logging & Transcript Export

**Goal:** Users get a scannable GitHub Actions console and a full `conversation.json` transcript exported for artifact upload.

**Design reference:** `research/opencode-upgrade-design-2026-05-29.md` §3 (D3).

### Story 9.1: Add Log-Group Wrapping Around Tool Calls

As a user, I want each tool call collapsed into a GitHub Actions log group so the console stays scannable.
**AC:** `handleMessagePartUpdated` wraps each tool's verbose body in `core.startGroup(formatLog)` / `core.endGroup()`; assistant narrative stays top-level; groups not nested. (FR50)

### Story 9.2: Ration GitHub Annotations

As a user, I want only run-level outcomes as annotations so real failures aren't buried.
**AC:** Routine tool errors → `core.info` inside their group; `core.error/warning/notice` (with `title=`) reserved for final failure / validation-exhausted / fatal SDK error; stays under 10/type/step and 50/job caps. (FR51)

### Story 9.3: Transcript Writer (`conversation.json`)

As a user, I want the full conversation saved to a file for artifact upload.
**AC:** New `src/transcript-writer.ts` fetches `session.messages()` after run (and each validation turn), scrubs secrets, writes `conversation.json` (raw messages array incl. text, tool I/O, reasoning, token/cost). (FR52, FR53, NFR21)

### Story 9.4: Job Summary Writer

As a user, I want a readable run report in the GitHub job summary.
**AC:** New `src/summary-writer.ts` builds status heading + token/cost/duration table + collapsed `<details>` per tool category + final message + artifact link via `core.summary`; written once at run end. (FR54)

### Story 9.5: Stop-Command Wrapping & Long-Line Guard

As a maintainer, I want streamed assistant text safe and the log fast.
**AC:** `handleTextPart` wraps streamed text with `::stop-commands::`/`::{token}::`; no single live-log line approaches ~6k chars (full bodies to debug/transcript file only). (NFR22)

### Story 9.6: Action Inputs/Outputs & Examples

As a user, I want to enable transcript export and know how to upload it.
**AC:** `action.yml` adds `export_transcript` input + `transcript_json_path` output; README + example workflow shows `actions/upload-artifact` step (upload stays in consuming workflow — D6).

### Story 9.7: Tests

**AC:** Unit tests for transcript-writer (incl. secret-scrubbing) and summary-writer; e2e exercises real-server transcript fetch.

---

## Epic 10: Model Selection & Free-Model Filtering

**Goal:** List models with cost/free tags and disable free models without ever mis-classifying a paid subscription.

**Design reference:** `research/opencode-upgrade-design-2026-05-29.md` §4 (D4, D7).

### Story 10.1: Join Provider Auth State With Model Cost

As the runner, I need `enabled.via` alongside per-model `cost`.
**AC:** `listModels()` calls `client.v2.provider.list()` (provider `enabled.via`) and `client.config.providers()` (models + cost) and joins by provider id; a provider absent from the v2 list is treated as non-account. (FR57)

### Story 10.2: Provider-Aware Free Predicate

As the runner, I need to identify free models correctly.
**AC:** `isFilterableFree(model, provider) = cost?.input===0 && cost?.output===0 && enabled.via!=="account"`; missing `cost` → "unknown pricing", NOT free. Unit-covered with the Copilot/Zen/OpenRouter cases. (FR57, D4)

### Story 10.3: `disable_free_models` Input

As a user, I want to exclude free models.
**AC:** New `disable_free_models` input (default false); when true, `list_models` omits free models AND a resolved free model fails fast with a clear error. (FR56)

### Story 10.4: Enrich `list_models` Output

As a user, I want to see pricing when listing models.
**AC:** `list_models` output annotates each model `free`/`paid`/`unknown-pricing` with cost. (FR55)

### Story 10.5: `subscription_providers` Override

As a user with a non-standard flat-subscription provider, I want to extend protection.
**AC:** Optional `subscription_providers` config key adds provider ids to the keep-set; defaults empty (the `enabled.via` rule covers observed providers). (FR58)

### Story 10.6: Tests

**AC:** Unit tests assert Copilot (`via:account`, cost 0) kept, Zen `*-free` filtered, OpenAI free-tier kept, missing-cost kept; the proven real-data cases.

---

## Epic 11: Provider Fallback Chain

**Goal:** Select the first healthy provider at conversation start from an ordered cross-provider chain; auth stays separate.

**Design reference:** `research/opencode-upgrade-design-2026-05-29.md` §5 (D1, D2, D5, D8) + §7 spike.

### Story 11.1: Parse `fallback_config` (No Credentials)

As a user, I want an ordered provider/model chain.
**AC:** New `fallback_config` input parses an ordered `[{provider, model}]` list; **rejects any `auth`/credential field** (D8); validates shape and size. (FR59)

### Story 11.2: Authenticated-Provider Preflight

As the runner, I skip chain entries that can't start.
**AC:** Before selection, each chain provider is checked against `v2.provider.list()` (`enabled !== false`); unauthenticated references are skipped with a `core.warning`. Auth itself is applied from `auth_config` as today. (FR60)

### Story 11.3: Start-and-Watch Selector

As the runner, I pick the first provider that starts cleanly.
**AC:** `src/provider-chain.ts` creates a session pinned to chain[i], sends the first prompt, watches the event stream; a `session.error` (whole error union) before the first assistant part → abort, advance to chain[i+1]. (FR61, FR62)

### Story 11.4: Commit-Boundary Detection

As the runner, I must not switch after the conversation commits.
**AC:** "Committed" = first **assistant-role** text/tool/reasoning part (NOT the user-prompt echo, per spike finding); once committed, no provider switching (D2).

### Story 11.5: Exhaustion Error & Precedence

As a user, I get a clear failure and predictable precedence.
**AC:** Chain exhausted → aggregated error listing per-provider skip reason; when `fallback_config` is present it supersedes the single `model` input (D5), with a `core.warning` on conflict. (FR63)

### Story 11.6: Tests

**AC:** Unit + e2e (real server): invalid/unauthenticated provider is skipped; startup `session.error` advances the chain; committed conversation does not switch.

---

## Epic 12: SDK Currency & Maintenance Guard

**Goal:** Stay on latest stable SDK with a CI signal when the pin lags; keep the CLI binary aligned.

**Design reference:** `research/opencode-upgrade-design-2026-05-29.md` §2.

### Story 12.1: CI Currency Guard

As a maintainer, I want a signal when a newer stable SDK ships.
**AC:** A scheduled CI job compares `npm view @opencode-ai/sdk version` to the pinned version and opens an issue / emits a warning when it lags. (FR64)

### Story 12.2: Bump SDK + Align CLI Binary

As a maintainer, I want the SDK and Docker CLI binary in lockstep.
**AC:** Bump `@opencode-ai/sdk` to current latest (1.15.13 at time of writing); Dockerfile `npm install -g opencode-ai` version matches the SDK pin; `dist/index.js` rebundled. (FR64, FR65)

---

## Epic 13: Security Hardening (Red-Team Remediation)

**Goal:** Close the verified security findings from the manual/security/whitehat testing (3 CRITICAL, 2 HIGH, 2 MEDIUM, 2 doc) with layered, secure-by-default containment — without breaking the tool's purpose (run a workflow over source code to extract knowledge/patterns), the Copilot-never-blocked invariant, the fallback chain (Epic 11), or the transcript/summary features (Epic 9).

**Design reference:** `research/security-hardening-design-2026-06-02.md` (architect judgement, ai-memory aligned) + `research/security-hardening-research-2026-06-01.md` (best-practice research). Findings: `docs/tests/test-run-redteam-2026-06-01.md`, `docs/tests/TC-REDTEAM-agent-execution.md`.

**Test design reference:** `_bmad-output/implementation-artifacts/test-design-epic-13.md` (to be created in Story 13-8).

**Product decisions (confirmed + refined with user 2026-06-02):** fine-grained tool allowlists, not a blunt toggle. **bash** = command-pattern allowlist permitting read-only extraction commands (`grep`/`ls`/`find`/`cat`/`head`/`tail`/`wc`/`tree`/`git log|show|diff|blame`, …) and denying the rest (natively supported — opencode parses the command tree and matches via `Wildcard.match`); **websearch** = allowed (knowledge extraction needs it); **webfetch** = default-deny with coarse `allow_webfetch` opt-in (no native per-domain allowlist in opencode config — trusted-domain webfetch is a documented follow-up). **Filesystem** = confine the agent to `GITHUB_WORKSPACE` via `external_directory: "deny"` so it cannot read `auth.json`/`/proc`/`~/.aws`/`/etc` outside the workspace. baseURL = host allowlist + `allowed_provider_hosts` opt-in + refuse-auth for non-allowlisted endpoints.

### Story 13.1: Scope the Agent Server Environment (RC-A / A1)

As an operator, I want the AI agent to never see ambient runner secrets it wasn't given, so a malicious prompt cannot dump `GITHUB_TOKEN`/cloud creds via the agent.
**AC:** A shared `buildScopedEnv()` allowlist helper in `security.ts` (mirroring the existing `validation.ts:buildChildEnv` pattern); `process.env` is sanitized to the allowlist (PATH/HOME/LANG/TERM + runtime vars JAVA*HOME/GOPATH/GOROOT/XDG*\* + declared `env_vars` + RUNNER_TEMP) around `createOpencode` in `opencode.ts:doInitialize` and restored in `finally`. Verified: agent `bash: env|grep` no longer surfaces undeclared secrets; declared `env_vars` and env-authenticated providers still work; Java/Go LSP autoinstall unaffected. (FR66, NFR24) [Fixes AGENT-01, AGENT-06; partial FINDING-5]

### Story 13.2: Fine-Grained Tool Allowlist + FS Confinement + Fix Permission Merge (RC-A / A2+A3)

As an operator, I want the agent restricted to safe read-only shell commands and confined to the working directory, with consumer config unable to weaken our hardening.
**AC:** `buildPermissionConfig` sets: **bash** = command-pattern allowlist (object form) permitting curated read-only extraction commands (`grep*`,`ls*`,`find*`,`cat*`,`head*`,`tail*`,`wc*`,`tree*`,`file*`,`rg*`,`git log*`,`git show*`,`git diff*`,`git blame*`,`git status*`) with a final `"*":"deny"`; a `bash_allow_patterns` input lets consumers extend the allowlist; **websearch** = `allow`; **webfetch** = `deny` with an `allow_webfetch` input (coarse on/off — no native per-domain allowlist, trusted-domain webfetch deferred to a documented follow-up); **`external_directory` = `deny`** with the agent project dir set to `GITHUB_WORKSPACE`, so reads/bash outside the workspace (auth.json, `/proc/*/environ`, `~/.aws`, `/etc`) are refused by opencode's `containsPath` check; **merge direction inverted** so Action security rules win under OpenCode's last-match-wins semantics (consumer `permission` applied first, Action rules overlaid last); the `handlePermissionAsked` handler must resolve a denied-bash/external_directory request to reject, never silently `'always'`. Verified: `curl|sh`/`rm`/installs denied while `grep`/`ls`/`find`/`cat` (in-tree) succeed; `cat auth.json`/`/proc` outside workspace refused; websearch works; consumer `opencode_config` cannot re-enable a denied command. (FR67, FR68) [Fixes AGENT-09 RCE, AGENT-02/03 on-disk reads; primary FINDING-5]

### Story 13.3: Non-Root Container (RC-A / A4)

As an operator, I want the Action to run as a non-root user so the agent (and any allowed bash) has minimal OS-level blast radius.
**AC:** `entrypoint.sh` starts as root, `chown`s workspace/RUNNER_TEMP/HOME/GOPATH/XDG as needed, then drops to a non-root user via `gosu` for the Node process (chosen over hardcoded `USER 1001` for runner-UID resilience per `runner-service-install-user` lesson). Verified on a real container run: workspace + `$GITHUB_OUTPUT` writes still succeed; `id` inside agent bash is non-root; non-root cannot read other users' `/proc/*/environ`. (FR69, NFR25) [Fixes AGENT-05 root writes; defense-in-depth for AGENT-02 — the primary auth.json fix is now 13.2's `external_directory: deny`]

### Story 13.4: Provider baseURL Allowlist + Refuse-Auth (RC-B)

As an operator, I want the Action to refuse to send provider credentials to an attacker-chosen endpoint.
**AC:** `buildSdkConfig` validates every consumer-supplied `provider.<id>.options.{baseURL,endpoint}`: require `https:`, block private/loopback/link-local/metadata ranges (incl. 169.254.169.254), allowlist known provider hosts (incl. `api.githubcopilot.com` — Copilot-never-blocked) plus a new `allowed_provider_hosts` opt-in input for enterprise gateways; fail-closed (reject) on mismatch. `applyAuth` skips `client.auth.set` for any provider whose effective baseURL isn't allowlisted (belt-and-suspenders). The host allowlist is a curated, override-able security constant in `security.ts` — NOT a provider-classification list (preserves D7/D8: must not bleed into model-filter or fallback auth logic). Verified: redirected baseURL no longer receives the org key; Azure `resourceName` derivation + Bedrock hosts accommodated; `allowed_provider_hosts` re-enables a custom gateway. (FR70) [Fixes AGENT-04, FINDING-1]

### Story 13.5: Global Wall-Clock Timeout (MEDIUM-1)

As an operator, I want `timeout_minutes` to be a hard ceiling on the whole run, including the validation-retry loop.
**AC:** `index.ts` creates `AbortSignal.timeout(inputs.timeoutMs)` merged with `shutdownController.signal` via `AbortSignal.any`; the combined signal threads everywhere the shutdown signal flows; `runValidationLoop` guards its head with `combined.aborted`; `TimeoutError` reason maps to status `timeout` (distinct from `cancelled`). Verified: an infinite-loop validation script is aborted at `timeout_minutes`, not after `retries × per-call timeout`. (FR71) [Fixes FINDING-2]

### Story 13.6: Inert Summary Rendering + Ambient-Secret Masking Backstop (MEDIUM-2 + cross-cutting)

As an operator, I want untrusted agent output rendered safely and runner secrets masked even if the agent surfaces them.
**AC:** `summary-writer.ts` renders the final assistant message via `addCodeBlock` (inert; neutralizes markdown phishing links/images) keeping `scrubSecrets`+`truncateString`; `security.ts` extends the mask/scrub set with secrets the Action can enumerate (`GITHUB_TOKEN` if present + values parsed from `auth.json` in `applyAuth`) via `core.setSecret()` so they're masked in transcript/summary. Verified: an agent-emitted phishing link does not render as a clickable link; enumerable runner secrets are masked in artifacts. (FR72, NFR24) [Fixes AGENT-08; backstop for FINDING-5 output path]

### Story 13.7: Threat-Model Docs + Digest-Pin Base Images (FINDING-3, FINDING-4)

As an adopter, I want safe-deployment guidance and tamper-evident builds.
**AC:** README + `SECURITY.md` gain a "Security Considerations / Threat Model" section covering: minimal `permissions:`, never `pull_request_target` + untrusted PR + secrets, `opencode_config` is trusted/credential-adjacent, `allow_bash` implications, egress filtering (`step-security/harden-runner`) for consumers who need it; Dockerfile base images pinned by `@sha256:` digest (aligns with `supply-chain-branch-remediation` decision on artifact integrity). (FR73) [Fixes FINDING-3, FINDING-4]

### Story 13.8: Tests + Epic-End Security Re-Validation

As a maintainer, I want unit coverage for every fix and proof that each red-team finding now PASSES.
**AC:** Unit tests for `buildScopedEnv`, permission merge, baseURL allowlist (incl. private-range/metadata rejection + `allowed_provider_hosts` opt-in), global-timeout mapping, summary code-block, ambient-secret masking (≥80% on new logic). Create `_bmad-output/implementation-artifacts/test-design-epic-13.md`. At epic end (per validation policy): re-run the real `TC-REDTEAM-*`/`TC-AGENT-*` cases against the **live container** (authoritative-evidence-validation) using `github-copilot/gpt-5-mini` for funcval/manual and an opencode free model for e2e — every prior FAIL must flip to PASS, with regression confirmation that Copilot runs, fallback chain, transcript/summary, and free-model filtering still work. (covers all Epic 13 FRs/NFRs)
