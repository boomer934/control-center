# 0017 — Modello ed effort per turno, provider Codex

- **Stato:** accettata
- **Data:** 2026-11-27

## Contesto

La 5f porta Codex in Vernier e permette di scegliere modello ed effort dalla chat, per Claude Code e per Codex, con effetto dal turno successivo (`PIANO.md`, "Priorità dopo la 5e"). Prima di integrare la sessione Codex nel main servono lo schema degli eventi e il contratto IPC, così la corsia Codex può preparare fixture, normalizzatore e interfaccia (5f.2).

Prove su Windows del 2026-11-27:

- **Claude Code 2.1.326** accetta `--model <alias|nome>` e `--effort low|medium|high|xhigh|max` a ogni `claude -p`. La riga `init` riporta il modello per esteso (`claude-sonnet-5-5`) ma non l'effort. Ogni turno dell'app è già una run separata con `--resume`, quindi la scelta vale dal turno successivo senza riavviare nulla.
- **Cache e effort:** tre turni con Sonnet sulla stessa sessione. Il secondo, con lo stesso effort, legge 45 105 token dalla cache; il terzo, con effort `high` al posto di `low`, ne legge 63 117. Il cambio del solo effort non invalida la cache, quindi non serve l'avviso.
- **Codex:** la CLI non è sul PATH. L'app desktop di Codex (pacchetto Store `OpenAI.Codex` 26.1120) include `app\resources\codex.exe` (`codex-cli 0.171.0-alpha.13.2`), che si avvia anche da fuori. `codex app-server generate-ts` produce i tipi del protocollo. È JSON-RPC su stdio: `initialize` e `initialized`, poi `thread/start` (`model`, `cwd`, `approvalPolicy`, `sandbox`), `thread/resume` per `threadId` e `turn/start` con `model` ed `effort` validi "per questo turno e i successivi". `turn/interrupt` richiede `threadId` e `turnId`. Le approvazioni arrivano come richieste del server (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`). `model/list` elenca i modelli con `supportedReasoningEfforts` e `defaultReasoningEffort`, mentre `model/rerouted` segnala un cambio di modello deciso dal provider.

## Decisione

- **Schema eventi v3** (migrazione 2 → 3 senza trasformazioni, come la 1 → 2):
  - provider `codex` e sorgente `codex` (App Server);
  - `session.started.effort` facoltativo;
  - nuovo evento `session.configChanged` con `model` ed `effort` in vigore da quel punto, `previousModel` e `previousEffort` se noti e `by`: `user` per la scelta nella chat, `provider` per un cambio deciso dal provider. Un campo assente vale "configurazione della CLI";
  - `modelIdSchema` ed `effortSchema` escludono spazi, virgolette e `-` iniziale, perché i valori possono diventare argomenti della riga di comando.
