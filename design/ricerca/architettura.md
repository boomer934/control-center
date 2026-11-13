# Architettura dell'informazione

> Fase 1a. Il testo è in italiano; le etichette dell'interfaccia sono in inglese (app open source) e sono scritte `così`. I valori numerici (larghezze, punti di rottura) sono **indicativi**: i valori veri diventano token in 1c. Vincoli di partenza: `docs/memoria/DESIGN.md`, `PIANO.md` §4.1-4.5, Fase 4b e "Errori e stack trace".

## Principi

1. **La Vista Live è la casa.** Si apre lì, si torna lì con `Ctrl+1`. Le altre sezioni sono strumenti di contorno.
2. **Calma per default.** Se nulla richiede attenzione, nulla si muove fuori dal punto in cui lavora l'agente. Solo `waiting-user` richiama lo sguardo.
3. **Vista umana ovunque, vista raw a un tasto.** Ogni evento ha una frase leggibile ("Edited `client.ts` (+12 −3)") e il JSON originale dietro `R`.
4. **Tutto da tastiera.** Ogni azione ha una voce nella command palette; quelle frequenti hanno una scorciatoia.
5. **I pannelli non si aprono da soli** per rubare spazio, tranne il dialog di un permesso richiesto dall'agente. Il resto si segnala con badge e contatori.
6. **Le assenze non sono errori.** Senza Docker, GPU o Ollama l'app funziona: i segmenti relativi diventano neutri e spiegano come attivarli.

## Struttura della finestra

```
┌───┬──────────────────────────────────────────────────────┬────────────────────┐
│ W │  Title bar: workspace ▾ · branch · session title      │                    │
│ ─ ├──────────────────────────────────────────────────────┤   Dock destro      │
│ L │                                                      │   "Session"        │
│ I │                                                      │   (chat Claude,    │
│ A │               Area centrale                          │    permessi,       │
│ M │          (sezione attiva, default Live)              │    input task)     │
│ G │                                                      │                    │
│ T │                                                      │                    │
│ ─ ├──────────────────────────────────────────────────────┴────────────────────┤
│ S │  Dock inferiore: Terminal │ Logs │ Problems (Console Errori)              │
├───┴───────────────────────────────────────────────────────────────────────────┤
│ Status bar: workspace · session · agents · ⚠ waiting · ✖ errors · tok · VRAM · Docker │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Barra attività (sinistra, stretta, ~48 px):**
  - in alto l'avatar del workspace (iniziali + colore stabile), che apre il selettore dei workspace;
  - le icone delle 7 sezioni, con tooltip ed etichetta;
  - in basso `Settings`.
  - Le sezioni con qualcosa da segnalare hanno un badge: ad esempio Git con il numero di file modificati, Infra con un avviso sulle porte esposte.
- **Title bar personalizzata:**
  - selettore del workspace, branch corrente, titolo della sessione attiva;
  - a destra i pulsanti per mostrare o nascondere i dock e i controlli della finestra di Windows.
- **Area centrale:** la sezione attiva.
- **Dock destro "Session":** la conversazione con Claude, l'input del task e il **dialog dei permessi**. Larghezza ridimensionabile (indicativo 360-560 px).
- **Dock inferiore:** schede `Terminal` (più terminali), `Logs` (log dell'app e dei processi figli) e `Problems` (Console Errori). Altezza ridimensionabile.
- **Barra di stato:** sempre visibile, in ogni sezione. Vedi [Barra di stato](#barra-di-stato).

### Sezioni

| #   | Sezione (etichetta UI) | Contenuto                                                                                | Scorciatoia |
| --- | ---------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| 1   | `Live`                 | mappa + timeline + pannello agenti/ispettore                                             | `Ctrl+1`    |
| 2   | `Infra`                | Docker, porte, GPU/Ollama                                                                | `Ctrl+2`    |
| 3   | `Local agents`         | modelli Ollama, compiti delegati, comandi rapidi, politica di instradamento              | `Ctrl+3`    |
| 4   | `MCP & Skills`         | server MCP (toggle per sessione), libreria di skill e comandi con editor                 | `Ctrl+4`    |
| 5   | `Git`                  | branch, file modificati, diff, ultimi commit, checkpoint degli agenti                    | `Ctrl+5`    |
| 6   | `Telemetry`            | consumi per sessione e giorno, lavoro fatto in locale                                    | `Ctrl+6`    |
| 7   | `Settings`             | generale, temi e densità, modelli, privacy ("cancella tutto"), scorciatoie, informazioni | `Ctrl+7`    |

## Navigazione

- **Workspace = cartella di un progetto.**
  - Si apre con `Ctrl+O` o dall'onboarding.
  - `Ctrl+Alt+O` apre la lista dei recenti, filtrabile.
  - Ogni percorso viene normalizzato e verificato dentro il workspace (regola di sicurezza).
- **Un workspace ha sessioni.** La sessione attiva sta nella title bar; le sessioni passate si aprono in replay (sola lettura) dalla palette (`#`) o dalla timeline.
- **Persistenza per workspace:** sezione attiva, layout dei dock, zoom e posizione della mappa, filtri della timeline.
- **Indietro/avanti:** `Alt+←`/`Alt+→` tra le selezioni (nodo, evento, errore), come in un IDE.

