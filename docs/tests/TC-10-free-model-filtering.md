# TC-10: Model Selection & Free-Model Filtering (Epic 10)

Real-runtime tests for `list_models` pricing tags, `disable_free_models` (listing + fail-fast), the Copilot-never-blocked invariant, and the `subscription_providers` override.

## Prerequisites

- [ ] Docker image `awr:manual-test` built from source
- [ ] `~/.local/share/opencode/auth.json` with `github-copilot` authenticated; OpenCode Zen (`opencode`) reachable for free models
- [ ] These tests mostly use `list_models` (no model run) → cheap and fast

---

### TC-10-01: `list_models` pricing tags (free / subscription / paid)

**Priority**: High
**Design Ref**: opencode-upgrade-design §4a; FR55

**Steps**:

1. List models and capture tagged output:
   ```bash
   RT=/tmp/tc1001; rm -rf $RT; mkdir -p $RT; : > $RT/gh-output.txt
   docker run --rm -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_LIST_MODELS=true \
     awr:manual-test 2>&1 | tee $RT/list.txt | grep -E '\[(free|subscription|paid|unknown)\]' | head -40
   ```

**Checkpoints**:

- [ ] CP1: Copilot models tagged `[subscription]` (cost 0 + account) — verify: `grep -E 'github-copilot/.*\[subscription\]' $RT/list.txt | wc -l` ≥ 1
- [ ] CP2: paid models tagged `[paid]` — verify: `grep -cE '\[paid\]' $RT/list.txt` ≥ 1
- [ ] CP3: free models tagged `[free]` (OpenCode Zen `*-free`) — verify: `grep -E 'opencode/.*-free.*\[free\]|\[free\]' $RT/list.txt | wc -l` ≥ 1 (if Zen reachable; SKIP if Zen unavailable)
- [ ] CP4: list run succeeded — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success`

**Cleanup**: `rm -rf /tmp/tc1001`

---

### TC-10-02: `disable_free_models` hides free, keeps subscription/paid

**Priority**: Critical
**Design Ref**: opencode-upgrade-design §4a; FR56, FR57

**Steps**:

1. List WITHOUT the flag (baseline count), then WITH it:
   ```bash
   RT=/tmp/tc1002; rm -rf $RT; mkdir -p $RT
   run() { docker run --rm -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e INPUT_LIST_MODELS=true "$@" awr:manual-test 2>&1; }
   run > $RT/all.txt
   run -e INPUT_DISABLE_FREE_MODELS=true > $RT/filtered.txt
   ```

**Checkpoints**:

- [ ] CP1: with flag on, a "N free model(s) hidden" notice is logged — verify: `grep -iE 'free model\(s\) hidden' $RT/filtered.txt`
- [ ] CP2: filtered list has NO `[free]` tags — verify: `grep -c '\[free\]' $RT/filtered.txt` returns `0`
- [ ] CP3: Copilot `[subscription]` models still present when filtered — verify: `grep -cE 'github-copilot/.*\[subscription\]' $RT/filtered.txt` ≥ 1
- [ ] CP4: filtered count < unfiltered count (something was actually hidden) — verify: `[ $(grep -cE '\[(free|paid|subscription|unknown)\]' $RT/filtered.txt) -lt $(grep -cE '\[(free|paid|subscription|unknown)\]' $RT/all.txt) ] && echo HIDDEN` (SKIP if Zen unreachable → 0 free to hide)

**Cleanup**: `rm -rf /tmp/tc1002`

---

### TC-10-03: `disable_free_models` fail-fast on a free resolved model

**Priority**: Critical
**Design Ref**: opencode-upgrade-design §4a; FR56

**Preconditions**:

- [ ] A known free model id: `opencode/big-pickle` (OpenCode Zen, cost 0, unauthenticated provider)

**Steps**:

1. Try to RUN a free model with the flag on:
   ```bash
   WS=/tmp/tc1003/workspace; RT=/tmp/tc1003/rt
   rm -rf /tmp/tc1003; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Say pong.\n' > $WS/workflow.md
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_MODEL='opencode/big-pickle' \
     -e INPUT_DISABLE_FREE_MODELS=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | tail -6
   ```

**Checkpoints**:

- [ ] CP1: clear fail-fast error naming the free model — verify: `grep -iE "Model 'opencode/big-pickle' is a free model and disable_free_models" $RT/log.txt`
- [ ] CP2: status is failure — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `failure`
- [ ] CP3: no session was created (failed BEFORE running) — verify: `grep -c 'Session created' $RT/log.txt` returns `0`

**Cleanup**: `rm -rf /tmp/tc1003`

---

### TC-10-04: COPILOT-NEVER-BLOCKED invariant

**Priority**: Critical
**Design Ref**: opencode-upgrade-design D7; FR57

**Preconditions**:

- [ ] `github-copilot/gpt-5-mini` (cost 0, but `enabledVia: account` → subscription, must NOT be blocked)

**Steps**:

1. RUN the Copilot subscription model WITH `disable_free_models: true` (must succeed, not be blocked):
   ```bash
   WS=/tmp/tc1004/workspace; RT=/tmp/tc1004/rt
   rm -rf /tmp/tc1004; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_MODEL='github-copilot/gpt-5-mini' \
     -e INPUT_DISABLE_FREE_MODELS=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'pong|free model|error' | head -4
   ```

**Checkpoints**:

- [ ] CP1: NOT blocked — verify: `grep -c 'is a free model and disable_free_models' $RT/log.txt` returns `0`
- [ ] CP2: status success — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success` (run 2–3× for majority; auth-freshness caveat applies)
- [ ] CP3: assistant produced output — verify: `grep -i 'pong' $RT/log.txt`

