# Sicurezza

Leggere prima di toccare IPC, processi figli, file system, segreti, Docker, bridge o aggiornamenti.

## Modello delle minacce

| Superficie          | Rischio                                                         | Contromisura                                                                                                          | Fase |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---- |
| Renderer            | XSS dall'output degli agenti (Markdown, log) → accesso all'IPC  | sandbox, CSP, Markdown sanitizzato, niente HTML raw                                                                   | 3    |
| IPC                 | comandi arbitrari dal renderer                                  | canali espliciti in `ipc-contract`, zod, controllo del mittente, nessun "esegui comando" generico                     | 3    |
| Hooks/MCP bridge    | un processo locale invia eventi falsi                           | named pipe (scrittura a utente, SYSTEM e Administrators; lettura a tutti) + token per sessione, niente TCP (ADR 0009) | 4, 7 |
| File system         | path traversal, symlink fuori dal workspace                     | normalizzazione + verifica del percorso reale                                                                         | 4    |
| Docker              | il socket equivale a privilegi elevati                          | sola lettura di default, conferma sulle azioni                                                                        | 6    |
| Porte               | esposizione involontaria                                        | solo lettura delle porte locali, avviso su `0.0.0.0`, nessuna scansione remota                                        | 6    |
| Server MCP di terzi | codice non fidato                                               | mostrare comando e origine prima di abilitarli; i nuovi server non si avviano mai da soli                             | 8    |
| Agenti locali       | output inaffidabile                                             | nessuna scrittura diretta, solo proposte di diff; allowlist dei tool MCP                                              | 7    |
| Git/checkpoint      | perdita di lavoro                                               | ref nascosti, mai toccare il branch dell'utente, conferma + anteprima del diff                                        | 4b   |
| Modello progetto    | lettura fuori dal workspace, file enormi, contenuti esposti     | worker in sola lettura, niente symlink, limiti di file e dimensioni, solo percorsi e import al renderer (ADR 0012)    | 5a   |
| Dipendenze          | supply chain                                                    | lockfile, Dependabot, `pnpm audit`, ADR per ogni dipendenza, pnpm `onlyBuiltDependencies`                             | 0    |
| Aggiornamenti       | update malevolo                                                 | firma e verifica di electron-updater                                                                                  | 10   |
| Repo pubblica       | segreti nella cronologia                                        | gitleaks in pre-commit e in CI (cronologia completa)                                                                  | 0    |
| Fixture pubblicate  | segreti, contenuti di file o dati personali nelle registrazioni | pulizia ad allowlist (`sanitize.mjs`), `--check` in CI e in Vitest, gitleaks; grezzi git-ignored                      | 2    |
| Eventi              | segreti o percorsi personali in eventi e log                    | `makeTextCleaner` (radice → `.`, home → `~`, `redactSecrets`) su ogni testo; schema senza assoluti                    | 2    |

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

Test: **B** = `packages/hooks-bridge/src/bridge.test.ts`, **S** = `apps/desktop/src/main/claude/session.test.ts` (e `kill-tree.test.ts`), **K** = `apps/desktop/src/main/claude/cli.test.ts`, **V** = `apps/desktop/src/main/claude/service.test.ts`, **E2E** = `apps/desktop/e2e/app/claude.spec.ts`.