## Dock agganciabili

| Azione                         | Come                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| Mostra/nascondi dock destro    | `Ctrl+Alt+B`, pulsante nella title bar                                 |
| Mostra/nascondi dock inferiore | `Ctrl+J`; `` Ctrl+` `` apre direttamente `Terminal`                    |
| Comprimi barra attività        | `Ctrl+B` (diventa solo icone senza badge testuali; non sparisce mai)   |
| Ridimensiona                   | trascinando il bordo; doppio clic sul bordo → dimensione predefinita   |
| Massimizza un dock             | doppio clic sulla linguetta o `Ctrl+Shift+Enter` sul dock con il focus |
| Sposta una scheda              | fuori v1: le schede restano nel proprio dock (riduce la complessità)   |

**Layout predefiniti**

- **Dev quotidiano** (finestra ≥ 1280 px): Live + dock destro aperto, dock inferiore chiuso.
- **Di passaggio** (finestra stretta, tipico secondo monitor in verticale o a metà schermo):
  - **< 1100 px:** il dock destro diventa un pannello sovrapposto che si apre su richiesta o per un permesso;
  - **< 800 px:** la Vista Live mostra solo il pannello agenti e una timeline compatta; la mappa resta a un tasto.
- **Prima apertura:** onboarding (vedi [`schermate.md`](schermate.md#onboarding-3-passi-saltabile)).

## Vista Live: layout interno

```
┌──────────────────────────────────────────────┬──────────────────┐
│ Toolbar: Follow ▾ · Filters · Fit · Replay ⏵ │  Agents │Inspector│
├──────────────────────────────────────────────┤ ┌──────────────┐ │
│                                              │ │ ◆ Claude     │ │
│                 MAPPA                         │ │ editing      │ │
│   (cartelle → file → simboli, zoom semantico) │ │ client.ts    │ │
│   avatar agenti agganciati ai nodi            │ │ 2m14 · 41k   │ │
│                                    ┌───────┐ │ └──────────────┘ │
│                                    │minimap│ │ ┌──────────────┐ │
│                                    └───────┘ │ │ ▲ qwen-coder │ │
├──────────────────────────────────────────────┤ │ local · 38t/s│ │
│ TIMELINE  swimlane per agente, corsie figlie  │ └──────────────┘ │
│ ──●──■■──▲────────●───────────|scrubber       │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

- **Mappa** (area principale): specifica in `PIANO.md` §4.3-A. Decisioni di architettura:
  - per default solo i file toccati nella sessione e i loro vicini diretti; il resto collassato nelle cartelle;
  - **filtri** nella toolbar: per agente, per stato, "mostra tutto il progetto";
  - **`Fit`** (`0`) inquadra tutto ciò che è visibile.
  - **Segui agente** (`F` o il menu `Follow ▾`):
    - la camera segue l'agente selezionato;
    - qualsiasi input sulla mappa (trascinamento, rotella) lo interrompe, e compare la pillola "Following stopped · F to resume";
    - `Esc` lo ferma.
  - **Anteprima diff** al passaggio del mouse su un nodo `writing`/`done` con modifiche; clic → Diff viewer.
  - **Nodi temporanei** per comandi, servizi e MCP: compaiono collegati all'agente e svaniscono quando l'attività finisce.
