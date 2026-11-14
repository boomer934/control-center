# Schermate e stati

> Fase 1a. È l'inventario da disegnare in 1c (HTML statico in `design/sistema/`) e la lista di controllo per le revisioni impeccable. Etichette dell'interfaccia in inglese, scritte `così`. Struttura e flussi: [`architettura.md`](architettura.md).

## Definizione degli stati

| Stato           | Quando                                                                           | Regola di design                                                                                    |
| --------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Vuoto**       | primo avvio, nessun dato, nessuna sessione                                       | spiega cosa comparirà qui e offre **una** azione principale; niente illustrazioni decorative grandi |
| **Caricamento** | dati in arrivo (scansione, connessione a Docker, avvio sessione)                 | scheletro con la forma finale, mai uno spinner a tutta pagina; oltre 2 s mostra cosa sta facendo    |
| **Normale**     | uso tipico: 1 agente, 5-20 file toccati, pochi container                         | riferimento per gerarchia e ritmo                                                                   |
| **Denso**       | 4+ agenti (subagent e Ollama), 100+ file toccati, 500 nodi visibili, 20 eventi/s | deve restare leggibile: si raggruppa, si collassa, si limita il movimento; nessun testo sovrapposto |
| **Errore**      | qualcosa che l'utente può correggere è fallito                                   | colore errore + icona + testo + **azione per uscirne**; mai un vicolo cieco                         |
| **Offline**     | nessuna rete                                                                     | Claude non funziona; Ollama, Docker, porte, Git e replay sì. Si dice cosa resta disponibile         |

**Casi d'errore specifici** (ognuno con messaggio, causa e azione):

