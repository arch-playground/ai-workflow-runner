# Story 5.6: Create Signal-Forwarding Entrypoint

Status: done

## Story

As a **developer**,
I want **signals forwarded to the Node.js process in Docker**,
So that **graceful shutdown works correctly when GitHub Actions terminates the container**.

## Acceptance Criteria

1. **Given** the entrypoint.sh script
   **When** SIGTERM is sent to the container
   **Then** the signal is forwarded to the Node.js process
   **And** the application can perform graceful shutdown

2. **Given** the entrypoint.sh script
   **When** SIGINT is sent to the container
   **Then** the signal is forwarded to the Node.js process
   **And** the application can perform graceful shutdown

3. **Given** the Node.js process exits
   **When** the exit code is captured
   **Then** the entrypoint exits with the same code
   **And** GitHub Actions receives the correct exit status

4. **Given** the entrypoint script
   **When** executed
   **Then** it uses POSIX-compatible signal numbers (15=SIGTERM, 2=SIGINT)
   **And** it runs the Node.js application in background to capture PID
   **And** it waits for the process to complete

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Shell script security
  - [x] Review existing entrypoint.sh implementation
  - [x] Review `src/index.ts` for signal handling on the Node.js side

- [x] **Task 2: Create Shell Script Header** (AC: 4)
  - [x] Use `#!/bin/sh` shebang for POSIX compatibility
  - [x] Add `set -e` for exit on error
  - [x] Initialize exit code tracking variable

- [x] **Task 3: Implement Signal Handler** (AC: 1, 2)
  - [x] Create `cleanup()` function to forward signals
  - [x] Use POSIX signal numbers: 15 (SIGTERM), 2 (SIGINT)
  - [x] Forward signal to Node.js process using `kill -TERM`
  - [x] Wait for process to exit and capture exit code

- [x] **Task 4: Implement Process Management** (AC: 3, 4)
  - [x] Run Node.js in background with `&` to capture PID
  - [x] Store PID in `NODE_PID` variable
  - [x] Wait for process completion with `wait`
  - [x] Exit with captured exit code

- [x] **Task 5: Configure Docker to Use Entrypoint** (AC: All)
  - [x] Copy entrypoint.sh to container root
  - [x] Set executable permission with `chmod +x`
  - [x] Set as ENTRYPOINT in Dockerfile

- [x] **Final Task: Quality Checks**
  - [x] Test signal forwarding manually with `docker kill -s SIGTERM`
  - [x] Verify exit codes are preserved correctly
  - [x] Ensure script is POSIX-compliant (no bash-isms)

## Dev Notes

### Architecture Requirements

- GitHub Actions sends SIGTERM when cancelling a workflow
- The runner needs to clean up OpenCode sessions and resources
- Exit code must be preserved for GitHub Actions status reporting

### Signal Flow

```
GitHub Actions → SIGTERM → Docker → entrypoint.sh → Node.js (index.ts)
                                                          ↓
                                                   handleShutdown()
                                                          ↓
                                                   dispose resources
                                                          ↓
                                                   exit with code
```

### Node.js Signal Handling

From `src/index.ts`:

```typescript
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

async function handleShutdown(signal: string): Promise<void> {
  core.info(`Received ${signal}, initiating graceful shutdown...`);
  shutdownController.abort();
  // ... cleanup logic
}
```

### POSIX Compatibility

- Use `/bin/sh` instead of `/bin/bash` for broader compatibility
- Use signal numbers (15, 2) instead of names (SIGTERM, SIGINT)
- Avoid bash-specific features like arrays or `[[ ]]`

### Implementation Pattern

```shell
#!/bin/sh
set -e

FINAL_EXIT_CODE=0

cleanup() {
    echo "Received shutdown signal, forwarding to application..."
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null
        FINAL_EXIT_CODE=$?
    fi
    exit $FINAL_EXIT_CODE
}

trap cleanup 15 2

node /app/dist/index.js &
NODE_PID=$!

wait $NODE_PID
EXIT_CODE=$?

exit $EXIT_CODE
```

### Project Structure Notes

- entrypoint.sh location: Repository root
- Dockerfile references: `COPY entrypoint.sh /entrypoint.sh`
- Application path: `/app/dist/index.js`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Resource Management]
- [Source: _bmad-output/planning-artifacts/prd.md#Lifecycle Management]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6]
- [Source: src/index.ts - Signal handling implementation]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation exists in entrypoint.sh (30 lines, POSIX-compliant)
- Signal handler uses numeric signals (15, 2) for portability
- Dockerfile configures ENTRYPOINT correctly at line 80
- Exit code preservation implemented correctly

### File List

- `entrypoint.sh` - Signal-forwarding entrypoint script
- `Dockerfile` - References entrypoint.sh as ENTRYPOINT
