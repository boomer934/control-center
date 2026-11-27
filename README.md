# Control Center

> Working name. **Status: early development.**

A desktop app (Electron, Windows first) that shows **in real time what your AI coding agents are doing** on your project, next to your local dev infrastructure.

- **Live view:** a map of your codebase where files light up as agents read and write them, a per-agent timeline with replay, and diffs one hover away.
- **Claude Code integration:** drives the official `claude` CLI with your own `claude login`. No API keys are required.
- **Local agents:** delegates repetitive work (log summaries, code search, test drafts) to local [Ollama](https://ollama.com) models, so your subscription limits are spent where they matter.
- **Infrastructure:** Docker containers, listening ports, GPU/VRAM and loaded models at a glance.
- **MCP & Skills:** see, toggle and edit MCP servers and Claude Code skills per session.
- **Git & checkpoints:** automatic checkpoints before agents write, so you can compare and roll back from the timeline.
- **Error console:** stack traces from the app and from your project in real time, linked to the files on the map.

**Local and private by default.** No telemetry and no remote crash reporting. Your data stays in the app's local data folder.

## Requirements (planned)

- Windows 10/11 (macOS and Linux after v1)
- Node.js ≥ 22 and pnpm 10, for development
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in
- Optional: Docker Desktop, Ollama, an NVIDIA GPU

## Windows installation and updates

Run the x64 NSIS installer from [GitHub Releases](https://github.com/boomer934/control-center/releases) when it is listed under the release assets. The app checks there for stable updates at launch and every six hours. It downloads in the background, installs when you close the app, and offers **Restart to update** when a download is ready. Use **Settings → Automatic app updates** to turn it off.

The updater verifies the installer's SHA-512 digest against the release manifest fetched over HTTPS. When the installer is unsigned, Windows may show a SmartScreen warning. The digest alone does not verify the publisher's identity.

## Development

```bash
pnpm install
pnpm verify   # format check, typecheck, lint, unit tests
pnpm dist     # Windows x64 installer and update metadata, built locally
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the project plan in [`docs/memoria/PIANO.md`](docs/memoria/PIANO.md) (Italian).

## Disclaimer

This is an independent project and is not affiliated with Anthropic. Each user runs Claude Code with their own account and is responsible for complying with its terms of use.

## License

[MIT](LICENSE)