| Caso                              | Dove si vede                                            | Azione proposta                                                  |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Claude CLI non installata         | onboarding passo 2, dock Session, barra di stato        | `How to install` (link alla documentazione), `Retry`             |
| Claude non autenticato            | onboarding passo 2, dock Session                        | `Run claude login` nel terminale integrato, `Retry`              |
| Sessione Claude uscita con errore | dock Session, card agente, timeline, toast              | `View log`, `Resume session`                                     |
| Docker spento o assente           | Infra → Docker, barra di stato (**neutro**, non errore) | `Start Docker Desktop` (solo un'istruzione), `Hide Docker`       |
| Ollama assente o spento           | Local agents, Infra → GPU/Ollama (**neutro**)           | `How to install Ollama`, `Retry`                                 |
| GPU NVIDIA assente                | Infra → GPU (**neutro**)                                | spiegazione: VRAM non disponibile, Ollama usa la CPU             |
| Modello non entra in VRAM         | Local agents, avviso sulla scelta del modello           | `Choose a smaller model`, `Use anyway`                           |
| Pipe del bridge non raggiungibile | barra di stato, dock Session, Problems                  | `Restart bridge`, `View log`; la Live continua dallo stream-json |
| Workspace non valido o rimosso    | selettore workspace, Live                               | `Remove from recents`, `Locate…`                                 |
| Errore interno dell'app           | Problems (Console Errori), toast con contatore          | `Copy report` (senza segreti), `Open logs folder`                |

## Inventario

Priorità per la 1c:

- **P0:** serve al flusso principale e al prototipo cliccabile;
- **P1:** serve alla v1;
- **P2:** si può disegnare dopo, partendo dai componenti.

### Sezioni (area centrale)

| Schermata                 | Vuoto                                                              | Caricamento                                   | Normale                                                                | Denso                                                                         | Errore                                                                        | Offline                                         | P   |
| ------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | --- |
| **Live**                  | cartelle principali + "No session yet. Start a task" (focus input) | scheletro della mappa durante la scansione    | 1 agente, file toccati + vicini, timeline che scorre                   | 4+ agenti, corsie figlie, cartelle collassate con heatmap, movimento limitato | nodo/corsia in errore, banner se la sessione è caduta                         | banner "Offline: Claude unavailable", replay ok | P0  |
| **Live — replay**         | "No past sessions in this workspace"                               | ricostruzione dello stato allo scrubber       | sessione passata, barra di modalità read-only                          | sessione lunga (ore): timeline con zoom e salto agli eventi chiave            | file JSONL illeggibile o di una versione incompatibile → `Migrate`/`View raw` | funziona uguale                                 | P1  |
| **Infra**                 | n/a (ci sono sempre le porte)                                      | tre pannelli a scheletro, ognuno indipendente | 4 container, 5 porte, 1 modello in VRAM                                | 30 container, 50 porte: tabelle dense, filtri, raggruppamento per progetto    | per pannello: Docker off / no GPU / Ollama off (neutri)                       | invariato: è tutto locale                       | P1  |
| **Local agents**          | "No local models" + `How to install Ollama`                        | elenco modelli                                | modelli, compiti delegati, comandi rapidi                              | molti compiti in coda: lista con stato e tok/s                                | Ollama non raggiungibile, modello troppo grande                               | invariato                                       | P1  |
| **MCP & Skills**          | "No MCP servers configured" + cosa sono                            | lettura delle configurazioni                  | server con toggle per sessione, skill con anteprima                    | 30+ server e skill: ricerca, gruppi per origine (progetto/utente)             | config non valida (errore zod con riga), server che non parte                 | server remoti segnati non disponibili           | P1  |
| **MCP & Skills — editor** | n/a                                                                | apertura file                                 | CodeMirror con validazione del frontmatter                             | n/a                                                                           | frontmatter non valido, conflitto su file cambiato fuori                      | invariato                                       | P2  |
| **Git**                   | "Not a git repository" + `Initialize` (con conferma)               | stato del repo                                | branch, file modificati, diff, commit, checkpoint                      | 200+ file modificati: raggruppati per cartella, diff caricati su richiesta    | merge in corso, conflitti, lock di git                                        | invariato (push/pull disabilitati con motivo)   | P0  |
| **Telemetry**             | "No sessions yet"                                                  | aggregazione                                  | sessione corrente + ultimi 7 giorni, lavoro in locale                  | 90 giorni, molte sessioni: grafici aggregati, tabella paginata                | dati corrotti di un giorno → saltati, con avviso                              | invariato                                       | P2  |
| **Settings**              | n/a                                                                | n/a                                           | generale, aspetto (tema, densità), modelli, privacy, scorciatoie, info | n/a                                                                           | valore non valido inline                                                      | invariato                                       | P1  |

### Dock e superfici sempre presenti

| Superficie                      | Vuoto                                     | Caricamento                        | Normale                                    | Denso                                                      | Errore                                        | Offline                       | P   |
| ------------------------------- | ----------------------------------------- | ---------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- | ----------------------------- | --- |
| **Dock Session** (chat + input) | input del task con esempi, modello e MCP  | avvio della sessione (`Starting…`) | conversazione, tool collassati in una riga | conversazione lunga: virtualizzata, tool raggruppati       | CLI assente, non autenticata, sessione caduta | input disabilitato con motivo | P0  |
| **Terminal**                    | un terminale nella cartella del workspace | avvio della shell                  | più schede                                 | output molto lungo: limite di scrollback, ricerca          | shell non avviabile                           | invariato                     | P1  |
| **Logs**                        | "No logs yet"                             | n/a                                | log strutturati per processo, filtri       | 10k righe: virtualizzate, filtro per livello               | n/a                                           | invariato                     | P2  |
| **Problems** (Console Errori)   | "No problems" (stato positivo, discreto)  | n/a                                | errori raggruppati, stack leggibile        | 100+ errori: raggruppati con contatore, filtri per origine | n/a (è la schermata degli errori)             | invariato                     | P0  |
| **Barra di stato**              | `No session` + workspace                  | segmenti a scheletro               | tutti i segmenti                           | spazio insufficiente: menu `…` per priorità                | segmento errori evidenziato                   | segmento `Offline`            | P0  |
| **Barra attività + title bar**  | nessun workspace: solo `Open project`     | n/a                                | workspace, sezioni, badge                  | molti workspace recenti: selettore con ricerca             | workspace non valido                          | invariato                     | P0  |

### Overlay e dialog

| Superficie                        | Stati da disegnare                                                                                                            | P   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --- |
| **Command palette**               | vuota (suggerimenti recenti), risultati misti, ogni prefisso (`> / @ # ! ?`), nessun risultato, azione distruttiva → conferma | P0  |
| **Dialog permesso**               | comando Bash, scrittura con anteprima diff, tool MCP, richiesta multipla in coda, comando lungo (troncato con espansione)     | P0  |
| **Diff viewer**                   | un file, più file, file nuovo/eliminato/rinominato, file binario, diff enorme (caricamento progressivo)                       | P0  |
| **Ispettore evento** (Live)       | vista umana, vista raw (JSON), evento d'errore, evento di un agente Ollama, nessuna selezione                                 | P0  |
| **Conferma azione distruttiva**   | ripristino checkpoint (tutto / alcuni file), discard, stop di un container, con anteprima                                     | P0  |
| **Selettore workspace**           | recenti, ricerca, workspace non più esistente                                                                                 | P1  |
| **Toast**                         | info, done, error, raggruppato con contatore                                                                                  | P1  |
| **Notifica di Windows**           | permesso richiesto, agente fermo, task completato                                                                             | P1  |
| **Proposta di diff (Ollama)**     | proposta da approvare, approvata, rifiutata                                                                                   | P1  |
| **Avviso riavvio sessione (MCP)** | `Restart now` / `Next session`                                                                                                | P2  |

## Onboarding (3 passi, saltabile)

Si mostra al primo avvio; si riapre da `Settings → General → Run setup again`. `Skip` è sempre visibile: saltando si arriva alla Live vuota, con gli stessi controlli disponibili in barra di stato.

1. **Choose a project**
   - Il pulsante `Open folder` apre la finestra di scelta di Windows.
   - Sotto ci sono le cartelle recenti di VS Code, se leggibili senza permessi aggiuntivi; altrimenti nulla.
   - **Errore:** la cartella non esiste o non si può leggere.
2. **Check Claude Code**
   - L'app esegue `claude --version` e lo stato del login.
   - **Stati:**
     - verifica in corso;
     - ok (versione + "Logged in");
     - CLI assente (istruzioni);
     - non autenticato (`Run claude login` nel terminale integrato e `Retry`).
   - Nessun dato di account viene mostrato oltre al fatto che il login è attivo.
3. **Optional: Docker and Ollama**
   - Due righe indipendenti, ognuna con lo stato: verifica, trovato (versione, numero di container/modelli), assente (neutro, con link alle istruzioni).
   - La GPU si mostra come informazione.
   - `Finish` porta alla Live con il progetto scelto.

## Cosa serve a 1b e 1c

- **1b (tre direzioni estetiche):** ogni direzione disegna la **Live in stato normale** come schermata HTML statica e, se possibile, una seconda schermata in stato **denso**, per verificare che la direzione regga 4+ agenti e il contrasto in scala di grigi. Contenuti:
  - dock Session con un **dialog permesso** aperto;
  - barra di stato completa con il segmento di attesa;
  - nella mappa almeno un nodo per ognuno dei 7 stati semantici;
  - i 3 tipi di agente: Claude, subagent, Ollama.
- **1c (HTML statico):** tutte le righe **P0** con tutti i loro stati, poi le **P1**. Le **P2** solo se c'è tempo, partendo dai componenti. I flussi F1-F7 di [`architettura.md`](architettura.md#flussi-principali) si verificano sulla sequenza delle schermate; il prototipo interattivo è quello in codice della 1d.
