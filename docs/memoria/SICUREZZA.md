# Sicurezza

Leggere prima di toccare IPC, processi figli, file system, segreti, Docker, bridge o aggiornamenti.

## Modello delle minacce

| Superficie          | Rischio                                                         | Contromisura                                                                                                       | Fase |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| Renderer            | XSS dall'output degli agenti (Markdown, log) → accesso all'IPC  | sandbox, CSP, Markdown sanitizzato, niente HTML raw                                                                | 3    |
| IPC                 | comandi arbitrari dal renderer                                  | canali espliciti in `ipc-contract`, zod, controllo del mittente, nessun "esegui comando" generico                  | 3    |
| Hooks/MCP bridge    | un processo locale invia eventi falsi                           | named pipe con permessi utente + token casuale per sessione, niente TCP (4.1: ADR 0009)                            | 4, 7 |
| File system         | path traversal, symlink fuori dal workspace                     | normalizzazione + verifica del percorso reale                                                                      | 4    |
| Docker              | il socket equivale a privilegi elevati                          | sola lettura di default, conferma sulle azioni                                                                     | 6    |
| Porte               | esposizione involontaria                                        | solo lettura delle porte locali, avviso su `0.0.0.0`, nessuna scansione remota                                     | 6    |
| Server MCP di terzi | codice non fidato                                               | mostrare comando e origine prima di abilitarli; i nuovi server non si avviano mai da soli                          | 8    |
| Agenti locali       | output inaffidabile                                             | nessuna scrittura diretta, solo proposte di diff; allowlist dei tool MCP                                           | 7    |
| Git/checkpoint      | perdita di lavoro                                               | ref nascosti, mai toccare il branch dell'utente, conferma + anteprima del diff                                     | 4b   |
| Modello progetto    | lettura fuori dal workspace, file enormi, contenuti esposti     | worker in sola lettura, niente symlink, limiti di file e dimensioni, solo percorsi e import al renderer (ADR 0012) | 5a   |
| Dipendenze          | supply chain                                                    | lockfile, Dependabot, `pnpm audit`, ADR per ogni dipendenza, pnpm `onlyBuiltDependencies`                          | 0    |
| Aggiornamenti       | update malevolo                                                 | firma e verifica di electron-updater                                                                               | 10   |
| Repo pubblica       | segreti nella cronologia                                        | gitleaks in pre-commit e in CI (cronologia completa)                                                               | 0    |
| Fixture pubblicate  | segreti, contenuti di file o dati personali nelle registrazioni | pulizia ad allowlist (`sanitize.mjs`), `--check` in CI e in Vitest, gitleaks; grezzi git-ignored                   | 2    |
| Eventi              | segreti o percorsi personali in eventi e log                    | `makeTextCleaner` (radice → `.`, home → `~`, `redactSecrets`) su ogni testo; schema senza assoluti                 | 2    |

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
- `superviseChild` avvia senza shell, scarta stdout, nome limitato a `[a-z0-9-]`. L'avvio di shell interattive è descritto nella 4.2.
- I fault injector dei test esistono solo nella build `--mode e2e`; il pacchetto di produzione non li contiene (`e2e/packaged/build.spec.ts`).

### Eventi push (4.0, ADR 0007)

- Solo eventi dichiarati nel contratto: l'emitter del main rifiuta uno spec che non è l'oggetto del contratto, anche con lo stesso nome, e valida il payload prima di inviarlo. Test: C `createEventEmitter`.
- Destinatari: solo finestre create dall'app, vive e con un URL dell'app; `webContents.send` raggiunge il solo frame principale. Test: E `a window the app did not create is an untrusted sender` (la finestra estranea si iscrive ma non riceve nulla).
- Il preload non passa mai l'`IpcRendererEvent` (il suo `sender` è `ipcRenderer`), rivalida il payload, scarta messaggi con più argomenti e rifiuta listener che non sono funzioni. Test: C `events in createApi`, E `IPC events`.
- Niente cicli: un errore di un iscritto si segnala una volta sola per errore distinto; un rifiuto di `errors:changed` va solo nel log; `emit` non lancia mai. Test: C e `apps/desktop/src/main/ipc-events.test.ts`.

### Workspace e terminale (4.2, ADR 0008)

