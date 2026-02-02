#!/bin/sh
set -e

# Track exit code for signal handler
FINAL_EXIT_CODE=0

# Forward signals to the Node.js process
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

# Run the Node.js action in background to capture PID
node /app/dist/index.js &
NODE_PID=$!

# Wait for the process and capture exit code
wait $NODE_PID
EXIT_CODE=$?

exit $EXIT_CODE
