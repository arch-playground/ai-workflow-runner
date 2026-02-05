# Story 4.1: Implement Main Entry Point

## Story

As a **developer**,
I want **a clean main entry point**,
So that **the action orchestrates all components correctly**.

## Status

**Status:** done
**Epic:** 4 - Lifecycle Management & Graceful Shutdown
**Sprint:** MVP Implementation Sprint

## Acceptance Criteria

- [x] **AC1:** Given action starts, when run() is called, then inputs are parsed via getInputs()
- [x] **AC2:** Given action starts, when run() is called, then inputs are validated via validateInputs()
- [x] **AC3:** Given action starts, when run() is called, then workflow is executed via runWorkflow()
- [x] **AC4:** Given action starts, when run() is called, then outputs are set via core.setOutput()
- [x] **AC5:** Given validation fails, when inputs are invalid, then errors are logged via core.error()
- [x] **AC6:** Given validation fails, when inputs are invalid, then action fails via core.setFailed()

## Tasks

- [x] **Task 1:** Create src/index.ts as main entry point
- [x] **Task 2:** Import all required modules (config, runner, security, types, opencode)
- [x] **Task 3:** Implement run() async function with try-catch error handling
- [x] **Task 4:** Parse inputs using getInputs() from config module
- [x] **Task 5:** Validate inputs using validateInputs() from config module
- [x] **Task 6:** Execute workflow using runWorkflow() from runner module
- [x] **Task 7:** Set outputs using core.setOutput() for status and result
- [x] **Task 8:** Handle validation errors with core.error() and core.setFailed()
- [x] **Task 9:** Handle shutdown signal with cancelled status

## Dev Agent Record

### File List

| File              | Action   | Description                                                |
| ----------------- | -------- | ---------------------------------------------------------- |
| src/index.ts      | Created  | Main entry point with run() function                       |
| src/types.ts      | Modified | Added ShutdownSignal type and SHUTDOWN_TIMEOUT_MS constant |
| src/index.spec.ts | Created  | Unit tests for main entry point and lifecycle management   |

### Change Log

| Date       | Change                                | Reason                                              |
| ---------- | ------------------------------------- | --------------------------------------------------- |
| 2026-02-05 | Story documented retroactively        | Epic 4 was implemented but story files were missing |
| 2026-02-05 | Added unit tests for index.ts         | Code review identified missing test coverage        |
| 2026-02-05 | Updated File List to include types.ts | Code review identified undocumented file changes    |

## Implementation Notes

The main entry point (`src/index.ts`) orchestrates:

1. Input parsing and validation
2. Workflow execution with abort signal support
3. Output setting for GitHub Actions
4. Error handling with sanitized messages
5. Graceful shutdown coordination

Key implementation details:

- Uses `shutdownController` AbortController for cancellation
- Tracks `runPromise` for shutdown coordination
- Sets `status` output as 'success', 'failure', or 'cancelled'
- Sets `result` output as JSON string