- Solo il dialog nativo nel main aggiunge una radice. I recenti si riaprono per ID se risolvono ancora alla stessa cartella canonica. Test: `workspace/service.test.ts`.
- Il risolutore verifica i confini del workspace prima di risolvere il percorso reale, poi accetta solo file regolari con percorso canonico interno. Se cambia solo l'uso delle maiuscole, confronta gli identificativi della directory sul volume. Rifiuta i percorsi Win32 ambigui, i percorsi di dispositivo e gli stream alternativi. Test: `workspace/paths.test.ts`, con junction reali su Windows e casi symlink e UNC simulati.
- `workspace:open-file` ricontrolla il workspace attivo e apre il file canonico come argomento di Notepad, senza applicare associazioni di file. E2E: apertura dal terminale e rifiuto di percorsi esterni.
- `terminal:start` accetta solo due profili definiti nel main e un ID di workspace attivo. Le operazioni usano ID di pty vincolati al mittente e l'input richiede anche il workspace attivo. Il main chiude ogni pty alla perdita del renderer proprietario. Test: `terminal/service.test.ts` ed E2E.
- Il main raggruppa i dati ConPTY, con controllo di flusso e payload validati, e li invia solo al proprietario. Il testo del terminale rimane nel buffer di xterm. I link OSC 8 non avviano navigazioni. Gli stili di xterm usano CSSOM con CSP invariata, verificata dall'E2E del terminale.

### Hooks bridge e sessione Claude (4.1, ADR 0009)

Test: **B** = `packages/hooks-bridge/src/bridge.test.ts`, **S** = `apps/desktop/src/main/claude/session.test.ts`, **K** = `apps/desktop/src/main/claude/cli.test.ts`, **V** = `apps/desktop/src/main/claude/service.test.ts`, **E2E** = `apps/desktop/e2e/app/claude.spec.ts`.

- **Pipe:** nome casuale a 128 bit per sessione, niente TCP. Se il nome esiste già, `listen` fallisce: niente pipe-squatting silenzioso (B).
- **Rifiuti:** il server rifiuta senza token, con token vuoto, sbagliato o troppo lungo (confronto a tempo costante su SHA-256), JSON malformato, campi in più, versione diversa, payload fuori schema, oltre 1 MiB, client muto per 5 s, oltre 16 connessioni (B). Ogni rifiuto va in Console come `bridge-rejected` con il solo codice; il reporter non riceve mai token né payload (B, S con messaggi falsi durante una run vera, che restano fuori dalla timeline).
- **Token:** 256 bit, solo in `bridge.json` nella cartella dati della sessione, mai nell'ambiente di `claude` né nella riga di comando. La cartella si cancella alla chiusura (S) e quelle rimaste da un crash al primo avvio (K).
- **Script degli hooks:** esce sempre con 0, non scrive su stdout e non stampa mai il token (B). Accetta solo un percorso assoluto che finisce in `bridge.json`, un file regolare di al massimo 4 KiB, e lo valida con zod.
- **Comando degli hooks:** tre percorsi tra virgolette, con i caratteri che una shell interpreta rifiutati invece che escapati (K). Gli hooks stanno in un `settings.json` temporaneo passato con `--settings`: `~/.claude*` non si tocca.
- **Avvio di `claude`:** il processo parte senza shell, nella radice del workspace verificata dal servizio dei workspace. L'ambiente è quello dell'utente senza le variabili `ELECTRON_*`. L'id per `--resume` è validato (niente `-` iniziale). La CLI si cerca solo nelle voci assolute del PATH (K). `taskkill` si avvia dal percorso completo di `System32`.
- **Stdout:** ogni riga è JSON con un `type` valido (zod) prima dei normalizzatori. Le righe oltre 16 Mi caratteri e quelle non valide vengono scartate e contate in Console (S).
- **IPC:** la sessione appartiene alla finestra che l'ha aperta. Un'altra finestra non può inviare, interrompere o chiudere (V). Si invia solo mentre il workspace della sessione è attivo (V). Il testo è limitato a 100 000 caratteri e non può essere vuoto (E2E). Gli eventi del push sono `AgentEvent` validati, al massimo 200 per messaggio (V).
- **Albero dei processi:** interruzione e chiusura terminano anche gli script degli hooks e i comandi dei tool ancora attivi nel workspace (S).

### Chat, permessi e cronologia (4.3, ADR 0010)

