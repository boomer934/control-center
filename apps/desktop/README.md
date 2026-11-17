# apps/desktop

The Electron app: main process, sandboxed preload and React renderer, built with electron-vite.

```
src/main/            app lifecycle, window, IPC handlers (ipc.ts), hardening (hardening.ts)
src/main/security/   pure, unit-tested rules: webPreferences, CSP, URLs, permissions, app:// paths
src/preload/         exposes only the typed window.api from @control-center/ipc-contract
src/renderer/        React UI (phase 3a: placeholder shell)
e2e/app/             Playwright _electron tests on the built app (security checklist, dev mode)
e2e/packaged/        tests on the unpacked electron-builder output (Electron Fuses)
```

## Commands

From the repository root:

- `pnpm dev` starts the app with hot reload.
- `pnpm build` bundles main, preload and renderer into `out/`.
- `pnpm e2e` builds and runs the Playwright `_electron` tests.
- `pnpm e2e:packaged` builds the unpacked app into `release/` (`electron-builder --dir`) and checks its Electron Fuses.

## Security model

See `docs/memoria/SICUREZZA.md` (Electron checklist, each item with its test) and `docs/adr/0004-shell-sicura-e-ipc.md`. In short:

- every window uses `secureWebPreferences` (context isolation, sandbox, no Node);
- the packaged renderer is served from `app://control-center/` with a strict CSP;
- the renderer reaches the main process only through `window.api`, generated from the IPC contract; the main process checks the sender and validates requests and responses with zod;
- new windows, navigation away from the app and all web permissions are denied; `https:` links open in the system browser;
- Electron Fuses disable `RunAsNode`, `NODE_OPTIONS` and the inspector, and enforce ASAR integrity.

All dependencies are `devDependencies`: electron-vite bundles them, so the package ships no `node_modules`.
