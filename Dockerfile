# Stage 1: Build stage - install packages and prepare environment
FROM debian:bookworm-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install all system packages in a single layer
# Use JDK 17 (LTS, available in Debian Bookworm)
# Install Node.js 20.x from NodeSource with GPG verification
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        gnupg \
        openjdk-17-jre-headless \
        python3.11 \
        python3.11-venv \
        python3-pip \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs

# Stage 2: Runtime stage - minimal image with only necessary files
FROM debian:bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/owner/ai-workflow-runner"
LABEL org.opencontainers.image.description="AI Workflow Runner - Multi-runtime GitHub Action"

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies only (no build tools like curl, gnupg)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        openjdk-17-jre-headless \
        python3.11 \
        python3.11-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy Node.js from builder stage
COPY --from=builder /usr/bin/node /usr/bin/node
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
COPY --from=builder /usr/bin/npm /usr/bin/npm
COPY --from=builder /usr/bin/npx /usr/bin/npx

# Verify installations
RUN node --version && \
    python3.11 --version && \
    java --version

# Create non-root user for security
RUN groupadd --gid 1000 runner && \
    useradd --uid 1000 --gid runner --shell /bin/sh --create-home runner

# Copy application
COPY dist/ /app/dist/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory to where workspace will be mounted
WORKDIR /github/workspace

# Switch to non-root user
USER runner

# Use entrypoint with signal handling
ENTRYPOINT ["/entrypoint.sh"]
