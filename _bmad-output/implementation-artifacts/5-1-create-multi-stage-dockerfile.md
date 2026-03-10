# Story 5.1: Create Multi-Stage Dockerfile

Status: done

## Story

As a **developer**,
I want **an optimized Docker image using multi-stage builds**,
So that **build time and image size are minimized while maintaining all required runtimes**.

## Acceptance Criteria

1. **Given** a Dockerfile
   **When** built
   **Then** it uses a bundler stage (`node:20-bookworm-slim`) that runs `npm ci` and `npm run bundle` to produce `dist/index.js` from TypeScript source
   **And** it uses a builder stage (`debian:bookworm-slim`) that installs system runtimes (Node.js, Python, Java, OpenCode CLI)
   **And** it uses a runtime stage that copies from both bundler and builder
   **And** the final image is smaller than a single-stage build

2. **Given** the builder stage
   **When** packages are installed
   **Then** curl, ca-certificates, and gnupg are available for downloading runtimes
   **And** all package installations happen in optimized layers

3. **Given** the runtime stage
   **When** the image is built
   **Then** only runtime dependencies are included (no build tools)
   **And** apt cache is cleaned to reduce image size
   **And** temporary files are removed

4. **Given** the final image
   **When** inspected
   **Then** it is based on debian:bookworm-slim for glibc compatibility
   **And** it has appropriate OCI labels for source and description
   **And** the working directory is set to /github/workspace

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/backend/coding-style.md` - Naming conventions
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - Security practices
  - [x] Review existing Dockerfile implementation at `Dockerfile`

- [x] **Task 2: Create Bundler Stage** (AC: 1)
  - [x] Use `node:20-bookworm-slim` as base image
  - [x] Copy `package.json`, `package-lock.json`, `tsconfig.json`
  - [x] Run `npm ci` for dependency installation
  - [x] Copy `src/` directory
  - [x] Run `npm run bundle` to produce `dist/index.js`
  - [x] `dist/` no longer committed to git — Docker builds from source

- [x] **Task 3: Create Builder Stage** (AC: 1, 2)
  - [x] Use `debian:bookworm-slim` as base image
  - [x] Set `DEBIAN_FRONTEND=noninteractive` to prevent interactive prompts
  - [x] Install build dependencies: curl, ca-certificates, gnupg
  - [x] Add GPG keyrings directory for secure package verification

- [x] **Task 4: Create Runtime Stage** (AC: 1, 3)
  - [x] Use fresh `debian:bookworm-slim` as base (not FROM builder)
  - [x] Add OCI labels for image metadata
  - [x] Install only runtime dependencies (ca-certificates, python3.11)
  - [x] Clean apt cache and remove temporary files

- [x] **Task 4: Configure Working Directory** (AC: 4)
  - [x] Set WORKDIR to `/github/workspace` (GitHub Actions mount point)
  - [x] Copy application dist folder to `/app/dist/`
  - [x] Copy and chmod entrypoint.sh

- [x] **Task 5: Verify Build** (AC: All)
  - [x] Build image locally with `docker build -t ai-workflow-runner .`
  - [x] Verify image size is reasonable (~800MB-1.1GB with Java)
  - [x] Verify all runtimes are accessible

- [x] **Final Task: Quality Checks**
  - [x] Verify Dockerfile follows best practices (layer caching, minimal layers)
  - [x] Ensure no sensitive data in image layers

## Dev Notes

### Architecture Requirements

- Three-stage build: bundler → builder → runtime
- **Bundler stage:** `node:20-bookworm-slim` — builds `dist/index.js` from TypeScript source via `npm run bundle`
- **Builder stage:** `debian:bookworm-slim` — installs system runtimes (Node.js, Python 3.11, Java 21, OpenCode CLI)
- **Runtime stage:** `debian:bookworm-slim` — copies from both bundler (dist/) and builder (runtimes)
- `dist/` added to `.gitignore` — Docker builds from source, eliminating stale bundle issues
- `.dockerignore` updated to allow `src/` and `tsconfig.json` through for bundler stage
- GitHub Actions mounts workspace at `/github/workspace`

### Implementation Reference

The Dockerfile uses three stages:

```dockerfile
# Stage 1: Bundler - build application from source
FROM node:20-bookworm-slim AS bundler
WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npm run bundle

# Stage 2: Builder - install system runtimes
FROM debian:bookworm-slim AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ...

# Stage 3: Runtime - minimal image
FROM debian:bookworm-slim AS runtime
COPY --from=bundler /build/dist/ /app/dist/
COPY --from=builder /usr/bin/node /usr/bin/node
# ... copies runtimes from builder
```

### Project Structure Notes

- Dockerfile location: Repository root
- entrypoint.sh location: Repository root
- Application bundle: `dist/index.js` (built by Docker, not committed to git)
- `.dockerignore` allows: `src/`, `tsconfig.json`, `package.json`, `package-lock.json`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Technology Stack]
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation updated with bundler stage that builds from TypeScript source
- `dist/` removed from git (added to `.gitignore`) — Docker builds from source, eliminating stale bundle issues
- `.dockerignore` updated to allow `src/` and `tsconfig.json` through for bundler stage

### File List

- `Dockerfile` - Main Dockerfile with 3-stage build (bundler + builder + runtime)
- `.gitignore` - Added `dist/` exclusion
- `.dockerignore` - Updated to allow source files for bundler stage

### Change Log

- 2026-03-10: Correct-course alignment — Added bundler stage to Dockerfile (3-stage build), removed `dist/` from git, updated `.dockerignore`
