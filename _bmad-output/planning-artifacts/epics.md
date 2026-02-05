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
implementationStatus: 'MVP Complete - All epics implemented'
---

# AI Workflow Runner - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for AI Workflow Runner, decomposing the requirements from the PRD, Architecture, and Tech Specs into implementable stories.

**Implementation Status:** MVP Complete - All 6 epics fully implemented.

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

### NonFunctional Requirements

**Performance (NFR1-NFR4):**

- NFR1: Docker image build < 10 minutes on CI
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
**Then** builder stage installs all packages
**And** runtime stage copies only necessary files
**And** final image is smaller than single-stage build

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

**Given** tag pushed matching v*.*.\* pattern
**When** release workflow runs
**Then** build and tests are run
**And** GitHub Release is created with auto-generated notes
**And** major version tag (v1) is updated

**Given** invalid tag (e.g., vfoo)
**When** pushed
**Then** release workflow does not trigger

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
