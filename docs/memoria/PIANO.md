# Piano — Local AI Control Center (app desktop)

## Context

Vuoi un'app desktop personale (Electron) che faccia da centro di controllo per lo sviluppo con l'AI. Deve mostrare in tempo reale cosa fanno gli agenti (Claude Code e modelli locali Ollama) sulla mappa del progetto, insieme all'infrastruttura locale (Docker, porte, GPU), agli MCP e alle skill.

Le tue risposte hanno fissato questi vincoli:

- **Uso personale ora, pronto per l'open source su GitHub dopo.** La repo nasce "pubblicabile": licenza, niente segreti nella cronologia, configurazione generica, ogni utente usa il proprio `claude login`.
- **Solo Windows** nelle prime versioni (CI su `windows-latest`); macOS/Linux dopo la v1.
- **La Vista Live è obbligatoria** ed è il cuore del progetto: riceve il maggior investimento di design e sviluppo.
- **Gli agenti locali Ollama vanno introdotti di sicuro**, per spostare in locale il lavoro ripetitivo invece di consumare ogni volta l'abbonamento Claude. Diventano una fase obbligatoria, con un modo per misurare quanto si risparmia.

Questo è il piano approvato. In fondo al file c'è l'appendice con i dettagli operativi della prima stesura (task, DoD e rischi per fase): dove i due testi non coincidono vale il piano.

## Principi

1. Ogni fase produce qualcosa che si usa davvero.
2. Il design viene prima del codice, ma si prova su dati veri. Registriamo sessioni reali di Claude Code (stream-json + hooks) e le usiamo come _fixture_ per progettare, sviluppare e testare la Vista Live senza far girare agenti.
3. Intuitiva in superficie, profonda per un developer. Ogni cosa ha una vista "umana" e una vista "raw" (JSON, comando, log); ogni azione è raggiungibile dalla command palette (Ctrl+K).
4. Locale e privata di default: nessuna telemetria verso l'esterno.
5. Un solo runtime: Node/TypeScript.
6. Un'architettura a registri, in cui pannelli, normalizzatori di eventi, regole per framework e grammatiche si aggiungono come moduli.

## Stack

- **Struttura e build:** monorepo pnpm, electron-vite, electron-builder + electron-updater.
- **Interfaccia:** React 19, TypeScript strict, Tailwind v4, Radix/shadcn, Lucide, Motion.
- **Componenti specialistici:** @xyflow/react + elkjs (layout nel worker), xterm.js + node-pty, CodeMirror 6, web-tree-sitter.
- **Stato, dati e test:** Zustand, zod su ogni confine, JSONL per gli eventi, Vitest e Playwright `_electron`.

Struttura delle cartelle:

- `apps/desktop/src/{main,preload,renderer}`, `apps/desktop/e2e`
- `packages/{event-schema, ipc-contract, hooks-bridge, mcp-bridge, ollama-client, fixtures}`
- `docs/adr`, `design/`, `.github/`

## Fasi

Ogni fase ha deliverable, task e criterio di completamento (DoD). I dettagli completi sono nell'appendice in fondo; qui sotto ci sono le scelte e le modifiche.

| #   | Fase                                                                            | Dimensione |
| --- | ------------------------------------------------------------------------------- | ---------- |
| 0   | Repo, tooling, CI, igiene open source                                           | S          |
| 1   | UX e design system (token + HTML), prototipo della Vista Live                   | L          |
| 2   | Registrazione sessioni e schema `AgentEvent`                                    | S          |
| 3   | Shell Electron sicura, layout, design system in codice                          | M          |
| 4   | Workspace, terminale, sessione Claude Code, permessi, timeline base             | L          |
| 5   | **Vista Live** (modello progetto → mappa → timeline e replay → pannello agenti) | XL         |
| 6   | Monitor infrastruttura: Docker, porte, GPU/Ollama                               | M          |
| 7   | **Agenti locali Ollama e ponte MCP** (anticipata, obbligatoria)                 | L          |
| 8   | MCP e Skills: registry, toggle per sessione, editor                             | M          |
| 9   | Telemetria locale, risparmio Ollama compreso                                    | S          |
| 10  | Packaging Windows, auto-update, rilascio open source                            | M          |

### Fase 0 — Repo

- `git init`, repo GitHub privata (pubblica più avanti), `main` protetto.
- TypeScript strict, ESLint (con regole di sicurezza) + Prettier, lint-staged, commitlint, release-please.
- CI con GitHub Actions su `windows-latest`: typecheck → lint → unit → build → E2E. Dependabot, `pnpm audit`, secret scanning.
- `CLAUDE.md` di progetto e ADR 0001 sullo stack.
- **Igiene open source fin dal giorno 1:** `LICENSE` (MIT proposta), README, CONTRIBUTING, SECURITY.md, CODE_OF_CONDUCT, `.gitignore` per dati e fixture grezze, gitleaks in pre-commit e in CI. Così la repo si potrà rendere pubblica senza dover riscrivere la cronologia.

### Fase 1 — UX e design (prima del codice)

- **Strumenti:**
  - /frontend-design per la direzione estetica (2-3 proposte, tu scegli);
  - token e pagine HTML statiche per componenti e schermate in alta fedeltà (Figma tolto il 2026-11-14: troppi token per un passaggio intermedio);
  - impeccable per la critica;
  - Playwright sul prototipo in codice.
- **Domande a cui l'app deve rispondere in meno di 2 secondi:**
  - cosa fa l'agente adesso;
  - quali file ha toccato e cosa ha cambiato;
  - se aspetta me o se ha sbagliato;
  - cosa gira sulla macchina;
  - quanto ho consumato, e quanto è stato fatto in locale.
- **Architettura dell'informazione:**
  - barra workspace e sezioni (Live, Infra, Agenti locali, MCP & Skills, Telemetria);
  - area centrale;
  - chat agganciabile a destra;
  - terminale e log in basso;
  - barra di stato sempre visibile (sessione, agenti attivi, VRAM, token);
  - command palette.
- **Design system:**
  - token in `design/tokens.json`, poi tema Tailwind;
  - tema scuro principale e tema chiaro, contrasto AA;
  - font mono con cifre tabulari per i contatori;
  - stati semantici unici in tutta l'app: idle, reading, writing, running, waiting-user, error, done (mai indicati solo dal colore);
  - identità stabile per ogni agente (colore + glifo): Claude, subagent Claude, agente Ollama. **Gli agenti locali si distinguono a colpo d'occhio da quelli cloud.**
- **Specifica della Vista Live**, il pezzo con più investimento:
  - **Mappa:**
    - cartelle e file collegati dagli import;
    - zoom semantico;
    - di default solo i file toccati e i loro vicini;
    - agenti come presenze agganciate ai nodi, con archi animati diversi per lettura e scrittura;
    - "Segui agente";
    - anteprima del diff al passaggio del mouse;
    - nodi temporanei per servizi e MCP;
    - minimappa con heatmap.
  - **Timeline:** swimlane per agente, con corsie figlie per subagent e agenti Ollama, e uno scrubber di replay che funziona anche sulle sessioni passate.
  - **Pannello agenti:** card con modello, compito, tool, token, tok/s, interrompi.
  - **Movimento:** comunica stato, non decora; durate di 150-300 ms; rispetta `prefers-reduced-motion`; eventi accorpati per frame.
- **Stati da disegnare:** vuoto, caricamento, denso, errore (Claude non autenticato, Docker o Ollama assenti), onboarding in 3 passi.
- **DoD:** schermate in alta fedeltà con tutti gli stati, token esportati, prototipo in codice della Vista Live che gira su una sessione registrata, revisione impeccable pulita, **revisione insieme a te**.

### Fase 2 — Schema eventi

- **Fixture:** 5-10 sessioni reali registrate, catturando stream-json e hooks (`PreToolUse`, `PostToolUse`, `SubagentStop`, `Notification`, `Stop`).
- **`AgentEvent` (zod):**
  - sessione;
  - messaggi;
  - `tool.called/completed/failed`;
  - `file.read/written`;
  - `agent.spawned/finished` con `provider: claude | ollama`;
  - `mcp.called`;
  - `permission.*`;
  - `usage.updated`.
- **Normalizzatori** per Claude, hooks e Ollama.
- **Script di pulizia** delle fixture (segreti, nome utente, percorsi), controllato in CI. Fondamentale per l'open source.

### Fase 3 — Shell sicura

