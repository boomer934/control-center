# 0004 — Shell sicura: contratto IPC, protocollo app:// e Fuses

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La Fase 3a crea la shell Electron. Il renderer mostrerà output degli agenti (Markdown, log, diff): un XSS non deve poter arrivare al sistema. Servono un confine IPC stretto e verificabile, un modo sicuro di servire il renderer in produzione e un binario che non si possa riusare come runtime Node. Ogni regola deve avere un test (checklist di `SICUREZZA.md`).

## Decisione

- **Contratto IPC** in `packages/ipc-contract`, senza import di Electron (testabile con un `ipcMain` finto):
  - un oggetto `contract` con metodi nominati `namespace:nome`, ognuno con schema zod di richiesta e di risposta (`.strict()`), al massimo un argomento;
  - `registerIpcHandlers` nel main: controllo del mittente → validazione della richiesta → handler → validazione della risposta. Risponde sempre con un envelope `{ ok, value } | { ok: false, error: { code, message } }`, senza far passare eccezioni; i messaggi non riportano i valori ricevuti né i dettagli degli errori degli handler;
  - `createApi` nel preload genera `window.api` dal contratto, congelato in profondità. I tipi `Api` e `Handlers` derivano dal contratto: un metodo senza handler non compila;
  - il mittente è fidato solo se è il frame principale di una finestra creata dall'app e mostra un URL dell'app;
  - ESLint vieta `ipcMain`, `ipcRenderer` e `contextBridge` fuori da `src/main/ipc.ts` e `src/preload/index.ts`, e qualsiasi import di Electron o Node nel renderer.
- **Protocollo `app://control-center/`** al posto di `file://` in produzione: schema privilegiato `standard` + `secure`, gestito con `protocol.handle`, che serve solo file regolari dentro `out/renderer` (percorso normalizzato e `realpath` verificato) e aggiunge l'header CSP. La stessa CSP, generata da `buildCsp`, finisce anche in un `<meta>` in build.
- **CSP** di produzione: `default-src 'none'`, script e stili solo `'self'`, niente `unsafe-inline`/`unsafe-eval`, nessuna sorgente remota, niente frame. In sviluppo si aggiungono solo l'inline per il preambolo di React Refresh e il websocket HMR su loopback; mai `unsafe-eval`.
- **Fuses** con l'opzione `electronFuses` di electron-builder; il test le legge dal binario con `@electron/fuses` e prova il binario dall'esterno (`ELECTRON_RUN_AS_NODE`, `--inspect`, `NODE_OPTIONS`, `app.asar` manomesso).
- **Tutto in bundle:** le dipendenze di `apps/desktop` sono `devDependencies`, electron-vite le mette nel bundle e il pacchetto non contiene `node_modules`.

## Alternative considerate

- `file://` con CSP in `<meta>`: niente header, privilegi extra del protocollo file, nessun controllo dei percorsi.
- Canali IPC liberi con validazione nel singolo handler: facile dimenticarla, nessun elenco unico da rivedere.
- `electron-trpc` o simili: dipendenza in più per un problema che bastano 200 righe a risolvere.
- `@electron/fuses` in un hook `afterPack`: l'opzione nativa di electron-builder coordina già fuse e integrità ASAR.

## Conseguenze

- Ogni nuova capacità del renderer è un metodo nel contratto, con schema e test: il test `declares exactly the reviewed channels` va aggiornato apposta.
- I test E2E di Playwright girano sulla build non impacchettata: sul pacchetto il fuse dell'inspector impedisce di collegarsi. Il pacchetto si verifica a parte (`pnpm e2e:packaged`).
- I permessi web sono tutti negati, compresa la scrittura negli appunti: la 3b ("copia report") dovrà aprirne uno solo o passare da un metodo IPC.
- Librerie che iniettano `<style>` o usano `eval` (alcune di grafici o editor) richiederanno una scelta esplicita sulla CSP.
