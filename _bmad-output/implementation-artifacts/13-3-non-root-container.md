# Story 13.3: Non-Root Container (Privilege Drop)

Status: ready-for-dev

## Story

As an **operator**,
I want **the Action's Node process (and the agent it spawns) to run as a non-root user**,
So that **the agent's OS-level blast radius is minimized — non-root bash can't read other users' `/proc/*/environ`, root-owned mounts, or write root-owned paths (defense-in-depth behind 13-1/13-2; closes AGENT-05 root-write)**.

## Background

**Red-team finding (verified):** the container runs as **root** (no `USER` in the Dockerfile runtime stage), so agent `bash` ran as `uid=0` and wrote `/root/.bashrc` + `/etc/cron.d/*` (AGENT-05). 13-1/13-2 already block most reach via env-scoping + tool denial; this story removes root itself.

**Design decision (RC-A / A4, ai-memory `runner-service-install-user`):** use the **root→`gosu` drop** pattern in `entrypoint.sh` rather than a hardcoded `USER 1001`. Rationale: GitHub-hosted runners own the workspace as UID 1001, but self-hosted runners may use a different UID (often 1000). Starting the entrypoint as root lets us `chown` what's needed and then drop to a non-root user via `gosu`, which is resilient across runner-UID variance. (A hardcoded `USER 1001` breaks workspace/`$GITHUB_OUTPUT` writes on non-1001 runners — the documented GitHub Actions UID pitfall: actions/checkout#956, runner#2411.)

**Scope boundary:** container + entrypoint ONLY. Do NOT touch permissions/env-scoping (13-1/13-2 done), baseURL (13-4), or app TypeScript beyond what's needed to read HOME/XDG correctly (likely nothing — env-scoping already passes HOME through).

## Acceptance Criteria

1. **Non-root user exists.** The Dockerfile runtime stage creates a dedicated non-root user+group (e.g. `runner`, uid/gid configurable via `ARG` with a sane default like 1001) and installs `gosu`.

