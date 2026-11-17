# Brief operativo — Fase 4: prima versione usabile

> Questo file passa il lavoro alla sessione che apre la Fase 4. Va letto insieme a `STATO.md`, alla sezione "Fase 4" di `PIANO.md` (§7) e a `SICUREZZA.md`. Si aggiorna a ogni sotto-fase chiusa; a fine fase si archivia, cioè lo si riassume in `STORIA.md` e lo si toglie dalla repo.
>
> **Stato:** 4.0 e 4.2 unite su `main`; 4.1 implementata su `feat/hooks-bridge` (ADR 0009); 4.3 da fare.

## Obiettivo

Dalla Fase 4 l'app serve ogni giorno. Si apre un workspace e si usa il terminale. Si conduce una sessione Claude Code con:

- chat in streaming;
- richieste di permesso;
- cronologia in JSONL.

L'hooks bridge consegna gli eventi in tempo reale via named pipe, con un token per ogni sessione. La CI non chiama mai il vero servizio: un finto eseguibile `claude` riproduce le fixture.

## Prima di iniziare (bloccante per 4.1, risolto)

Risolto con `sessione-07` (PR #38). Il testo resta come procedura per registrare nuove fixture. In origine mancava la fixture reale di `Notification`; `PostToolUseFailure` è in `sessione-06`. Per catturarle serve una sessione interattiva breve nel progetto di prova, con l'hook `PostToolUseFailure` attivo. Poi:

1. `node scripts/fixtures/sanitize.mjs`;
2. rileggere a mano il risultato;
3. aggiornare gli snapshot con `npx vitest run packages/fixtures -u`.

Questa sessione la deve fare l'utente: Claude non può avviare una sessione interattiva al suo posto.

## Regole che valgono per tutta la fase

- **Niente subagent** su IPC, processi figli, named pipe, token, file system e configurazione degli hooks (`CLAUDE.md`, regola 1). Si possono delegare solo pezzi di UI già specificati (4.3) e bozze di test.
- **Leggere `SICUREZZA.md` prima di ogni sotto-fase.** Ogni nuova superficie d'attacco va aggiunta lì, con un test che la copra:
  - la pipe;
  - l'avvio di `claude`;
  - il pty;
  - i percorsi del workspace.
- **IPC solo da `packages/ipc-contract/src/contract.ts`,** con zod e controllo del mittente:
  - nessun canale generico "esegui comando";
  - il terminale scrive solo sul proprio pty, identificato da un id;
  - i flussi continui (output del pty, eventi della sessione) richiedono un canale push. Il canale va progettato nel contratto: oggi esiste solo richiesta/risposta, e la Console Errori interroga ogni secondo.
- **Tutto ciò che entra passa da uno schema zod:** eventi degli hooks, righe stream-json, messaggi della pipe. Gli eventi diventano `AgentEvent` tramite i normalizzatori di `@control-center/event-schema`. Testi e log passano da `makeTextCleaner`/`redactSecrets`.
- **Mai modificare** `~/.claude*` o file di configurazione dell'utente. La configurazione degli hooks è temporanea, per sessione, e sta nella cartella dati dell'app (regola 8).
- **Dipendenze di runtime:**
  - xterm.js e node-pty sono già coperti dall'ADR 0001;
  - per il resto (rendering Markdown, evidenziazione del codice) serve un'ADR nuova;
  - node-pty va ricompilato per Electron (`pnpm.onlyBuiltDependencies` esteso solo per lui).
- **UI:** solo token, stati semantici di `DESIGN.md` (`waiting-user` per i permessi), revisione impeccable su ogni PR di UI.

## Punti di partenza già pronti

| Cosa                                         | Dove                                                                     | Serve per |
| -------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| Schema `AgentEvent`, normalizzatori, merge   | `packages/event-schema` (ADR 0003)                                       | 4.1, 4.3  |
| Fixture ripulite (stream-json, hooks)        | `packages/fixtures/sanitized/` con il loader                             | 4.1, 4.3  |
| Contratto IPC, gate del main, `window.api`   | `packages/ipc-contract` (ADR 0004)                                       | tutta     |
| Supervisione dei processi figli, logger      | `superviseChild` nel main, `packages/app-log` (ADR 0005)                 | 4.1, 4.2  |
| Shell a pannelli, dock, palette, scorciatoie | `apps/desktop/src/renderer` (ADR 0006), ambito di focus del terminale    | 4.2, 4.3  |
| Schermate e stati di chat e permessi         | `design/sistema/` (P0/P1 della 1c), `design/ricerca/architettura.md`     | 4.3       |
| Scope di commit già previsti                 | `hooks-bridge`, `desktop`, `main`, `preload`, `renderer`, `ipc-contract` | tutta     |

Cose da sapere:

- `packages/hooks-bridge` non esiste ancora.
- I normalizzatori oggi lavorano a blocchi: dal vivo servono versioni incrementali.
- `normalizeClaudeHooks` collega gli hooks dei subagent alla chiamata `Agent` solo a posteriori. Dal vivo l'attribuzione va presa dallo stream, con `parent_tool_use_id`.

## Sotto-fasi, modello e goal

Una sessione o un loop per sotto-fase, su un branch `feat/…` con PR e merge a mano a CI verde. Ogni sotto-fase si chiude con la skill `fine-sessione`. Niente ultracode. Modello ed effort per sotto-fase vengono da `PIANO.md`:

- **4.1:** Opus 5.5, effort high, `/code-review` high;
- **4.2:** Sonnet 5.5, effort medium;
- **4.3:** Sonnet 5.5, effort high.

### 4.1 — Hooks bridge e sessione Claude

- **Branch proposto:** `feat/hooks-bridge`.
- **Stato:** implementata il 2026-11-17 (ADR 0009). Oltre al brief c'è il namespace IPC `claude` (`start`, `send`, `interrupt`, `close`, evento `claude:updated`), su cui la 4.3 costruisce la chat. Restano per la 4.3 il canale dei permessi su stdin e, per la Fase 10, lo script degli hooks nel pacchetto.
- **Produce:**
  - `packages/hooks-bridge`:
    - lo script chiamato dagli hooks legge l'evento da stdin;
    - lo valida con zod;
    - lo inoltra alla named pipe dell'app (`\\.\pipe\…`, nome casuale per sessione) con il token della sessione;
    - non apre porte TCP e non scrive mai il token nei log;
  - nel main:
    - il server della pipe: rifiuta i messaggi senza token, con token sbagliato, malformati o troppo grandi, e registra ogni rifiuto in Console;
    - la configurazione hooks temporanea per sessione, scritta nella cartella dati e cancellata a fine sessione;
  - il gestore della sessione nel main:
    - avvia `claude -p --input-format stream-json --output-format stream-json` con `--resume`;
    - si appoggia a `superviseChild`;
    - ha i normalizzatori incrementali;
    - unisce stream e hooks in `AgentEvent`;
    - avvisa se la versione della CLI non è tra quelle testate;
  - il finto eseguibile `claude` per i test: riproduce le fixture su stdout e chiama gli hooks.
- **Goal:**
  > L'hooks bridge consegna gli eventi all'app via named pipe con token per sessione (eventi senza token o malformati rifiutati, con test); la sessione `claude -p` in stream-json con `--resume` è gestita dal main e i suoi eventi passano dai normalizzatori di `event-schema`; test di integrazione con il finto eseguibile claude verdi; memoria aggiornata.

### 4.2 — Workspace e terminale

- **Branch proposto:** `feat/workspace-terminal`.
- **Stato:** implementazione pronta sul branch, con revisione e merge dalla PR. Vedi [ADR 0008](../adr/0008-workspace-e-terminale.md).
- **Produce:**
  - **workspace:**
    - elenco dei recenti e aggiunta da cartella (dialog nativo nel main);
    - cambio rapido con `Ctrl+P`;
    - layout e sessioni conservati per ogni workspace;
  - **modulo dei percorsi nel main:** normalizza, risolve i symlink e verifica che il percorso stia dentro il workspace; ha test su traversal, symlink, junction e percorsi UNC;
  - **metodo IPC per aprire un file:** apre un frame della Console Errori o un link del terminale nell'editor esterno, solo dentro il workspace;
  - **terminale:**
    - xterm.js e node-pty ricompilato per Electron;
    - PowerShell o bash, più schede, apertura nella cartella del workspace;
    - ambito di focus del terminale già previsto in 3c;
    - output via canale push.
- **Goal:**
  > Dall'app si apre un workspace (recenti, cambio rapido, percorsi verificati dentro il workspace con test su traversal e symlink) e si usa il terminale PowerShell/bash a più schede con node-pty ricompilato per Electron; E2E verde; memoria aggiornata.

### 4.3 — Chat, permessi e cronologia

- **Branch proposto:** `feat/claude-chat`.
- **Produce:**
  - **chat in streaming:**
    - blocchi tool richiudibili;
    - Markdown e codice (con ADR per la libreria);
    - interruzione e ripresa della sessione;
  - **richieste di permesso:** dicono cosa, su quale file e con quale comando; i pulsanti sono Approva, Rifiuta e Sempre in questa sessione. Usano lo stato `waiting-user` e la regione `aria-live`;
  - **cronologia** delle sessioni in JSONL nella cartella dati, ripulita;
  - **timeline:** prima versione come lista semplice;
  - **test:** E2E con il finto `claude` (permesso approvato, rifiutato, "sempre").
- **Goal:**
  > La chat mostra la sessione in streaming, le richieste di permesso (Approva / Rifiuta / Sempre in questa sessione) funzionano e la cronologia è salvata in JSONL; E2E con il finto eseguibile claude verdi; revisione impeccable senza gravi; memoria aggiornata.

## Fine fase

Il goal complessivo della Fase 4 (in `PIANO.md`) è l'unione dei tre. Alla chiusura:

- sintesi in `STORIA.md`;
- questo file archiviato;
- `SICUREZZA.md` aggiornato con le nuove superfici: pipe, processi `claude`, pty, percorsi.
