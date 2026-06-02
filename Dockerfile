# Stage 1: Bundle stage - install deps and build the application
# Pinned by digest for tamper-evident builds; tag: node:20-bookworm-slim. Dependabot (docker ecosystem) bumps this.
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS bundler

WORKDIR /build

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ src/
RUN npm run bundle

# Stage 2: System builder - install system packages and runtimes; tag: debian:bookworm-slim
FROM debian:bookworm-slim@sha256:0104b334637a5f19aa9c983a91b54c89887c0984081f2068983107a6f6c21eeb AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install all system packages in a single layer
# Install Node.js 20.x from NodeSource with GPG verification
# Install Java 21 from Adoptium (Eclipse Temurin) - not available in Debian Bookworm default repos
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        gnupg \
        python3.11 \
        python3.11-venv \
        python3-pip \
        git \
        golang \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs temurin-21-jre

# Install OpenCode CLI globally (required for @opencode-ai/sdk)
RUN npm install -g opencode-ai@1.15.13

# Stage 3: Runtime stage - minimal image with only necessary files; tag: debian:bookworm-slim
FROM debian:bookworm-slim@sha256:0104b334637a5f19aa9c983a91b54c89887c0984081f2068983107a6f6c21eeb AS runtime

LABEL org.opencontainers.image.source="https://github.com/arch-playground/ai-workflow-runner"
LABEL org.opencontainers.image.description="AI Workflow Runner - Multi-runtime GitHub Action"

ENV DEBIAN_FRONTEND=noninteractive

# Configurable runner user identity (default matches GitHub-hosted runner UID).
# Override at build time for self-hosted runners with a different UID/GID.
ARG RUNNER_UID=1001
ARG RUNNER_GID=1001

# Install runtime dependencies only (no build tools like curl, gnupg).
# gosu enables the root→non-root privilege drop in entrypoint.sh.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3.11 \
        python3.11-venv \
        python3-pip \
        git \
        gosu \
    && rm -f /usr/bin/python3 && ln -s /usr/bin/python3.11 /usr/bin/python3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create a dedicated non-root runner user.
# The entrypoint starts as root to chown mounted volumes, then drops to this user.
# We do NOT add a USER instruction so the entrypoint can perform the chown first.
RUN groupadd -g "${RUNNER_GID}" runner \
    && useradd -m -u "${RUNNER_UID}" -g "${RUNNER_GID}" -d /home/runner runner

# Copy Node.js from builder stage
COPY --from=builder /usr/bin/node /usr/bin/node
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
COPY --from=builder /usr/bin/npm /usr/bin/npm
COPY --from=builder /usr/bin/npx /usr/bin/npx

# OpenCode CLI is included in /usr/lib/node_modules from the builder stage.
# The opencode-ai package's bin is bin/opencode.exe (per its package.json "bin"
# mapping), not bin/opencode — symlink the actual binary so `opencode` resolves.
RUN ln -s /usr/lib/node_modules/opencode-ai/bin/opencode.exe /usr/local/bin/opencode

# Copy Java 21 from builder stage (path varies by architecture: temurin-21-jre-arm64, temurin-21-jre-amd64)
COPY --from=builder /usr/lib/jvm/temurin-21-jre-* /usr/lib/jvm/temurin-21-jre/
ENV JAVA_HOME=/usr/lib/jvm/temurin-21-jre

# Copy Go from builder stage (for gopls LSP server auto-install).
# GOPATH moved from /root/go to /home/runner/go so gopls install works after the privilege drop.
COPY --from=builder /usr/lib/go /usr/lib/go
ENV GOPATH=/home/runner/go
ENV PATH="${JAVA_HOME}/bin:/usr/lib/go/bin:${GOPATH}/bin:${PATH}"

# Pre-create writable dirs owned by the runner user so LSP autoinstall and opencode
# XDG cache/data writes succeed after the privilege drop in entrypoint.sh.
RUN mkdir -p \
        "${GOPATH}" \
        /home/runner/.local/share/opencode \
        /home/runner/.cache \
    && chown -R runner:runner /home/runner /app 2>/dev/null || true

# Verify installations
RUN node --version && \
    python3.11 --version && \
    python3 --version && \
    java --version && \
    opencode --version

# Copy bundled application from bundler stage
COPY --from=bundler /build/dist/ /app/dist/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && chown -R runner:runner /app

# Set working directory to where workspace will be mounted
WORKDIR /github/workspace

# Use entrypoint with signal handling.
# No USER instruction — entrypoint starts as root to chown mounted volumes, then drops via gosu.
ENTRYPOINT ["/entrypoint.sh"]