- **Pipe:** nome casuale a 128 bit per sessione, niente TCP. Se il nome esiste già, `listen` fallisce: niente pipe-squatting silenzioso (B). Il server ascolta **prima** che `bridge.json` esista: chi legge il file trova la pipe già dell'app (S).
- **DACL reale della pipe** (letta con `GetSecurityInfo` su una pipe creata dal Node di Electron 45.4.1, il 2026-11-27): controllo completo a utente, SYSTEM e Administrators; **lettura (0x120089) a Everyone e ad Anonymous**. Libuv non permette di scegliere la DACL né di impostare `PIPE_REJECT_REMOTE_CLIENTS`, quindi la pipe può essere raggiunta anche via SMB da un client remoto autenticato, dove l'accesso di rete e le policy del sistema (firewall, condivisione file, accesso anonimo alle pipe) lo consentono. Con la sola lettura un altro utente, un processo a bassa integrità o un client remoto può aprire un'istanza (occupa una delle 16 connessioni e scade come `timeout`), ma non può scrivere un messaggio: l'effetto è un disturbo, non un evento falso. Il token resta la difesa contro chi può scrivere.
- **Provato a mano (2026-11-27):** stesso utente a integrità media: lettura e scrittura aperte; processo a **bassa integrità**: lettura aperta, scrittura negata (errore 5, no-write-up). **Da provare:** un secondo account locale (atteso: solo lettura) e un AppContainer (atteso: nessun accesso, la DACL non nomina `ALL APPLICATION PACKAGES`).
- **Fuori dal modello delle minacce:** un processo dello **stesso utente a integrità media** può leggere `bridge.json` e quindi il token, e scrivere sulla pipe. Il bridge non difende da lui (potrebbe comunque modificare il workspace o `~/.claude`). Opzione futura, se servisse: un broker con identità separata o una DACL esplicita creata senza libuv (dipendenza nativa, ADR).
- **Rifiuti:** il server rifiuta senza token, con token vuoto, sbagliato o troppo lungo (confronto a tempo costante su SHA-256), JSON malformato, campi in più, versione diversa, payload fuori schema, oltre 1 MiB, in più di 1024 frammenti, oltre 16 connessioni (B). La scadenza di 5 s è **assoluta** dalla connessione: un client che scrive un byte alla volta non guadagna tempo (B).
- **Rifiuti in Console:** raggruppati per codice, al massimo un riepilogo ogni 2 s e 20 riepiloghi per sessione; dopo il limite si contano soltanto e la chiusura invia l'ultimo conteggio (B). Un riepilogo è una riga `bridge-rejected` con codici e conteggi; il reporter non riceve mai token né payload (B, S con messaggi falsi durante una run vera, che restano fuori dalla timeline).
- **Token:** 256 bit, solo in `bridge.json` nella cartella dati della sessione, mai nell'ambiente di `claude` né nella riga di comando. La cartella si cancella alla chiusura (S); quelle rimaste da un crash si tenta di cancellarle all'avvio successivo dell'app (K), con ritentativi, e se una non si cancella la Console lo dice (`StaleSessionCleanupFailed`).
- **Script degli hooks:** una volta avviato esce con 0 in ogni caso gestito (configurazione assente o non valida, input non valido, pipe irraggiungibile, rifiuto), non scrive su stdout e non stampa mai il token (B). Se Node non riesce ad avviarlo, esce con un codice di Node (mai 2, che per Claude Code bloccherebbe): Claude Code lo tratta come errore non bloccante. Accetta solo un percorso assoluto che finisce in `bridge.json`: un file regolare, non un collegamento, aperto **una sola volta** e controllato sull'handle (`fstat`, stesso `dev`/`ino` del percorso), con al massimo 4 KiB + 1 byte letti, poi validato con zod (B). **Limite:** resta la finestra tra `lstat` e `open`; il confronto `dev`/`ino` la chiude su NTFS locale, ma su ReFS l'ID a 64 bit esposto da libuv può coincidere per file distinti. Garantire l'identità anche lì richiederebbe `FileIdInfo` a 128 bit (API nativa). Chi può sostituire il file nella cartella dati è comunque lo stesso utente, già fuori dal modello delle minacce.
- **Comando degli hooks:** tre percorsi tra virgolette, con i caratteri che una shell interpreta rifiutati invece che escapati (K). Gli hooks passano a `claude --settings` come **JSON nella riga di comando** (la 2.1.326 accetta file o JSON): nessun `settings.json` su disco, `~/.claude*` non si tocca. Il JSON contiene solo i percorsi, mai il token (K, S).
- **Avvio di `claude`:** il processo parte senza shell, nella radice del workspace verificata dal servizio dei workspace. L'ambiente è quello dell'utente senza le variabili `ELECTRON_*`. L'id per `--resume` è validato (niente `-` iniziale). La CLI si cerca solo nelle voci assolute del PATH (K). `taskkill` si avvia dal percorso completo di `System32`.
- **Stdout:** ogni riga è JSON con un `type` valido (zod) prima dei normalizzatori. Le righe oltre 16 Mi caratteri e quelle non valide vengono scartate e contate in Console (S).
- **IPC:** la sessione appartiene alla finestra che l'ha aperta. Un'altra finestra non può inviare, interrompere o chiudere (V). Si invia solo mentre il workspace della sessione è attivo (V). Il testo è limitato a 100 000 caratteri e non può essere vuoto (E2E). Gli eventi del push sono `AgentEvent` validati, al massimo 200 per messaggio (V).
- **Processi della run:** interruzione e chiusura usano `taskkill /T /F`, che termina i discendenti ancora collegati al processo `claude` (script degli hooks, comandi dei tool) (S). **Non è l'intero albero garantito:** un processo il cui genitore è già uscito, o avviato staccato, sfugge. Una sola terminazione per run, condivisa da interruzione e chiusura. Se `taskkill` fallisce (anche per timeout di 5 s) si ritenta una volta, poi la Console mostra `ProcessTreeNotEnded` e si termina almeno il processo `claude`. Nessun tentativo parte dopo l'uscita di `claude`, perché Windows riassegna i PID: un nuovo tentativo in attesa si annulla e il fallimento si segnala. `close()` attende al massimo 3 s, poi ferma `taskkill` e termina `claude` prima di risolversi (`kill-tree.test.ts`). Un Job Object con `KILL_ON_JOB_CLOSE` chiuderebbe il buco: richiede una dipendenza nativa, da valutare con un'ADR.