- **Isolamento:** `contextIsolation`, `sandbox`, niente `nodeIntegration`, CSP, navigazione e `window.open` bloccati, Electron Fuses.
- **IPC:** preload minimo, IPC tipizzato e validato con controllo del mittente, nessun canale "esegui comando" generico.
- **Interfaccia:** layout a pannelli, command palette, scorciatoie, temi, pagina interna con tutti i componenti (usata anche per i test visivi).

### Fase 4 — Prima versione usabile

- **Workspace:** recenti, cambio rapido, ogni percorso verificato dentro il workspace.
- **Terminale:** PowerShell/bash con più schede (node-pty ricompilato per Electron).
- **Sessione Claude:**
  - `claude -p --input-format stream-json --output-format stream-json`, con `--resume`;
  - **hooks bridge** che manda gli eventi all'app via named pipe di Windows con token per sessione, senza porte TCP;
  - richieste di permesso chiare (Approva / Rifiuta / Sempre in questa sessione);
  - cronologia in JSONL.
- **DoD:** una giornata di lavoro fatta dall'app; E2E con un finto eseguibile `claude` che riproduce le fixture.

### Fase 5 — Vista Live (obbligatoria, in 4 rilasci)

- **5a. Modello del progetto:**
  - scansione nel worker (rispetta `.gitignore`);
  - import con web-tree-sitter (TS/JS, Python, Go, Rust);
  - ruoli per framework come plugin;
  - watcher incrementale.
- **5b. Mappa:** nodi personalizzati, elkjs nel worker, stati collegati al bus eventi, Segui agente, anteprima diff, heatmap.
- **5c. Timeline e replay:** lo stato si ricostruisce dagli eventi in qualsiasi istante; le sessioni passate si aprono in sola lettura.
- **5d. Pannello agenti e ispettore** (vista umana + JSON).
- **Budget misurati in CI:** 60 fps con 500 nodi e 20 eventi/s; apertura in meno di 2 s su un progetto da 5.000 file.
- **DoD:** riproducendo una sessione, si risponde alle domande della Fase 1 senza leggere la chat.

### Fase 6 — Infrastruttura

- **Docker:** dockerode su `//./pipe/docker_engine`, in sola lettura per default; le azioni chiedono conferma.
- **Porte:** `Get-NetTCPConnection`, solo locali, con avviso per quelle esposte su `0.0.0.0`.
- **GPU:** `nvidia-smi`.
- **Ollama:** `/api/ps`, carica/scarica i modelli con `keep_alive`.
- **Assenze gestite:** tutto funziona anche senza Docker, GPU o Ollama.

### Fase 7 — Agenti locali Ollama (anticipata e obbligatoria)

**Obiettivo:** spostare in locale il lavoro ripetitivo per non consumare ogni volta l'abbonamento Claude.

- **`packages/ollama-client`:** streaming, annullamento, conteggio token e tok/s (`eval_count`/`eval_duration`).
- **`packages/mcp-bridge`:**
  - server MCP stdio con `delegate_to_local_agent(task, files, model)` e `list_local_models`;
  - registrato nella sessione Claude;
  - manda gli eventi all'app sulla stessa pipe autenticata, così gli agenti locali compaiono nella Vista Live con la loro identità visiva.
- **Politica di instradamento** (cosa va in locale):
  - una skill/istruzione di progetto (`.claude/skills/delegate-local`) che dice a Claude quando delegare: riassunto di log, ricerca e classificazione nel codice, bozze di test, documentazione, spiegazioni di file singoli;
  - in più, **comandi rapidi diretti** dall'app (es. "riassumi questo log", "scrivi bozza test per questo file") che vanno a Ollama **senza passare da Claude**: questo è il risparmio più netto.
- **Qualità:**
  - il risultato locale torna a Claude come bozza;
  - gli agenti locali non scrivono file: propongono un diff che approvi tu o Claude;
  - i tool MCP condivisi con i modelli locali passano solo da una allowlist.
- **Modelli:** scelta del modello per tipo di compito nelle impostazioni (il coder più recente disponibile su Ollama), avviso se il modello non entra in VRAM.
- **Onestà sul risparmio:** con un abbonamento Pro/Max non si risparmiano soldi a chiamata, ma si consumano meno i limiti d'uso. La Fase 9 lo misura.

### Fase 8 — MCP e Skills

- **Registry:** legge `.mcp.json` e la configurazione utente.
- **Toggle per sessione:** genera la config della sessione e riavvia con `--mcp-config` + `--strict-mcp-config`. I file dell'utente non si modificano senza conferma e backup; i segreti sono sempre mascherati.
- **Skill library:** `.claude/skills`, `~/.claude/skills`, `.claude/commands`, con palette ed editor CodeMirror (validazione del frontmatter, diff prima di salvare).

### Fase 9 — Telemetria locale

- **Per sessione:** turni, tool, MCP, token in/out/cache, durata.
- **Ollama:** token e tok/s in tempo reale.
- **Pannello "lavoro fatto in locale":** compiti e token gestiti da Ollama invece che da Claude.
- **Limiti abbonamento:** la stima è dichiarata come approssimativa.

### Fase 10 — Rilascio

- **Installer:** NSIS per Windows, auto-update da GitHub Releases (canali stable e beta), release-please.
- **Prima di rendere pubblica la repo:**
  - audit con gitleaks su tutta la cronologia;
  - verifica dei termini Anthropic sull'uso della CLI in un'app di terzi (ogni utente con il proprio login);
  - firma del codice opzionale (le build open source non firmate mostrano l'avviso di SmartScreen: va scritto nel README).

## Trasversali

**Sicurezza (modello delle minacce):**

| Superficie          | Rischio                                | Contromisura                                   |
| ------------------- | -------------------------------------- | ---------------------------------------------- |
| Renderer            | XSS da output degli agenti             | Sandbox, CSP, Markdown sanitizzato             |
| IPC                 | Comandi arbitrari dal renderer         | Schema zod e controllo del mittente            |
| Bridge (hooks, MCP) | Eventi falsi da altri processi locali  | Pipe con permessi utente + token               |
| File system         | Path traversal, symlink                | Normalizzazione di ogni percorso               |
| Docker              | Il socket equivale a privilegi elevati | Sola lettura per default                       |
| MCP di terzi        | Codice non fidato                      | Comando e origine mostrati prima di abilitarli |
| Agenti locali       | Output inaffidabile                    | Solo proposte di diff                          |
| Dipendenze          | Supply chain                           | Lockfile, Dependabot, audit                    |
| Aggiornamenti       | Update malevolo                        | Firma e verifica                               |

**Privacy:** nessuna telemetria esterna né crash reporter remoto, dati solo nella cartella dell'app, retention configurabile, "cancella tutto", redazione automatica dei segreti in log ed eventi, servizi solo su localhost, pagina Privacy nelle impostazioni.

**Integrazione continua delle feature:**

- trunk-based con branch brevi;
- feature flag `experimental.*`;
- piramide di test: unit, integrazione con processi finti, E2E su fixture, test visivi, axe-core, budget di prestazioni;
- revisione impeccable su ogni PR di UI;
- revisione manuale per IPC, file system, processi e sicurezza;
- ADR per ogni scelta architetturale;
- controllo periodico di compatibilità con le nuove versioni di Claude Code.

**Lavoro con Claude** (secondo le regole globali):

- `explorer` per le ricerche ampie;
- `implementer` in parallelo su parti indipendenti (es. pannello Docker e pannello porte);
- sicurezza, IPC, bridge e packaging restano all'agente principale;
- commit, push e aggiornamento del piano solo dall'agente principale.

## Memoria di progetto: CLAUDE.md + file .md di lavoro (creati nella Fase 0)

Servono a non perdere contesto tra una sessione e l'altra: Claude legge il file giusto a seconda del bisogno, non tutto ogni volta.

**`CLAUDE.md` (radice, breve: si carica sempre)**

- Cos'è il progetto in 5 righe, stack, struttura delle cartelle.
- Comandi: `pnpm dev`, `pnpm test`, `pnpm e2e`, `pnpm lint`, `pnpm typecheck`.
- Regole fisse: sicurezza Electron (mai `nodeIntegration`, IPC solo da `ipc-contract` con zod), percorsi sempre verificati dentro il workspace, niente segreti in log o fixture, Conventional Commits, design system obbligatorio (niente colori o durate fuori dai token).
- **Indice dei file di memoria**, con la regola di quando leggerli e aggiornarli (vedi sotto).
- Divieti espliciti: niente dipendenze nuove senza ADR, niente modifiche a `~/.claude*` dell'utente.

**`docs/memoria/`: un file per ogni scopo**

| File                | Contenuto                                                                                                                                  | Quando si legge                             | Quando si aggiorna                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| `STATO.md`          | Fase e task in corso, branch attivo, cosa funziona e cosa è rotto ora, blocchi                                                             | **All'inizio di ogni sessione**             | A fine sessione e a ogni cambio di task     |
| `PROSSIMI_PASSI.md` | Coda ordinata dei prossimi task, con il riferimento alla fase                                                                              | Quando si sceglie cosa fare                 | Quando un task si chiude o nasce            |
| `STORIA.md`         | Diario delle sessioni: data, cosa è stato fatto, decisioni prese, problemi incontrati (voci brevi, la più recente in alto)                 | Quando serve capire perché qualcosa è com'è | A fine sessione                             |
| `DECISIONI.md`      | Indice delle ADR in `docs/adr/` con una riga di sintesi ciascuna                                                                           | Prima di cambiare architettura              | Ogni nuova ADR                              |
| `PIANO.md`          | Questo piano (fasi, DoD)                                                                                                                   | Quando si apre una nuova fase               | Se cambia il piano, con voce in `STORIA.md` |
| `DESIGN.md`         | Direzione estetica, token, linguaggio degli stati, regole di movimento, link al design system HTML (generato con impeccable a fine Fase 1) | Prima di toccare la UI                      | Quando cambia il design system              |
| `SICUREZZA.md`      | Modello delle minacce e checklist Electron                                                                                                 | Prima di toccare IPC, processi, file system | Ogni nuova superficie                       |
| `GLOSSARIO.md`      | Termini del progetto (AgentEvent, fixture, bridge, workspace…)                                                                             | Al bisogno                                  | Quando nasce un termine                     |
| `PROBLEMI_NOTI.md`  | Bug noti, workaround, incompatibilità (es. versioni di Claude Code)                                                                        | Quando qualcosa si rompe                    | Alla scoperta o risoluzione                 |

**Automazioni**

- Skill di progetto `.claude/skills/fine-sessione`: aggiorna `STATO.md`, `PROSSIMI_PASSI.md` e `STORIA.md` partendo dal `git log` della sessione.
- Skill `.claude/skills/inizio-sessione`: legge `STATO.md` + `PROSSIMI_PASSI.md` e propone il prossimo task.
- Hook `SessionStart` che ricorda di leggere `STATO.md`; controllo CI che segnala le PR di feature senza voce in `STORIA.md`.

## Versionamento

**Del progetto (Fase 0)**

- Git con branch brevi (`feat/…`, `fix/…`, `docs/…`), `main` protetto, merge solo con PR e CI verde.
- Conventional Commits (commitlint) → **release-please** calcola la versione SemVer, scrive `CHANGELOG.md` e crea tag e GitHub Release.
- Versione mostrata nell'app (Impostazioni → Informazioni) con hash del commit e canale (stable/beta).
- Schema eventi e configurazioni salvate **versionati** (`schemaVersion`) con migrazioni testate, così le sessioni vecchie restano riproducibili nel replay.
- ADR numerate in `docs/adr/` come storia delle decisioni.

**Dentro l'app, per il lavoro degli agenti (nuova Fase 4b)**

- **Pannello Git** del workspace: branch, file modificati, diff, ultimi commit, stage/commit con messaggio (proposto da Claude o da un agente Ollama, modificabile).
- **Checkpoint automatici degli agenti:** prima che una sessione inizi a scrivere, l'app salva uno snapshot (stash o ref nascosto `refs/control-center/checkpoints/<sessione>`, senza toccare il branch dell'utente). Dalla timeline si può **confrontare** e **ripristinare** lo stato a qualsiasi checkpoint, file per file o tutto.
- Sulla mappa, i file modificati e non committati hanno un indicatore; nel replay ogni scrittura è collegata al suo diff.
- Azioni distruttive (ripristino, discard) sempre con conferma e anteprima del diff.