- Il controllo dei permessi usa solo le pipe stdin e stdout del processo Claude. Il main valida la richiesta, associa un UUID locale all'ID del protocollo e accetta solo una decisione per richiesta pendente, dal mittente proprietario nel workspace attivo. L'annullamento e la fine del turno invalidano gli ID pendenti. Test in `claude/permissions.test.ts`, `claude/service.test.ts` e `e2e/app/claude.spec.ts`.
- «Always in this session» conserva in memoria un massimo di 128 impronte dello strumento e degli argomenti originali. Le regole restano valide fino alla chiusura della sessione, anche quando il suo workspace passa in secondo piano. Le decisioni manuali richiedono il workspace attivo. Il renderer vede i dettagli ripuliti, con un indicatore esplicito se sono troncati. Il main costruisce la risposta usando gli argomenti originali.
- Lo storico viene letto e scritto sotto `userData/claude-history/<workspaceId>/<id>.jsonl`. L'IPC accetta solo un hash di workspace e un UUID. Il servizio controlla il workspace attivo e verifica che i sottopercorsi e i file siano directory e file regolari, rispettivamente. Il JSONL in lettura passa dallo schema della cronologia. Il main passa alla CLI come argomento di `--resume` soltanto un ID validato dallo storico di quel workspace.
- Il testo finale viene reso con React Markdown e la CSP esistente. Il renderer scarta HTML e immagini e presenta il testo dei link senza navigazione. Lo storico contiene prompt ed eventi ripuliti e l'ID di ripresa. I delta transitori e gli argomenti originali dei permessi restano fuori dal file.

### Git e checkpoint (4b, ADR 0011)

- Gli handler operano sul workspace attivo e sul mittente fidato. Git si avvia dal PATH assoluto senza shell e riceve solo operazioni definite dall'app, pathspec letterali, OID validati e il messaggio di commit via stdin. Gli override `GIT_*` ereditati, hook Git, fsmonitor, firma automatica e driver esterni sono disattivati.
- Un gitfile è ammesso solo per un linked worktree con collegamento reciproco. Per i ripristini il main valida i percorsi e i tipi di file, rifiuta symlink, junction, gitlink, hardlink sul percorso da scrivere, nomi Win32 ambigui e collisioni con file ignorati.
- Il ripristino è una seconda azione dopo il confronto. Il token è monouso, vincolato alla finestra, al workspace e ai due alberi correnti, oltre a branch e HEAD. Le scritture Git del pannello e i turni Claude nello stesso workspace si escludono. Un checkpoint di recupero viene salvato prima della prima scrittura.
- Il renderer riceve i diff per mostrarli su richiesta. Diff, messaggi Git e stdout/stderr del processo restano fuori dal log e dalla cronologia Claude. La cronologia conserva solo UUID e ora del checkpoint. I riferimenti locali contengono i dati del repository e vanno esclusi da eventuali trasferimenti con `--mirror`.

### Modello del progetto (5a, ADR 0012)

Test: **M** = `packages/project-model/src/model.test.ts`, **I** = `packages/project-model/src/indexer.test.ts`, **E2E** = `apps/desktop/e2e/app/project.spec.ts`.

- **Solo lettura.** Il worker legge nomi, dimensioni e contenuto dei file del workspace attivo e non scrive nulla. Non esegue codice del progetto: niente `require` dei file analizzati, niente script, niente Git. Il parsing usa Tree-sitter in WASM, senza addon nativi.
- **Confini del workspace.** La radice è quella canonica del workspace attivo (ADR 0008). La scansione non segue symlink e junction (I). Scarta i nomi con caratteri di controllo, `:` o `\` e i percorsi con `.` o `..` (M), e risolve gli import solo verso file già elencati. Resta una finestra TOCTOU: un file sostituito da un collegamento tra `lstat` e lettura verrebbe letto. L'impatto è basso, perché dal contenuto escono solo specificatori di import.
- **Limiti.** 20.000 file, 64 livelli, file oltre 1 MiB non letti, 500 import e 200 nomi esterni per file, `.gitignore` e file di configurazione oltre 256 KiB ignorati.
- **IPC.** `project:open` richiede il mittente fidato e il workspace attivo; un ID sconosciuto riceve `workspace-unavailable` (E2E). I delta vanno solo alle finestre che hanno aperto il modello. Main e preload validano snapshot e delta con lo schema del contratto. Il main valida anche ogni messaggio del worker.
- **Cosa esce.** Al renderer arrivano percorsi relativi, linguaggio, dimensione, ruoli e nomi degli import, mai il contenuto dei file. Gli errori del worker arrivano alla Console con un nome e un messaggio fissi, senza percorsi né testo dei file.

## Privacy

- Nessuna telemetria esterna né crash reporter remoto.
- Redazione automatica di chiavi, token, `env` delle config MCP e contenuti `.env` in log ed eventi.
- Retention configurabile + "cancella tutto".
- Servizi interni solo su localhost.

## Da fare

- Fissare le GitHub Actions a SHA di commit invece che a tag (prima di rendere pubblica la repo).
