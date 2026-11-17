# Sicurezza

Leggere prima di toccare IPC, processi figli, file system, segreti, Docker, bridge o aggiornamenti.

## Modello delle minacce

| Superficie          | Rischio                                                         | Contromisura                                                                                       | Fase |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- |
| Renderer            | XSS dall'output degli agenti (Markdown, log) → accesso all'IPC  | sandbox, CSP, Markdown sanitizzato, niente HTML raw                                                | 3    |
| IPC                 | comandi arbitrari dal renderer                                  | canali espliciti in `ipc-contract`, zod, controllo del mittente, nessun "esegui comando" generico  | 3    |
| Hooks/MCP bridge    | un processo locale invia eventi falsi                           | named pipe con permessi utente + token casuale per sessione, niente TCP                            | 4, 7 |
| File system         | path traversal, symlink fuori dal workspace                     | normalizzazione + verifica del percorso reale                                                      | 4    |
| Docker              | il socket equivale a privilegi elevati                          | sola lettura di default, conferma sulle azioni                                                     | 6    |
| Porte               | esposizione involontaria                                        | solo lettura delle porte locali, avviso su `0.0.0.0`, nessuna scansione remota                     | 6    |
| Server MCP di terzi | codice non fidato                                               | mostrare comando e origine prima di abilitarli; i nuovi server non si avviano mai da soli          | 8    |
| Agenti locali       | output inaffidabile                                             | nessuna scrittura diretta, solo proposte di diff; allowlist dei tool MCP                           | 7    |
| Git/checkpoint      | perdita di lavoro                                               | ref nascosti, mai toccare il branch dell'utente, conferma + anteprima del diff                     | 4b   |
| Dipendenze          | supply chain                                                    | lockfile, Dependabot, `pnpm audit`, ADR per ogni dipendenza, pnpm `onlyBuiltDependencies`          | 0    |
| Aggiornamenti       | update malevolo                                                 | firma e verifica di electron-updater                                                               | 10   |
| Repo pubblica       | segreti nella cronologia                                        | gitleaks in pre-commit e in CI (cronologia completa)                                               | 0    |
| Fixture pubblicate  | segreti, contenuti di file o dati personali nelle registrazioni | pulizia ad allowlist (`sanitize.mjs`), `--check` in CI e in Vitest, gitleaks; grezzi git-ignored   | 2    |
| Eventi              | segreti o percorsi personali in eventi e log                    | `makeTextCleaner` (radice → `.`, home → `~`, `redactSecrets`) su ogni testo; schema senza assoluti | 2    |

## Checklist Electron (Fase 3: tutte verificate in test)

Spuntata in 3a (2026-11-17, ADR 0004). Abbreviazioni dei test: **U** = `apps/desktop/src/main/security/security.test.ts`, **E** = `apps/desktop/e2e/app/security.spec.ts`, **F** = `apps/desktop/e2e/packaged/fuses.spec.ts`, **C** = `packages/ipc-contract/src/ipc.test.ts`.