### Chat, permessi e cronologia (4.3, ADR 0010)

- Il controllo dei permessi usa solo le pipe stdin e stdout del processo Claude. Il main valida la richiesta, associa un UUID locale all'ID del protocollo e accetta solo una decisione per richiesta pendente, dal mittente proprietario nel workspace attivo. L'annullamento e la fine del turno invalidano gli ID pendenti. Test in `claude/permissions.test.ts`, `claude/service.test.ts` e `e2e/app/claude.spec.ts`.
- «Always in this session» conserva in memoria un massimo di 128 impronte dello strumento e degli argomenti originali. Le regole restano valide fino alla chiusura della sessione, anche quando il suo workspace passa in secondo piano. Le decisioni manuali richiedono il workspace attivo. Il renderer vede i dettagli ripuliti, con un indicatore esplicito se sono troncati. Il main costruisce la risposta usando gli argomenti originali.
- Lo storico viene letto e scritto sotto `userData/claude-history/<workspaceId>/<id>.jsonl`. L'IPC accetta solo un hash di workspace e un UUID. Il servizio controlla il workspace attivo e verifica che i sottopercorsi e i file siano directory e file regolari, rispettivamente. Il JSONL in lettura passa dallo schema della cronologia. Il main passa alla CLI come argomento di `--resume` soltanto un ID validato dallo storico di quel workspace.
- Il testo finale viene reso con React Markdown e la CSP esistente. Il renderer scarta HTML e immagini e presenta il testo dei link senza navigazione. Lo storico contiene prompt ed eventi ripuliti e l'ID di ripresa. I delta transitori e gli argomenti originali dei permessi restano fuori dal file.

### Git e checkpoint (4b, ADR 0011)

