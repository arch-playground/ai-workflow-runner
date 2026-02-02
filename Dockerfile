# Stage 1: Build stage - install packages and prepare environment
FROM debian:bookworm-slim AS builder

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
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs temurin-21-jre

# Stage 2: Runtime stage - minimal image with only necessary files
FROM debian:bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/arch-playground/ai-workflow-runner"
LABEL org.opencontainers.image.description="AI Workflow Runner - Multi-runtime GitHub Action"

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies only (no build tools like curl, gnupg)
# Java 21 requires ca-certificates-java for proper SSL handling
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3.11 \
        python3.11-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy Node.js from builder stage
COPY --from=builder /usr/bin/node /usr/bin/node
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
COPY --from=builder /usr/bin/npm /usr/bin/npm
COPY --from=builder /usr/bin/npx /usr/bin/npx

# Copy Java 21 from builder stage
COPY --from=builder /usr/lib/jvm/temurin-21-jre /usr/lib/jvm/temurin-21-jre
ENV JAVA_HOME=/usr/lib/jvm/temurin-21-jre
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Verify installations
RUN node --version && \
    python3.11 --version && \
    java --version

# Copy application
COPY dist/ /app/dist/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory to where workspace will be mounted
WORKDIR /github/workspace

# Note: GitHub Actions runs Docker containers with --user matching the runner's UID,
# so a custom USER directive is unnecessary and may cause permission issues.

# Use entrypoint with signal handling
ENTRYPOINT ["/entrypoint.sh"]
