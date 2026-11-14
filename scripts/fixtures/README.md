# Raw session recordings

Real Claude Code sessions recorded as fixtures for the event schema (phase 2) and the Live view prototype (`design/prototipo-live/`). They live in `packages/fixtures/raw/`, which is **git-ignored**: nothing recorded here is committed before the phase 2 sanitizer has cleaned it (only `packages/fixtures/sanitized/` is ever committed).

## Recording a session

Run it in a separate **test project**, never in a real one and never with hooks in `~/.claude`.

1. In the test project's `.claude/settings.local.json`, add a `command` hook for `PreToolUse`, `PostToolUse`, `SubagentStop`, `Notification` and `Stop` that runs:

   ```bash
   node "<repo>/scripts/fixtures/capture-hook.mjs"
   ```

   Keep the permissions narrow, so that one prompt can trigger a denial.

2. Record the stream and the hooks together:

   ```bash
   VERNIER_HOOKS_SESSION=sessione-06 claude -p "<realistic task>" --output-format stream-json --verbose > <repo>/packages/fixtures/raw/sessione-06.jsonl
   ```

   `capture-hook.mjs` appends every hook payload as `{capturedAt, payload}` to `raw/<VERNIER_HOOKS_SESSION>.hooks.jsonl`. Hooks carry no timestamp of their own, hence the wrapper.

3. Check the set:

   ```bash
   node scripts/fixtures/check-raw.mjs
   ```

   It validates every line and checks that the recordings together cover file edits, shell commands, subagents, a permission denial and an error.

4. Sanitize and check:

   ```bash
   node scripts/fixtures/sanitize.mjs
   ```

   It rewrites every `raw/<name>.jsonl` and `<name>.hooks.jsonl` into `packages/fixtures/sanitized/`, then runs the check. The sanitizer is an allowlist. For every kind of stream-json line and hook payload it keeps only the keys the normalizers need. It replaces file contents with `<redacted>` lines, so line counts and `+`/`-` diff counts stay true. Then it cleans every string:
   - the workspace becomes `C:\fixtures\workspace`;
   - any home becomes `C:\Users\user`;
   - the local user name, host name, git identity and e-mail addresses are replaced;
   - secrets are redacted.

   `node scripts/fixtures/sanitize.mjs --check` only scans `sanitized/` and exits 1 on findings. It also runs in CI and in `pnpm test`. **Read the sanitized files before committing them.**

5. Update the timeline snapshots of the normalizer tests (`npx vitest run packages/fixtures -u`) and review the diff.

## What the current set covers

`sessione-01..05`: a multi-file rename, a failing test fixed and re-run, a subagent, a denied `npx tsc` (through the `PowerShell` tool on Windows, not `Bash`) and a missing file.

**Still missing:** an interactive session (with `-p` permissions are denied at once, so there is no `Notification` for a user wait) and `PostToolUseFailure` (failed tools have no `PostToolUse`).
