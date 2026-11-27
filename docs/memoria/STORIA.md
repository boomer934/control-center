# Storia del progetto

Diario delle sessioni, con la voce più recente in alto. Ogni voce: cosa è stato fatto, decisioni prese, problemi incontrati.

---

## 2026-11-27 — Correzioni dalla revisione Astra della PR #80

- **Fatto.** Corretti i 7 rilievi di `gpt-6.2-astra` sul commit `c8741a1`, con test di regressione (`d054075`). P2: le voci rimosse contano nel limite di 2048 per agente e cadono le più vecchie, così istantanea e lista restano valide. Una risposta senza un campo non rimuove le voci di quel tipo (`kinds` nella lettura). Una CLI tornata disponibile si rilegge anche con la cache fresca. Il limite d'output della sonda conta tutte le righe. All'uscita la sonda si interrompe e la chiusura ne attende la fine. P3: "nuovo" e "cambiato" si decidono per revisione e non per orario; una lista piena conserva il 64º modello.
- **Decisioni.** L'istantanea passa a `v: 2` (revisioni per voce e `seenRevision` per agente). Una `v: 1` si rilegge vuota senza avviso: esisteva solo in sviluppo. La nota di revisione di Codex resta sul suo branch locale `codex/review-pr80` e non si unisce.
- **Verifica.** `pnpm verify` verde (577 test). E2E Claude, Codex e sicurezza verdi (27). Prova reale verde.
- **Problemi.** Anche Codex ha visto un worker di Vitest uscire una volta (`infra/snapshot.test.ts`): è lo stesso errore intermittente già annotato in `PROBLEMI_NOTI.md`.

## 2026-11-27 — Catalogo Claude e inventario delle capacità (5h.1)

- **Fatto.** PR #79 unita. Il commit del piano 5h era rimasto fuori dallo squash ed è stato riportato. Su `feat/capabilities-contract` ([PR #80](https://github.com/boomer934/control-center/pull/80)): una sonda chiede a Claude Code solo `initialize`, senza prompt e senza consumo di token. Dalla risposta arrivano i modelli con i loro effort, che diventano il catalogo della chat (`CLAUDE_MODELS` resta solo come ripiego), e i comandi, gli agenti, gli stili e le capacità. Nuovi `capabilities/inventory.ts` e `service.ts` (istantanea in `capabilities.json`; voci nuove, cambiate e rimosse) e il namespace IPC `capabilities`. Fixture `claude-initialize.control.jsonl` e finto `claude` che risponde a `initialize`. `SICUREZZA.md` aggiornato.
- **Decisioni.** La sonda non parte all'avvio: parte alla prima sessione Claude o alla prima `capabilities:list`. Gira al più una volta per avvio, e solo se la versione è cambiata o l'ultima lettura ha più di 24 h. La prima lettura di un agente fa da base: niente centinaia di novità alla prima apertura. `mark-seen` vuole la revisione mostrata (`stale` se è cambiata). `capabilities:changed` porta solo la revisione, come `errors:changed`. Il modello `default` della risposta non entra nel catalogo, perché equivale a "nessuna scelta". Nuovo tipo d'errore `capabilities`.
- **Verifica.** `pnpm verify` verde (568 test). E2E Claude, Codex e sicurezza verdi. Prova reale con 2.1.326 verde.
- **Problemi.** In 2 run complete di `vitest` su circa 15 è comparso un «Unhandled Error» che non si è più riprodotto (vedi `PROBLEMI_NOTI.md`). Le barre rovesciate nei heredoc di Bash si perdono ancora: correggere con Edit.

## 2026-11-27 — Revisione della PR #79 e piano della 5h