**Cleanup**: `rm -rf /tmp/tc1004`

---

### TC-10-05: `subscription_providers` override keeps a free-tier provider's models (edge)

**Priority**: High
**Design Ref**: opencode-upgrade-design D7; FR58

**Preconditions**:

- [ ] `disable_free_models: true` AND `subscription_providers` includes `opencode` (the Zen provider whose `*-free` models are normally filtered) → they should now be KEPT (treated as subscription).

**Steps**:

1. List with disable_free_models on, but opencode in the override:
   ```bash
   RT=/tmp/tc1005; rm -rf $RT; mkdir -p $RT
   docker run --rm -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e INPUT_LIST_MODELS=true -e INPUT_DISABLE_FREE_MODELS=true \
     -e INPUT_SUBSCRIPTION_PROVIDERS='opencode' \
     awr:manual-test 2>&1 | tee $RT/list.txt | grep -iE 'opencode/|hidden' | head -20
   ```

**Checkpoints**:

- [ ] CP1: opencode `*-free` models are NOT hidden (override treats them as subscription) — verify: `grep -cE 'opencode/.*-free' $RT/list.txt` ≥ 1 (SKIP if Zen unreachable)
- [ ] CP2: those models are tagged `[subscription]` not `[free]` — verify: `grep -E 'opencode/.*-free.*\[subscription\]' $RT/list.txt | wc -l` ≥ 1 (SKIP if Zen unreachable)
- [ ] CP3: list run succeeded — verify: list output present, no crash

**Cleanup**: `rm -rf /tmp/tc1005`

---

### TC-10-06: `disable_free_models` with an unresolvable model — conservative, proceeds (abnormal/edge)

**Priority**: Medium
**Design Ref**: opencode-upgrade-design §4a (AC6 conservative)

**Preconditions**:

- [ ] `disable_free_models: true` but NO explicit `model` input (the guard can't positively resolve the model) → must PROCEED (not over-block), per AC6.

**Steps**:

1. Run with the flag on but no model pin (relies on opencode default; guard should skip):
   ```bash
   WS=/tmp/tc1006/workspace; RT=/tmp/tc1006/rt
   rm -rf /tmp/tc1006; mkdir -p $WS $RT; : > $RT/gh-output.txt
   printf 'Reply with exactly the single word: pong\nDo not use any tools.\n' > $WS/workflow.md
   printf '{ "model": "github-copilot/gpt-5-mini" }\n' > $WS/oc.json
   # disable_free_models on, but NO INPUT_MODEL (model comes from config file → guard skips per AC6)
   docker run --rm -v $WS:/github/workspace -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -v $RT/gh-output.txt:/rt/gh-output.txt \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt -e GITHUB_OUTPUT=/rt/gh-output.txt \
     -e INPUT_WORKFLOW_PATH=workflow.md -e INPUT_OPENCODE_CONFIG=oc.json \
     -e INPUT_DISABLE_FREE_MODELS=true -e INPUT_TIMEOUT_MINUTES=2 \
     awr:manual-test 2>&1 | tee $RT/log.txt | grep -iE 'pong|skipping guard|free model|error' | head -5
   ```

**Checkpoints**:

- [ ] CP1: guard skipped (no explicit model to resolve) — verify: `grep -iE 'disable_free_models: no explicit model input — skipping guard' $RT/log.txt` (debug line) OR the run simply proceeds
- [ ] CP2: run is NOT fail-fast-blocked — verify: `grep -c "is a free model and disable_free_models" $RT/log.txt` returns `0`
- [ ] CP3: run completes (subscription gpt-5-mini from config) — verify: `grep -A1 'status<<' $RT/gh-output.txt | tail -1` equals `success` (majority of 2-3 for auth freshness)

**Cleanup**: `rm -rf /tmp/tc1006`

---

### TC-10-07: Invalid boolean for `disable_free_models` is treated as false (abnormal input)

**Priority**: Medium
**Design Ref**: config boolean parse (`trim().toLowerCase() === 'true'`)

**Preconditions**:

- [ ] `disable_free_models` set to a non-`true` junk value (`"yes"`, `"1"`, `"TRUE "` with trailing space is true; `"yes"` is false) → only exact `true` (case-insensitive, trimmed) enables it.

**Steps**:

1. List with `disable_free_models=yes` (should be treated as false → free models NOT hidden):
   ```bash
   RT=/tmp/tc1007; rm -rf $RT; mkdir -p $RT
   docker run --rm -v $RT:/rt \
     -v "$HOME/.local/share/opencode/auth.json":/root/.local/share/opencode/auth.json:ro \
     -e GITHUB_WORKSPACE=/github/workspace -e RUNNER_TEMP=/rt \
     -e INPUT_LIST_MODELS=true -e INPUT_DISABLE_FREE_MODELS=yes \
     awr:manual-test 2>&1 | tee $RT/list.txt | grep -iE 'hidden|\[free\]' | head
   ```

**Checkpoints**:

- [ ] CP1: NO "free model(s) hidden" notice (junk value = false) — verify: `grep -ciE 'free model\(s\) hidden' $RT/list.txt` returns `0`
- [ ] CP2: free models still present (not filtered) — verify: `grep -cE '\[free\]' $RT/list.txt` ≥ 1 (SKIP if Zen unreachable; otherwise free tags should appear)
- [ ] CP3: no crash on the junk value — verify: list output produced

**Cleanup**: `rm -rf /tmp/tc1007`