- **Timeline** (striscia in basso nell'area Live, altezza ridimensionabile):
  - swimlane per agente, con le corsie figlie dei subagent e degli agenti Ollama agganciate al punto di nascita;
  - clic su un blocco → seleziona il nodo sulla mappa e apre l'ispettore.
  - **Scrubber di replay:** trascinandolo si entra in modalità replay, segnalata da una barra di modalità; `Live ⏭` torna al presente. Controlli: `Space` play/pausa, `←`/`→` evento precedente/successivo, `Shift+←/→` salto di un minuto.
- **Colonna destra della Live** (larghezza indicativa 280-320 px, comprimibile), a due schede:
  - **`Agents`:** una card per agente attivo con glifo e colore d'identità, modello, compito, tool in uso, tempo, token (tok/s per Ollama). Azioni: `Interrupt`, `Open log`, `Follow on map`.
  - **`Inspector`:** si attiva da solo quando si seleziona un nodo o un evento, e lo mostra in vista umana (frase, file, durata, esito) o in vista raw (JSON originale, copiabile).
  - Se la finestra è stretta e il dock destro è aperto, la colonna si riduce a una striscia di avatar.
- **Vista umana ↔ raw:** `R` (con il focus nella Live, fuori dai campi di testo) e voce di palette `Toggle raw view`. Vale per timeline e ispettore; la scelta resta per workspace.

## Barra di stato

Segmenti da sinistra a destra. La **priorità** decide cosa resta quando lo spazio non basta: si nascondono prima i segmenti con il numero più alto, che finiscono in un menu `…`.

| Segmento                        | Contenuto (esempio)                 | Clic                                  | Priorità |
| ------------------------------- | ----------------------------------- | ------------------------------------- | -------- |
| Workspace                       | `control-center · feat/x`           | selettore workspace                   | 8        |
| Sessione                        | `● Session active` / `○ No session` | dock Session                          | 4        |
| Agenti                          | `◆ Claude · editing · +2`           | Live → scheda Agents                  | 3        |
| **Attesa** (solo se presente)   | `⚠ Waiting for you: run npm test`   | apre il dialog del permesso           | **1**    |
| Errori                          | `✖ 3`                               | dock inferiore → Problems             | 2        |
| File modificati                 | `2 changed`                         | Diff viewer con l'elenco              | 6        |
| Token                           | `182k tok · 31k local`              | Telemetry; al passaggio: in/out/cache | 5        |
| VRAM                            | `▮▮▮▯ 9.1/16 GB`                    | Infra → GPU/Ollama                    | 7        |
| Docker                          | `Docker · 4` / `Docker off`         | Infra → Docker                        | 9        |
| Porte esposte (solo se ci sono) | `⚠ 1 exposed port`                  | Infra → Ports                         | 7        |

- Le cifre sono **tabulari**, perché i contatori cambiano in tempo reale.
- Il segmento di attesa usa il colore attenzione **più** un'icona **più** testo. È l'unico segmento che può pulsare, e solo con `prefers-reduced-motion` disattivo.

## Command palette

- **`Ctrl+K`**, con l'alternativa `Ctrl+Shift+P` che funziona **anche quando il focus è nel terminale**: lì `Ctrl+K` passa alla shell.
- Senza prefisso cerca in tutto, con le azioni in cima. **Prefissi:**

| Prefisso | Cerca                                    | Esempio                |
| -------- | ---------------------------------------- | ---------------------- |
| `>`      | solo azioni                              | `> restore checkpoint` |
| `/`      | file del workspace (li mostra in mappa)  | `/client.ts`           |
| `@`      | agenti (segui, interrompi, log)          | `@qwen interrupt`      |
| `#`      | sessioni, anche passate (apre il replay) | `#yesterday refactor`  |
| `!`      | comandi rapidi locali (Ollama)           | `! summarize this log` |
| `?`      | aiuto e scorciatoie                      | `?`                    |

- Ogni voce mostra la sua scorciatoia, se esiste. Le azioni distruttive (`Restore checkpoint`, `Discard changes`) aprono sempre la conferma con anteprima, anche dalla palette.

## Scorciatoie

**Ambiti di focus.** Una scorciatoia vale nell'ambito più interno che ha il focus. Il **terminale** cattura tutto tranne `Ctrl+Shift+P`, `` Ctrl+` ``, `Ctrl+J` e `Ctrl+1…7`: così `Ctrl+C`, `Ctrl+K`, `Ctrl+L` arrivano alla shell. I tasti singoli (`R`, `F`, `0`, `Space`) valgono solo nella Live e mai dentro un campo di testo.

| Azione                              | Scorciatoia                            | Ambito                  |
| ----------------------------------- | -------------------------------------- | ----------------------- |
| Command palette                     | `Ctrl+K`                               | globale (non terminale) |
| Command palette (sempre)            | `Ctrl+Shift+P`                         | globale                 |
| Sezioni 1-7                         | `Ctrl+1` … `Ctrl+7`                    | globale                 |
| Apri progetto / recenti             | `Ctrl+O` / `Ctrl+Alt+O`                | globale                 |
| Vai a ciò che aspetta me            | `Ctrl+Shift+A`                         | globale                 |
| Focus sull'input del task (Session) | `Ctrl+L`                               | globale (non terminale) |
| Interrompi l'agente selezionato     | `Ctrl+Alt+X`                           | globale                 |
| Dock destro / inferiore / terminale | `Ctrl+Alt+B` / `Ctrl+J` / `` Ctrl+` `` | globale                 |
| Problems (Console Errori)           | `Ctrl+Shift+M`                         | globale                 |
| Barra attività compatta             | `Ctrl+B`                               | globale                 |
| Indietro / avanti tra le selezioni  | `Alt+←` / `Alt+→`                      | globale                 |
| Approva il permesso                 | `Ctrl+Enter`                           | dialog permesso         |
| Rifiuta                             | `Ctrl+Backspace`                       | dialog permesso         |
| Sempre in questa sessione           | `Ctrl+Shift+Enter`                     | dialog permesso         |
| Vista umana ↔ raw                   | `R`                                    | Live                    |
| Segui agente / smetti               | `F` / `Esc`                            | Live                    |
| Inquadra tutto                      | `0`                                    | Live → mappa            |
| Replay play/pausa, passo, salto     | `Space`, `←/→`, `Shift+←/→`            | Live → timeline         |
| Torna al presente                   | `End`                                  | Live → timeline         |

- Nel dialog del permesso `Enter` da solo **non** approva: si evita un'approvazione per sbaglio mentre si scrive altrove.
- `Esc` chiude il dialog **senza** rifiutare: la richiesta resta in attesa nella barra di stato.
- Le scorciatoie saranno riassegnabili in `Settings → Keyboard` (Fase 3); questa tabella è il default.

## Notifiche

| Evento                                  | Nell'app                                    | Fuori dall'app (Windows)                       |
| --------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Permesso richiesto (`waiting-user`)     | dialog nel dock Session, segmento di attesa | notifica (clic → dialog) + badge sulla taskbar |
| Agente fermo per errore o uscito        | toast `error` con azione `Open`             | notifica, se la finestra non ha il focus       |
| Task completato                         | toast `done`, discreto                      | notifica solo se attivata nelle impostazioni   |
| Errore rilevato nel progetto (Fase 5e)  | contatore in Problems, nodo rosso           | no                                             |
| Assenze (Docker spento, Ollama assente) | segmento neutro                             | no                                             |

I toast si raggruppano: tre errori uguali diventano un toast con contatore. Le notifiche di Windows si possono silenziare per workspace.

## Flussi principali

Il flusso del prototipo cliccabile di 1c: **apro progetto → lancio task → guardo l'agente sulla mappa → approvo un permesso → vedo il diff → ripristino un checkpoint → leggo un errore.**

### F1 — Apro il progetto

1. Avvio dell'app → si apre l'ultimo workspace; al primo avvio parte l'onboarding.
2. `Ctrl+O` → selettore della cartella di Windows; oppure `Ctrl+Alt+O` per i recenti.
3. Si apre la **Live** in stato vuoto: la mappa mostra le cartelle principali e il messaggio "No session yet. Start a task" con il focus sull'input del dock Session.
4. Intanto la barra di stato si popola (Docker, VRAM, branch) senza bloccare.

### F2 — Lancio un task

1. `Ctrl+L` → input del task nel dock Session. Sopra l'input: modello, MCP attivi (link a `MCP & Skills`), checkpoint automatico attivo.
2. `Enter` invia. La sessione parte; in Live compare l'avatar di Claude e la timeline inizia a scorrere.
3. Prima della prima scrittura l'app crea un **checkpoint** (Fase 4b): appare come marcatore nella timeline.

### F3 — Guardo l'agente sulla mappa

1. L'avatar si aggancia al file che l'agente legge (arco di lettura, stato `reading`) o modifica (arco di scrittura, `writing`).
2. `F` attiva "Segui agente". Con più agenti, `@` nella palette o clic su una card del pannello `Agents`.
3. Un subagent compare come avatar figlio e come corsia figlia nella timeline.

### F4 — Approvo un permesso

1. L'agente chiede il permesso → stato `waiting-user`: avatar e card in colore attenzione, segmento di attesa in barra di stato, notifica di Windows se l'app non ha il focus.
2. Dal clic sulla notifica, da `Ctrl+Shift+A` o dalla barra di stato si arriva al **dialog** nel dock Session. Il dialog mostra:
   - il tool;
   - il comando completo o i percorsi;
   - il motivo dato dall'agente;
   - per le scritture, l'anteprima del diff.
3. `Approve` / `Deny` / `Always this session`. L'agente riparte e lo stato torna `running`.

### F5 — Vedo il diff

1. Sulla mappa i file scritti hanno il badge `+N −M`. Al passaggio del mouse compare l'anteprima del diff dell'ultima modifica.
2. Clic → **Diff viewer** (sovrapposto all'area centrale): elenco dei file della sessione a sinistra, diff a destra, scelta tra "ultima modifica", "dall'inizio della sessione" e "rispetto a HEAD".
3. Da qui `Open in editor` (VS Code esterno) o `Show on map`.

### F6 — Ripristino un checkpoint

1. Nella timeline (o in `Git → Checkpoints`) si sceglie un marcatore di checkpoint.
2. `Restore…` apre la **conferma con anteprima**: file che cambieranno, diff, scelta tra "tutto" e "solo alcuni file".
3. La conferma richiede un'azione esplicita (pulsante `Restore N files`, mai `Enter` di default). Il branch dell'utente non viene toccato: il ripristino agisce sul working tree e prima crea un checkpoint dello stato attuale, così si può annullare.

### F7 — Leggo un errore

1. Un errore compare come contatore `✖` nella barra di stato. Se riguarda un file del progetto (Fase 5e), il nodo diventa rosso con un'icona.
2. Clic → `Problems` nel dock inferiore. Gli errori sono raggruppati e ripetuti con un contatore; i frame del progetto sono evidenziati e quelli di `node_modules` collassati.
3. Clic su un frame → `Open in editor` alla riga giusta, oppure `Show on map`.
4. Azioni rapide: `Ask Claude to fix`, `Explain locally` (Ollama), `Copy report` (già ripulito dai segreti).

## Flussi secondari

- **S1 — Onboarding:** 3 passi saltabili (scegli progetto → verifica `claude login` → verifica Docker/Ollama, opzionali). Dettaglio in [`schermate.md`](schermate.md#onboarding-3-passi-saltabile).
- **S2 — Dall'errore al file:** è F7 partendo dalla mappa: nodo rosso → ispettore con l'errore → frame → editor.
- **S3 — Delega a Ollama:**
  - **diretta:** `!` nella palette (es. `! summarize this log`, `! draft tests for client.ts`), senza passare da Claude;
  - **indiretta:** Claude chiama `delegate_to_local_agent`.
  - In entrambi i casi l'agente locale ha il suo avatar e la sua corsia. **Non scrive file**: un risultato con modifiche arriva come **proposta di diff** da approvare.
- **S4 — Replay di una sessione passata:** `#` nella palette o `Live → Replay ⏵` → elenco delle sessioni del workspace → si apre in sola lettura (barra di modalità "Replay · read-only", input del task disabilitato). Lo scrubber ricostruisce la mappa in qualsiasi istante.
- **S5 — Toggle MCP:**
  - in `MCP & Skills` si attiva o disattiva un server per la sessione;
  - se la sessione è in corso, un avviso spiega che serve il **riavvio** (con `--resume`), con le azioni `Restart now` / `Next session`;
  - per i server di terze parti si mostrano comando e origine prima di abilitarli;
  - i file dell'utente non si modificano senza conferma e backup.

## Decisione aperta: densità predefinita

**Raccomandazione:** **compatta "da IDE" per default**, con l'opzione `Comfortable` in `Settings → Appearance`.

- **Perché:**
  - la persona principale tiene l'app accanto all'editor e spesso su metà schermo;
  - timeline, tabelle di Infra e Problems sono liste lunghe;
  - la Vista Live deve reggere 500 nodi: nella stessa area entra più contesto.
- **Rischio:** con tanti nodi e testi piccoli la mappa può diventare illeggibile.
- **Mitigazione:**
  - lo zoom semantico mostra meno elementi, ma più grandi;
  - la densità riguarda liste e pannelli, non la dimensione minima del testo, che resta leggibile e con contrasto AA.
- **Si decide in 1b** guardando le tre direzioni in entrambe le densità; poi diventa token in 1c.
