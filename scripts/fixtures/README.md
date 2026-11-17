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

`sessione-01..05`: a multi-file rename, a failing test fixed and re-run, a subagent, a denied `npx tsc` (through the `PowerShell` tool on Windows, not `Bash`) and a missing file. `sessione-06`: a `Read` of a missing file with the `PostToolUseFailure` hook (failed tools have no `PostToolUse`).

**Still missing:** an interactive session, recorded as `sessione-07`. With `-p` permissions are denied at once, so there is no `Notification` for a user wait. Follow the next section.

## Recording an interactive session (`Notification`) on Windows, step by step

A person has to do this: Claude cannot answer a permission prompt shown in another session. It takes about 3 minutes.

Two folders are involved:

| Name             | What it is                                                    |
| ---------------- | ------------------------------------------------------------- |
| `<repo>`         | this repository (the folder containing `pnpm-workspace.yaml`) |
| `<test-project>` | the separate test project used for the recordings             |

### A. Check the hooks of the test project (once)

Open `<test-project>\.claude\settings.local.json`. Under `"hooks"` it must list at least `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification` and `Stop`. Every entry must run:

```json
{ "type": "command", "command": "node \"<repo>/scripts/fixtures/capture-hook.mjs\"" }
```

Use forward slashes in `<repo>`. Under `"permissions"` → `"allow"`, do **not** list `PowerShell`: the prompt below must ask for permission.

### B. Record (in a new PowerShell window, not inside Claude Code)

1. Open a new **PowerShell** window, for example from the Start menu or Windows Terminal.
2. Go to the test project:

   ```powershell
   cd <test-project>
   ```

3. Name the session. The variable lives only in this window:

   ```powershell
   $env:VERNIER_HOOKS_SESSION = "sessione-07"
   ```

4. Start Claude Code in interactive mode, **without** `-p`:

   ```powershell
   claude
   ```

5. At the Claude prompt type exactly this and press Enter:

   ```text
   Run `npx --version` with the PowerShell tool and tell me the output.
   ```

6. Claude asks for permission ("Do you want to proceed?"). **Wait 10 seconds without answering**: this wait is what produces `Notification`. Then choose **Yes**.
7. Type this second prompt and press Enter:

   ```text
   Now run `git log -1` with the PowerShell tool.
   ```

   When it asks for permission, choose **No**. This records a denial made by a person.

8. Close the session:

   ```text
   /exit
   ```

### C. Prepare the files (same window)

9. Remove the variable and go to the repository:

   ```powershell
   Remove-Item Env:VERNIER_HOOKS_SESSION
   cd <repo>
   ```

10. An interactive session writes no stream, only `raw\sessione-07.hooks.jsonl`. Create an **empty** stream file next to it, otherwise `check-raw.mjs` and `sanitize.mjs` skip the session:

    ```powershell
    New-Item packages\fixtures\raw\sessione-07.jsonl -ItemType File
    ```

11. Check that `Notification` was captured:

    ```powershell
    Select-String -Path packages\fixtures\raw\sessione-07.hooks.jsonl -Pattern '"Notification"'
    ```

    You should see at least one line. If you see nothing:
    - the hooks were not loaded: you were not in `<test-project>`, or the JSON in step A is wrong. Type `/hooks` inside `claude` to see the hooks it loaded;
    - or you answered too fast. Delete both `sessione-07` files in `raw\` and start again from step 2.

### D. Sanitize and commit (from `<repo>`)

12. Run, one after the other:

    ```powershell
    node scripts\fixtures\check-raw.mjs
    node scripts\fixtures\sanitize.mjs
    npx vitest run packages/fixtures -u
    ```

13. Read `packages\fixtures\sanitized\sessione-07.hooks.jsonl` and the snapshot diff (`git diff`), then commit on a `feat/…` branch.