## Errori e stack trace in tempo reale

Due livelli, un'unica **Console Errori** (pannello in basso, accanto a terminale e log, con contatore nella barra di stato).

**1. Errori dell'app stessa (Fase 3, dalla shell in poi)**

- Cattura centralizzata: `uncaughtException`/`unhandledRejection` nel main, `window.onerror`/`unhandledrejection` e Error Boundary React nel renderer, uscite anomale e stderr dei processi figli (claude, ollama, server MCP, pty), errori di validazione IPC/zod.
- Logger strutturato (pino) → file JSONL ruotati nella cartella dati + stream verso la Console Errori.
- **Source map** abilitate in sviluppo e incluse (non pubblicate) in produzione: lo stack mostra file e riga del sorgente TypeScript, non del bundle.
- Ogni errore: messaggio, stack leggibile con frame del progetto evidenziati e quelli di `node_modules` collassati, processo di origine, timestamp, contesto (sessione, ultimo evento). Clic su un frame → apre il file all'altezza giusta nell'editor esterno (VS Code) o nella mappa.
- Raggruppamento degli errori ripetuti con contatore; pulsante "copia report" con dati già ripuliti dai segreti; **nessun invio esterno**.

**2. Errori del progetto su cui lavori (Fase 5e, dopo la Vista Live)**

- Parser di stack trace (Node/TS, Python, Go, Rust, browser) applicato a: terminale integrato, output dei comandi lanciati dagli agenti, log dei container Docker, dev server rilevati nella Fase 6, risultati dei test.
- Gli errori trovati diventano eventi `error.detected` nello schema `AgentEvent`: **il nodo del file colpevole si colora di rosso sulla mappa** e compare nella timeline accanto all'azione dell'agente che lo ha preceduto.
- Azioni rapide sull'errore: "chiedi a Claude di sistemarlo", "spiegalo in locale" (Ollama, gratuito per i limiti d'uso), "vai al file".
- Il parser è un registro: un nuovo linguaggio si aggiunge con un modulo e i suoi test su esempi reali.

**Verifica:** test E2E che provocano un errore nel main, nel renderer e in un processo figlio e controllano che compaia in Console con lo stack sorgente corretto; fixture di stack trace per ogni linguaggio del parser.

## Modifiche alla tabella delle fasi

- Fase 0: + `CLAUDE.md`, `docs/memoria/*`, skill inizio/fine sessione, release-please e CHANGELOG.
- Fase 3: + logger, cattura errori, Console Errori, source map.
- **Fase 4b (nuova, M):** pannello Git e checkpoint degli agenti.
- **Fase 5e (nuova, M):** errori del progetto in tempo reale sulla mappa.

## Modello, effort, ultracode e goal per ogni fase

**Criteri usati**

- **Sonnet 5.5 di default:** implementazione già specificata (brief, design approvato, test come criterio di fine). **Opus 5.5** solo per sicurezza, architettura nuova e logica delicata. **Haiku 5.5:** solo per i subagent di ricerca (`explorer`).
- **Effort:** `medium` per lavoro definito, `high` per logica non banale o sicurezza; `high` è il tetto normale. `xhigh` e `max` mai di default: si usano solo per un problema bloccato, annotandolo in `STORIA.md`.
- **Ultracode** (orchestrazione multi-agente): oggi non è previsto in nessuna fase, perché ogni agente riparte da zero e consuma molti limiti. Si valuta solo per parti grandi, davvero parallele e indipendenti; altrimenti si lavora in sequenza o con i subagent `implementer` (sonnet).
- **Risparmio token** (revisione del 2026-11-14):
  - una sessione per sotto-goal, chiusa con `fine-sessione`; mai due sotto-fasi nella stessa conversazione;
  - verifiche a testo prima che a immagini (asserzioni Playwright, `read_page`): screenshot solo come prova finale;
  - a inizio sessione si leggono solo `STATO.md` e `FASE_<n>.md`, non tutto questo piano;
  - il lavoro meccanico (bozze di test, fixture, documentazione) va a OmniRoute secondo le regole globali.
- **Goal (`/goal`):** ogni goal è una condizione **verificabile da comandi** (test, lint, file presenti), così il loop si ferma da solo quando è vera e non "a sensazione". Ogni goal termina sempre con l'aggiornamento di `STATO.md`, `PROSSIMI_PASSI.md` e `STORIA.md`.
- **Le fasi lunghe si fanno a sotto-goal** (uno per sotto-fase): un goal enorme porta il loop a sessioni troppo lunghe e a perdere contesto.

