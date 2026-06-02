# Story 13.6: Inert Summary Rendering + Ambient-Secret Masking Backstop

Status: ready-for-dev

## Story

As an **operator**,
I want **untrusted agent output rendered as inert text in the job summary, and the runner secrets the Action can enumerate masked even if surfaced**,
So that **a phishing link in agent output doesn't render as clickable (closes AGENT-08/MEDIUM-2), and ambient secrets like GITHUB_TOKEN or parsed auth.json values are scrubbed from artifacts as a backstop (cross-cutting C2)**.

## Background

**Red-team findings:**

- **MEDIUM-2 (AGENT-08):** `summary-writer.ts:128` uses `.addRaw(scrubbed)`. `core.summary` escapes HTML but **renders markdown** — so `[Click here](https://evil)` from agent output becomes a live phishing link in the job summary.
- **Cross-cutting (C2 backstop):** `maskSecrets` (`security.ts:208`) only masks values passed via `env_vars`. Ambient runner secrets the Action _can_ enumerate — `GITHUB_TOKEN` if present, and the credential values it parses from `auth.json` in `applyAuth` — are NOT masked, so if surfaced they appear unredacted. (Primary prevention is 13-1/13-2; this is the output-side backstop.)

**Design (MEDIUM-2 S1 + cross-cutting C2):** render the final message via `addCodeBlock` (inert preformatted — no markdown/link rendering); and feed the enumerable ambient secrets into `core.setSecret()`.

**Scope boundary:** summary rendering + ambient-secret masking ONLY. Do NOT touch permissions/env/container/baseURL/timeout (done). Token-shape heuristic redaction (C3) is OUT of scope (optional future).

## Acceptance Criteria

1. **Inert summary.** `summary-writer.ts` renders the final assistant message via `core.summary.addCodeBlock(scrubbed)` (or equivalent inert form) instead of `.addRaw(scrubbed)`. Verified: an agent message `[Click](https://evil.example)` appears as literal preformatted text in the summary, NOT a clickable link. Keep the existing `scrubSecrets` + `truncateString` pass (code-blocking is IN ADDITION to scrubbing).

2. **Summary still readable.** The rest of the summary (status, token/cost/duration table, tool activity) renders as before — only the untrusted final-message body becomes a code block. The transcript JSON (full fidelity) is unaffected.

3. **GITHUB_TOKEN masked.** If `process.env.GITHUB_TOKEN` (or `INPUT_GITHUB_TOKEN`) is present, its value is registered via `core.setSecret()` so it's redacted in logs/summary/transcript even if surfaced. (Defensive — the agent shouldn't see it post-13-1, but mask anyway.)

4. **Parsed auth.json values masked.** In `applyAuth`, after parsing the auth file, each credential value (the secret-bearing leaf values — keys/tokens) is registered via `core.setSecret()` before use, so a provider key never appears unredacted in any artifact. (Mirror how `maskSecrets` iterates `env_vars` values.)

5. **No over-masking.** Don't `setSecret` empty/whitespace/very-short values (avoid masking benign substrings). Mirror the existing `maskSecrets` guard (non-empty `value.length > 0`); consider a minimum length to avoid masking trivial values.

6. **Backward compatible.** Summary + transcript still produced; declared `env_vars` masking unchanged; the run behaves identically otherwise.

## Tasks / Subtasks

- [ ] **Task 1: Read Required Standards (MANDATORY)** (AC: All)
  - [ ] coding-style, commenting, logging, security, unit-testing standards. Load `typescript-clean-code`, `typescript-unit-testing`.
  - [ ] Read design `security-hardening-design-2026-06-02.md` → MEDIUM-2 (S1) + Cross-cutting (C2).

- [ ] **Task 2: Inert summary rendering** (AC: 1, 2)
  - [ ] `summary-writer.ts`: replace `.addRaw(scrubbed)` (l.128) with `.addCodeBlock(scrubbed)`. Confirm `core.summary.addCodeBlock` exists in the installed `@actions/core` (it does — check signature; it may take a language arg). Keep the `scrubSecrets`+`truncateString` of `finalMessage` (l.115-116).
  - [ ] If a heading/label precedes the message ("Final message:"), keep it; only the message body becomes the code block.

- [ ] **Task 3: Ambient-secret masking backstop** (AC: 3, 4, 5)
  - [ ] Add a helper (in `security.ts`, near `maskSecrets`) e.g. `maskAmbientSecrets()` that, if `process.env.GITHUB_TOKEN`/`INPUT_GITHUB_TOKEN` is set and non-trivial, `core.setSecret`s it. Call it early (e.g. in index.ts startup or config parse, before the agent runs).
  - [ ] In `applyAuth` (opencode.ts): after `loadJsonFile`, walk the parsed auth object and `core.setSecret` each string leaf value (the credential values) before `client.auth.set`. Guard against empty/short. (Reuse a shared mask helper if clean.)

- [ ] **Task 4: Unit tests** (AC: 1–6)
  - [ ] summary-writer.spec.ts: asserts `addCodeBlock` is called with the scrubbed message (not `addRaw`); a markdown-link message ends up code-blocked; scrubbing still applied.
  - [ ] security.spec.ts: `maskAmbientSecrets` calls `setSecret` for a present GITHUB_TOKEN; skips empty/short; doesn't throw when absent.
  - [ ] opencode.spec.ts: `applyAuth` registers each parsed auth value via `setSecret` (mock core.setSecret, assert called with the credential values).

- [ ] **Final Task: Quality Checks** — `npm run lint` · `npm run format` · `npm run typecheck` · `npm run test:unit`

## Dev Notes

- **`addCodeBlock` vs `addRaw`:** `core.summary.addCodeBlock(code, lang?)` wraps in a fenced/`<pre>` block → markdown links/images don't render. This is the lowest-risk neutralization (design S1). Verify the exact method name/signature in the installed @actions/core summary API.
- **Prevention is primary (13-1/13-2); this is the backstop (C2).** Don't try to enumerate ALL possible secrets (impossible) — only the ones the Action demonstrably holds: GITHUB_TOKEN + parsed auth.json values. That's the high-value, low-false-positive set.
- **`core.setSecret` is idempotent-ish** and additive — masking the same value twice is harmless.
- **Avoid masking short/benign values** — masking a 2-char value would redact it everywhere in output. Mirror `maskSecrets`' `value.length > 0` guard, and consider a small min length for the ambient set.
- ai-memory `comment-hygiene`: minimal comments.
- Conventions: named exports, `.js` imports; coverage ≥80%/75%. Backward compatible.

### References

- [Source: epics.md#Story 13.6] · [Source: prd.md#FR72, #NFR24]
- [Source: research/security-hardening-design-2026-06-02.md → MEDIUM-2 (S1), Cross-cutting (C2)]
- [Source: docs/tests/TC-REDTEAM-agent-execution.md → AGENT-08]
- Current: `src/summary-writer.ts:115-128` (scrub + addRaw), `src/security.ts:208` (maskSecrets), `src/opencode.ts:applyAuth`

## Dev Agent Record

### Agent Model Used

_(developer)_

### Completion Notes List

_(developer)_

### File List

_(developer)_
