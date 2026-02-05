# Story 5.5: Install OpenCode CLI

Status: done

## Story

As a **developer**,
I want **OpenCode CLI globally installed in the Docker image**,
So that **the @opencode-ai/sdk can spawn the CLI for agentic AI execution**.

## Acceptance Criteria

1. **Given** the Docker image
   **When** `opencode --version` is run
   **Then** version is returned successfully

2. **Given** the OpenCode CLI installation
   **When** installed globally via npm
   **Then** the `opencode-ai` package is in `/usr/lib/node_modules/`
   **And** the `opencode` binary is accessible in PATH

3. **Given** the runtime stage
   **When** OpenCode CLI is needed
   **Then** a symlink exists from `/usr/local/bin/opencode` to the CLI binary
   **And** the CLI can be invoked by the SDK

4. **Given** the @opencode-ai/sdk
   **When** it initializes
   **Then** it can successfully spawn the OpenCode CLI
   **And** the CLI starts a local server for session management

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - NPM package security
  - [x] Review existing OpenCode CLI installation in `Dockerfile`
  - [x] Review `src/opencode.ts` for SDK initialization requirements

- [x] **Task 2: Install OpenCode CLI in Builder Stage** (AC: 1, 2)
  - [x] Install `opencode-ai` package globally using npm
  - [x] Verify installation with `opencode --version`

- [x] **Task 3: Copy OpenCode CLI to Runtime Stage** (AC: 2, 3)
  - [x] OpenCode CLI is copied as part of `/usr/lib/node_modules` (from Node.js copy)
  - [x] Create symlink: `/usr/local/bin/opencode` -> `/usr/lib/node_modules/opencode-ai/bin/opencode`

- [x] **Task 4: Verify Installation** (AC: 1, 4)
  - [x] Add `RUN opencode --version` verification step
  - [x] Verify the SDK can find and spawn the CLI

- [x] **Final Task: Quality Checks**
  - [x] Verify CLI version matches SDK requirements
  - [x] Ensure CLI binary has correct permissions

## Dev Notes

### Architecture Requirements

- The `@opencode-ai/sdk` requires the OpenCode CLI to be installed
- The SDK spawns the CLI to start a local server for AI session management
- The CLI handles the actual AI model communication

### SDK Initialization Pattern

From `src/opencode.ts`:

```typescript
import { createOpencode } from '@opencode-ai/sdk';

// SDK spawns the CLI internally
const { client, server } = await createOpencode({
  hostname: '127.0.0.1',
  port: 0, // Let OS assign port
});
```

### Installation Pattern

```dockerfile
# In builder stage
RUN npm install -g opencode-ai

# In runtime stage (after copying node_modules)
# The opencode-ai package is already in /usr/lib/node_modules
# Just create the symlink for the binary
RUN ln -s /usr/lib/node_modules/opencode-ai/bin/opencode /usr/local/bin/opencode
```

### Why Global Installation?

- The SDK expects `opencode` to be in PATH
- Global npm packages are copied with `/usr/lib/node_modules`
- Symlink provides standard binary location

### Version Pinning

- SDK version `^1.1.28` is specified in `package.json`
- CLI version should be compatible with SDK version
- Consider pinning CLI version in Dockerfile for reproducibility

### Project Structure Notes

- OpenCode CLI is a runtime dependency for the SDK
- The CLI binary is in `node_modules/opencode-ai/bin/opencode`
- SDK communicates with CLI via local server

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Technology Stack]
- [Source: _bmad-output/planning-artifacts/prd.md#Components]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5]
- [Source: src/opencode.ts - SDK initialization and CLI interaction]
- [Source: package.json - @opencode-ai/sdk version]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation exists in Dockerfile line 26 (builder) and lines 52-55 (runtime)
- Global npm install in builder, symlink created in runtime
- CLI included via `/usr/lib/node_modules` copy from Node.js stage
- Verified via `RUN opencode --version` in Dockerfile:66

### File List

- `Dockerfile` - Contains OpenCode CLI installation