| Fase              | Modello                                                                                       | Effort | Ultracode                      | Note                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- | ------ | ------------------------------ | ----------------------------------------------------- |
| 0 Repo            | Sonnet 5.5                                                                                    | medium | no                             | Lavoro meccanico; `CLAUDE.md` scritto/rivisto da Opus |
| 1 Design          | Opus 5.5                                                                                      | high   | sì, effort `high`, solo per 1b | 3 direzioni estetiche esplorate in parallelo          |
| 2 Eventi          | Opus 5.5                                                                                      | high   | no                             | Lo schema è la base di tutto                          |
| 3a Shell e IPC    | Opus 5.5                                                                                      | high   | no                             | Sicurezza Electron: niente deleghe                    |
| 3b Console Errori | Sonnet 5.5                                                                                    | high   | no                             | Specificata nel dettaglio; riusa il contratto IPC 3a  |
| 3c Design system  | Sonnet 5.5                                                                                    | medium | no                             | Porting dell'HTML 1c già approvato; impeccable a fine |
| 4.1 Bridge        | Opus 5.5                                                                                      | high   | no                             | Hooks bridge, named pipe, token, sessione Claude      |
| 4.2 Terminale     | Sonnet 5.5                                                                                    | medium | no                             | Workspace, terminale, node-pty                        |
| 4.3 Chat          | Sonnet 5.5                                                                                    | high   | no                             | UI chat, permessi, cronologia JSONL                   |
| 4b Git/checkpoint | Sonnet 5.5                                                                                    | high   | no                             | Cautela garantita dai test su repo temporanei         |
| 5a Modello        | Opus 5.5                                                                                      | high   | no                             | Fissa il contratto per 5b-5d                          |
| 5b Mappa          | Opus 5.5                                                                                      | high   | no                             | Budget 60 fps con 500 nodi: logica delicata           |
| 5c Timeline       | Sonnet 5.5                                                                                    | high   | no                             | Stato derivato già impostato in 5a e nel prototipo 1d |
| 5d Agenti         | Sonnet 5.5                                                                                    | medium | no                             | UI su dati già pronti                                 |
| 5e Errori live    | Sonnet 5.5                                                                                    | medium | no                             | Parser ripetitivi; bozze di test a OmniRoute          |
| 6 Infra           | Sonnet 5.5                                                                                    | medium | no                             | Tre pannelli piccoli, in sequenza                     |
| 7 Ollama          | Opus 5.5 (`mcp-bridge`, allowlist) + Sonnet 5.5 medium (`ollama-client`)                      | high   | no                             | Sicurezza solo nel bridge                             |
| 8 MCP & Skills    | Sonnet 5.5                                                                                    | high   | no                             | Scrittura file utente: rivista da Opus                |
| 9 Telemetria      | Sonnet 5.5                                                                                    | medium | no                             |                                                       |
| 10 Rilascio       | Sonnet 5.5 (packaging, update) + Opus 5.5 high (audit prima della pubblicazione)              | medium | no                             | Firma, update, audit open source                      |
| Revisioni         | `/code-review` `medium`; `high` su 3a, 4.1, 7, 8, 10; `ultra` solo prima di pubblicare e v1.0 |        |                                | `impeccable` su ogni PR di UI                         |

**Goal da impostare (da copiare in `/goal`)**

- **Fase 0**

  > Fase 0 completata: repo git con monorepo pnpm e struttura del piano; `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` passano senza errori; workflow CI su windows-latest presente; commitlint, release-please, Dependabot, gitleaks configurati; LICENSE, README, CONTRIBUTING, SECURITY.md presenti; `CLAUDE.md` e tutti i file di `docs/memoria/` presenti e compilati; skill inizio-sessione e fine-sessione create; `STATO.md`, `PROSSIMI_PASSI.md`, `STORIA.md` aggiornati.