- Gli handler operano sul workspace attivo e sul mittente fidato. Git si avvia dal PATH assoluto senza shell e riceve solo operazioni definite dall'app, pathspec letterali, OID validati e il messaggio di commit via stdin. Gli override `GIT_*` ereditati, fsmonitor e i driver esterni sono disattivati. Il clic dell'utente su **Commit staged** esegue il codice degli hook configurati per il repository. Gli altri comandi disabilitano gli hook. Con `commit.gpgsign` attivo, il commit va eseguito dal terminale.
- Un gitfile è ammesso solo per un linked worktree con collegamento reciproco. Per i ripristini il main valida i percorsi e i tipi di file, rifiuta symlink, junction, gitlink, hardlink sul percorso da scrivere, nomi Win32 ambigui e collisioni con file ignorati.
- Il ripristino è una seconda azione dopo il confronto. Il token è monouso, vincolato alla finestra, al workspace e ai due alberi correnti, oltre a branch e HEAD. Le scritture Git del pannello e i turni Claude nello stesso workspace si escludono. Un checkpoint di recupero viene salvato prima della prima scrittura.
- Il renderer riceve i diff per mostrarli su richiesta. Diff, messaggi Git e stdout/stderr del processo restano fuori dal log e dalla cronologia Claude. La cronologia conserva UUID e ora del checkpoint oppure il solo codice dell'errore di cattura. I riferimenti locali conservano anche i file non tracciati e non ignorati. Per workspace si mantengono gli ultimi 20 checkpoint e 30 recuperi. I riferimenti vanno esclusi da eventuali trasferimenti con `--mirror`.

### Modello del progetto (5a, ADR 0012)

Test: **M** = `packages/project-model/src/model.test.ts`, **I** = `packages/project-model/src/indexer.test.ts`, **E2E** = `apps/desktop/e2e/app/project.spec.ts`.

