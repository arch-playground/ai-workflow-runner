#!/bin/bash
# Run the AI workflow runner locally for debugging.
#
# Usage:
#   ./scripts/run-local.sh <workspace_dir> <workflow_path> [timeout_minutes]
#
# Example (replicating the CI layout):
#   ./scripts/run-local.sh /path/to/om-blk-knowledge-base workflows/service-analysis/steps/01-init-and-scan.md 10
#
# Prerequisites:
#   - opencode CLI installed and configured (with auth)
#   - Target repo checked out at <workspace_dir>/target-repo/ (if the workflow expects it)

set -euo pipefail

WORKSPACE_DIR="${1:?Usage: $0 <workspace_dir> <workflow_path> [timeout_minutes]}"
WORKFLOW_PATH="${2:?Usage: $0 <workspace_dir> <workflow_path> [timeout_minutes]}"
TIMEOUT_MINUTES="${3:-10}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/.local-run-logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RUN_LOG_DIR="$LOG_DIR/$TIMESTAMP"

mkdir -p "$RUN_LOG_DIR"

# Resolve workspace to absolute path
WORKSPACE_DIR="$(cd "$WORKSPACE_DIR" && pwd)"

echo "=== Local Run Configuration ==="
echo "Workspace:    $WORKSPACE_DIR"
echo "Workflow:     $WORKFLOW_PATH"
echo "Timeout:      ${TIMEOUT_MINUTES}m"
echo "Log dir:      $RUN_LOG_DIR"
echo "==============================="

# Build
echo ""
echo ">>> Building project..."
cd "$PROJECT_DIR"
npm run bundle 2>&1 | tail -3

# OpenCode config with DEBUG log level (must be under RUNNER_TEMP for path validation)
OPENCODE_CONFIG_FILE="/tmp/opencode-local-config.json"
cat > "$OPENCODE_CONFIG_FILE" <<'EOF'
{
  "logLevel": "DEBUG"
}
EOF
cp "$OPENCODE_CONFIG_FILE" "$RUN_LOG_DIR/opencode-config.json"

echo ""
echo ">>> Starting workflow runner..."
echo ">>> WORKSPACE=$WORKSPACE_DIR"
echo ">>> Workflow=$WORKFLOW_PATH"
echo ">>> OpenCode config: $OPENCODE_CONFIG_FILE (logLevel: DEBUG)"
echo ">>> Debug log: $RUN_LOG_DIR/workflow-debug.log"
echo ""

# Set GitHub Actions-compatible env vars
export GITHUB_WORKSPACE="$WORKSPACE_DIR"
export GITHUB_OUTPUT="/dev/null"
export GITHUB_STATE="/dev/null"
# Do NOT set RUNNER_TEMP — it triggers Docker path translation in validateConfigPath
unset RUNNER_TEMP

# Action inputs (INPUT_ prefix for @actions/core)
export INPUT_WORKFLOW_PATH="$WORKFLOW_PATH"
export INPUT_TIMEOUT_MINUTES="$TIMEOUT_MINUTES"
export INPUT_PROMPT=""
export INPUT_ENV_VARS='{"OUTPUT_FILE": "services/om-blk-alert-service/scan-results.json"}'
export INPUT_VALIDATION_SCRIPT=""
export INPUT_VALIDATION_SCRIPT_TYPE=""
export INPUT_VALIDATION_MAX_RETRY="5"
export INPUT_LIST_MODELS="false"
export INPUT_DEBUG_LOG="true"
export INPUT_DEBUG_LOG_PATH="/tmp/opencode-workflow-debug.log"
export INPUT_MODEL="${MODEL:-}"
export INPUT_OPENCODE_CONFIG="$OPENCODE_CONFIG_FILE"
export INPUT_AUTH_CONFIG=""

echo ">>> Press Ctrl+C to stop at any time"
echo ""

# Change to workspace directory so OpenCode server uses it as CWD
cd "$WORKSPACE_DIR"

# Run with output to both console and log file
set +e
node "$PROJECT_DIR/dist/index.js" 2>&1 | tee "$RUN_LOG_DIR/console.log"
EXIT_CODE=${PIPESTATUS[0]}
set -e

echo ""
echo ">>> Run completed with exit code: $EXIT_CODE"

# Copy OpenCode server logs
echo ">>> Collecting OpenCode server logs..."
for LOG_BASE in \
  "$HOME/.local/share/opencode/log" \
  "$HOME/Library/Application Support/opencode/log"; do
  if [ -d "$LOG_BASE" ]; then
    echo "    Found logs at: $LOG_BASE"
    find "$LOG_BASE" -name "*.log" -mmin -60 -exec cp {} "$RUN_LOG_DIR/" \;
    break
  fi
done

echo ""
echo "=== Logs saved to: $RUN_LOG_DIR ==="
ls -lah "$RUN_LOG_DIR/"
echo ""

# Copy debug log from /tmp
if [ -f "/tmp/opencode-workflow-debug.log" ]; then
  cp /tmp/opencode-workflow-debug.log "$RUN_LOG_DIR/workflow-debug.log"
  echo "=== workflow-debug.log (last 30 lines) ==="
  tail -30 "$RUN_LOG_DIR/workflow-debug.log"
  echo ""
fi

# Show OpenCode server log if available
OPENCODE_LOG=$(find "$RUN_LOG_DIR" -name "*.log" ! -name "console.log" ! -name "workflow-debug.log" ! -name "opencode-config.json" | head -1)
if [ -n "$OPENCODE_LOG" ]; then
  echo "=== OpenCode server log (last 50 lines): $(basename "$OPENCODE_LOG") ==="
  tail -50 "$OPENCODE_LOG"
fi

exit $EXIT_CODE