- **Fase 1** (quattro goal in sequenza, ciascuno chiuso da una tua revisione)
  - 1a > Esistono in `design/` la ricerca UX (persona, domande chiave, architettura dell'informazione) e la mappa delle schermate con tutti i loro stati, scritte in `docs/memoria/DESIGN.md`; memoria aggiornata.
  - 1b > Tre direzioni estetiche distinte prodotte con /frontend-design, ciascuna con palette, tipografia e una schermata della Vista Live, salvate in `design/direzioni/`; memoria aggiornata con la richiesta di scelta all'utente.
  - 1c > Esistono `design/tokens.json` e `design/sistema/` con token CSS, pagina componenti con tutti gli stati e le schermate P0 e P1 in alta fedeltà nella direzione scelta, solo con i token; screenshot senza errori di console; revisione impeccable senza problemi gravi aperti; memoria aggiornata.
  - 1d > Il prototipo in codice della Vista Live gira su almeno una fixture reale; i test Playwright di screenshot degli stati passano; la revisione impeccable non ha problemi gravi; memoria aggiornata.

- **Fase 2**

  > `packages/event-schema` definisce AgentEvent con zod; almeno 5 sessioni registrate e ripulite in `packages/fixtures`; i normalizzatori convertono tutte le fixture senza errori di validazione e i loro test passano in CI; lo script di pulizia non trova segreti; memoria aggiornata.

- **Fase 3** (tre goal in sequenza; dettagli in `FASE_3.md`)

  > L'app Electron si avvia con contextIsolation, sandbox, CSP e Fuses attivi; tutti i canali IPC passano da ipc-contract con validazione zod; la checklist di `SICUREZZA.md` è tutta verificata; la Console Errori mostra con stack sorgente un errore provocato nel main, nel renderer e in un processo figlio (test E2E verdi); temi, command palette e pagina componenti presenti con test visivi verdi; memoria aggiornata.
  - 3a > `apps/desktop` si avvia con electron-vite; contextIsolation, sandbox, CSP, blocco di navigazione e `window.open` e Fuses sono attivi e verificati da test; tutti i canali IPC passano da `packages/ipc-contract` con validazione zod e controllo del mittente; la checklist Electron di `SICUREZZA.md` è tutta spuntata, ogni voce con il suo test; un test E2E Playwright `_electron` avvia l'app anche in CI; memoria aggiornata.
  - 3b > Il logger scrive JSONL ruotati e alimenta la Console Errori; un errore provocato nel main, nel renderer e in un processo figlio compare in Console con lo stack del sorgente TypeScript (test E2E verdi); log e report passano da `redactSecrets`; memoria aggiornata.
  - 3c > Il design system è in codice (token → Tailwind, componenti base della 1c con i loro stati); layout a pannelli, barra di stato, command palette, scorciatoie con ambiti di focus e temi chiaro/scuro/sistema funzionano; la pagina componenti ha test visivi verdi e un E2E apre la palette e cambia tema; revisione impeccable senza gravi; memoria aggiornata.

- **Fase 4** (tre goal in sequenza; il goal complessivo è l'unione)

  > Dall'app si apre un workspace, si usa il terminale e si conduce una sessione Claude Code con chat in streaming, richieste di permesso e cronologia JSONL; l'hooks bridge consegna gli eventi via named pipe con token; i test E2E con il finto eseguibile claude passano; typecheck, lint e test verdi; memoria aggiornata.
  - 4.1 > L'hooks bridge consegna gli eventi all'app via named pipe con token per sessione (eventi senza token o malformati rifiutati, con test); la sessione `claude -p` in stream-json con `--resume` è gestita dal main e i suoi eventi passano dai normalizzatori di `event-schema`; test di integrazione con il finto eseguibile claude verdi; memoria aggiornata.
  - 4.2 > Dall'app si apre un workspace (recenti, cambio rapido, percorsi verificati dentro il workspace con test su traversal e symlink) e si usa il terminale PowerShell/bash a più schede con node-pty ricompilato per Electron; E2E verde; memoria aggiornata.
  - 4.3 > La chat mostra la sessione in streaming, le richieste di permesso (Approva / Rifiuta / Sempre in questa sessione) funzionano e la cronologia è salvata in JSONL; E2E con il finto eseguibile claude verdi; revisione impeccable senza gravi; memoria aggiornata.

- **Fase 4b**

  > Il pannello Git mostra branch, modifiche, diff e commit; un checkpoint viene creato prima di ogni sessione che scrive e si può ripristinare da timeline senza toccare il branch dell'utente; test di integrazione su repository temporanei verdi; memoria aggiornata.

- **Fase 5** (un goal per sotto-fase)
  - 5a > Il modello del progetto (scansione nel worker, import via web-tree-sitter per TS/JS/Python/Go/Rust, watcher incrementale) produce il grafo corretto sui progetti di test; apertura sotto i 2 s su 5.000 file misurata in un test; memoria aggiornata.
  - 5b > La mappa React Flow mostra gli stati dei nodi del design system pilotati dagli eventi delle fixture, con agenti agganciati, Segui agente, anteprima diff e heatmap; 60 fps con 500 nodi e 20 eventi/s nel test di prestazioni; test visivi verdi; memoria aggiornata.
  - 5c > La timeline a swimlane e lo scrubber ricostruiscono lo stato della mappa in qualunque istante di una fixture e di una sessione passata; test unitari dello stato derivato ed E2E verdi; memoria aggiornata.
  - 5d > Il pannello agenti e l'ispettore (vista umana + JSON) sono sincronizzati con mappa e timeline; riproducendo una fixture, un test E2E verifica che le 5 domande chiave abbiano risposta visibile; revisione impeccable pulita; memoria aggiornata.

- **Fase 5e**

  > I parser di stack trace per Node/TS, Python, Go, Rust e browser passano sulle fixture; gli errori da terminale, comandi degli agenti, Docker e dev server producono eventi error.detected e colorano il nodo giusto sulla mappa (test E2E verde); memoria aggiornata.

- **Fase 6**

  > I pannelli Docker (sola lettura di default), porte locali e GPU/Ollama funzionano e mostrano stati vuoti corretti quando Docker, GPU o Ollama mancano (test di integrazione con servizi simulati verdi); memoria aggiornata.

- **Fase 7**

  > Il server MCP `delegate_to_local_agent` è registrato nella sessione Claude; un compito delegato compare come agente Ollama nella Vista Live con token e tok/s; gli agenti locali producono solo proposte di diff; i comandi rapidi locali funzionano senza passare da Claude; la skill delegate-local esiste; test con Ollama simulato verdi; memoria aggiornata.

- **Fase 8**

  > Il registry MCP legge le config di progetto e utente con segreti mascherati; il toggle per sessione cambia i tool disponibili (E2E con server MCP finto); la skill library e l'editor salvano solo dopo diff di conferma e backup; memoria aggiornata.

- **Fase 9**

  > La telemetria mostra per sessione turni, tool, MCP, token e durata, e per Ollama token e tok/s, con il pannello "lavoro fatto in locale"; i dati restano solo locali; test verdi; memoria aggiornata.

- **Fase 10**
  > `pnpm dist` produce l'installer NSIS; l'auto-update funziona tra due versioni di prova sul canale beta; gitleaks su tutta la cronologia è pulito; README con istruzioni di installazione e avviso SmartScreen; CHANGELOG e tag v1.0.0 generati da release-please; memoria aggiornata.

**Come usare il loop in pratica**

1. Aprire la sessione con la skill `inizio-sessione` (legge `STATO.md`).
2. Impostare modello ed effort della fase dalle impostazioni della sessione.
3. Lanciare `/goal` con il testo della sotto-fase.
4. Una sotto-fase per sessione: a goal raggiunto `fine-sessione`, PR, revisione, e la sotto-fase successiva in una sessione nuova.

## Primi passi dopo l'approvazione

1. ~~Aggiornare `PIANO.md` con questa versione.~~ Fatto (2026-11-13).
2. Fase 0: creare la repo (cartella da scegliere, es. `Desktop\control-center`), con `CLAUDE.md`, `docs/memoria/*` già compilati (`STATO.md` = "Fase 0 in corso", `PROSSIMI_PASSI.md` = task delle Fasi 0-2, `STORIA.md` = prima voce con la nascita del progetto e queste decisioni), skill inizio/fine sessione e versionamento configurato.
3. In parallelo: registrare le prime sessioni (Fase 2) e preparare la moodboard con /frontend-design (Fase 1).

## Verifica del piano stesso

- Ogni fase ha un DoD verificabile: CI verde, E2E Playwright sulle fixture, budget di prestazioni, revisione impeccable.
- Fine Fase 1: revisione insieme del prototipo della Vista Live prima di scrivere codice di prodotto.
- Fine Fase 7: verifica che un compito delegato compaia come agente Ollama nella Vista Live e che la telemetria lo conti come "fatto in locale".

---

# Appendice — dettagli operativi della prima stesura

> Dove questa appendice e il piano sopra non coincidono (numerazione fasi, Ollama anticipato, solo Windows, open source), vale il piano sopra.

---

## 0. Principi guida

1. **Ogni fase produce qualcosa che si usa.** Niente fasi "di sola infrastruttura" lunghe: dopo la Fase 4 l'app è già utile ogni giorno.
2. **Design prima del codice, ma provato con dati veri.** Registriamo sessioni reali di Claude Code (stream-json + hooks) e le usiamo come _fixture_: il design della vista live si valida su dati veri, e la UI si sviluppa e si testa senza far girare agenti.
3. **Intuitiva per chi la apre, profonda per chi la usa.** Tutto ha una vista "umana" (mappa, timeline, stati a colori) e una vista "raw" (JSON dell'evento, comando, log) a un tasto di distanza.
4. **Locale e privata di default.** Nessun dato esce dalla macchina se non verso Claude (tramite la CLI ufficiale) e Ollama su localhost.
5. **Un solo runtime: Node/TypeScript.** Niente microservizio Python.
6. **Architettura a pannelli registrabili.** Ogni feature è un modulo che si aggancia al bus eventi e al layout: aggiungere funzioni nuove non tocca il nucleo.

---

## 1. Stack e struttura

| Area                  | Scelta                                                         | Note                                                |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Monorepo              | pnpm workspaces                                                | `apps/desktop`, `packages/*`                        |
| Build Electron        | electron-vite                                                  | HMR per renderer, main e preload                    |
| Packaging/update      | electron-builder + electron-updater                            | Release su GitHub (privata)                         |
| UI                    | React 19, TypeScript strict, Tailwind v4                       |                                                     |
| Primitive accessibili | Radix UI (via shadcn/ui, personalizzato)                       | Focus, tastiera, ARIA già risolti                   |
| Icone                 | Lucide                                                         |                                                     |
| Animazioni            | Motion (+ CSS per i casi semplici)                             | Budget di movimento definito nel design system      |
| Grafo                 | @xyflow/react + elkjs (layout)                                 | Layout calcolato in Web Worker                      |
| Terminale             | xterm.js + node-pty                                            | Ricompilato con electron-rebuild                    |
| Editor/diff           | CodeMirror 6 (+ @codemirror/merge)                             | Più leggero di Monaco                               |
| Stato renderer        | Zustand                                                        | Store per dominio                                   |
| Validazione           | zod                                                            | Su ogni confine: IPC, hooks, stream, file di config |
| Persistenza           | JSONL append-only per eventi; JSON per impostazioni            | SQLite solo se servirà davvero                      |
| Test                  | Vitest (unit), Playwright `_electron` (E2E), screenshot visivi |                                                     |
| Lint/format           | ESLint (flat config) + Prettier                                | Regole Electron security incluse                    |

```
control-center/
├─ apps/desktop/
│  ├─ src/main/          # processi, servizi (claude, ollama, docker, fs, pty)
│  ├─ src/preload/       # bridge minimo e tipizzato
│  ├─ src/renderer/      # React: shell, pannelli, design system
│  └─ e2e/               # Playwright
├─ packages/
│  ├─ event-schema/      # schema unificato AgentEvent (zod) + tipi
│  ├─ ipc-contract/      # canali IPC tipizzati e validati
│  ├─ hooks-bridge/      # script per gli hooks di Claude Code → app
│  ├─ mcp-bridge/        # server MCP "delegate_to_local_agent" (Fase 9)
│  └─ fixtures/          # sessioni registrate per design, sviluppo e test
├─ docs/adr/             # Architecture Decision Records
├─ design/               # ricerca, direzioni, token, design system HTML
└─ .github/              # CI, template PR/issue, Dependabot
```

---

## 2. Mappa delle fasi

| Fase | Contenuto                                                   | Dimensione | Si usa già?               |
| ---- | ----------------------------------------------------------- | ---------- | ------------------------- |
| 0    | Repo, tooling, CI, regole                                   | S          | —                         |
| 1    | Ricerca UX, design system, prototipo Vista Live             | L          | prototipo                 |
| 2    | Registrazione sessioni + schema eventi                      | S          | —                         |
| 3    | Shell Electron sicura + layout + design system in codice    | M          | finestra vuota ma "bella" |
| 4    | Workspace, terminale, chat con Claude Code, timeline eventi | L          | **sì, uso quotidiano**    |
| 5    | **Vista Live degli agenti** (mappa + timeline + replay)     | XL         | **cuore del progetto**    |
| 6    | Monitor infrastruttura (Docker, porte, GPU/Ollama)          | M          | sì                        |
| 7    | MCP & Skills (registry, toggle, editor)                     | M          | sì                        |
| 8    | Telemetria token e sessioni                                 | S          | sì                        |
| 9    | Agenti locali Ollama + ponte MCP                            | L          | sperimentale              |
| 10   | Packaging, firma, auto-update, release                      | M          | installer                 |
| ∞    | Sicurezza, privacy, qualità, CI (trasversali)               | —          | —                         |

Ogni fase ha: **obiettivo · deliverable · task · criterio di completamento (DoD) · rischi**.

---

## 3. Fase 0 — Fondamenta della repo

**Obiettivo:** una repo in cui ogni cambiamento viene controllato automaticamente fin dal primo giorno.

**Task**

- `git init`, repo GitHub **privata**, branch `main` protetto (PR obbligatoria, CI verde obbligatoria).
- Monorepo pnpm, TypeScript `strict` + `noUncheckedIndexedAccess`, path alias.
- ESLint + Prettier + `eslint-plugin-security`; pre-commit con lint-staged (solo file toccati, deve restare veloce).
- Conventional Commits (commitlint) → changelog e versione automatici con release-please.
- CI GitHub Actions (runner **windows-latest**, poi anche macOS/Linux): install → typecheck → lint → unit → build → E2E.
- Dependabot (settimanale, raggruppato) + `pnpm audit` in CI + secret scanning attivo su GitHub.
- Template di PR e issue (bug, feature, ADR).
- `CLAUDE.md` di progetto: convenzioni, comandi, divieti (es. mai `nodeIntegration: true`), struttura. `.claude/agents/` con override di `explorer`/`implementer` se servono.
- `docs/adr/0001-stack.md` con le scelte del §1.

**DoD:** una PR di prova passa tutta la CI; una PR con un errore di tipo viene bloccata.

---

## 4. Fase 1 — UX e design (prima di qualsiasi codice di prodotto)

**Strumenti:** skill **/frontend-design** per la direzione estetica; token e pagine HTML statiche per componenti e schermate; **impeccable** per la critica e la revisione; Playwright per gli screenshot e per validare il prototipo in codice.

> Figma era previsto per wireframe, componenti e prototipo, ma è stato tolto il 2026-11-14: con il server MCP costava molti token per un passaggio intermedio (HTML → Figma → codice) che qui non serve, perché non c'è un designer che lavora a mano. Vedi `STORIA.md`.

### 4.1 Ricerca e architettura dell'informazione

- **Persona principale:** sviluppatore che usa Claude Code tutti i giorni, alterna 2-5 progetti, ha Docker e modelli locali. Persona secondaria: lo stesso sviluppatore "di passaggio" che vuole solo capire cosa sta succedendo.
- **Jobs to be done** (le domande a cui l'app deve rispondere in < 2 secondi):
  1. _Cosa sta facendo l'agente adesso?_
  2. _Quali file ha toccato e cosa ha cambiato?_
  3. _È bloccato, sta aspettando me, ha sbagliato?_
  4. _Cosa gira sulla mia macchina (container, porte, modelli in VRAM)?_
  5. _Quanto ho consumato in questa sessione?_
- **Architettura dell'informazione**
  - Barra sinistra stretta: workspace (progetti) + sezioni (Live, Infra, MCP & Skills, Telemetria, Impostazioni).
  - Area centrale: la sezione attiva (per default **Live**).
  - Pannello destro agganciabile: chat/sessione Claude.
  - Pannello inferiore agganciabile: terminale e log.
  - **Command palette** (Ctrl+K) come accesso universale: ogni azione è raggiungibile da tastiera.
  - Barra di stato in basso: sessione attiva, agenti in corso, VRAM, token, stato Docker, sempre visibili.

### 4.2 Design system

- **Token** (colori, spaziatura, raggi, ombre, tipografia, durate e curve di movimento) definiti in `design/tokens.json`, usati come variabili CSS dalle pagine HTML della 1c e poi come tema Tailwind.
- **Tema scuro come principale**, tema chiaro completo. Contrasto AA verificato su entrambi.
- **Tipografia:** un sans per l'interfaccia e un mono per percorsi, codice, numeri (cifre tabulari per i contatori che cambiano in tempo reale).
- **Linguaggio semantico degli stati**, coerente ovunque (mappa, timeline, lista agenti, barra di stato):

| Stato        | Significato                | Trattamento visivo                                                   |
| ------------ | -------------------------- | -------------------------------------------------------------------- |
| idle         | nessuna attività           | neutro, bassa saturazione                                            |
| reading      | l'agente legge             | colore "info", impulso leggero                                       |
| writing      | l'agente modifica          | colore "accento caldo", bordo pieno + badge diff                     |
| running      | comando/tool in esecuzione | indicatore di progresso indeterminato                                |
| waiting-user | serve una tua decisione    | colore "attenzione", unico stato che richiama attivamente lo sguardo |
| error        | fallito                    | colore "errore", icona, mai solo colore                              |
| done         | completato                 | ritorna neutro con una traccia che sfuma                             |

- **Identità degli agenti:** ogni agente (Claude principale, subagent Claude, agente Ollama) ha un colore e un glifo propri, assegnati in modo stabile. Distinguibili anche in scala di grigi (forma + colore).
- **Componenti:** pulsanti, input, tab, pannelli, toast, menu, tabelle dense, badge di stato, card agente, nodo file, nodo servizio, nodo MCP, voce di timeline, ispettore JSON, diff viewer.

### 4.3 Il cuore: la Vista Live (specifica di design)

È la parte su cui investire di più. Tre viste coordinate sullo stesso flusso di eventi:

**A. Mappa del progetto (React Flow)**

- Nodi = cartelle e file, raggruppati per cartella; archi = import/dipendenze.
- **Zoom semantico:** da lontano si vedono solo le cartelle (con una "heatmap" di attività), avvicinandosi compaiono i file, poi i simboli principali.
- **Si mostra solo ciò che conta:** per default i file toccati nella sessione e i loro vicini diretti; il resto è collassato. Così si evita il groviglio.
- **Agenti come presenze sulla mappa:** l'avatar dell'agente si "aggancia" al nodo su cui lavora; un arco animato collega agente → file (direzione diversa per lettura e scrittura).
- **Modalità "Segui agente":** la camera segue l'agente selezionato con movimenti morbidi, interrompibili appena tocchi la mappa.
- **Anteprima diff:** passando sopra un nodo in stato _writing_ compare il diff dell'ultima modifica; clic → diff completo nel pannello.
- **Nodi per servizi e MCP:** quando l'agente chiama un server MCP o un comando (es. `docker`, `npm test`), compare un nodo temporaneo collegato.
- **Minimappa con heatmap** delle zone più toccate.

**B. Timeline / Activity feed**

- Corsie orizzontali per agente (stile "swimlane"), eventi come blocchi con durata reale.
- I subagent compaiono come corsie figlie collegate al punto in cui sono nati.
- Clic su un evento → evidenzia il nodo sulla mappa e apre l'ispettore (vista umana + JSON raw).
- **Scrubber di replay:** si può tornare indietro nella sessione e vedere la mappa com'era in quel momento. Funziona anche su sessioni passate (dai JSONL salvati).

**C. Pannello Agenti**

- Card per ogni agente attivo: modello, compito, tool in uso, tempo trascorso, token, tok/s (per Ollama).
- Azioni: interrompi, apri log, "segui sulla mappa".

**Regole di movimento**

- Il movimento comunica stato, non decora: impulso = attività, scia che sfuma = attività recente, nessuna animazione continua su nodi inattivi.
- Durate brevi (150-300 ms), curve definite nei token, rispetto di `prefers-reduced-motion` (sostituisce il movimento con cambi di colore/opacità).
- **Budget di prestazioni:** gli eventi vengono accorpati per frame (`requestAnimationFrame`), al massimo N animazioni contemporanee, 60 fps con 500 nodi visibili.

### 4.4 Stati da disegnare per ogni schermata

Vuoto (primo avvio, nessun progetto), caricamento, normale, denso (molti agenti), errore (Claude non autenticato, Docker spento, Ollama assente), offline. Onboarding di primo avvio: 3 passi (scegli progetto → verifica `claude login` → verifica Docker/Ollama opzionali), saltabile.

### 4.5 Processo

1. Moodboard e direzione estetica con **/frontend-design** (2-3 direzioni, ne scegliamo una).
2. Token in `design/tokens.json`, pagina componenti e schermate in alta fedeltà come HTML statico; i flussi principali (_apro progetto → lancio task → guardo l'agente sulla mappa → approvo un permesso → vedo il diff_) si verificano sulla sequenza delle schermate.
3. Revisione con **impeccable** (critica di gerarchia, densità, coerenza, accessibilità) → iterazione.
4. **Prototipo in codice della sola Vista Live** alimentato dalle fixture registrate (Fase 2): è il vero test del design, perché il movimento si valuta solo in codice.
5. Revisione insieme a te prima di passare alla Fase 3.

**DoD:** token in `design/tokens.json`; pagina componenti e tutte le schermate P0 e P1 in alta fedeltà con i loro stati, solo con i token; prototipo della Vista Live che gira su una sessione reale registrata; revisione impeccable senza problemi gravi aperti.

---

## 5. Fase 2 — Registrazione sessioni e schema eventi

**Obiettivo:** un formato unico per tutto ciò che accade, e dati veri su cui lavorare.

**Task**

- Registrare 5-10 sessioni reali di Claude Code su progetti diversi, catturando sia `--output-format stream-json` sia gli eventi degli hooks (`PreToolUse`, `PostToolUse`, `SubagentStop`, `Notification`, `Stop`…).
- Definire `AgentEvent` in `packages/event-schema` (zod), per esempio:
  - `session.started / session.ended`
  - `message.assistant / message.user`
  - `tool.called / tool.completed / tool.failed` (con nome tool, input, durata)
  - `file.read / file.written` (percorso normalizzato relativo al workspace, diff opzionale)
  - `agent.spawned / agent.finished` (subagent Claude e agenti Ollama)
  - `mcp.called`
  - `permission.requested / permission.resolved`
  - `usage.updated` (token in/out, cache)
- Normalizzatori: stream-json → AgentEvent, hooks → AgentEvent, Ollama → AgentEvent. Testati sulle fixture.
- **Pulizia delle fixture** prima del commit: niente segreti, percorsi personali sostituiti (vedi §13).

**DoD:** tutte le fixture si convertono senza errori di validazione; test unitari dei normalizzatori in CI.

---

## 6. Fase 3 — Shell Electron sicura e design system in codice

**Task**

- Finestra principale con `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`; nessun contenuto remoto caricato.
- CSP restrittiva; blocco di `window.open`/navigazione verso l'esterno (link esterni aperti nel browser di sistema solo dopo verifica dello schema `https:`).
- **Electron Fuses** (disattivare `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, attivare integrità ASAR).
- Preload minimo che espone solo `window.api` tipizzato da `packages/ipc-contract`; ogni messaggio IPC validato con zod nel main, con controllo del mittente.
- Layout a pannelli agganciabili (dimensioni ricordate per workspace), barra laterale, barra di stato, command palette, scorciatoie da tastiera (mostrate nei tooltip e in una schermata dedicata).
- Design system in codice: `design/tokens.json` → Tailwind; componenti base portati dalla pagina HTML della 1c; **storybook-like** interno (una pagina nascosta che mostra tutti i componenti e stati) usato anche per i test visivi.
- Tema chiaro/scuro/sistema.

**DoD:** test E2E Playwright avvia l'app, apre la palette, cambia tema; screenshot di riferimento dei componenti; checklist di sicurezza Electron (§13.1) tutta verde.

---

## 7. Fase 4 — Workspace, terminale e sessione Claude (prima versione usabile)

### 7.1 Workspace

- Elenco progetti recenti, aggiunta da cartella, cambio rapido (Ctrl+P sui progetti).
- Al cambio: ricarica configurazioni, skill, MCP, mappa; ogni workspace conserva layout e sessioni.
- Controllo dei percorsi: tutte le operazioni su file restano dentro la cartella del workspace (protezione da path traversal e symlink).

### 7.2 Terminale

- xterm.js + node-pty (PowerShell/bash/zsh secondo il sistema), più schede, apertura nella cartella del workspace.
- Link cliccabili su percorsi (aprono il file nella mappa o nell'editor esterno).

### 7.3 Sessione Claude Code

- Il main avvia `claude -p --output-format stream-json --input-format stream-json` (sessione interattiva via stdin) con `--resume` per riprendere.
- **Hooks bridge:** all'avvio della sessione l'app scrive una configurazione hooks temporanea per la sessione che chiama `packages/hooks-bridge`; lo script inoltra gli eventi all'app tramite **named pipe** (Windows) / socket Unix, autenticato con un token casuale per sessione. Nessuna porta TCP aperta.
- Chat: messaggi in streaming, blocchi tool richiudibili, rendering Markdown e codice.
- **Permessi:** quando Claude chiede l'autorizzazione per un tool, compare una richiesta chiara (cosa, su quale file, con quale comando) con Approva / Rifiuta / Approva sempre per questa sessione. È lo stato _waiting-user_ del design system.
- Interruzione e ripresa della sessione; cronologia sessioni salvata in JSONL nella cartella dati dell'app.
- Prima versione della **timeline eventi** (lista semplice; la versione completa arriva nella Fase 5).

**DoD:** si lavora un'intera giornata con l'app invece che con il terminale; E2E con un finto eseguibile `claude` che riproduce le fixture (così la CI non chiama mai il vero servizio).

**Rischio:** il formato stream-json e gli hooks possono cambiare tra versioni di Claude Code → gli adattatori sono isolati e versionati, e la CI testa le fixture; un controllo all'avvio mostra un avviso se la versione della CLI non è tra quelle testate.

---

## 8. Fase 5 — Vista Live degli agenti (cuore del progetto)

Implementazione della specifica del §4.3, in quattro passi indipendenti, ciascuno rilasciabile:

**5a. Modello del progetto**

- Scansione della cartella (rispettando `.gitignore`), in un worker per non bloccare la UI.
- Grafo degli import: Tree-sitter (`web-tree-sitter`, WASM) per TS/JS, Python, Go, Rust come primo set; si estende con nuove grammatiche.
- Riconoscimento di "ruoli" (pagine, componenti, route API, schema DB) con regole per framework (Next.js, Vite+React, FastAPI, Express…) definite come plugin.
- Aggiornamento incrementale con un file watcher (chokidar), non rescansione completa.

**5b. Mappa**

- React Flow con nodi personalizzati (cartella, file, servizio, MCP, agente), layout elkjs nel worker, zoom semantico, collasso automatico.
- Collegamento al bus eventi: i nodi cambiano stato secondo il §4.2; agenti agganciati ai nodi; archi animati.
- "Segui agente", anteprima diff, minimappa con heatmap.

**5c. Timeline e replay**

- Swimlane per agente con corsie figlie per i subagent; selezione sincronizzata con la mappa.
- Scrubber: ricostruisce lo stato della mappa in qualsiasi istante (stato derivato da eventi → facile da fare bene se tutto passa da `AgentEvent`).
- Apertura di sessioni passate in sola lettura.

**5d. Pannello agenti e ispettore**

- Card agente, azioni, ispettore evento con vista "umana" e JSON raw, copia negli appunti.

**Prestazioni (requisiti misurati in CI con un test dedicato)**

- 60 fps con 500 nodi visibili e 20 eventi/secondo.
- Avvio della Vista Live su un progetto da 5.000 file in < 2 s (mappa collassata).

**DoD:** riproducendo una sessione registrata, un utente risponde alle 5 domande del §4.1 senza leggere il testo della chat. Test visivi Playwright dei vari stati dei nodi.

---

## 9. Fase 6 — Monitor dell'infrastruttura

- **Docker** (dockerode; su Windows via `//./pipe/docker_engine`): elenco container, stato, CPU/RAM, log in streaming. **Sola lettura per default**; azioni (start/stop/restart) attivabili nelle impostazioni e sempre con conferma. Il socket Docker equivale a privilegi di amministratore: nessuna azione distruttiva implicita.
- **Porte locali:** elenco delle porte in ascolto su `127.0.0.1`/`::1`/`0.0.0.0` con il processo associato (comandi di sistema: `Get-NetTCPConnection` su Windows, `lsof`/`ss` altrove). Riconoscimento dei servizi noti (Postgres, Vite, Next…), apertura nel browser. **Nessuna scansione di altre macchine.** Le porte esposte su `0.0.0.0` sono segnalate come avviso.
- **GPU/Ollama:** `nvidia-smi` (se presente) per VRAM/uso; `GET /api/ps` di Ollama per i modelli caricati; carica/scarica modello con `keep_alive`.
- I servizi compaiono anche come nodi nella mappa quando un agente li usa.

**DoD:** il pannello funziona anche senza Docker, senza GPU NVIDIA e senza Ollama (stati vuoti chiari, nessun errore).

---

## 10. Fase 7 — MCP e Skills

- **Registry MCP:** lettura di `.mcp.json` (progetto) e della configurazione utente di Claude Code; elenco server con origine, tipo (stdio/http), stato.
- **Toggle per sessione:** l'app genera una configurazione MCP per la sessione e riavvia/riprende la sessione con `--mcp-config` + `--strict-mcp-config`. I file dell'utente **non vengono modificati** senza conferma esplicita; prima di ogni scrittura, backup automatico.
- **Segreti nelle config** (variabili `env`, header): sempre mascherati nella UI, mai scritti nei log o negli eventi.
- **Skill library:** scansione di `.claude/skills/`, `~/.claude/skills/`, `.claude/commands/`; palette accanto alla chat con ricerca; lancio con un clic.
- **Editor skill:** CodeMirror con anteprima Markdown, validazione del frontmatter, salvataggio con diff di conferma.

**DoD:** abilitare/disabilitare un MCP cambia davvero i tool disponibili nella sessione successiva (verificato in E2E con un server MCP finto).

---

## 11. Fasi 8-10

### Fase 8 — Telemetria (solo locale)

- Per sessione: turni, tool usati, MCP chiamati, token in/out/cache dagli eventi `usage`, durata.
- Agenti Ollama: token generati e tok/s in tempo reale (dai campi `eval_count`/`eval_duration`).
- Grafici semplici per giorno/progetto. Stima dei limiti dell'abbonamento indicata esplicitamente come **approssimativa**.

### Fase 9 — Agenti locali Ollama e ponte MCP

- Client Ollama nel main, con streaming e annullamento.
- `packages/mcp-bridge`: server MCP stdio con il tool `delegate_to_local_agent(task, files, model)`, registrato nella sessione di Claude. Comunica con l'app tramite la stessa pipe autenticata degli hooks, così ogni agente locale compare nella Vista Live.
- Casi d'uso iniziali, dove i modelli locali rendono: riassunto di log, ricerca/classificazione nel codice, bozze di test da far rivedere a Claude.
- **Limiti di sicurezza:** gli agenti locali di default **non scrivono file**; propongono un diff che Claude o tu approvate. Tool MCP condivisi con i modelli locali solo in un elenco esplicito (allowlist).
- Gestione VRAM: pre-caricamento e scaricamento dei modelli, avviso se un modello non entra in VRAM.

### Fase 10 — Packaging e rilascio

- electron-builder: installer NSIS per Windows, poi DMG/AppImage.
- Firma del codice (Windows: certificato o Azure Trusted Signing; macOS: notarizzazione) — opzionale per uso personale, necessaria se distribuita.
- Auto-update da GitHub Releases con canali **stable** e **beta**.
- Workflow di rilascio: release-please apre la PR di versione → merge → CI compila, firma, pubblica.

---

## 12. Decisioni aperte (da rivedere insieme)

1. **Nome del prodotto e identità visiva** — da decidere nella Fase 1.
2. **Solo per te o distribuibile?** Cambia firma del codice, onboarding, e soprattutto i termini d'uso: usare il proprio abbonamento Claude tramite la CLI ufficiale per sé va bene; un'app distribuita che si appoggia agli abbonamenti di altri va verificata sui termini di Anthropic.
3. **Piattaforme:** solo Windows all'inizio, o da subito anche macOS/Linux?
4. **Licenza:** privata, MIT, altro.
5. **Quanto spingere sull'analisi del codice (5a):** solo struttura + import, o anche ruoli per framework fin dall'inizio?
6. **Fase 9 sì o no:** è la più incerta come valore; proposta: decidere dopo aver usato le Fasi 4-5 per qualche settimana.
7. **Direzione estetica:** la scegliamo tra le 2-3 proposte della Fase 1.

---

## 13. Trasversale: sicurezza

### 13.1 Modello delle minacce (sintesi)

L'app avvia shell, agenti che scrivono file, container e server MCP: è un'app potente, quindi i confini contano.

| Superficie          | Rischio                                                      | Contromisura                                                                                 |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Renderer            | XSS da output degli agenti (Markdown, log) → accesso all'IPC | Sandbox, CSP, Markdown sanitizzato, nessun HTML raw, IPC minimo e validato                   |
| IPC                 | Comandi arbitrari dal renderer                               | Canali espliciti con schema zod, controllo mittente, nessun canale "esegui comando" generico |
| Hooks/MCP bridge    | Un processo locale qualsiasi invia eventi falsi              | Named pipe/socket con permessi utente + token per sessione                                   |
| File system         | Path traversal, symlink fuori dal workspace                  | Normalizzazione e verifica di ogni percorso                                                  |
| Docker              | Socket = privilegi elevati                                   | Sola lettura di default, conferma sulle azioni                                               |
| Server MCP di terzi | Codice non fidato                                            | Mostrare comando e origine prima di abilitarli; mai avviati automaticamente se nuovi         |
| Agenti locali       | Output inaffidabile                                          | Nessuna scrittura diretta, solo proposte di diff                                             |
| Dipendenze          | Supply chain                                                 | Lockfile, Dependabot, `pnpm audit`, poche dipendenze, revisione di quelle native             |
| Aggiornamenti       | Update malevolo                                              | Firma e verifica degli update                                                                |

### 13.2 Checklist Electron (in CI dove possibile)

`contextIsolation`, `sandbox`, niente `nodeIntegration`, CSP, nessun `remote`, navigazione bloccata, `setWindowOpenHandler`, Fuses, versione di Electron aggiornata (entro due major), permessi web (camera, microfono…) negati di default.

---

## 14. Trasversale: privacy

- **Nessuna telemetria verso l'esterno**, nessun crash reporter remoto. Gli unici collegamenti in uscita sono quelli della CLI di Claude e gli eventuali server MCP che scegli tu.
- Dati salvati solo nella cartella dati dell'app; **retention configurabile** delle sessioni (es. 30 giorni) e pulsante "cancella tutto".
- **Redazione automatica** nei log e negli eventi salvati: chiavi API, token, variabili `env` delle config MCP, contenuti di `.env`.
- Le fixture committate nella repo passano da uno script di pulizia (segreti, nome utente, percorsi personali); controllo in CI.
- Ollama e tutti i servizi interni ascoltano solo su localhost.
- Schermata "Privacy" nelle impostazioni che dice in chiaro cosa viene salvato e dove.

---

## 15. Trasversale: qualità e integrazione continua delle feature

- **Flusso di lavoro:** trunk-based, branch brevi (`feat/…`, `fix/…`), una PR per feature, merge solo con CI verde.
- **Feature flag** locali (`settings.experimental.*`) per far entrare nel `main` funzioni non finite senza esporle; le funzioni nuove passano da "sperimentale" a "stabile".
- **Piramide di test**
  - Unit (Vitest): normalizzatori di eventi, parser, logica di stato derivato, sicurezza dei percorsi.
  - Integrazione: servizi del main con processi finti (CLI `claude` simulata, Ollama simulato, Docker simulato).
  - E2E (Playwright `_electron`): flussi principali sulle fixture.
  - **Visivi:** screenshot della pagina dei componenti e degli stati della Vista Live; differenze bloccano la PR finché non vengono approvate.
  - Accessibilità: axe-core nei test E2E; navigazione completa da tastiera verificata.
  - Prestazioni: test della Vista Live con il budget del §8.
- **Revisione:** ogni PR con modifiche UI passa da **impeccable**; ogni PR con modifiche a IPC, file system, processi o sicurezza viene rivista a mano (non delegata ai subagent, come da regole globali).
- **ADR** per ogni decisione che cambia l'architettura.
- **Estendibilità:** pannelli, normalizzatori di eventi, regole per framework e grammatiche Tree-sitter sono registri: una nuova feature si aggiunge con un modulo nuovo, senza toccare il nucleo.
- **Compatibilità con Claude Code:** job CI settimanale che installa l'ultima versione della CLI e verifica i normalizzatori contro una sessione reale breve (solo se si accetta di usare l'abbonamento in CI; altrimenti è un controllo manuale periodico).

---

## 16. Come lavoriamo con Claude su questo progetto

| Momento                                                   | Strumento                               |
| --------------------------------------------------------- | --------------------------------------- |
| Direzione estetica, nuove schermate                       | skill **/frontend-design**              |
| Componenti e schermate in alta fedeltà                    | token + **HTML statico** (niente Figma) |
| Critica e revisione UI                                    | **impeccable**                          |
| Test E2E, visivi, accessibilità                           | **Playwright** (`_electron`)            |
| Ricerche ampie nel codice                                 | subagent `explorer`                     |
| Parti indipendenti (es. pannello Docker e pannello porte) | subagent `implementer` in parallelo     |
| IPC, sicurezza, hooks bridge, file system, packaging      | agente principale, mai delegato         |
| Commit, push, aggiornamento di questo piano               | agente principale                       |

**Primo passo concreto dopo l'approvazione del piano:** Fase 0 (repo) e, in parallelo, registrazione delle prime sessioni (Fase 2) e moodboard (Fase 1).