- **Solo lettura.** Il worker legge nomi, dimensioni e contenuto dei file del workspace attivo e non scrive nulla. Non esegue codice del progetto: niente `require` dei file analizzati, niente script, niente Git. Il parsing usa Tree-sitter in WASM, senza addon nativi.
- **Confini del workspace.** La radice è quella canonica del workspace attivo (ADR 0008). La scansione non segue symlink e junction (I). Scarta i nomi con caratteri di controllo, `:` o `\` e i percorsi con `.` o `..` (M), e risolve gli import solo verso file già elencati. Resta una finestra TOCTOU: un file sostituito da un collegamento tra `lstat` e lettura verrebbe letto. L'impatto è basso, perché dal contenuto escono solo specificatori di import.
- **Limiti.** 20.000 file, 64 livelli, file oltre 1 MiB non letti, 500 import e 200 nomi esterni per file, `.gitignore` e file di configurazione oltre 256 KiB ignorati.
- **IPC.** `project:open` richiede il mittente fidato e il workspace attivo; un ID sconosciuto riceve `workspace-unavailable` (E2E). I delta vanno solo alle finestre che hanno aperto il modello. Main e preload validano snapshot e delta con lo schema del contratto. Il main valida anche ogni messaggio del worker.
- **Cosa esce.** Al renderer arrivano percorsi relativi, linguaggio, dimensione, ruoli e nomi degli import, mai il contenuto dei file. Gli errori del worker arrivano alla Console con un nome e un messaggio fissi, senza percorsi né testo dei file.

### Errori del progetto (5e, ADR 0015)

Test: **S** = `packages/fixtures/src/stacks.test.ts`, **T** = `apps/desktop/src/main/terminal/errors.test.ts`, **E2E** = `apps/desktop/e2e/app/project-errors.spec.ts`.

- **Nessun nuovo canale.** Gli errori del terminale viaggiano su `terminal:updated` (aggiornamento `errors`), solo verso la finestra proprietaria del pty. Main e preload li validano con lo schema del contratto: al massimo 20 per messaggio, messaggio di 500 caratteri e 20 frame.
- **Solo testo, niente esecuzione.** I parser leggono l'output già prodotto e non aprono file, non seguono URL e non eseguono nulla. Gli URL dei frame del browser diventano percorsi relativi.
- **Ripulitura.** Messaggio e percorsi passano da `makeTextCleaner` e `toFileRef`: radice `.`, home `~`, segreti redatti (S). I percorsi fuori dal workspace restano `external`. Gli eventi entrano nella cronologia della sessione con la stessa ripulitura degli altri.
- **Contro le inondazioni.** Scansione dopo 250 ms di quiete, al massimo 64 KiB di buffer e 256 KiB per scansione, ripetizioni scartate per 10 s, al massimo 30 errori al minuto per terminale (T).
- **Migrazione.** Gli eventi della cronologia passano da `migrateAgentEvent` e poi dallo schema. Versioni sconosciute o future vengono scartate, non riparate.

### Azioni rapide sugli errori (5e+, ADR 0016)

- `workspace:read-source-location` richiede il mittente fidato, il workspace attivo, un percorso relativo e una riga positiva. Il main riusa `resolveWorkspaceFile`, confronta l'identità del descrittore aperto con il percorso canonico verificato e ricontrolla il workspace prima della risposta. Il payload è testo UTF-8 fino a 1 MiB. Il visualizzatore rende il testo senza interpretarlo ed evidenzia la riga richiesta.
- `infra:explain-project-error` accetta messaggio, origine, linguaggio e posizione validati. Il main contatta Ollama su `127.0.0.1:11434`, senza proxy o redirect. Esclude nomi cloud e modelli con metadati remoti e controlla la capacità di completamento prima di inviare la richiesta. Il renderer non sceglie endpoint, modello o strumenti. Il main redige i segreti nel testo in entrata e in uscita, impone limiti di tempo e dimensione e annulla l'inferenza alla chiusura del proprietario.
- «Ask Claude to fix» prepara una bozza nel flusso esistente. L'invio esplicito e il percorso dei permessi restano quelli della chat.
- **Regola in vigore dal 2026-11-27, approvata dall'utente.** Il main rifiuta prima di aprire il file se il nome richiesto o quello canonico inizia con `.env`, senza distinzione tra maiuscole e minuscole. Il controllo copre anche symlink e nomi brevi Windows 8.3 che risolvono a un file `.env*`. Il visualizzatore segnala che il sorgente non è disponibile.

### Modello ed effort per turno (5f, ADR 0017)

Test: **A** = `packages/ipc-contract/src/agent-config.test.ts`, **M** = `apps/desktop/src/main/claude/models.test.ts`, **V** = `apps/desktop/src/main/claude/service.test.ts`, **S** = `apps/desktop/src/main/claude/session.test.ts`.

- **Niente argomenti liberi.** Il renderer sceglie solo dal catalogo che il main ha pubblicato per quella sessione. `claude:configure` rifiuta un modello fuori catalogo o un effort che il modello non accetta (`invalid`), risponde solo alla finestra proprietaria e solo a sessione aperta (V). Una scelta ripresa dalla cronologia vale solo se il catalogo costruito da alias e settings la offre; altrimenti si scarta e non arriva né alla riga di comando né agli eventi (V). Gli schemi di modello ed effort escludono spazi, virgolette e `-` iniziale (A); `claudeConfigArgs` li rivalida subito prima della riga di comando (M). `claude` parte sempre senza shell (S verifica gli argomenti ricevuti dal finto `claude`).
- **Configurazione dell'utente in sola lettura.** Da `~/.claude/settings.json` si leggono solo `model` ed `effortLevel`: un'apertura sola, controllo dal descrittore e al massimo 256 KiB più un byte letti, anche se il file cresce dopo il controllo; validazione zod. Un modello che la redazione dei segreti modificherebbe è scartato, così non arriva al renderer nel catalogo. Un file mancante, non valido o ostile vale "non impostato" (M). Il file non si scrive mai (regola 8).
- **Eventi.** `session.configChanged` porta solo modello, effort e chi li ha scelti; passa dalla stessa ripulitura degli altri eventi prima della cronologia.

### Sessione Codex (5f.1, ADR 0018)

Test: **R** = `apps/desktop/src/main/codex/rpc.test.ts`, **L** = `codex/cli.test.ts`, **M** = `codex/models.test.ts`, **S** = `codex/session.test.ts`, **V** = `codex/service.test.ts`, **E2E** = `apps/desktop/e2e/app/codex.spec.ts`.

- **Programma:** `codex` si cerca nelle sole voci assolute del PATH, poi nel pacchetto Store `OpenAI.Codex` dell'editore `2p2nqsd0c76g0`. Il nome del pacchetto arriva da `reg.exe` (percorso da `SystemRoot`, argomenti fissi, timeout 5 s, 256 KiB) e passa da una regex stretta prima di diventare un percorso sotto `ProgramW6432\WindowsApps` (L). Nessuna variabile dedicata, oltre al PATH come per `claude`, sceglie il programma. Uno shim npm senza script o senza Node, o un pacchetto Store senza `codex.exe`, non ferma la ricerca: si passa al candidato successivo (L).
- **Processo:** `codex app-server` parte senza shell, nella radice verificata del workspace, con l'ambiente dell'utente senza `ELECTRON_*`. Chiusura e uscita dell'app usano lo stesso `killTree` di Claude, con gli stessi limiti (S).
- **Protocollo:** ogni riga di stdout passa da zod come risposta, richiesta del server o notifica; righe non valide o oltre 16 Mi caratteri si scartano e si contano in Console. Ogni richiesta dell'app ha un timeout (R). Le notifiche di altri thread si ignorano, quelle di altri turni le scarta il normalizzatore.
- **Politica:** il main decide `approvalPolicy: untrusted`, `approvalsReviewer: user` e `sandbox: workspace-write`; il renderer non le sceglie. Senza `approvalsReviewer` la CLI usa la configurazione dell'utente, che può essere `auto_review` (un modello approva da sé, visto con la CLI 0.171.0-alpha.13.2). Politica e revisore si ripetono in ogni `turn/start`. Se la risposta di `thread/start`/`thread/resume` non riporta esattamente la politica chiesta (`untrusted`, `user`, sandbox `workspaceWrite`), l'apertura fallisce con `CodexPolicyRejected` (S). `config.toml` di Codex si legge con `config/read` e non si scrive mai (regola 8). Il login resta alla CLI: senza account l'apertura fallisce (S). Una risposta di `initialize` o `account/read` fuori schema (per esempio senza il campo `account`) non vale come login: apertura rifiutata con `CodexUnexpectedResponse` (S).
- **Interruzione:** se il server non conferma `turn/interrupt` entro 10 s, il main termina l'albero dei processi (`InterruptNotConfirmed` in Console); fino ad allora la sessione resta `running` e il workspace occupato (S).
- **Approvazioni:** solo le richieste di comando e di patch del thread e del turno in corso, con l'id del turno già confermato dal server (risposta a `turn/start` o `turn/started`), diventano richieste per l'utente. Il testo della richiesta mostra l'ambito effettivo: tipo (comando o input a un comando già avviato; tipi sconosciuti rifiutati), comando, cartella (`in:`), host di rete, file della patch, motivo, `grantRoot` e cosa copre «Sempre» (S). Le richieste aperte sono al massimo 16; le altre si rifiutano (`decline`) o ricevono -32601. La risposta arriva solo dalla finestra proprietaria con il workspace attivo, con un UUID locale (V, E2E «an approval reaches only the session that asked for it»). «Sempre in questa sessione» solo se il server offre `acceptForSession` (S).
- **Modello ed effort:** catalogo da `model/list` con id ed effort validati dagli schemi della v3 e modelli nascosti esclusi (M). `codex:configure` accetta solo valori del catalogo, con l'effort controllato sul modello effettivo (M, V). Gli argomenti di `turn/start` sono campi JSON, non una riga di comando.
- **Cronologia:** `userData/codex-history/<workspace>/<id>.jsonl`, stesse regole della cronologia Claude; l'id del thread per la ripresa è validato con lo stesso schema (V).
- **Da tenere d'occhio:** lo stderr di Codex va in Console così com'è, senza payload dell'utente ma con righe di log del server.

### Catalogo Claude e inventario delle capacità (5h.1)

Test: **C** = `apps/desktop/src/main/claude/catalog.test.ts`, **D** = `claude/discovery.test.ts`, **I** = `capabilities/inventory.test.ts`, **K** = `capabilities/service.test.ts`, **P** = `packages/ipc-contract/src/capabilities.test.ts`, **E2E** = `apps/desktop/e2e/app/claude.spec.ts` › «offers the models Claude Code lists…».

- **Sonda senza turno:** `claude -p --input-format stream-json --output-format stream-json --verbose`, senza shell, con l'ambiente dell'utente senza `ELECTRON_*` e con cartella di lavoro `userData` (mai un workspace). Riceve solo la richiesta `initialize` con un id casuale. Non manda un prompt, quindi nessun modello viene chiamato. Si accetta solo la `control_response` con quell'id. Entro 30 s, o al massimo 4 Mi caratteri di output contati su tutte le righe, l'albero dei processi si chiude con `killTree` e la risposta arriva solo a processo finito (C). All'uscita dell'app la sonda in corso si interrompe e la chiusura ne attende la fine; dopo non ne parte un'altra (C, D). Al più una sonda per avvio dell'app, e solo se la versione (`claude --version`, timeout 10 s) è cambiata, l'ultima lettura ha più di 24 h o la CLI non era raggiungibile all'ultimo tentativo. All'avvio non parte nulla: parte alla prima sessione Claude o alla prima `capabilities:list` (D).
- **Account mai letto:** la risposta contiene email e organizzazione. Gli schemi zod nominano solo `models`, `commands`, `agents`, `available_output_styles`, `capabilities` e `claude_code_version`; il resto si scarta prima di ogni uso (C, prova reale `CC_REAL_CLAUDE=1`). La fixture `claude-initialize.control.jsonl` non ha campi account ed è coperta da `sanitize.mjs --check`.
- **Valori ostili:** gli id dei modelli passano da `safeModelId` (niente `-` iniziale, spazi o forme da segreto). Gli effort passano da `effortSchema` (C). `claudeConfigArgs` resta l'ultimo controllo prima della riga di comando. Le voci dell'inventario passano tutte da `makeCapability`: id stampabile e senza spazi, testo con le cartelle personali ridotte a `~`, segreti redatti, spazi compressi e limiti di lunghezza (I, P). Nel renderer sono solo testo.
- **File:** `userData/agent-catalog.json` (modelli, ≤ 256 KiB) e `userData/capabilities.json` (istantanea, ≤ 8 MiB). Si leggono con un'apertura sola e un limite sul descrittore, si validano con zod e si scrivono interi passando da un file temporaneo. Un file non valido vale vuoto, con `CapabilitySnapshotInvalid` in Console; un'istantanea di formato precedente vale vuota senza avviso (K). Ogni agente ha al massimo 2048 voci, comprese le rimosse: oltre, cadono le rimozioni più vecchie, così il file resta valido e la lista non supera il limite dell'IPC (I). Una risposta senza un campo (per esempio senza `commands`) non rimuove le voci di quel tipo (I, C).
- **IPC:** `capabilities:list` non ha argomenti. `capabilities:mark-seen` prende solo l'agente e la revisione mostrata, e una revisione superata non segna nulla (`stale`). `capabilities:changed` porta solo il numero di revisione (P, I). Nessun canale fa scegliere al renderer un programma, un metodo o un flag.

## Privacy

- Nessuna telemetria esterna né crash reporter remoto.

## Riepilogo dell'inventario nella Vista Live (ADR 0014)

- `infra:snapshot` passa dal gate IPC esistente e rifiuta argomenti. Il main decide tutti i percorsi, comandi e indirizzi. Richieste contemporanee riusano un risultato con validità di 10 secondi.
- Docker usa un solo GET sulla named pipe locale. Ollama usa un solo GET su `127.0.0.1:11434`. Richieste senza redirect, limite di 1 MiB e timeout di 4 secondi. PowerShell e `nvidia-smi` partono da percorsi assoluti di sistema, con argomenti fissi e limiti equivalenti.
- Al renderer arrivano conteggi, VRAM e nomi dei modelli. Risposte grezze e dettagli dei fallimenti restano fuori da log, storico e fixture di sessione.
- Redazione automatica di chiavi, token, `env` delle config MCP e contenuti `.env` in log ed eventi.
- Retention configurabile + "cancella tutto".
- Servizi interni solo su localhost.

## Da fare

- Fissare le GitHub Actions a SHA di commit invece che a tag (prima di rendere pubblica la repo).
