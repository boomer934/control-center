# Security Policy

Control Center starts shells, runs AI agents that edit files, talks to the Docker engine and launches MCP servers. We treat security as a core feature.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository. Include:

- what an attacker can do, and under which preconditions;
- steps to reproduce;
- the affected version (Settings → About).

You will get an acknowledgement as soon as possible. Fixes are released as patch versions and credited in the changelog, if you wish.

## Supported versions

Until v1.0, only the latest release receives security fixes.

## Security model (summary)

- The renderer runs sandboxed with context isolation, a strict CSP and no Node integration.
- IPC goes through a minimal typed contract, and every message is validated with zod in the main process.
- The hooks and MCP bridges talk to the app over local named pipes, authenticated with a per-session token. No TCP ports are opened.
- File operations are confined to the selected workspace (path traversal and symlink checks).
- Docker access is read-only by default, and destructive actions always ask for confirmation.
- Local (Ollama) agents never write files directly. They only propose diffs.
- No telemetry, no remote crash reporting. Secrets are redacted from logs and stored events.

The full threat model lives in `docs/memoria/SICUREZZA.md`.
