#!/bin/sh
set -e

# Set runner user environment before any gosu calls.
# HOME/GOPATH/XDG_* are in 13-1's buildScopedEnv allowlist so they propagate to the agent.
export HOME=/home/runner
export GOPATH=/home/runner/go
export XDG_DATA_HOME=/home/runner/.local/share
export XDG_CACHE_HOME=/home/runner/.cache

# Chown mounted volumes so the non-root runner user can write to them.
# GITHUB_WORKSPACE and RUNNER_TEMP are bind-mounted at runtime by the GitHub Actions runner.
# Best-effort: don't fail if either env var is unset or the path is unwritable (e.g. read-only FS).
if [ -n "${GITHUB_WORKSPACE}" ]; then
    chown -R runner:runner "${GITHUB_WORKSPACE}" 2>/dev/null || true
fi
if [ -n "${RUNNER_TEMP}" ]; then
    chown -R runner:runner "${RUNNER_TEMP}" 2>/dev/null || true
fi

# GITHUB_OUTPUT and GITHUB_STEP_SUMMARY are file paths (not dirs) created by the runner before
# the container starts. Chown them individually so the runner user can append to them.
if [ -n "${GITHUB_OUTPUT}" ] && [ -f "${GITHUB_OUTPUT}" ]; then
    chown runner:runner "${GITHUB_OUTPUT}" 2>/dev/null || true
fi
if [ -n "${GITHUB_STEP_SUMMARY}" ] && [ -f "${GITHUB_STEP_SUMMARY}" ]; then
    chown runner:runner "${GITHUB_STEP_SUMMARY}" 2>/dev/null || true
fi

# Set the safe.directory gitconfig entry for the runner user.
# Running as runner (via gosu) ensures the config lands in /home/runner/.gitconfig, not root's.
gosu runner git config --global --replace-all safe.directory '*'

# Track exit code for signal handler
FINAL_EXIT_CODE=0

# Forward signals to the Node.js process.
# gosu execs node directly (no wrapper shell), so kill on NODE_PID (the gosu pid) forwards
# the signal to node. The trap here catches SIGTERM/SIGINT sent to the shell and relays them.
cleanup() {
    echo "Received shutdown signal, forwarding to application..."
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null
        FINAL_EXIT_CODE=$?
    fi
    exit $FINAL_EXIT_CODE
}

# Use signal numbers for POSIX compatibility (15=SIGTERM, 2=SIGINT)
trap cleanup 15 2

# Drop privileges and run the Node.js action as the non-root runner user.
# gosu execs node (replaces itself), so the process tree is: sh → gosu → node.
# Signals sent to the gosu pid are forwarded to node by gosu's exec semantics.
gosu runner node /app/dist/index.js &
NODE_PID=$!

# Wait for the process and capture exit code
wait $NODE_PID
EXIT_CODE=$?

exit $EXIT_CODE
