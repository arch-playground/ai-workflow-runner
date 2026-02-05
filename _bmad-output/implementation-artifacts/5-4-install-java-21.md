# Story 5.4: Install Java 21

Status: done

## Story

As a **GitHub Actions user**,
I want **Java 21 available in the Docker image**,
So that **Java-based workflows and tools work correctly**.

## Acceptance Criteria

1. **Given** the Docker image
   **When** `java --version` is run
   **Then** version 21 is returned

2. **Given** the Adoptium Temurin JRE
   **When** installed
   **Then** headless JRE is used (not full JDK) to save space
   **And** the installation is from official Adoptium repository

3. **Given** the Java installation
   **When** copied to runtime stage
   **Then** `JAVA_HOME` environment variable is set correctly
   **And** Java binaries are in `PATH`
   **And** the JRE works on both amd64 and arm64 architectures

4. **Given** the Adoptium repository
   **When** added to apt sources
   **Then** GPG verification is used for security
   **And** the key is stored in `/etc/apt/keyrings/adoptium.gpg`

## Tasks / Subtasks

- [x] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [x] Read `.knowledge-base/technical/standards/global/security.md` - GPG verification requirements
  - [x] Review existing Java installation in `Dockerfile`

- [x] **Task 2: Add Adoptium Repository in Builder Stage** (AC: 4)
  - [x] Download and dearmor GPG key from Adoptium
  - [x] Add repository to apt sources with signed-by directive
  - [x] Repository URL: `https://packages.adoptium.net/artifactory/deb`

- [x] **Task 3: Install Java 21 JRE in Builder Stage** (AC: 1, 2)
  - [x] Install `temurin-21-jre` package (JRE, not JDK)
  - [x] Verify Java 21 is installed

- [x] **Task 4: Copy Java to Runtime Stage** (AC: 3)
  - [x] Copy JRE from builder using architecture-agnostic pattern
  - [x] Handle both `temurin-21-jre-amd64` and `temurin-21-jre-arm64` paths
  - [x] Set `JAVA_HOME` environment variable
  - [x] Add Java bin directory to `PATH`

- [x] **Task 5: Verify Installation** (AC: 1, 3)
  - [x] Add `RUN java --version` verification step
  - [x] Test on both amd64 and arm64 if possible

- [x] **Final Task: Quality Checks**
  - [x] Verify GPG key is properly verified
  - [x] Ensure JRE (not JDK) is used to minimize image size
  - [x] Verify Java works without display (headless mode)

## Dev Notes

### Architecture Requirements

- Java 21 is the latest LTS version
- JRE is sufficient (no compilation needed, just runtime)
- Adoptium Temurin is the community successor to AdoptOpenJDK

### Why Adoptium Temurin?

- Not available in Debian Bookworm default repositories
- Official Eclipse Foundation distribution
- Well-maintained with security updates
- Provides both amd64 and arm64 builds

### Image Size Consideration

- Java JRE is the largest component (~200-300MB)
- Using JRE instead of JDK saves significant space
- Headless variant avoids GUI dependencies

### Multi-Architecture Pattern

```dockerfile
# Copy with wildcard to handle both architectures
COPY --from=builder /usr/lib/jvm/temurin-21-jre-* /usr/lib/jvm/temurin-21-jre/

# Set environment variables
ENV JAVA_HOME=/usr/lib/jvm/temurin-21-jre
ENV PATH="${JAVA_HOME}/bin:${PATH}"
```

### Implementation Pattern

```dockerfile
# In builder stage
RUN curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends temurin-21-jre
```

### Project Structure Notes

- Java is optional for workflows (not required by the runner itself)
- Included for users who need Java-based AI tools or workflows
- The ~300MB size impact is acceptable per PRD (~1GB total image size)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Technology Stack]
- [Source: _bmad-output/planning-artifacts/prd.md#Components]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4]
- [Source: https://adoptium.net/installation/linux/ - Adoptium installation guide]

## Dev Agent Record

### Agent Model Used

Code Review Agent (Claude Opus 4.5)

### Completion Notes List

- Implementation exists in Dockerfile lines 20-23 (builder) and 57-60 (runtime)
- GPG verification implemented correctly for Adoptium repository
- Architecture-agnostic copy with wildcard pattern
- JAVA_HOME and PATH configured correctly
- Verified via `RUN java --version` in Dockerfile:65

### File List

- `Dockerfile` - Contains Java 21 installation
