# Story 5.2: Install Node.js 20+

Status: done

## Story

As a **GitHub Actions user**,
I want **Node.js 20+ available in the Docker image**,
So that **JavaScript-based workflows and the runner itself work correctly**.

## Acceptance Criteria

1. **Given** the Docker image
   **When** `node --version` is run
   **Then** version 20.x or higher is returned

2. **Given** the NodeSource repository
   **When** added to apt sources
   **Then** GPG verification is used for security
   **And** the key is stored in `/etc/apt/keyrings/nodesource.gpg`

3. **Given** the runtime stage
   **When** Node.js binaries are copied from builder
   **Then** `/usr/bin/node` is available
   **And** `/usr/bin/npm` is available
   **And** `/usr/bin/npx` is available
   **And** `/usr/lib/node_modules` contains global packages

4. **Given** the Node.js installation
   **When** the runner executes
   **Then** it can run the bundled `dist/index.js` application
   **And** it can execute JavaScript validation scripts

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - GPG verification requirements
  - [x] Review existing Node.js installation in `Dockerfile`

- [x] **Task 2: Add NodeSource Repository in Builder Stage** (AC: 2)
  - [x] Create keyrings directory: `mkdir -p /etc/apt/keyrings`
  - [x] Download and dearmor GPG key from NodeSource
  - [x] Add repository to apt sources with signed-by directive
  - [x] Update apt cache after adding repository

- [x] **Task 3: Install Node.js in Builder Stage** (AC: 1)
  - [x] Install `nodejs` package from NodeSource repository
  - [x] Verify Node.js 20.x is installed

- [x] **Task 4: Copy Node.js to Runtime Stage** (AC: 3)
  - [x] Copy `/usr/bin/node` from builder
  - [x] Copy `/usr/lib/node_modules` from builder (includes npm and global packages)
  - [x] Copy `/usr/bin/npm` and `/usr/bin/npx` symlinks

- [x] **Task 5: Verify Installation** (AC: 1, 4)
  - [x] Add `RUN node --version` verification step
  - [x] Test running a simple Node.js script

- [x] **Final Task: Quality Checks**
  - [x] Verify GPG key is properly verified
  - [x] Ensure no unnecessary Node.js development files are included

## Dev Notes

### Architecture Requirements

- Node.js 20+ is required for ES2022 support and LTS stability
- The runner application (`dist/index.js`) requires Node.js to execute
- JavaScript validation scripts (`*.js`) need Node.js runtime

### Security Requirements

- GPG key verification is mandatory for NodeSource repository
- Use `--no-install-recommends` to minimize installed packages

### Implementation Pattern

```dockerfile
# In builder stage
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs

# In runtime stage
COPY --from=builder /usr/bin/node /usr/bin/node
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
COPY --from=builder /usr/bin/npm /usr/bin/npm
COPY --from=builder /usr/bin/npx /usr/bin/npx
```

### Project Structure Notes

- Node.js is the primary runtime for the action
- Global npm packages are installed in builder and copied to runtime
- OpenCode CLI depends on Node.js being available

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Technology Stack]
- [Source: _bmad-output/planning-artifacts/prd.md#Components]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- [Source: https://github.com/nodesource/distributions - NodeSource installation guide]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation exists in Dockerfile lines 17-23 (builder) and 46-50 (runtime)
- GPG verification implemented correctly
- All Node.js binaries copied to runtime stage
- Verified via `RUN node --version` in Dockerfile:63

### File List

- `Dockerfile` - Contains Node.js installation