- [x] `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. Test: U `secureWebPreferences`; E `webPreferences` (legge le preferenze effettive della finestra) e "the renderer has no Node.js globals". In più `app.enableSandbox()` per ogni renderer.
- [x] CSP restrittiva (niente `unsafe-eval`, niente sorgenti remote). Test: U `buildCsp` (produzione e dev); E `Content-Security-Policy` (header e `<meta>`, blocco di `eval`, `new Function`, timer stringa, script inline e remoti, fetch e iframe remoti); `e2e/app/dev.spec.ts` per la CSP di sviluppo.
- [x] `setWindowOpenHandler` → deny; `will-navigate` bloccato; link esterni solo `https:` tramite `shell.openExternal` dopo verifica. Test: U `URL rules`; E `navigation and new windows` (`window.open`, `target=_blank`, navigazione verso https, `file:` e loopback). Bloccati anche `will-frame-navigate`, `will-redirect` e `<webview>`.
- [x] Permessi web (camera, microfono, notifiche…) negati di default. Test: U `web permissions`; E `web permissions` (notifiche, geolocalizzazione, camera e microfono negati davvero).
- [x] Electron Fuses: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, integrità ASAR on, `OnlyLoadAppFromAsar` on. Test: F (fuse wire letto dal binario, più prove dall'esterno: `ELECTRON_RUN_AS_NODE`, `--inspect`, `NODE_OPTIONS`, `app.asar` manomesso rifiutato). Anche `EnableCookieEncryption` on e `GrantFileProtocolExtraPrivileges` off.
- [x] Preload espone solo `window.api` tipizzato. Test: C `createApi` e gate del main (mittente, richiesta, risposta, envelope); E `preload` e `IPC gate` (forma congelata di `window.api`, nessun `ipcRenderer`, payload invalidi rifiutati, finestra non creata dall'app rifiutata come mittente); `scripts/eslint-ipc-rules.test.mjs` (IPC grezzo vietato fuori dai due file ponte, Electron e Node vietati nel renderer).
- [x] Electron entro le ultime 2 major supportate. Test: `scripts/check-electron-support.mjs` in CI (confronto con l'ultima stabile su npm) con `scripts/check-electron-support.test.mjs`; E "runs the Electron version installed in node_modules".

### Altre difese della shell (3a)

- Il renderer di produzione arriva da `app://control-center/` (schema privilegiato), non da `file://`. Il gestore serve solo file regolari dentro `out/renderer`: percorso normalizzato, `realpath` dentro la radice, niente `..`, separatori codificati o NUL (test U `resolveAssetPath`, E `app:// protocol`). Header `X-Content-Type-Options`, `Cross-Origin-Opener-Policy`, `Referrer-Policy`.
- Il dev server (`ELECTRON_RENDERER_URL`) è accettato solo se l'app non è impacchettata e solo su `http` loopback.
- Istanza singola (`requestSingleInstanceLock`).
- L'envelope IPC non riporta i valori ricevuti né i messaggi degli errori degli handler (possono contenere percorsi).

### Errori e log (3b, ADR 0005)

- Log JSONL in `<userData>/logs`, mai verso l'esterno. Ogni stringa passa da `makeTextCleaner` (segreti, home → `~`, radice → `.`); i valori sotto chiavi tipo `token`/`secret`/`password` sono sostituiti. Test: `packages/app-log/src/app-log.test.ts`, E2E `errors.spec.ts` ("secrets and personal paths never reach the Console, the log or the report").
- Il renderer può solo segnalare i propri errori (`errors:report-renderer`: schema stretto, stack ≤ 20 kB, tetto 100 ogni 10 s) e leggere gruppi già ripuliti. "Copia report" scrive negli appunti dal main: i permessi web restano negati.
- Il gate IPC registra canale e codice, mai il payload; per errori di schema solo percorsi e messaggi (`issues`). Test: E2E "a refused IPC call is recorded without its payload".
- Le source map si leggono solo dentro `out/` (`resolveAssetPath`): un frame costruito ad arte non legge altri file. Test: `stack-mapper.test.ts` ("never reads a map outside the build").
- `superviseChild` avvia senza shell, scarta stdout, nome limitato a `[a-z0-9-]`; non esiste un canale IPC per avviare processi.
- I fault injector dei test esistono solo nella build `--mode e2e`; il pacchetto di produzione non li contiene (`e2e/packaged/build.spec.ts`).

## Privacy

- Nessuna telemetria esterna né crash reporter remoto.
- Redazione automatica di chiavi, token, `env` delle config MCP e contenuti `.env` in log ed eventi.
- Retention configurabile + "cancella tutto".
- Servizi interni solo su localhost.

## Da fare

- Fissare le GitHub Actions a SHA di commit invece che a tag (prima di rendere pubblica la repo).
