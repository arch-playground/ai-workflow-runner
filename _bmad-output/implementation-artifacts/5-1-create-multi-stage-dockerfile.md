# Story 5.1: Create Multi-Stage Dockerfile

Status: done

## Story

As a **developer**,
I want **an optimized Docker image using multi-stage builds**,
So that **build time and image size are minimized while maintaining all required runtimes**.

## Acceptance Criteria

1. **Given** a Dockerfile
   **When** built
   **Then** it uses a builder stage that installs all packages
   **And** it uses a runtime stage that copies only necessary files
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

- [x] **Task 2: Create Builder Stage** (AC: 1, 2)
  - [x] Use `debian:bookworm-slim` as base image
  - [x] Set `DEBIAN_FRONTEND=noninteractive` to prevent interactive prompts
  - [x] Install build dependencies: curl, ca-certificates, gnupg
  - [x] Add GPG keyrings directory for secure package verification

- [x] **Task 3: Create Runtime Stage** (AC: 1, 3)
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

- Base image: `debian:bookworm-slim` for glibc compatibility and minimal footprint
- Multi-stage build reduces final image size by excluding build tools
- GitHub Actions mounts workspace at `/github/workspace`

### Implementation Reference

The existing implementation in `Dockerfile` already follows these patterns:

- Builder stage with all build dependencies
- Runtime stage with minimal dependencies
- Proper cleanup of apt cache and temp files

### Key Patterns

```dockerfile
# Builder stage pattern
FROM debian:bookworm-slim AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ...

# Runtime stage pattern
FROM debian:bookworm-slim AS runtime
COPY --from=builder /path/to/runtime /destination/
RUN apt-get clean && rm -rf /var/lib/apt/lists/*
```

### Project Structure Notes

- Dockerfile location: Repository root
- entrypoint.sh location: Repository root
- Application bundle: `dist/index.js`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Technology Stack]
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation already exists in Dockerfile
- Story created for documentation purposes

### File List

- `Dockerfile` - Main Dockerfile with multi-stage build
