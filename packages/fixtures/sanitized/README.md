# Sanitized fixtures

Real Claude Code sessions, recorded in a throwaway test project ("fixture-lab") with `scripts/fixtures/capture-hook.mjs`, then cleaned by `scripts/fixtures/sanitize.mjs`. They are the only recordings ever committed. The raw ones stay in `../raw/` (git-ignored).

| File                          | Session                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `sessione-01`                 | multi-file rename (Grep, Read, Edit)                       |
| `sessione-02`                 | a failing test fixed and re-run (Bash, Read, Edit)         |
| `sessione-03`                 | a subagent explores `src/`, then a new file (Agent, Write) |
| `sessione-04`                 | a denied `npx tsc` through the PowerShell tool             |
| `sessione-05`                 | a missing file (Read error, Glob)                          |
| `ollama-chat.synthetic.jsonl` | hand-written `/api/chat` stream, not a recording           |

Each session is `<name>.jsonl` (stream-json) plus `<name>.hooks.jsonl` (`{capturedAt, payload}`).

What the sanitizer guarantees:

- only the keys the normalizers need;
- file contents replaced by `<redacted>` lines, with line and diff counts kept;
- the workspace shown as `C:\fixtures\workspace` and any home as `C:\Users\user`;
- no user name, host name, git identity, e-mail address or secret.

`node scripts/fixtures/sanitize.mjs --check` verifies it, in CI too.