2. **Writable dirs prepared for the non-root user.** `HOME` for the runner user (e.g. `/home/runner`), `GOPATH`, the opencode XDG data dir (`$XDG_DATA_HOME` or `~/.local/share/opencode`), and any LSP autoinstall target are created and `chown`ed to the runner user at build time. `GOPATH`/`JAVA_HOME`/`PATH` env updated so Go/Java LSP autoinstall writes to a runner-writable location (move `GOPATH=/root/go` → the runner's HOME).

3. **Entrypoint drops privileges.** `entrypoint.sh` starts as root, `chown`s the mounted `GITHUB_WORKSPACE` and `RUNNER_TEMP` to the runner user (so writes work), runs the `git config --global safe.directory` as the runner user (or sets it for that user), then execs `node` via **`gosu <runner-user>`**. Signal forwarding (SIGTERM/SIGINT → node) must still work through the gosu layer.

4. **Workspace + GitHub outputs still writable (the UID pitfall — MUST verify on real container).** After the drop, the Action can still write `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY`, `RUNNER_TEMP`, the transcript, and files under the workspace. Verified by a real container run that exercises output writing (status output present, transcript written).

5. **Agent runs non-root.** Inside the spawned agent, `id` reports a non-root uid (verify in funcval — re-run the AGENT-05 vector: `/root/.bashrc` / `/etc/cron.d` writes now fail with permission denied AND/OR are blocked by 13-2's bash deny; the OS layer is the backstop).

6. **Runtimes still work non-root.** opencode starts, a model run completes (Copilot gpt-5-mini → pong), Java/Go LSP autoinstall doesn't fail on permissions (or is not triggered by the smoke workflow). The `opencode --version` build-time verify still passes.

7. **Backward compatible.** The image builds; the smoke run (gpt-5-mini → pong, status success) works exactly as before, just non-root.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, commenting (zero-obvious), conventions, security standards under `.knowledge-base/`
  - [ ] Read design `security-hardening-design-2026-06-02.md` → "Non-root container" section; ai-memory note `runner-service-install-user` (UID mismatch → cryptic runtime failures).

- [ ] **Task 2: Dockerfile — create user, install gosu, prepare writable dirs** (AC: 1, 2, 6)
  - [ ] `apt-get install gosu` in the runtime stage deps.
  - [ ] `ARG RUNNER_UID=1001`, `ARG RUNNER_GID=1001`; `groupadd -g $RUNNER_GID runner && useradd -m -u $RUNNER_UID -g $RUNNER_GID -d /home/runner runner`.
  - [ ] Move `GOPATH=/root/go` → `/home/runner/go`; create + chown `GOPATH`, `/home/runner/.local/share/opencode` (XDG), `/home/runner/.cache`, `/app` (read), to runner. Keep `JAVA_HOME` readable.
  - [ ] Do NOT add a `USER` line (entrypoint must start as root to chown the mounted volumes). Keep `ENTRYPOINT ["/entrypoint.sh"]`.

- [ ] **Task 3: entrypoint.sh — chown mounts + gosu drop + signal forwarding** (AC: 3, 4)
  - [ ] At start (as root): `chown -R runner:runner "$GITHUB_WORKSPACE" "$RUNNER_TEMP" 2>/dev/null || true` (best-effort; don't fail if a path is unset/unwritable). Also ensure the runner can write `$GITHUB_OUTPUT`/`$GITHUB_STEP_SUMMARY` files (they live under RUNNER_TEMP or are bind-mounted — chown the file if it exists).
  - [ ] Run `git config --global --replace-all safe.directory '*'` as the runner user (`gosu runner git config …`) so it lands in the runner's gitconfig, OR set `HOME=/home/runner` before it.
  - [ ] Replace `node /app/dist/index.js &` with `gosu runner node /app/dist/index.js &` (keep the background + `wait` + trap signal-forwarding pattern; verify signals reach node through gosu — gosu execs, so the trap on the shell still forwards to the gosu child's node).
  - [ ] Export `HOME=/home/runner` and `XDG_DATA_HOME`/`GOPATH` for the runner before exec, so opencode/LSP resolve to writable dirs (these must survive 13-1's env scoping — they're in the allowlist: HOME, GOPATH, XDG\_\*).

- [ ] **Task 4: Functional validation (real container — REQUIRED, this is the UID-pitfall story)** (AC: 4, 5, 6, 7)
  - [ ] Build the image; `opencode --version` build verify passes.
  - [ ] Run a smoke workflow (gpt-5-mini → pong) with `$GITHUB_OUTPUT`/`$GITHUB_STEP_SUMMARY`/transcript mounted: confirm status=success, output written, transcript written, summary written (the UID-pitfall check — writes work non-root).
  - [ ] Confirm the agent is non-root: a workflow running `id` (allowed? no — bash `id` is denied by 13-2; instead verify via `docker run --entrypoint sh awr:13-3 -c 'gosu runner id'` ⇒ non-root uid).
  - [ ] Re-run the AGENT-05 vector if feasible (write /root/.bashrc) — now blocked (by 13-2 bash deny and/or OS permission). Document.

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit` (no app code change expected, but run to be safe; the Docker build is the real gate here).

## Dev Notes

- **gosu, not su/sudo:** gosu execs without a TTY/PAM, preserves signals correctly, designed exactly for this entrypoint-drop pattern. It's a single small static binary in debian (`apt-get install gosu`).
- **Signal forwarding through gosu:** the current entrypoint backgrounds node and traps 15/2 to forward. With `gosu runner node … &`, the shell's trap still fires and `kill -TERM $NODE_PID` (the gosu pid) — gosu forwards signals to its child. Verify SIGTERM still reaches node (the lifecycle tests / a manual `docker stop` check).
- **The UID pitfall is the whole point of Task 4.** A hardcoded non-root USER would break workspace writes on runners whose UID ≠ ours. The chown-in-entrypoint-then-gosu approach adapts at runtime. MUST verify writes on a real container, not just that it builds.
- **HOME/XDG/GOPATH must reach the agent child** — they're in 13-1's `buildScopedEnv` allowlist, so setting them in the entrypoint propagates correctly. Confirm opencode's auth/LSP still resolve (auth.json now under `/home/runner/.local/share/opencode` if mounted there — note: the Action sets auth via `client.auth.set`, not a mounted file, so this is mostly about LSP/cache dirs).
- **ai-memory `runner-service-install-user`:** UID/user mismatch causes cryptic runtime failures — this is exactly why we chown+gosu instead of assuming a UID.
- No app TypeScript change expected. If something needs HOME read differently, flag to leader.

### References

- [Source: epics.md#Story 13.3] · [Source: prd.md#FR69, #NFR25]
- [Source: research/security-hardening-design-2026-06-02.md → "Non-root container" (N1, gosu drop)]
- [Source: research/security-hardening-research-2026-06-01.md → Non-root section (UID pitfall, gosu)]
- [Source: docs/tests/TC-REDTEAM-agent-execution.md → AGENT-05]
- ai-memory: `~/.jarvis/memory/patterns/runner-service-install-user.md`
- Current: `Dockerfile` runtime stage, `entrypoint.sh`

## Dev Agent Record

### Agent Model Used

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