- **Contratto condiviso** (`packages/ipc-contract/src/agent-config.ts`): `AgentModel` (id, etichetta, effort accettati, effort predefinito), `AgentConfig` (`model` ed `effort`, `null` = decide la CLI) e `AgentCatalog` (`models`, `defaults` letti dalla configurazione della CLI, `current` per il prossimo turno). `isConfigInCatalog` stabilisce cosa è ammesso.
- **Namespace `claude`:** metodo `claude:configure` (`id`, `model`, `effort` → `applied | invalid | closed`) e aggiornamento `config` con il catalogo, inviato all'apertura e dopo ogni cambio. Il main accetta solo valori del catalogo pubblicato per quella sessione, solo dalla finestra proprietaria e solo a sessione aperta (durante l'apertura risponde `closed`). Il workspace attivo non serve, perché `configure` non esegue nulla. Gli argomenti si rivalidano con gli schemi appena prima della riga di comando.
- **Valori iniziali Claude:** `model` ed `effortLevel` di `~/.claude/settings.json`, in sola lettura: il file si apre una volta, si controlla dal descrittore e si leggono al massimo 256 KiB più un byte, così un file che cresce dopo il controllo non supera il limite. I valori passano da zod; un modello che la redazione dei segreti modificherebbe è scartato. Altrimenti vale "non impostato". Il catalogo offre gli alias `fable`, `opus`, `sonnet` e `haiku`, più l'eventuale nome completo configurato, ciascuno con i cinque livelli di effort. Finché l'utente non sceglie, nessun argomento viene passato e decide la CLI.
- **Eventi:** `LiveClaudeSession.startRun(at, config)` annota la scelta della run; `session.configChanged` (`by: user`) esce insieme al `session.started` di quella run, solo se diversa dall'ultima run partita davvero, e `session.started` riceve l'effort. Una run che muore prima di partire non cambia nulla, quindi il nuovo tentativo registra la scelta. Alla ripresa dalla cronologia il main ricava l'ultima scelta (`by: user`) dagli eventi salvati e la ripristina solo se il catalogo, costruito da alias e settings, la offre; altrimenti la scarta. Il primo turno non registra un cambio fittizio.
- **Codex (5f.1, seconda PR):** namespace `codex` con le stesse forme di `claude`: sessione su `codex app-server` (JSON-RPC su stdio, nessuna shell), login gestito dalla CLI, approvazioni dalle richieste del server, interruzione con `turn/interrupt` e catalogo da `model/list`. La scelta passa in `turn/start`. Il normalizzatore completo da notifiche ad `AgentEvent` spetta alla corsia Codex (5f.2), che parte da un normalizzatore minimo consegnato con il main.

## Alternative considerate

- **Un solo namespace `agent` con il provider come parametro.** Ridurrebbe la duplicazione, ma richiederebbe di riscrivere subito l'unico consumatore nel renderer (`useClaudeChat`), che spetta alla corsia Codex. Gli schemi condivisi tengono le due forme allineate. L'unificazione resta possibile nella 5g.
- **Leggere effort e modello di Claude per esteso** (`modelSettings.<nome>.effortLevel`). Richiederebbe di risolvere gli alias nei nomi completi, che cambiano a ogni rilascio. Si legge solo la chiave di primo livello.
- **Avviso anche per il cambio di effort.** Escluso dalla prova della cache.

## Conseguenze

- **Revisione incrociata di Codex (2026-11-27):** cinque rilievi medi, tutti corretti prima del merge: scelta ripresa non validata, limite di lettura aggirabile, ID modello simili a credenziali, `configure` durante l'apertura, cambio registrato per una run mai partita.
- **Da definire nella 5f.2 e nella PR B** (richieste della revisione):
  - per l'avviso al cambio di modello serve un'identità confrontabile tra l'alias scelto (`opus`) e il nome effettivo riportato dalla CLI (`claude-opus-5-5`), e un comportamento quando il modello effettivo è sconosciuto;
  - la stima del contesto per Claude usa l'ultimo `usage.updated` di `main` con `scope: message` (input + cache letta + cache creata), non i totali di sessione, che includono più chiamate e i subagent; per Codex serve una misura equivalente o lo stato "stima non disponibile";
  - nella PR B l'effort va validato sul modello effettivo anche con `model: null`, e va definito come `null` torna al default dopo un override di `turn/start`, che vale anche per i turni successivi del thread;
  - una scelta confermata ma mai usata non sopravvive alla riapertura: si ripristina solo quella registrata negli eventi.

- I file della cronologia scritti dalla v3 non si leggono con le versioni precedenti dell'app, che scartano le versioni future. È lo stesso comportamento della v2.
- Il renderer riceve l'aggiornamento `config` ma lo ignora finché la 5f.2 non aggiunge selettore e avviso. L'avviso sul contesto usa gli eventi `usage.updated` già presenti.
- Un modello Claude nuovo compare nel selettore solo dopo un aggiornamento dell'elenco degli alias, oppure se è configurato in `settings.json`.
- La ricerca di `codex.exe` nel pacchetto Store e il resto della seconda PR sono in [ADR 0018](0018-sessione-codex-nel-main.md).
