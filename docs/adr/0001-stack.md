# 0001 — Stack tecnologico

- **Stato:** accettata
- **Data:** 2026-11-13

## Contesto

Serve un'app desktop (Windows prima) con terminale reale, accesso a processi locali (Claude Code CLI, Ollama, Docker), grafi interattivi in tempo reale e una UI molto curata. Il progetto è personale ma destinato all'open source.

## Decisione

- **Electron** con main e preload in TypeScript, renderer React 19, build con electron-vite e packaging con electron-builder.
- **Un solo runtime, Node/TypeScript:** niente microservizio Python. L'analisi del codice usa web-tree-sitter (WASM).
- **Monorepo pnpm:** `apps/desktop` + `packages/*` (schema eventi, contratto IPC, bridge, client Ollama, fixture).
- **TypeScript 6 strict** (TS 7 non ancora supportato da typescript-eslint).
- **UI:** Tailwind v4, Radix/shadcn, Lucide, Motion. Grafo con @xyflow/react + elkjs nel worker. Terminale con xterm.js + node-pty. Editor e diff con CodeMirror 6.
- **Stato:** Zustand. **Validazione:** zod su ogni confine. **Persistenza:** JSONL append-only per gli eventi.
- **Test:** Vitest (unit e integrazione), Playwright `_electron` (E2E e visivi), axe-core.

## Alternative considerate

- **Tauri:** binari più leggeri, ma node-pty, dockerode e l'SDK MCP sono nativi Node; con Tauri servirebbe un sidecar.
- **Backend Python/FastAPI:** un secondo runtime da distribuire e mantenere, senza un vantaggio decisivo.
- **Monaco:** più pesante di CodeMirror 6 per editor Markdown e diff.
- **SQLite da subito:** aggiunge un modulo nativo; JSONL basta per il replay e si rivaluterà più avanti.

## Conseguenze

- I moduli nativi (node-pty) richiedono electron-rebuild e build tools su Windows.
- Tutto è condiviso in TypeScript tra main, renderer e bridge: tipi unici.
- Il bundle è più pesante di Tauri, accettabile per un'app per sviluppatori.