- **Fatto.** PR B aperta come [PR #79](https://github.com/boomer934/control-center/pull/79). Revisione incrociata di Codex: "unire con correzioni", 6 rilievi, tutti corretti con test. P1: `approvalsReviewer: user` esplicito, perché con la CLI reale il thread usava `auto_review` (un sottoagente approva al posto dell'utente); la politica restituita si verifica (`CodexPolicyRejected`) e si ripete in ogni `turn/start`. P2: interruzione non confermata → chiusura dei processi invece di liberare il workspace; approvazioni solo per il turno confermato; ambito effettivo nel testo dell'approvazione; risposte di login fuori schema rifiutate. P3: ricerca della CLI che prosegue dopo un candidato inutilizzabile.
- **Decisioni.** Nuova sotto-fase 5h (capacità, sezione "Novità e capacità", controllo giornaliero delle CLI con auto-merge di `compat.json`, electron-updater), prima della 5g su scelta dell'utente. Piano in `FASE_5h.md`, righe in `CORSIE.md`, goal in `PIANO.md`. Si parte da `main` dopo il merge della #79, perché la 5h usa la sessione Codex della PR B e tocca gli stessi file.
- **Verifica.** `pnpm verify` 542 test, E2E Codex e sicurezza (20), prova con la CLI reale verdi.
- **Da decidere.** Anticipare electron-updater significa anticipare anche il packaging NSIS della Fase 10.

## 2026-11-27 — Sessione Codex nel main (5f.1, PR B)

- **Fatto.** Su `feat/codex-session-main` (ADR 0018): namespace IPC `codex` con le stesse forme di `claude`; servizio comune ai due provider estratto dal servizio Claude (`main/agents/service.ts`); sessione su `codex app-server` con JSON-RPC su stdio, approvazioni, interruzione, ripresa del thread, catalogo da `model/list`, default da `config/read`; ricerca della CLI dal PATH o dal pacchetto Store letto dal registro; normalizzatore minimo `LiveCodexSession`; finto `codex app-server`; E2E `codex.spec.ts`; prova reale `real-codex.smoke.test.ts`.
- **Decisioni.** Ogni `turn/start` manda modello ed effort espliciti, perché l'override di Codex vale anche per i turni successivi: `null` torna al valore configurato. L'effort senza modello si valida sul modello configurato. «Sempre in questa sessione» solo se il server offre `acceptForSession`. Un turno di un provider rende il workspace occupato anche per l'altro.
- **Verifica.** `pnpm verify` verde (535 test). E2E Codex, Claude, sicurezza ed errori del progetto verdi. Prova con la CLI vera 0.171.0-alpha.13.2 verde.
- **Problemi.** Lo stderr di Codex scrive righe `ERROR` anche per un comando rifiutato: arrivano in Console come `child-stderr`. Alla ripresa arriva un `tokenUsage` del turno precedente: lo scarta il normalizzatore.

---

## 2026-11-27 — Correzioni del bridge degli hooks dalla revisione Astra (F4.1)

- **Fatto.** Su `fix/hooks-bridge-hardening`: hooks passati a `claude --settings` come JSON inline, quindi nessun `settings.json` su disco; `bridge.json` scritto solo dopo `listen()`. Server della pipe con scadenza assoluta, limite di frammenti (`fragmented`) e rifiuti raggruppati e limitati prima della Console (`RejectSummary`). Lo script legge `bridge.json` con un solo `open`, verifica con `fstat` sull'handle e legge al massimo 4 KiB + 1 byte. `killTree` ritenta `taskkill` e segnala `ProcessTreeNotEnded`. La pulizia delle cartelle rimaste usa `maxRetries` e segnala `StaleSessionCleanupFailed`. Nuovi test: in `bridge.test.ts`, `cli.test.ts`, `session.test.ts` e `kill-tree.test.ts`.
- **Decisioni.** Lo stesso utente a integrità media resta fuori dal modello delle minacce. Un broker o una DACL esplicita sono opzioni future, come il Job Object. Tutte richiedono una dipendenza nativa e un'ADR. In `SICUREZZA.md` sono ridimensionate le frasi «esce sempre con 0», «intero albero» e «al primo avvio».
- **Verifica.** `pnpm verify` verde: 455 test e 0 errori di lint. Sono verdi i 4 E2E di `claude.spec.ts`. La DACL è stata letta su Electron 45.4.1: utente, SYSTEM e Administrators hanno controllo completo, Everyone e Anonymous la lettura. Un processo a bassa integrità può leggere ma non scrivere.
- **Problemi.** Gli strumenti Bash/heredoc dimezzano le barre rovesciate: correggere con Edit. Dopo `pnpm install` mancava il binario di Electron 45.4.1, scaricato dal pacchetto. `dev.spec.ts` è rosso in locale per `#/live`, senza legame con questo branch.

---

## 2026-11-27 — Repo pubblica e merge della PR #67

- **Fatto.** La CI non partiva (job fermati dal limite di spesa dell'account GitHub). Controllati segreti e dati personali su tutti i 215 commit e i branch: email dei commit tutte `noreply`, nessun token o chiave, fixture pulite, nessun secret su GitHub e nessun workflow `pull_request_target`. Repo resa pubblica, PR #67 chiusa e riaperta, CI verde (Verify Windows 8m18s, gitleaks su tutta la storia), unita in squash (`c33838b`).
- **Decisioni.** Il nome utente Windows nei percorsi di `CORSIE.md` e di due vecchi commit di `STATO.md` resta: l'utente ha scelto di non riscrivere la storia.
- **Protezione di `main`.** Attivata su richiesta dell'utente: PR obbligatoria con 0 approvazioni, quattro check CI obbligatori (Verify Windows, gitleaks, Conventional commits, Project memory), regole valide anche per gli admin, niente force-push né cancellazione. Le PR di release-please eseguono gli stessi job, quindi non restano bloccate.

---

## 2026-11-27 — Specifica modello ed effort per turno nella 5f

- **Fatto.** In `PIANO.md` il cambio di modello/effort per provider è ora parte della 5f: vale dal turno seguente, si conserva nella ripresa e compare in `session.started`/`session.configChanged` per Vista Live e replay. Aggiunti avviso sul contesto, stima token e opzione per non ripeterlo nella sessione.
- **Decisioni.** Avviso per il solo effort solo se una prova mostra invalidazione della cache. In `CORSIE.md`, Claude possiede contratto, validazione e CLI; Codex selettore, avviso e superfici UI/E2E. Aggiornati goal, prossimi passi e Vault.
- **Verifica.** `npx pnpm@10.34.9 verify` verde: 439 test passati, 1 saltato; lint con 418 warning e zero errori.
- **Da verificare.** Su Windows il supporto all'effort di Claude Code e ai parametri per turno del Codex App Server.

---

## 2026-11-27 — Collaudo dell'integrazione Claude Code e Codex

- **Fatto.** Definiti i criteri di accettazione per worktree, conflitti Git, attribuzione di eventi e richieste, ripresa dopo errori, accessibilità e prestazioni della Vista Live.
- **Decisioni.** La consegna del contratto sblocca il collegamento della UI. La 5g richiede fixture concorrenti, prova con le due CLI reali e revisione Impeccable in Electron.
- **Verifica.** `pnpm verify` verde con 439 test passati e uno saltato.
- **Da verificare.** I criteri si applicano durante l'implementazione di 5f e 5g.

---

## 2026-11-27 — Priorità Codex e uso simultaneo con Claude Code

- **Fatto.** Aggiornati piano, prossimi passi e corsie. Codex in Vernier (5f) e sessioni simultanee di Claude Code e Codex (5g) precedono la Fase 6.
- **Decisioni.** La prima consegna è una sessione Codex avviata da Vernier. Per la 5g il piano prevede due worktree Git e corsie distinte nella Vista Live. Claude prende contratti, runtime e isolamento. Codex prende fixture, trasformazione degli eventi, UI e verifica. Il lavoro sulle fixture può procedere in parallelo al runtime.
- **Verifica.** `pnpm verify` verde: 439 test passati e uno saltato.
- **Da verificare.** Comportamento dell'App Server su Windows, doppia sessione con le CLI reali e disponibilità di eventi live per chat avviate fuori da Vernier.

---

## 2026-11-27 — Chiusura Fase 5

**Fatto**

- Fase 5 (Vista Live, il cuore del prodotto) completata in sei sotto-fasi di codice, tutte su `main`:
  - **5a** modello del progetto (PR #56, `89a3eac`, ADR 0012), di Claude con la revisione Codex: scansione nel worker con `.gitignore`, import con Tree-sitter WASM per TS/JS, Python, Go e Rust, ruoli come plugin e watcher `fs.watch` incrementale;
  - **5b** mappa (PR #58, `b858988`, ADR 0013, e rifinitura PR #59, `08f5c47`), di Claude: React Flow ed elkjs nel worker, stati dei nodi dagli `AgentEvent`, Segui agente, anteprima diff, minimappa a heatmap;
  - **5c** timeline e replay (PR #62, `d6f35d0`), di Codex: corsie per agente e subagent, scrubber, sessioni passate in sola lettura con checkpoint confrontabili;
  - **5d** pannello agenti e ispettore (PR #63, `b90d53b`, ADR 0014), di Codex, con l'inventario locale in sola lettura (Docker, porte, VRAM, Ollama) anticipato dalla Fase 6 su autorizzazione dell'utente;
  - **5e** errori del progetto (PR #64, `1ce73a6`, ADR 0015), di Claude anche per la parte dei parser assegnata a Codex: schema `error.detected` v2 con la migrazione 1 → 2, parser di stack trace (V8, Firefox, `tsc`, esbuild/Vite/Oxc, Python, Go, Rust) su fixture reali, errori da terminale e comandi degli agenti, nodo colpevole rosso;
  - **5e+** azioni rapide sull'errore (PR #68, `a5681b9`, ADR 0016, ed E2E stabilizzati con la PR #70, `524ce89`), di Codex in subentro per crediti Claude esauriti: bozza per Claude, spiegazione da Ollama, apertura del sorgente alla riga, con `.env*` sempre esclusi.
- Fuori dalle sotto-fasi ma nello stesso periodo: checkpoint Git con percorsi lunghi su Windows (PR #61, `6bcb9cf`), che chiude il "checkpoint `failed`" trovato nella prova reale della 5b; release 1.3.0 (PR #57).
- **DoD di `PIANO.md`:** riproducendo `sessione-02`, l'E2E della 5d trova nella Vista Live la risposta alle cinque domande della Fase 1 senza leggere la chat.
- **Budget:** 60 fps con 500 nodi e 20 eventi/s misurati in CI (64,1 fps, 0% di frame lunghi, main thread al 15,8%); 5.000 file elencati in 46 ms e indicizzati in circa 2 s.
- **Ultime verifiche:** `pnpm verify` verde con 448 test (uno saltato); in CI E2E verdi (77/77 sulla 5e, `project-errors.spec.ts` 10/10 sulla 5e+) e app impacchettata 10/10.
- **Revisioni:**
  - impeccable su ogni sotto-fase con UI, nei due temi;
  - revisione incrociata Codex sulla 5a (7 rilievi corretti);
  - Claude `high` sulla 5d e sull'IPC della 5e+, senza rilievi bloccanti.

**Decisioni:** nessuna oltre le ADR 0012–0016. Due scostamenti da `PIANO.md`:

- `fs.watch` ricorsivo al posto di chokidar e `@vscode/tree-sitter-wasm` al posto di web-tree-sitter con una grammatica per pacchetto (ADR 0012);
- la mappa raggruppa per cartelle con `rectpacking`, non con un grafo `layered` degli import (ADR 0013).

Le sotto-fasi sono passate da una corsia all'altra in due casi, entrambi annotati in `CORSIE.md`: i parser della 5e e le azioni rapide della 5e+.

**Lezioni**

- Sulla mappa niente animazioni che ridipingono fuori dal segno di un nodo. Il budget dei fps si misura col tempo del main thread, perché i frame del runner senza GPU non distinguono una mappa che regge da una al limite.
- Le baseline visive vengono solo dagli artifact della CI: in locale i test visivi falliscono sempre per i font.
- Gli E2E sul terminale non leggono il testo visibile: ConPTY va a capo nei percorsi lunghi sullo schermo piccolo del runner. Servono percorsi relativi e un marcatore di fine comando, e un clic sulla mappa va fatto dopo `data-ready`.
- Gli E2E con il finto `claude` devono ripulire sia `PATH` sia `Path` (`cleanEnv`), altrimenti parte la CLI reale.
- Per modificare i sorgenti si usa l'editor, non gli heredoc della shell: perdono gli escape.

**Problemi aperti** (in `PROSSIMI_PASSI.md` e `PROBLEMI_NOTI.md`)

- Il worker del modello e la mappatura degli stack sono provati nei file estratti, non dentro l'app impacchettata (Fase 10).
- Gli errori letti direttamente dai container Docker e i dev server rilevati dalle porte passano alla Fase 6.
- Restano i minori della mappa: Fit quando cambia l'altezza col dock aperto, simboli nello zoom semantico, menu `@` per seguire un agente. Resta anche il passaggio del prototipo 1d alle fixture ripulite.
- Manca ancora la seconda opinione di Astra sulla pipe della 4.1.

---

## 2026-11-27 — Merge delle azioni rapide 5e+ (PR #68)

- **Fatto.** Claude ha rivisto le parti IPC e main della PR (controllo del mittente, workspace attivo, blocco di `.env*`, limiti di dimensione, Ollama solo locale, redazione) senza rilievi. Ha corretto due E2E che fallivano solo in CI (`fe06caf`) e unito la PR con squash (`a5681b9`) a CI verde, su richiesta dell'utente.
- **Decisioni.** Gli E2E con tracce lunghe usano percorsi relativi e un marcatore di fine comando, invece del testo visibile del terminale. Dopo il merge lo stesso spec è caduto in CI sulla PR 70 (clic su un nodo mentre la mappa si ridispone): `inspectNode` aspetta `data-ready` e ripete il clic finché l'ispettore mostra l'errore.
- **Problemi.** Sul runner a 1024×768 ConPTY va a capo nei percorsi assoluti di Node e le righe escono dalla parte visibile: voce in `PROBLEMI_NOTI.md`. I due commenti di CodeRabbit (scenari non supportati su Linux, abbonamento scaduto) non chiedevano modifiche. Il merge automatico di GitHub non è attivo nel repository.
- **Verifica.** `pnpm verify` verde (448 test passati, 1 saltato); `project-errors.spec.ts` 10/10 sia a 1440×900 sia a 1024×728; CI della PR verde.

---

## 2026-11-27 — Esclusione di `.env*` da «Go to file» (PR #68)

- **Fatto.** Il main controlla con `win32.basename` il nome richiesto e quello canonico prima di aprire il file. I test unitari verificano il blocco prima di `open()`, simulano un symlink e un alias Windows 8.3 e confermano la lettura di `environment.ts`.
- **Decisioni.** Regola approvata dall'utente il 2026-11-27 e recepita in `SICUREZZA.md` e nelle conseguenze dell'ADR 0016.
- **Verifica.** `pnpm verify` verde con 448 test passati e uno saltato. `project-errors.spec.ts` 10/10. Il caso `.env:1` mostrava il contenuto della fixture prima della correzione e ora segnala che il sorgente è indisponibile.

---

## 2026-11-27 — Selezione di errori nello stesso file (PR #68)

- **Fatto.** Ripristinata la chiave `mark.id` per `ProjectErrorActions`. Un E2E verifica che il cambio di errore nello stesso file rimuova la spiegazione precedente e annulli la richiesta in corso.
- **Verifica.** `pnpm verify` verde con 443 test passati e uno saltato. `project-errors.spec.ts` 9/9. Il nuovo caso passa anche sul commit precedente perché l'ispettore padre usa già `mark.id` come chiave.

---

## 2026-11-27 — Seconda revisione delle azioni rapide (PR #68)

- **Fatto.** Stato delle azioni isolato per errore, risoluzione dei percorsi del terminale condivisa con la mappa e ripiego sull'ultimo marcatore visibile del nodo.
- **Decisioni.** L'ADR 0016 esplicita il limite dell'inode zero per il visualizzatore. In `SICUREZZA.md` è proposta l'esclusione dei file `.env*` prima della lettura, in attesa di conferma.
- **Verifica.** `pnpm verify` con 443 test passati e uno saltato, `project-errors.spec.ts` 6/6, dieci E2E funzionali della mappa e rilevatore Impeccable senza rilievi.

---

## 2026-11-27 — Azioni rapide sugli errori della Vista Live (5e+)

- **Fatto.** Dall'errore selezionato sulla mappa o nella timeline si può preparare la correzione in Claude, chiedere una spiegazione a Ollama e aprire il file alla riga. Funziona anche per un errore del terminale prima di una chat. Codex ha coperto contratto e UI in subentro per crediti Claude esauriti.
- **Decisioni.** La chat conserva la bozza esistente e richiede l'invio esplicito. Il visualizzatore interno in sola lettura usa i controlli canonici della 4.2. Ollama riceve i metadati ripuliti dell'errore e usa il modello di completamento locale installato più piccolo (ADR 0016).
- **Verifica.** `pnpm verify` con 440 test passati e uno saltato. Tutti i 74 E2E funzionali passati, inclusi avvio da un errore del terminale, attraversamento del workspace rifiutato e apertura alla riga. Prova reale con `qwen2.5-coder:7b`. Impeccable in Electron a 960×602 nei due temi segnala solo la gerarchia tipografica compatta. I confronti visivi del runner Windows restano alla CI.
- **Problemi.** La minimappa copriva il file quando si apriva l'ispettore a finestra stretta. Corretto il Fit al ridimensionamento e tolto l'invito ad avviare una sessione quando c'è già un errore sulla mappa. Il dialogo ripristina il focus dopo Escape.

---

## 2026-11-26 — Errori del progetto sulla mappa (5e)

- **Fatto.** `error.detected` nello schema (v2) con la migrazione 1 → 2 per la cronologia; parser di stack trace a registro con fixture reali; errori dai comandi degli agenti e dal terminale integrato; colpevole rosso sulla mappa, segno nella timeline, dettagli nell'ispettore (ADR 0015).
- **Decisioni.** Versione alzata anche se il cambio è additivo, per mettere in opera le migrazioni. Nessun canale IPC nuovo: gli errori del terminale passano da `terminal:updated`. Lo stesso errore da terminale e sessione conta una volta. Un errore di un comando si spegne quando lo stesso comando passa, non solo con una scrittura sul file. La parte dei parser, assegnata a Codex, l'ha fatta Claude su goal dell'utente (annotato in `CORSIE.md`).
- **Verifica.** E2E 3/3 (terminale, comando dell'agente con `sessione-02`, Docker Compose e un Vite 8 vero), `pnpm verify` 439 test, audit impeccable via CDP nei due temi. In CI le sole immagini cambiate erano `map-error-dark/light` (attese): prese dal run 45903635423; il run successivo è verde (E2E 77/77). Unita con la PR #64 (`1ce73a6`) su richiesta dell'utente.
- **Problemi.** In locale gli E2E con il finto `claude` avviavano la CLI reale: `cleanEnv` lasciava il `PATH` ereditato accanto al `Path` del test; corretto, con la nota in `PROBLEMI_NOTI.md` (il primo E2E della 5e era passato su risposte vere). L'audit ha trovato la nota `AssertionError [ERR_ASS…` che sfondava il nodo. ConPTY disegna lo schermo con movimenti del cursore: tolte le sequenze ANSI, il caret si incollava al messaggio (`^TypeError`); ora i movimenti diventano a capo e spazi. `src/lib/` veniva preso per la libreria standard di Python (`Lib/` senza distinzione di maiuscole). Gli heredoc della shell perdono gli escape (`\n`, `\u0000`): le modifiche ai sorgenti vanno fatte con l'editor.

---

## 2026-11-26 — Riallineamento e revisione della Vista Live 5d

- **Fatto.** Riallineata la PR #63 dopo la 5c e integrato il branch con la correzione Windows.
- **Revisione.** Claude Opus a effort `high` non ha trovato rilievi bloccanti in IPC e probe locali. Verificati nel sorgente la validazione della risposta nel main, la documentazione di sicurezza e il polling della vista ogni 15 secondi.
- **Verifica.** `pnpm verify` sul branch combinato con 399 test passati e uno saltato.
- **Problemi.** L'inventario usa endpoint locali fissi. Docker era indisponibile nella prova sul computer, mentre l'E2E usa un inventario deterministico.

---

## 2026-11-26 — Merge della timeline e riallineamento del checkpoint

- **Fatto.** Unita la PR #62 su `main` a CI verde. Riallineata la PR #61.
- **Decisioni.** Conservati i commit della 5c, che sono la base del pannello agenti. Riunite le voci di memoria delle due PR.
- **Problemi.** Tre conflitti nella memoria di progetto. La correzione del checkpoint passa dalla nuova CI prima del merge.

---

## 2026-11-26 — Inventario macchina e cinque risposte del replay

- **Fatto.** Su autorizzazione dell'utente, la Vista Live mostra container in esecuzione, porte TCP, VRAM NVIDIA e modelli Ollama durante il replay.
- **Decisioni.** I probe sono in sola lettura. Il riepilogo IPC mostra lo stato corrente della macchina anche se il playhead è nel passato (ADR 0014).
- **Verifica.** L'E2E con `sessione-02` e inventario deterministico nel main copre le cinque domande. Impeccable pulito in Details e JSON nei due temi.
- **Problemi.** La [PR #63](https://github.com/boomer934/control-center/pull/63) è basata sulla #62. Il canale IPC e i probe locali richiedono la revisione Claude prima del merge.

---

## 2026-11-26 — Pannello agenti e ispettore della Vista Live (5d)

- **Fatto.** Pannello Agents sincronizzato con il playhead, selezione tra timeline, mappa e pannello, ispettore con dettagli e JSON copiabile.
- **Decisioni.** Il pannello deriva i dati dal prefisso di eventi al playhead. I token finali del turno sostituiscono il conteggio parziale dei messaggi. La 5d parte dalla PR #62 su un branch separato.
- **Verifica.** Electron con `sessione-02`, inclusi selezione da tastiera e confronto con gli appunti. Impeccable senza rilievi a 960×600 nei due temi e in entrambe le viste dell'ispettore.
- **Problemi.** Per la quarta domanda l'E2E mostra un comando locale avviato dall'agente. Docker, porte e GPU/Ollama richiedono l'inventario della Fase 6.

---

## 2026-11-26 — Pubblicazione di timeline e checkpoint Windows

- **Fatto.** Pubblicate la [PR #62](https://github.com/boomer934/control-center/pull/62) per timeline e replay 5c e la [PR #61](https://github.com/boomer934/control-center/pull/61) per il checkpoint Git su Windows.
- **Decisioni.** La correzione dei checkpoint ha una PR separata. Claude Code ha rivisto il diff a effort `medium` senza confermare bug. Il dettaglio dell'errore passa dal processo Git alla Console, che raggruppa le occorrenze ripetute.
- **Verifica.** Per la 5c, `pnpm verify` verde (393 test, uno saltato). Su Windows, `git update-ref` è fallito con un percorso di lock da 315 caratteri e ha funzionato con `-c core.longpaths=true`.
- **Problemi.** CI avviata sulle due PR. Merge dopo i controlli.

---

## 2026-11-26 — Timeline e replay della Vista Live (5c)

- **Fatto.** Corsie per agente con subagent annidati, marcatori e intervalli delle chiamate, scrubber da mouse e tastiera e riproduzione. Da History si riapre la sessione salvata in sola lettura, con confronto dei checkpoint.
- **Decisioni.** Il replay applica a `MapActivity` solo gli eventi fino all'istante scelto e usa il grafo corrente del workspace come contesto. Il layout resta stabile durante la ricerca. Una lettura o scrittura sul target già indicato dalla chiamata usa lo stesso marcatore.
- **Verifica.** `pnpm verify` verde (393 test, uno saltato). In Electron, 69 E2E funzionali verdi, inclusi replay della fixture, riapertura di una sessione dopo il riavvio e checkpoint. Audit Impeccable senza rilievi a 960×600 nei due temi.
- **Problemi.** I quattro confronti visivi locali di mappa e componenti falliscono anche su `origin/main`.

---

## 2026-11-26 — Checkpoint Git nei workspace Windows con percorsi lunghi

- **Fatto** Riprodotto il checkpoint mancante in Electron e corretto su `fix/git-checkpoint-electron`. Una sessione reale di Claude Code 2.1.326 ha modificato un file dopo la cattura. Il ripristino dalla timeline ha recuperato il contenuto originale mantenendo branch e HEAD.
- **Decisioni** L'app abilita `core.longpaths` per i propri processi Git su Windows. In caso di errore, Problems riporta il sottocomando e il codice di uscita, se disponibili. Lo storico mantiene il codice applicativo.
- **Problemi** Il file di lock del riferimento eccedeva il limite Windows perché il percorso include la radice Git, l'ID del workspace e l'UUID del checkpoint. La prova iniziale in Vitest usava un ID workspace più corto.
- **Verifica** `pnpm verify` con 387 test passati e uno saltato. Test di integrazione con un repository temporaneo profondo e tre E2E Git verdi. Resta la revisione Claude.

---

## 2026-11-26 — Rifinitura della mappa: audit e sessione reale

- **Fatto:** audit impeccable della mappa nei due temi: rilevatore pulito sul sorgente e sull'app via CDP, contrasto del testo ≥ 4,5:1. Prova con Claude Code 2.1.326 su un workspace Git di prova, guidata da Playwright: letture, permesso, edit con diff, due turni, Segui agente, anteprima diff. Tre correzioni nella PR #59: chip dell'agente dal secondo turno, `Fit` libero da legenda, readout, minimappa e nota vuota, Segui agente che inquadra file e chip insieme.
- **Decisioni:**
  - un agente ha una run per turno: `viewAt` lo considera vivo solo dentro una run, così il replay della 5c vede le pause tra i turni;
  - la nota "No session yet" sta in alto e `Fit` misura dal DOM quanto gli overlay entrano nella tela, invece di nascondere la legenda.
- **Problemi:** il checkpoint Git fallisce nell'app (`failed`) ma riesce fuori, sullo stesso repo: voce aperta per la corsia Codex (4b). Le baseline visive della mappa vanno rigenerate dalla CI.
- **Verifica:** `pnpm verify` verde (386 test); `map.spec.ts` 9 test di comportamento verdi in locale, 2 visivi rossi (attesi).

---

## 2026-11-26 — Mappa 5b in CI: budget dei 60 fps e merge

- **Fatto:** PR #58 portata a CI verde. Baseline visive della mappa dal runner Windows; `data-ready` solo sul layout del visibile corrente; props di `<ReactFlow>` stabili (un evento ri-renderizzava tutti i 511 nodi). Il test dei 60 fps falliva ancora (12,2% di frame > 25 ms): causa trovata con il protocollo DevTools e tracce del main thread. Ora il punto del viaggio si muove con `transform` sul compositor (`Trip`, un elemento per agente), i nodi della mappa non hanno transizioni e il `readtick` usa `fill/stroke-opacity`. Main thread durante il banco: 95% → 43% a CPU ×4, 25% → 9% a CPU ×1; in CI 64,1 fps, 0% di frame lunghi, 15,8% di main thread.
- **Decisioni:**
  - il test di prestazioni misura il tempo del main thread (`TaskDuration`, al massimo 50% con gli eventi) più fps ≥ 55 e 500 nodi: i frame del runner (senza GPU, timer da 15,6 ms) non distinguono una mappa che regge da una al limite;
  - sulla mappa niente animazioni che ridipingono fuori dal segno di un nodo (`map.css`, `PROBLEMI_NOTI.md`);
  - merge chiesto dall'utente prima della passata impeccable e della prova con una sessione reale (voce 3 di `PROSSIMI_PASSI.md`).
- **Problemi:** l'ipotesi precedente (timer del runner) era sbagliata: a mappa ferma il runner dava 0% di frame lunghi. Sette baseline rigenerate per l'antialiasing del testo del chip, contenuto invariato.
- **Verifica:** `pnpm verify` verde (385 test); CI della PR #58 verde su `fd558b6`.

---

## 2026-11-19 — Mappa della Vista Live (5b)

- **Fatto:** branch `feat/mappa` impilato sulla 5a (in revisione da Codex). Mappa React Flow in `renderer/src/live/`: contenitori per cartella con file toccati e vicini, resto collassato con calore; stati dei nodi dagli `AgentEvent`; chip e archi degli agenti; nodi temporanei per comandi e MCP; Segui agente, Fit, zoom semantico, minimappa a heatmap, anteprima diff; map lab con le fixture e banco da 500 file (ADR 0013).
- **Decisioni:**
  - raggruppamento per cartelle con griglia e ELK `rectpacking` nel worker, invece del grafo `layered` degli import (stabile, niente groviglio);
  - stato per nodo da uno store esterno: la lista dei nodi cambia solo con il layout;
  - un file si accende da `tool.called` (i `file.read`/`file.written` arrivano a fine chiamata);
  - anteprima diff dal `git:diff` esistente, niente nuovo IPC;
  - map lab tolto dalla produzione con una condizione letterale nel punto dell'import dinamico.
- **Problemi:**
  - React Flow toglie i `pointer-events` ai nodi non selezionabili né trascinabili: servono `onNodeMouseEnter`/`Leave`;
  - `rectpacking` senza larghezza obiettivo impila i contenitori in colonna;
  - Rollup non piega una costante importata da un altro modulo: il chunk del lab finiva in produzione;
  - in mancanza di baseline Playwright scrive gli screenshot locali: vanno cancellati, le baseline vengono dalla CI.
- **Verifica:** `pnpm verify` verde (381 test); E2E della mappa verdi (144 fps, p95 7 ms con 500 nodi e 20 eventi/s); test visivi da completare con le baseline della CI.

---

## 2026-11-19 — Correzioni della revisione 5a

- **Fatto:** corretti i sette rilievi della revisione incrociata della PR #56. Aggiunti test per il modulo Go alla radice, il limite dei percorsi, le regole di esclusione, l'arresto del worker durante la prima scansione, il recupero del watcher e l'ordine dei messaggi IPC.
- **Decisioni:** la stringa vuota rappresenta la directory radice solo in `importDirs` (ADR 0012). Il renderer richiede uno snapshot aggiornato se ha già visto un delta successivo.
- **Problemi:** la prova del worker dentro l'eseguibile Electron distribuito resta tracciata in `PROBLEMI_NOTI.md`.

---

## 2026-11-19 — Modello del progetto (5a) e correzioni della 4b

- **Fatto:** la PR #52 (4b) era stata unita prima delle correzioni della revisione. Claude le ha portate su `main` con la PR #55 (cherry-pick di `5bc30ae`), tenendo il test del terminale già stabilizzato e aggiungendo timeout e ambiente corretti per il commit con hook. Poi la 5a: pacchetto `project-model`, worker nel main, canali `project:open` e `project:updated`, stato del modello nella Vista Live (ADR 0012).
- **Decisioni:**
  - snapshot appena nota la lista dei file, import in delta ogni 100 ms;
  - `@vscode/tree-sitter-wasm` invece di web-tree-sitter con una grammatica per pacchetto: una dipendenza, nessun addon nativo;
  - `fs.watch` ricorsivo invece di chokidar (cambia `PIANO.md`);
  - ruoli solo dai percorsi, come plugin;
  - uno specchio del modello nel main risponde a `project:open`.
- **Problemi:**
  - il type stripping di Node non accetta le parameter property: il pacchetto non le usa, perché il worker deve girare anche dal sorgente;
  - Rollup mette il codice comune a main e worker in `out/main/chunks/`: nel pacchetto vanno estratti anche i chunk, controllato da `build.spec.ts`;
  - un percorso segnalato dal watcher dentro una junction nuova passava con `lstat`: ora si controllano tutte le cartelle antenate.
- **Verifica:** `pnpm verify` verde, 5.000 file aperti in 46 ms e indicizzati in circa 2 s, E2E del modello e del pacchetto verdi. In locale l'E2E della chat con i permessi fallisce anche su `main` (`PROBLEMI_NOTI.md`).

---

## 2026-11-19 — Revisione del pannello Git e dei checkpoint (4b)

- **Fatto:** riallineata la [PR #52](https://github.com/boomer934/control-center/pull/52) a `origin/main` dopo le PR #51 e #53. Conservata la memoria di main e aggiornate le voci della 4b. Tolti dalla PR la pianificazione dei modelli e il ritocco al test del terminale.
- **Decisioni:** la chat continua con un avviso nello storico se fallisce il checkpoint e chiede di riprovare quando Git è occupato. Il commit esegue gli hook e rimanda al terminale se è richiesta la firma. Ogni workspace mantiene 20 checkpoint e 30 recuperi. Il pannello conta i file omessi e aggiorna il diff selezionato.
- **Problemi:** l'istantanea completa ha ancora un costo sui repository grandi. Il ripristino riusa il piano dell'anteprima e ricontrolla i percorsi e i filtri prima della scrittura.
- **Verifica:** `pnpm verify` con 349 test passati e uno smoke test opzionale saltato. Cinque E2E Claude e Git verdi. La CI della PR precede il merge dell'utente.

---

## 2026-11-19 — Assegnazioni GPT-6.2 e preparazione della revisione 4b

- **Fatto** — Integrate le assegnazioni GPT-6.2 nel ramo `feat/git-checkpoints`. `CORSIE.md` raccoglie modelli ed effort, `PIANO.md` contiene i goal e le due skill di avvio consultano entrambi.
- **Decisioni** — GPT-6.2 Sol per l'implementazione Codex e GPT-6.2 Astra a effort `high` per le seconde opinioni previste. La 4b va in revisione con Claude `/code-review medium`.
- **Problemi** — Restano la revisione incrociata e la verifica degli snapshot sulla CI Windows.
- **CI della PR #52** — Due test di ripristino con processi Git reali hanno superato i 5 s predefiniti sul runner Windows. Il timeout della suite di integrazione Git è ora di 20 s.
- **E2E Windows** — Il test dei checkpoint attende più a lungo la fine del turno Claude. Nel test dell'editor, Playwright cerca di nuovo la riga del link se xterm la sostituisce mentre ridisegna il prompt.
- **Allineamento** — Integrata la memoria della PR #53 nel ramo della PR #52. Le PR di release #50 e #51 sono entrambe unite.

---

## 2026-11-18 — Pannello Git e checkpoint (4b)

- **Fatto** — Pannello Git con branch, modifiche, diff, commit recenti, stage e unstage. Il primo turno Claude con un workspace Git crea un checkpoint, visibile anche riaprendo la cronologia. Il dialogo dalla timeline confronta e ripristina un file o tutti, con effetto distinto su indice e working tree.
- **Decisioni** — L'ADR 0011 usa riferimenti Git locali, un indice temporaneo, token monouso legati all'anteprima e un checkpoint di recupero prima del ripristino.
- **Verifiche** — `pnpm verify` verde, 340 test passati e smoke test Claude reale saltato. Repository temporanei per staging, branch e stash invariati, ripristino parziale, anteprima invalidata da una modifica, linked worktree e percorsi rifiutati. Suite Electron con 54 test funzionali verdi, incluso il flusso pannello Git → Claude → timeline → ripristino.
- **Problemi** — Gli snapshot dei componenti si verificano sulla CI Windows. Restano la revisione incrociata e il merge.

---

## 2026-11-18 — Allineamento della memoria dopo le PR #49 e #50

- **Fatto:** la memoria locale era rimasta a `d1426a8`. Registrate la PR #49 (nove rilievi della 4.3 corretti, `f06cd09`), la release 1.1.0 (#50, `d8a546b`; la #51 è aperta) e lo stato della 4b: implementata da Codex su `feat/git-checkpoints` (`6180e12`), PR non ancora aperta. Tolta da `PROSSIMI_PASSI.md` la sezione dei rilievi 4.3, ormai chiusi.
- **Verifica:** `pnpm verify` eseguito sul branch di sola documentazione.

---

## 2026-11-18 — Correzioni dalla revisione della chat (4.3)

- **Fatto:** corretti i nove rilievi della PR #47 su `fix/claude-chat-review`. Ora i dettagli dei permessi lunghi restano approvabili, le richieste pendenti si aggiornano al limite delle regole, e il renderer segnala un'azione in corso. Lo storico richiede una finestra proprietaria e conserva l'ordine prompt → eventi.
- **Decisioni:** scrittura JSONL in coda asincrona per file, con attesa delle scritture prima della lettura e alla chiusura. Documentata la validità delle regole «Sempre in questa sessione» anche a workspace in secondo piano.
- **Verifiche:** `pnpm verify` (332 passati, smoke test reale saltato), due E2E Claude e rilevatore Impeccable senza rilievi. La prima passata di `/code-review medium` ha portato correzioni su richieste duplicate, avvio del turno e chiusura. Il pannello esplicita che l'approvazione include gli argomenti omessi.

---

## 2026-11-18 — Chiusura Fase 4

**Fatto**

- Fase 4 completata in quattro PR di codice: 4.0 canale push (#35, `4c2ef5c`, ADR 0007), 4.2 workspace e terminale (#40, `4b928ab`, ADR 0008), 4.1 hooks bridge e sessione Claude (#42, `ecb78f3`, ADR 0009, con la correzione del test #44), 4.3 chat, permessi e cronologia (#47, `fe3cb61`, ADR 0010). La memoria è registrata con le PR di sola documentazione (#41, #43, #45).
- Risultato: l'app apre un workspace (recenti, `Ctrl+P`, percorsi verificati), ha terminali PowerShell e Git Bash a schede, e conduce una sessione Claude Code con chat in streaming, richieste di permesso (Approva, Rifiuta, Sempre in questa sessione) e cronologia JSONL per workspace ripresa dopo il riavvio. Gli eventi arrivano dall'hooks bridge (named pipe con token per sessione) e dallo stream-json, uniti in `AgentEvent`. In CI il vero servizio non viene mai chiamato: lo sostituisce il finto `claude` (`packages/fixtures/bin/fake-claude.mjs`).
- Verifiche all'ultima PR (#47): `pnpm verify` verde con 326 test, 53 E2E funzionali verdi, impeccable senza rilievi a 960×600 nei due temi. Una run con la CLI vera (Claude Code 2.1.326) è stata provata sulla 4.1.
- Revisioni: `/code-review high` di Claude su 4.1 (7 punti, tutti chiusi), 4.2 (9 minori) e 4.3 (9 punti, ancora tutti aperti su `main`: la PR è una sola commit). Quelli della 4.3 sono in `PROSSIMI_PASSI.md`; i due di gravità media sono i permessi oltre 16 KiB rifiutati sempre e l'ordine degli eventi nello storico.
- `FASE_4.md` archiviato qui: le regole (niente subagent su IPC, processi, pipe, token, file system e configurazione degli hooks; `SICUREZZA.md` prima di ogni sotto-fase; IPC solo dal contratto, con zod e controllo del mittente; mai toccare `~/.claude*`; ADR per ogni dipendenza di runtime; solo token e stati semantici nella UI) restano in `CLAUDE.md` e `SICUREZZA.md`. Per registrare nuove fixture di hooks vale la procedura di "Fixture `Notification`" (`sessione-07`).
- Dopo la chiusura è stata unita la release `control-center-v1.0.0` (PR #46): Release Please ora funziona (impostazione dei permessi attivata).

**Decisioni:** nessuna nuova rispetto alle ADR 0007–0010. Il goal complessivo di `PIANO.md` è soddisfatto con due riserve: la seconda opinione di `gpt-6-astra` sulla pipe della 4.1 non è stata fatta (crediti Codex finiti) e la revisione della 4.3 è arrivata a PR già unita.

**Problemi aperti**

- Versione `1.0.0` della release (PR #46): inattesa rispetto a `PIANO.md`, ma decisa il 2026-11-18 di tenerla.
- 9 rilievi della revisione della 4.3, in `PROSSIMI_PASSI.md`.
- Astra sulla pipe; script degli hooks fuori dal pacchetto (Fase 10); font non inclusi.

---

## 2026-11-17 — Chat, permessi e cronologia (4.3)

**Fatto:** dock Session con testo in streaming, Markdown, codice e strumenti richiudibili. La timeline usa gli eventi normalizzati. Lo storico JSONL viene ricaricato dopo il riavvio e una conversazione salvata può continuare con `--resume`. Il finto eseguibile verifica approvazione, rifiuto, ripetizione identica, argomenti diversi e interruzione.

**Decisioni:** ADR 0010 per React Markdown, il protocollo stdin e lo storico ripulito. Il ricordo di un permesso è limitato allo stesso strumento con gli stessi argomenti e alla stessa sessione aperta.

**Verifiche e problemi:** `pnpm verify` verde con 326 test, 53 E2E funzionali verdi. A 960×600 le azioni dei permessi potevano uscire dall'area visibile della chat. La richiesta ora occupa una sezione fissa e la barra di stato può portare il focus agli argomenti. Impeccable senza rilievi, controllo visivo nei due temi. Resta la revisione Claude sul flusso dei permessi prima del merge.

## 2026-11-17 — Hooks bridge e sessione Claude (4.1)

**Fatto:**

- `event-schema`: normalizzatori incrementali e merge dal vivo (`LiveClaudeSession`); le funzioni batch sono invariate (snapshot uguali);
- nuovo pacchetto `hooks-bridge`: protocollo, server della named pipe, client e script degli hooks;
- main: sessione `claude -p` stream-json, una run per messaggio con `--resume`;
- namespace IPC `claude`;
- finto `claude` che riproduce le fixture ed esegue gli hooks configurati;
- test: 21 del bridge, 13 di integrazione della sessione, 15 di CLI e file, 6 del servizio, 9 del merge dal vivo, 1 E2E. `pnpm verify` verde (321 test). Commit da `7ef4238` a `9b062df` su `feat/hooks-bridge`.

**Decisioni:** ADR 0009. Il token sta solo nel file della sessione, mai nell'ambiente. Lo script degli hooks gira dal sorgente TS con il type stripping di Node ≥ 22.18. Nel merge dal vivo vince la prima copia di un fatto e gli hooks ambigui dei subagent attendono lo stream. Il namespace IPC `claude` è anticipato dalla 4.3 perché il contratto è un file caldo. Nuovi tipi di errore: `bridge-rejected` e `claude-setup`.

**Problemi:**

- su Windows `child.kill()` lasciava vivi i figli di `claude`: ora l'arresto usa `taskkill /T`;
- una pipe chiusa a metà dal client si chiude del tutto;
- Playwright carica le spec come CommonJS;
- `/code-review high` ha trovato 7 punti e ne sono stati corretti 6: processi vivi dopo l'uscita, eventi dopo `close`, schema che scartava gli errori lunghi, stderr troncato e due nomi;
- la prova con la CLI vera (2.1.326) è riuscita: gli hooks arrivano dalla pipe senza rifiuti. Ha però mostrato che `SessionStart` e `UserPromptSubmit` arrivano prima di `init`, e `session.started` perdeva modello e versione. Ora il merge dal vivo trattiene quegli hooks fino a `init`. La prova resta come test da attivare con `CC_REAL_CLAUDE=1`;
- la revisione di Astra non c'è perché i crediti Codex sono finiti.

**Merge:** PR #42 unita (`ecb78f3`) con tutti i controlli CI verdi. La PR della memoria #43 è fallita in CI per un test della sessione instabile sul runner: la cartella del workspace restava occupata dopo `taskkill /T`. La PR #44 (`54bce84`) l'ha corretta con una pulizia che riprova e l'uccisione al punto di attesa del finto claude. Entrambe sono unite. Release Please fallisce su `main` per un permesso della repo, già da prima di questa fase.

---

## 2026-11-17 — Workspace e terminale della 4.2

**Fatto:** dialog nativo, recenti, selettore `Ctrl+P`, ripristino del layout, percorsi canonici verificati, link al file e terminali a schede in PowerShell e Git Bash. L'output usa il canale push della 4.0.

**Decisioni:** ADR 0008. Notepad apre i file come testo. Ogni pty appartiene alla finestra e al workspace. Gli stili del terminale usano CSSOM con la CSP invariata.

**Problemi:** l'installazione Visual Studio locale non contiene le librerie MSVC Spectre. Il pacchetto di prova locale può usare il prebuild di node-pty. Il packaging standard richiede la ricompilazione. Il controllo dei percorsi con maiuscole diverse verifica l'identità della directory sul volume.

**Revisione e merge (Claude):** la CI era rossa su un solo test (`paths.test.ts`): nel runner `tmpdir()` è un percorso corto 8.3, quindi l'alias in maiuscolo differiva per grafia dalla radice e veniva rifiutato correttamente. Corretto il test con `realpath` (commit `7264c75`, modulo invariato); CI verde. `/code-review high`: 9 punti minori (ambiente del pty non filtrato, link dei Problems legati alla cartella dell'app, link del terminale per `file(12,5):`, altri in `PROSSIMI_PASSI.md`). PR #40 unita (`4b928ab`). I crediti Codex sono finiti dopo questa fase.

---

## 2026-11-17 — Fixture `Notification` (sessione-07), 4.1 sbloccata

**Fatto:**

- registrata e ripulita `sessione-07` (interattiva, 12 righe di hooks, nessuno stream): `Read`, permesso approvato dopo l'attesa (`Notification`, `permission_prompt`) e rifiuto fatto da una persona; unita con la PR #38 (`d6d08da`);
- `mergeClaudeSession` chiude a fine sessione le chiamate rimaste aperte come `tool.failed` (`interrupted`); le fixture 01-06 non cambiano; `pnpm verify` verde (243 test, 0 errori).

**Decisioni:** `interrupted` è un'inferenza, non un rifiuto certo: nel live della 4.1 il rifiuto va letto da un altro segnale. Il normalizzatore degli hooks non è stato toccato (un primo tentativo spostava le chiusure di 04 e 05 e fu annullato).

**Problemi:** i comandi di sola lettura (`npx --version`, `git log -1`) non chiedono permesso e quindi non generano `Notification`: serve un comando che scrive. Se `VERNIER_HOOKS_SESSION` non è nella finestra che lancia `claude`, gli hooks vanno in `unnamed.hooks.jsonl`. Il conflitto di merge in `STATO.md` con la PR #37 è stato risolto a mano.

---

## 2026-11-17 — 4.0 unita, memoria allineata

**Fatto:**

- la PR #35 (4.0) era già unita con lo squash, memoria compresa; il puntatore alle regole globali in `AGENTS.md`/`CLAUDE.md` era rimasto fuori ed è entrato con la PR #36 insieme alla memoria del merge;
- cancellato in locale `feat/ipc-push-channel`; `pnpm verify` verde su `main` (237 test).

**Decisioni:** nessuna.

**Problemi:** il worktree di Codex era in detached HEAD su `4c2ef5c`, senza `feat/workspace-terminal` sul remoto: annotato nella riga dei branch di `STATO.md`.

---

## 2026-11-17 — 4.0: canale push nel contratto IPC

**Fatto:**

- `packages/ipc-contract`: eventi main → renderer accanto ai metodi (`event(...)`, `listEvents`, tipi `Api` con `onX` e `Handlers` solo per i metodi); `createEventEmitter` nel main; `createApi(invoke, subscribe)` nel preload;
- `ErrorStore.onChange` in `app-log`; il main emette `errors:changed` (al massimo uno ogni 50 ms) e la Console ricarica `errors:list` solo a revisione più nuova: niente più polling;
- test: 237 unitari (emitter, iscrizioni, raggruppamento, instradamento dei rifiuti), E2E sulla forma di `window.api`, sul payload ricevuto e sulla finestra non fidata che non riceve eventi.

**Decisioni:** ADR 0007. Destinatari = finestre create dall'app con URL dell'app; il renderer non vede mai l'`IpcRendererEvent`; niente `MessagePort` per ora; chi emette flussi veloci raggruppa i dati.

**Problemi:** la revisione high ha trovato due possibili cicli (iscritto che lancia → segnalazione → nuovo evento; `targets()` che lancia dentro un timer) e un iscritto orfano: corretti con test.

---

## 2026-11-17 — Due corsie, Claude e Codex

**Fatto:**

- con l'abbonamento a Codex il lavoro si divide in due corsie parallele; nuovo file [`CORSIE.md`](CORSIE.md) con corsia, modello, effort e revisione per ogni fase, e l'ordine a onde;
- Opus 5.5 resta a sicurezza, contratti, bridge, scrittura di file dell'utente e audit; `gpt-6.1-sol` prende il lavoro già specificato; `gpt-6-luna` il meccanico; `gpt-6-astra` solo come seconda opinione di sicurezza (premessa dell'utente: Opus è più forte e costa meno);
- `AGENTS.md`, `.agents/` e `.codex/` committati; `CLAUDE.md` e `AGENTS.md` rimandano a `CORSIE.md`; `STATO.md` ha una sezione per corsia.

**Decisioni:**

- ogni agente lavora nel proprio worktree e modifica solo la propria sezione di `STATO.md`;
- nuova sotto-fase 4.0 (canale push nel contratto IPC), a Claude, perché 4.2, 4.3 e la Fase 6 ne dipendono e il contratto IPC non si delega;
- la 4.2 passa da medium a high perché tocca percorsi e pty.

**Problemi:**

- la `sessione-07` registrata non contiene `Notification` (vedi `STATO.md`): la 4.1 resta bloccata finché l'utente non la ripete.

---

## 2026-11-17 — Fixture `PostToolUseFailure` (`sessione-06`)

**Fatto:**

- registrata `sessione-06` nel progetto di prova con `claude -p` e Haiku: un `Read` di un file mancante, che genera l'hook `PostToolUseFailure`;
- l'hook è stato aggiunto a `.claude/settings.local.json` del progetto di prova, con un backup `.bak`;
- dopo la pulizia `check-raw.mjs` è verde; i file ripuliti sono stati riletti; c'è un nuovo snapshot della timeline (`tool.failed not-found`).

**Decisioni:** `Notification` resta all'utente: serve una sessione interattiva, e Claude non può rispondere alle richieste di permesso di un'altra sessione.

**Problemi:**

- `sanitize.mjs` e `check-raw.mjs` ignorano le sessioni che non hanno il file di stream. Una sessione interattiva ha solo gli hooks, quindi serve un `raw/<nome>.jsonl` vuoto (documentato nel README degli script).
- `packages/fixtures/raw/` è negato in lettura a Claude: i controlli si fanno con gli script.

---

## 2026-11-17 — Brief della Fase 4

**Fatto:** nuovo `FASE_4.md` con le regole della fase, i punti di partenza e le sotto-fasi 4.1 (hooks bridge e sessione Claude), 4.2 (workspace e terminale) e 4.3 (chat, permessi e cronologia), ognuna con branch, modello, effort e goal. `PIANO.md` lo richiama.

**Decisioni**

- La 4.1 parte solo dopo le fixture reali di `Notification` e `PostToolUseFailure`: i permessi e gli errori dei tool vanno provati su dati veri.
- Il metodo IPC per aprire file (frame della Console, link del terminale) nasce in 4.2, con i controlli di percorso del workspace.
- I flussi continui (pty, eventi della sessione) richiedono un canale push nel contratto IPC.

**Problemi:** una sessione parallela aveva già chiuso la Fase 3 (PR #29). Questo branch è stato riportato su `main` e tiene solo il brief.

---

## 2026-11-17 — Chiusura Fase 3

**Fatto**

- Fase 3 completata in tre PR: 3a shell sicura e IPC (#23, `985130d`, ADR 0004), 3b logger e Console Errori (#25, `2c64bf8`, ADR 0005), 3c design system in codice (#27, `1765186`, ADR 0006). Memoria registrata con #24, #26, #28.
- Risultato: `apps/desktop` con contextIsolation, sandbox, CSP, Fuses e blocco di navigazione verificati da test; `packages/ipc-contract` (6 metodi, zod, controllo del mittente); `packages/app-log` e Console Errori con stack sorgente; design system in codice, pannelli, palette, scorciatoie con ambiti di focus, temi e pagina componenti con test visivi. La checklist di `SICUREZZA.md` è tutta spuntata.
- In CI su `windows-latest`: 6 check verdi sulla PR #27, 46 E2E dell'app e 8 del pacchetto.
- `FASE_3.md` archiviato qui: le regole (niente subagent su IPC/processi/fs/CSP/Fuses/preload; ADR prima delle dipendenze di runtime; colori e durate solo dai token) restano in `CLAUDE.md` e `SICUREZZA.md`; i punti aperti sono in `PROSSIMI_PASSI.md`.

**Decisioni:** nessuna nuova rispetto alle voci delle tre sotto-fasi. Il goal complessivo di `PIANO.md` è soddisfatto così com'è.

**Problemi aperti**

- Revisione impeccable della 3c in un solo contesto (scelta di risparmio token), non con due subagent isolati.
- In locale i 12 test visivi falliscono (font diversi): le immagini di riferimento si rigenerano dall'artifact della CI.
- Font non inclusi nel pacchetto; `aria-live` del contatore errori e prova a finestra stretta da fare.

---

## 2026-11-17 — Fase 3c: design system in codice e interfaccia di base (PR #27, `1765186`)

**Fatto**

- Tailwind v4 come ponte dei token (`@theme inline`, niente preflight); `componenti.css` della 1c importato com'è; componenti React in `ui/primitives.tsx` (Button, Kbd, Tag, StateTag, Sigil, Switch, Check, TextInput, Field…) e sprite delle icone generato da `shell.js`.
- Shell a pannelli (`react-resizable-panels`, layout ricordato), barra attività con link `#/…`, barra di stato del design system, dock destro e dock inferiore (Problems = Console Errori), temi `system|dark|light` e densità.
- Command palette (`cmdk`, `Ctrl+K` e `Ctrl+Shift+P`), dialog `?` con tutte le scorciatoie, motore di scorciatoie puro con ambiti di focus (terminale, campi, Live, dialog), `Ctrl+1…7`.
- Pagina componenti (`#/components`, dalla palette) e test visivi con screenshot di riferimento in `ui.spec.ts-snapshots/` (6 sezioni × 2 temi).
- Test: 19 unitari nuovi (scorciatoie, tema), 17 E2E nuovi; `pnpm verify` verde (203 test), `pnpm e2e` 46 test verdi, `e2e:packaged` 8 verdi.

**Decisioni**

- ADR 0006: `react-resizable-panels` e `cmdk` (devDependencies del renderer); componenti.css non copiato; font non ancora inclusi nel pacchetto.
- Revisione impeccable in un solo contesto (nessun subagent, per la regola sul consumo): due problemi gravi trovati e corretti, cioè i dialog `aria-modal` senza trappola del focus (ora `useModalInert`) e l'`input` reale senza anello di focus (`.input:focus-within`). Aggiunti test per entrambi.

**Problemi**

- Gli screenshot generati in locale non coincidevano con `windows-latest` (1375 pixel, 4%): primo run CI rosso sui soli 2 test visivi. Rimedio: asserzioni `expect.soft` per far salvare alla CI tutti i 12 candidati, scaricati dall'artifact e committati come riferimento. In locale i test visivi ora falliscono (font diversi).
- La title bar personalizzata non c'è: la finestra usa la cornice nativa (la finestra senza cornice richiede lavoro nel main, da fare con la sicurezza della 3a in mente).

---

## 2026-11-17 — Fase 3b: logger, cattura errori e Console Errori (PR #25, `2c64bf8`)

**Fatto** (branch `feat/errors-console`, commit `faac590`)

- `packages/app-log`: logger JSONL ruotato (1 MiB × 5 file in `<userData>/logs`), parser degli stack V8 con frame `project`/`dependency`/`internal`, `ErrorStore` con raggruppamento e contatore, testo di "copia report". Tutto passa da `makeTextCleaner`/`redactSecrets`.
- Main: cattura di `uncaughtException`/`unhandledRejection`, `render-process-gone`/`child-process-gone`, errori del gate IPC (al posto di `console.warn`) e `superviseChild` per stderr e uscite dei processi figli. `stack-mapper.ts` riscrive i frame di `out/` con le source map.
- IPC: namespace `errors` con `list`, `reportRenderer`, `copyReport`, `clear`. Renderer: `window.onerror`, `unhandledrejection`, Error Boundary, barra di stato con contatore e pannello Console (frame del progetto in evidenza, dipendenze collassate, copia report, svuota).
- Test: 13 unit su `app-log`, 5 sul mapper, 1 sul contratto; `errors.spec.ts` (10 E2E: main, renderer, figlio, righe esatte dei sorgenti, segreti, log, appunti) e `build.spec.ts` sul pacchetto. `verify` 184 test; E2E app 29/29; packaged 8/8.

**Decisioni:** ADR 0005. Logger scritto in casa invece di pino; niente canale push (la Console interroga ogni secondo); fault injector solo con `--mode e2e` (alias di build nel main, `define` nel renderer); source map incluse nel pacchetto.

**Problemi:** `process.setSourceMapsEnabled` non rimappa lo stack nel main di Electron; lo stderr dei figli ha `
` e codici ANSI (Playwright forza i colori); il test dell'asar manomesso usava il vecchio prefisso `[ipc] `; `sourcesContent` delle mappe contiene anche codice eliminato dal bundle. Vedi `PROBLEMI_NOTI.md`.

---

## 2026-11-17 — Merge della sotto-fase 3a

**Fatto:** PR #23 unita su `main` (`985130d`, squash) con tutti i check verdi: Verify su Windows (compresi gli E2E `_electron` e i Fuses del pacchetto), gitleaks, commitlint, memoria.

**Decisioni:** nessun auto-merge di GitHub: senza protezione di `main` non è garantito che aspetti i check. Il merge si fa a mano dopo aver letto i check.

**Problemi:** nessuno.

---

## 2026-11-17 — Fase 3a: shell Electron sicura e IPC

**Fatto** (branch `feat/desktop-shell`)

- `apps/desktop` con electron-vite, Electron 45.3.3 e React 19. Il renderer di produzione è servito da `app://control-center/` con CSP sia in header sia in `<meta>`.
- `packages/ipc-contract`: metodi zod `.strict()`, gate nel main (mittente → richiesta → handler → risposta, con envelope) e `window.api` generato e congelato. ESLint vieta l'IPC grezzo fuori dai due file ponte.
- Hardening: `secureWebPreferences`, `app.enableSandbox()`, navigazione e nuove finestre bloccate, link `https:` al browser di sistema, permessi web negati, istanza singola.
- Fuses tramite `electronFuses` di electron-builder.
- Test: 165 unitari; 19 E2E `_electron` (sicurezza e modalità sviluppo); 6 sul pacchetto (fuse wire, `ELECTRON_RUN_AS_NODE`, `--inspect`, `NODE_OPTIONS`, ASAR manomesso con prova di controllo).
- In CI: `scripts/check-electron-support.mjs`, `pnpm e2e` ed `e2e:packaged` nel job Windows. Checklist Electron di `SICUREZZA.md` tutta spuntata.
- Dipendenze solo di sviluppo e build: `@electron/fuses`, `@playwright/test` (nel pacchetto desktop), `vite`, `@vitejs/plugin-react`.

**Decisioni:** ADR 0004. Le dipendenze dell'app sono tutte `devDependencies` messe in bundle, quindi il pacchetto non ha `node_modules`. Gli E2E girano sulla build non impacchettata, perché il fuse dell'inspector impedisce a Playwright di collegarsi al pacchetto.

**Problemi:** dentro `page.evaluate` DevTools permette `eval` (le prove CSP girano in un timer). `electron-vite dev --rendererOnly` avvia comunque Electron, quindi il test di sviluppo usa `createServer` di Vite. `getLastWebPreferences` manca nei tipi di Electron 45. electron-builder non legge `electron-builder.config.ts` senza `--config`. `@peculiar/utils` usa `tslib` senza dichiararlo. Il test ha scoperto che una cartella passava come asset di `app://`: corretto. In CI il test dei permessi falliva perché il runner non ha camera né microfono (`NotFoundError`): ora Electron parte con dispositivi finti. Dopo la correzione E2E e Fuses sono verdi su GitHub (PR #23).

---

## 2026-11-14 — Revisione di modelli ed effort per il consumo di token

**Fatto:** rivista la tabella "Modello, effort, ultracode e goal" di `PIANO.md` per le Fasi 3-10, dopo un forte aumento dell'uso di token. Aggiornati di conseguenza `FASE_3.md` e `STATO.md`.

**Decisioni**

- Sonnet 5.5 è il modello di default. Opus 5.5 resta solo per sicurezza e architettura nuova: 3a, 4.1 (bridge), 5a, 5b, il bridge della Fase 7 e l'audit della Fase 10.
- `high` è il tetto normale dell'effort; `xhigh` e `max` solo per un problema bloccato.
- Niente ultracode nelle Fasi 5 e 6.
- La Fase 4 è divisa in tre sotto-goal (4.1 bridge e sessione, 4.2 workspace e terminale, 4.3 chat e permessi).
- `/code-review` `medium` di default, `high` solo sulle PR di sicurezza.
- Regole di risparmio: una sessione per sotto-goal, verifiche a testo prima degli screenshot, a inizio sessione si leggono solo `STATO.md` e `FASE_<n>.md`, il lavoro meccanico va a OmniRoute.

**Problemi:** le cause dell'aumento erano Opus usato quasi ovunque, `xhigh` su fasi intere dentro i loop `/goal`, un goal unico per la Fase 4, l'ultracode previsto e le verifiche fatte con molti screenshot (55 nella 1c).

---

## 2026-11-14 — Chiusura Fase 2

**Fatto**

- PR #20 unita su `main` (`689ce2c`, squash) con i check verdi: verify su Windows (110 test, `sanitize.mjs --check` pulito su 11 file), gitleaks su tutta la cronologia, commitlint, controllo memoria.
- Fase 2 completa: 5 sessioni reali registrate (PR #16) e ripulite, `AgentEvent` con 16 tipi, normalizzatori per stream, hooks e Ollama, merge e pulizia controllata in CI (PR #20, ADR 0003).
- Preparata la Fase 3 senza iniziarla: brief `FASE_3.md` con le sotto-fasi 3a (shell e IPC), 3b (Console Errori) e 3c (design system in codice), ciascuna con branch proposto e goal.

**Decisioni:** la Fase 3 si fa a tre sotto-goal, come prevede `PIANO.md` per le fasi lunghe; il goal complessivo resta e ne è l'unione. Il facoltativo `Notification` passa a "prima della F4", dove servono le richieste di permesso.

**Problemi:** restano le fixture reali mancanti per `Notification` e `PostToolUseFailure`.

---

## 2026-11-14 — Fase 2: schema AgentEvent, normalizzatori e fixture ripulite

**Fatto** (branch `feat/event-schema`, `eddb07f`, `b9b7f8e`)

- `AgentEvent` in zod: 16 tipi stretti con envelope comune, percorsi relativi al workspace, `redactSecrets` e `makeTextCleaner` su ogni testo.
- Normalizzatori puri per stream-json, hooks e Ollama `/api/chat`, più `mergeClaudeSession`, che prende il contenuto dallo stream e i tempi dagli hooks.
- `scripts/fixtures/sanitize.mjs`:
  - pulizia ad allowlist: i contenuti dei file diventano righe `<redacted>` e i conteggi restano;
  - `--check`: nel grezzo trova più di mille problemi, nel ripulito zero;
  - gira in CI e in Vitest.
- 5 sessioni ripulite in `packages/fixtures/sanitized/`, rilette a mano: dall'`init` sono stati tolti i tool e i server MCP dell'account. 110 test verdi in `pnpm verify`.

**Decisioni:** ADR 0003. `schemaVersion` resta 1 perché nessun evento è ancora salvato. I test che leggono file stanno in `packages/fixtures`, così `event-schema` resta senza tipi Node. Un `Read` di un file mancante e un comando con test falliti diventano `tool.failed` (`not-found`, `tests-failing`).

**Problemi:** il test ha trovato un ordine sbagliato delle sostituzioni (un nome host che contiene il nome utente restava a metà), corretto ordinando dalla più lunga. Mancano fixture reali di `Notification` e `PostToolUseFailure`. gitleaks non è installato in locale.

---

## 2026-11-14 — Chiusura Fase 1

**Fatto**

- PR #18 (1d) unita su `main` (`dbaf4d4`, squash) con i 6 check verdi; insieme le regole `permissions.deny` di `.claude/settings.json`.
- Fase 1 completa: ricerca UX (PR #10), direzione `precisione fluida` (PR #12), design system e 18 schermate (PR #14), prototipo Live sulle fixture reali (PR #18). Decisioni chiuse: direzione `precisione fluida`, densità `compact`, nome **Vernier** con ripiego su Control Center, notifiche di Windows che non approvano mai.
- `FASE_1.md` archiviato qui: i vincoli (stati, accessibilità AA, 500 nodi a 60 fps, lingue) sono in `DESIGN.md`; la procedura di registrazione delle fixture è passata in `scripts/fixtures/README.md`; i controlli sul nome Vernier per la F10 in `PROSSIMI_PASSI.md`.

**Decisioni:** il merge si fa a mano a CI verde, perché l'auto-merge di GitHub non è disponibile su questa repo.

**Problemi:** CodeRabbit non ha revisionato la PR #18 (limite del piano gratuito).

---

## 2026-11-14 — Fase 1d: prototipo in codice della Vista Live

**Fatto** (branch `feat/live-prototype`)

- `design/prototipo-live/`: pacchetto del workspace solo per sviluppo (Vite, React 19, React Flow 12, elkjs) che riproduce le 5 fixture reali con mappa a contenitori (ELK), chip degli agenti agganciate ai nodi, timeline con corsie, forcella del subagent e scrubber, colonna `Agents`. Usa `tokens.css`, `componenti.css` e lo sprite di `shell.js` della 1c.
- Normalizzatore `stream-json + hooks → Replay` e `viewAt(replay, t)` puri, con 13 test unitari su una registrazione sintetica.
- 11 test Playwright: screenshot di reading, writing, running, error (×2), waiting, done (scuro e chiaro), più scrubbing, `Space` e movimento ridotto. Console pulita.
- Revisione impeccable: nessun grave, 16/20 (`design/prototipo-live/REVISIONE.md`).

**Decisioni:** le fixture grezze si normalizzano al volo nel dev server e non si scrive nulla di derivato; i test Playwright girano solo in locale. Un op resta attivo almeno 900 ms per essere visibile a 1×; il permesso negato da `claude -p` è mostrato come attesa simulata di 6 s, segnalata. Dipendenze solo di sviluppo e dentro il prototipo: nessuna ADR.

**Problemi:** React Flow non misura i nodi controllati senza `onNodesChange` (risolto passando le misure di ELK); Playwright 1.65 vuole un Chromium più nuovo di quello installato. Entrambi in `PROBLEMI_NOTI.md`. Un test ha trovato che l'etichetta d'errore troncata perdeva il motivo: ora il motivo resta sempre.

---

## 2026-11-14 — F2 anticipata: registrazione delle prime 5 fixture

**Fatto** (branch `feat/fixtures-recording`)

- `scripts/fixtures/capture-hook.mjs`: hook che salva ogni payload in `packages/fixtures/raw/<sessione>.hooks.jsonl`; nome di sessione validato, link simbolici rifiutati, esce sempre 0.
- `scripts/fixtures/check-raw.mjs`: valida le righe JSON e la copertura delle registrazioni.
- Progetto di prova `vernier-fixture-lab` fuori dalla repo, con hooks e permessi solo in `.claude/settings.local.json` (nessuna modifica a `~/.claude`).
- 5 sessioni registrate con Sonnet: rinomina su più file, test rotto e corretto, subagent, permesso negato (`npx tsc`), file mancante.

**Decisioni:** il progetto di prova è in JS con `node --test` invece che TS, per non installare dipendenze; il payload degli hooks è avvolto in `{capturedAt, payload}` perché gli hooks non hanno un orario.

**Problemi:** su Windows Claude ha usato il tool `PowerShell` per il comando negato, non `Bash`: lo schema della F2 deve trattarli entrambi come shell. In `-p` non c'è la richiesta interattiva di permesso, quindi manca l'evento `Notification`. Prima del push ho tolto dalla memoria il percorso personale del progetto di prova (vietato dal modello di PR).

**Merge:** PR #16 unita su `main` il 2026-11-14 (`e111c0a`), con i 6 check verdi. CodeRabbit non ha revisionato: limite del piano gratuito raggiunto.

---

## 2026-11-14 — Fase 1c (seconda parte): schermate P1, screenshot e revisione impeccable

**Fatto** (branch `feat/design-1c`, commit da `55c5e54` in poi)

- Le **9 schermate P1** con tutti gli stati: onboarding, replay, infra, local-agents, mcp-skills, settings, terminal, workspace, notifiche.
- `design/sistema/README.md` con le P1 e 55 screenshot WebP in `design/sistema/screenshot/`.
- **Revisione impeccable** (audit):
  - rilevatore su tutte le pagine: 0 errori;
  - scansione del contrasto su ogni pagina × stato × tema, anche del testo attenuato;
  - unico grave: il sigillo `CL` sul fondo dell'attesa (1,45:1 nel tema scuro, 2,85:1 nel chiaro), corretto con `.perm-h .sig { color: var(--on-waiting) }`;
  - rigenerato `componenti-dark.webp`, ora a pagina intera.

**Decisioni** (dell'utente, prese in anticipo per non bloccare la sessione)

- Nome **Vernier**, con ripiego su Control Center dove le collisioni creano problemi.
- La notifica di Windows non approva mai un permesso.
- I gravi della revisione si correggono subito se non toccano scelte di design.

**Problemi:** nessuno. Gli avvisi del rilevatore (11 px, Instrument Sans, barra indeterminata, righe di `reading`) sono scelte del design system.

**Merge:** PR #14 unita su `main` il 2026-11-14 (`93a8677`), con i 6 check verdi. CodeRabbit (piano gratuito) ha lasciato solo il riepilogo, senza osservazioni.

---

## 2026-11-14 — Fase 1c (prima parte): token, componenti e schermate P0

**Fatto** (branch `feat/design-1c`, commit da `2f76dc2` a `05ec3f8`, solo in locale)

- `design/tokens.json` in formato DTCG e `scripts/build-tokens.mjs`, che genera `design/sistema/tokens.css` e ha l'opzione `--check`.
- `componenti.css`, che usa solo token, e `shell.js`, il guscio comune con icone e parametri URL.
- `componenti.html` con tutti i componenti e i loro stati.
- Le **9 schermate P0** in `design/sistema/schermate/`, con 49 stati in totale. Sono generate da dati JS e controllate con playwright-core e Chromium 1248: nessun errore di console e nessun testo sotto 11 px.
- `design/sistema/README.md` con l'elenco delle pagine e la verifica dei flussi F1-F7.
- ESLint ha ora i globals del browser per `design/**/*.js`.

**Decisioni**

- Chiusi i minori: running va verso il verde-giallo, locale verso il ciano, reading un po' più blu (valori in `DESIGN.md`); l'errore in timeline porta il bersaglio; la timeline `normal` ha Read ×4 + Grep ×2.
- Nuovi token: scala di spaziatura e cicli.
- Gli scheletri restano fermi, senza shimmer.
- Le schermate P0 riusano il guscio della Live con varianti (dock, overlay, area centrale).
- Verifica di **Vernier**:
  - marchi `VERNIER…` di Vernier Software & Technology in classe 9;
  - il pacchetto npm `vernier` esiste già (giugno 2026) ed è un tool di feedback UI per agenti AI;
  - `vernier.com` e `vernier.dev` sono in uso.

  La decisione spetta all'utente.

**Problemi**

- La generazione di file molto grandi in un colpo solo si è bloccata. Ora i file si scrivono a pezzi.
- Non ho controllato il WHOIS dei domini, solo il DNS.

## 2026-11-14 — Fase 1b: scelta della direzione, `precisione fluida`

**Fatto**

- Nuova cartella `design/direzioni/precisione-fluida/` con `live.html`, `README.md` e 4 screenshot. È la sintesi scelta, ottenuta da una copia di `precisione` con:
  - uno strato CSS in coda;
  - collegamenti e timeline arrotondati nello script;
  - gli innesti: sigle di canale e telemetria da `sala-controllo`, legenda e titolo display del dialog da `carta-inchiostro`.
- Applicate nel mockup le correzioni trasversali della revisione: minimo 11 px, mono condensato solo in mappa, `Approve` a contorno, corsie della timeline che si alzano per le chiamate parallele, Fit vero.
- Nessun errore di console in 7 combinazioni (Chromium headless).
- Aggiornati `CONFRONTO.md` (decisione), `DESIGN.md`, `FASE_1.md` (1b ✅), `STATO.md` e `PROSSIMI_PASSI.md`.
- PR #12 revisionata dall'utente e unita su `main` con squash, CI verde (6/6).

**Decisioni** (con l'utente)

- Direzione: `precisione` con gli innesti raccomandati, **più fluida e con meno spigoli**. Grado "morbido": raggi 4 / 6 / 10 px più le pillole, nessun raggio oltre 10 px.
- Densità predefinita `compact`; nome candidato per la 1c: **Vernier**.
- L'attesa respira (1.6 s) invece di lampeggiare a scatti; resta l'unico impulso continuo.

**Problemi**

- Nessuno aperto. Nello scenario dense la colonna Agents non conteneva tutto: ora le card scorrono tra la telemetria e i file modificati, e sfumano quando non entrano.

---

## 2026-11-14 — Cambio di piano: via Figma, regole sui subagent

**Decisioni** (con l'utente)

- **Figma tolto dal piano.** Con il server MCP ogni schermata richiede molte chiamate e screenshot per verificare il risultato, e poi va ricostruita in codice. Qui non c'è un designer che lavora a mano, le direzioni della 1b sono già HTML e il movimento si valuta solo nel prototipo in codice della 1d. La 1c diventa: `design/tokens.json`, token CSS, pagina componenti e schermate P0 e P1 in HTML statico in `design/sistema/`, screenshot e revisione impeccable. Niente prototipo cliccabile: i flussi si verificano sulla sequenza delle schermate. Aggiornati `PIANO.md`, `FASE_1.md`, `STATO.md`, `PROSSIMI_PASSI.md`, `DESIGN.md`, `CLAUDE.md`, la skill `inizio-sessione` e i rimandi in `design/`.
- **Subagent solo se necessari** (regola globale in `~/.claude/CLAUDE.md`, backup fatto): si lanciano solo se sono necessari, migliorano il lavoro e fanno risparmiare token sull'intero task; mai Opus, solo haiku o sonnet; niente `fork`.

---

## 2026-11-14 — Fase 1b: tre direzioni estetiche, revisione e confronto

**Fatto**

- 13/11 (`ad5192a`): `design/direzioni/BRIEF.md` e tre direzioni con workflow ultracode: `precisione`, `sala-controllo` e `carta-inchiostro`, ciascuna con `live.html` e `README.md`. La revisione si era interrotta al limite delle 5 ore.
- 14/11 (`a03783f`), senza ultracode:
  - revisione impeccable con un solo subagent → `REVISIONE.md`: un grave (controlli finestra di `sala-controllo`), corretto;
  - 12 screenshot senza errori di console;
  - `CONFRONTO.md` con raccomandazione e domande all'utente.
- `DESIGN.md` e `FASE_1.md` aggiornati. `pnpm verify` verde. Branch pushato e PR aperta.

**Decisioni**

- Con l'utente: `reading` fa un solo impulso per evento. L'unico impulso continuo è il segmento d'attesa nella barra di stato, non il blocco in timeline (risolta la contraddizione del BRIEF).
- I problemi medi e minori non si correggono nei mockup: diventano regole dei token della 1c, tra cui il minimo di 11 px e le corsie della timeline che si allargano.
- Raccomandazione, da confermare: `precisione` con innesti dalle altre due, densità `compact`.

**Problemi**

- Il server MCP Playwright non funziona ancora. Gli screenshot si fanno con `playwright-core` dalla cache npx e Chromium 1248 (`PROBLEMI_NOTI.md`).

---

## 2026-11-13 — Fase 1a: ricerca UX e architettura dell'informazione

**Fatto**

- Su `feat/design-1a`, in `design/ricerca/`:
  - `persona.md`: Dev quotidiano, Di passaggio, anti-persona, 6 scenari;
  - `domande-chiave.md`: punto dello schermo, stati e dati per ognuna delle 5 domande; test dei 2 secondi;
  - `architettura.md`: finestra, sezioni, dock, layout della Live, barra di stato a priorità, palette con prefissi, scorciatoie per ambito, notifiche, flussi F1-F7 e S1-S5;
  - `schermate.md`: schermate × 6 stati con priorità P0/P1/P2, casi d'errore, onboarding in 3 passi.
- `DESIGN.md` con il riassunto e l'architettura aggiornata; `GLOSSARIO.md` con 5 nuovi termini; `FASE_1.md` con la 1a segnata ✅. `pnpm verify` verde.
- PR #10 revisionata dall'utente e unita su `main` con squash, con la CI verde. Una PR successiva ha allineato STATO e PROSSIMI_PASSI al merge.

**Decisioni**

- Per la 5ª domanda vale la versione di `DESIGN.md` ("…e quanto in locale"), non quella di `PIANO.md` §4.1.
- Proposta, da confermare in 1b: densità compatta "da IDE" di default, con l'opzione `Comfortable`.
- Il dialog dei permessi vive nel dock Session, non è modale sull'app; `Enter` da solo non approva e `Esc` non rifiuta.
- `PROSSIMI_PASSI.md` tiene le voci fatte segnate con ✅ fino alla chiusura della fase, su richiesta dell'utente.

**Problemi**

- Nessuno.

---

## 2026-11-13 — Passaggio alla Fase 1

**Fatto**

- Scritto il brief operativo `FASE_1.md`: prerequisiti, sotto-fasi 1a-1d con modello, effort e goal, registrazione delle fixture, vincoli e decisioni aperte. Collegato da STATO, PROSSIMI_PASSI e CLAUDE.md.
- Corretta un'incoerenza in `PIANO.md`: l'ultracode della Fase 1 è per la 1b (tre direzioni in parallelo), non per la 1c.

**Decisioni**

- Ogni fase lunga avrà un file `FASE_<n>.md` di passaggio, archiviato in STORIA a fine fase.
- La Fase 1 si fa in una nuova sessione, partendo da `inizio-sessione`.

---

## 2026-11-13 — Chiusura Fase 0

**Fatto**

- PR #6: aggiornate tutte le GitHub Actions (checkout v7, setup-node v7, pnpm/action-setup v6, release-please v5) e raggruppati gli aggiornamenti futuri di Dependabot per le Actions. Le PR Dependabot #1, #2, #3 e #5 sono state chiuse perché superate; la #4 (gitleaks-action) era già chiusa.
- PR #7 di prova: un errore di tipo voluto fa fallire "Verify (Windows)" con TS2322. Chiusa senza merge. **DoD della Fase 0 raggiunto.**

**Decisioni**

- Da qui in avanti anche la memoria si aggiorna tramite PR.

---

## 2026-11-13 — Repo su GitHub e prima CI

**Fatto**

- `PIANO.md` spostato in `docs/memoria/` (commit `fd39a80`).
- Creata la repo GitHub privata `control-center` e pushato `main`.
- Primo run della CI: Verify (Windows) verde, release-please ok, Dependabot attivo; gitleaks fallito per un difetto dell'action, non per segreti trovati.
- Gitleaks in CI sostituito con la CLI 8.24.3 su tutta la cronologia.

**Decisioni**

- Senza protezione dei branch (non disponibile nel piano gratuito per le repo private), la regola "solo PR con CI verde" è affidata alla disciplina fino alla pubblicazione.

**Problemi**

- `gitleaks-action@v2` e protezione dei branch: vedi `PROBLEMI_NOTI.md`.

---

## 2026-11-13 — Nascita del progetto e Fase 0

**Fatto**

- Brief iniziale rivisto: lo scope era troppo ampio per un progetto personale, quindi è diviso in fasi, ognuna utilizzabile da sola.
- Piano completo approvato (`PIANO.md`): Fasi 0-10 più 4b (Git e checkpoint) e 5e (errori live). Per ogni fase sono indicati modello, effort, ultracode e goal.
- Repo creata in `Desktop\control-center` con monorepo pnpm, tooling, CI, documenti open source, memoria di progetto e skill di sessione.

**Decisioni**

- Uso personale ora, open source dopo (MIT): repo "pubblicabile" fin dal primo commit.
- Solo Windows fino alla v1.
- La Vista Live è il cuore del progetto ed è obbligatoria.
- Agenti locali Ollama obbligatori e anticipati alla Fase 7, per consumare meno l'abbonamento Claude.
- Un solo runtime: Node/TypeScript, senza microservizio Python.
- Design prima del codice, validato su sessioni registrate (fixture).
- Lingue: codice e documenti pubblici in inglese, memoria in italiano.

**Problemi**

- typescript-eslint 8.72 non supporta TypeScript 7: fissato TypeScript 6 (vedi `PROBLEMI_NOTI.md`).
- Node 26 non include corepack: pnpm si usa via `npx pnpm@10.34.9`.
