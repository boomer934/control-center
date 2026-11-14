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

- [ ] `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`
- [ ] CSP restrittiva (niente `unsafe-eval`, niente sorgenti remote)
- [ ] `setWindowOpenHandler` → deny; `will-navigate` bloccato; link esterni solo `https:` tramite `shell.openExternal` dopo verifica
- [ ] Permessi web (camera, microfono, notifiche…) negati di default
- [ ] Electron Fuses: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, integrità ASAR on, `OnlyLoadAppFromAsar` on
- [ ] Preload espone solo `window.api` tipizzato
- [ ] Electron entro le ultime 2 major supportate

## Privacy

- Nessuna telemetria esterna né crash reporter remoto.
- Redazione automatica di chiavi, token, `env` delle config MCP e contenuti `.env` in log ed eventi.
- Retention configurabile + "cancella tutto".
- Servizi interni solo su localhost.

## Da fare

- Fissare le GitHub Actions a SHA di commit invece che a tag (prima di rendere pubblica la repo).
