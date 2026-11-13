# apps/desktop

The Electron app (main, preload, renderer). It is scaffolded in **Phase 3** (secure shell), after the UX/design work of Phase 1 and the event schema of Phase 2.

Planned layout:

```
src/main/       processes and services (claude, ollama, docker, fs, pty)
src/preload/    minimal typed bridge (window.api)
src/renderer/   React UI: shell, panels, design system
e2e/            Playwright (_electron) tests
```
