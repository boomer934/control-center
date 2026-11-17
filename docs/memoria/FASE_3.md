# Brief operativo — Fase 3: shell Electron sicura

> File di passaggio per la sessione che apre la Fase 3. Va letto insieme a `STATO.md`, alla sezione "Fase 3" di `PIANO.md` (§6) e a `SICUREZZA.md`. Va aggiornato a ogni sotto-fase chiusa e archiviato (spostato in `STORIA.md` in sintesi) a fine fase.
>
> **Stato:** 3a completata il 2026-11-17 (PR #23, `985130d`, ADR 0004). 3b completata il 2026-11-17 (PR #25, `2c64bf8`, ADR 0005). 3c da fare. Brief preparato il 2026-11-14, alla chiusura della Fase 2.
>
> **Da sapere per 3b e 3c**, dalla 3a:
>
> - nuovi metodi IPC solo in `packages/ipc-contract/src/contract.ts`, con test;
> - la CSP vieta stili inline e `<style>` iniettati in produzione: le librerie di 3c vanno controllate;
> - tutti i permessi web sono negati, appunti compresi;
> - `pnpm e2e` gira sulla build in `out/`, e i test di sviluppo usano `rendererConfig`.

## Obiettivo

La prima versione dell'app vera in `apps/desktop`: una shell Electron sicura per costruzione, con IPC tipizzato e validato, cattura degli errori con Console Errori, e il design system della 1c portato in codice. Nessuna funzione di prodotto ancora (workspace, terminale e sessione Claude arrivano in Fase 4).

## Regole che valgono per tutta la fase

- **Niente subagent** su IPC, processi, file system, CSP, Fuses e preload (`CLAUDE.md`, regola 1). Si possono delegare solo pezzi di UI già specificati in 3c.
- Leggere `SICUREZZA.md` prima di 3a e 3b. Ogni voce della checklist Electron si spunta solo quando c'è un test che la verifica.
- **ADR prima delle dipendenze di runtime.** L'ADR 0001 copre già Electron, electron-vite, electron-builder, React 19, Tailwind v4, Radix/shadcn, Lucide, Motion, Zustand e zod. Servono ADR nuove per tutto il resto, per esempio:
  - logger (il piano dice pino) in 3b;
  - pannelli ridimensionabili e command palette (es. `react-resizable-panels`, `cmdk`) in 3c.

  Le dipendenze solo di sviluppo e build (`@electron/fuses`, `@playwright/test`) non richiedono ADR, ma vanno citate nella STORIA.

- `pnpm.onlyBuiltDependencies` in `pnpm-workspace.yaml` va esteso solo per i pacchetti che devono davvero eseguire script (Electron sì).
- Gli eventi e i log usano `makeTextCleaner` e `redactSecrets` di `@control-center/event-schema`: nessun segreto o percorso personale in log o Console.
- Ogni PR di UI passa da impeccable. Colori, spaziature e durate solo dai token.

## Punti di partenza già pronti

| Cosa                                             | Dove                                                                     | Serve per |
| ------------------------------------------------ | ------------------------------------------------------------------------ | --------- |
| Checklist Electron e modello delle minacce       | `docs/memoria/SICUREZZA.md`                                              | 3a, 3b    |
| Schema eventi, redazione, percorsi               | `packages/event-schema` (ADR 0003)                                       | 3b        |
| Token e generatore CSS                           | `design/tokens.json`, `design/sistema/tokens.css`                        | 3c        |
| Componenti e stati in HTML                       | `design/sistema/componenti.html`, `componenti.css`, sprite di `shell.js` | 3c        |
| Navigazione, dock, scorciatoie e ambiti di focus | `design/ricerca/architettura.md`                                         | 3c        |
| Stati semantici, densità `compact`, movimento    | `docs/memoria/DESIGN.md`                                                 | 3c        |
| Scope di commit già previsti                     | `desktop`, `main`, `preload`, `renderer`, `ipc-contract`, `errors`       | tutta     |

`apps/desktop/` oggi contiene solo un `README.md`; `packages/ipc-contract` non esiste ancora.

## Sotto-fasi, modello e goal

Una sessione o un loop per sotto-fase, su un branch `feat/…` con PR e merge a mano a CI verde. Ogni sotto-fase si chiude con la skill `fine-sessione`. Niente ultracode. Modello ed effort per sotto-fase (da `PIANO.md`, revisione del 2026-11-14 per il consumo di token):

- **3a:** Opus 5.5, effort high;
- **3b:** Sonnet 5.5, effort high;
- **3c:** Sonnet 5.5, effort medium.

### 3a — Shell sicura e IPC

- **Branch proposto:** `feat/desktop-shell`.
- **Produce:**
  - `apps/desktop` con electron-vite (main, preload, renderer React 19) e `pnpm dev`;
  - finestra con `contextIsolation`, `sandbox`, `webSecurity`, niente `nodeIntegration`; CSP restrittiva; `setWindowOpenHandler` → deny; `will-navigate` bloccato; link esterni solo `https:` via `shell.openExternal`; permessi web negati;
  - Electron Fuses applicati in build (`RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` off; integrità ASAR e `OnlyLoadAppFromAsar` on);
  - `packages/ipc-contract`: canali espliciti con schemi zod di richiesta e risposta, controllo del mittente nel main, preload che espone solo `window.api` tipizzato; nessun canale generico;
  - Playwright `_electron` e `pnpm e2e`, anche nel job CI su Windows.
- **Goal:**
  > `apps/desktop` si avvia con electron-vite; contextIsolation, sandbox, CSP, blocco di navigazione e `window.open` e Fuses sono attivi e verificati da test; tutti i canali IPC passano da `packages/ipc-contract` con validazione zod e controllo del mittente; la checklist Electron di `SICUREZZA.md` è tutta spuntata, ogni voce con il suo test; un test E2E Playwright `_electron` avvia l'app anche in CI; memoria aggiornata.

### 3b — Logger, cattura errori e Console Errori

- **Branch proposto:** `feat/errors-console`.
- **Produce** (dettagli in `PIANO.md`, "Errori e stack trace in tempo reale", livello 1):
  - logger strutturato (con ADR) → JSONL ruotati nella cartella dati, più stream verso la Console;
  - cattura di `uncaughtException`/`unhandledRejection` nel main, `window.onerror`/`unhandledrejection` ed Error Boundary nel renderer, uscite anomale e stderr dei processi figli, errori di validazione IPC;
  - source map in sviluppo e incluse (non pubblicate) in produzione, così lo stack punta al sorgente TypeScript;
  - Console Errori: raggruppamento con contatore, frame del progetto evidenziati e `node_modules` collassati, "copia report" già ripulito; nessun invio esterno.
- **Goal:**
  > Il logger scrive JSONL ruotati e alimenta la Console Errori; un errore provocato nel main, nel renderer e in un processo figlio compare in Console con lo stack del sorgente TypeScript (test E2E verdi); log e report passano da `redactSecrets`; memoria aggiornata.

### 3c — Design system in codice e interfaccia di base

- **Branch proposto:** `feat/desktop-ui`.
- **Produce:**
  - `design/tokens.json` → Tailwind v4 (tema chiaro, scuro e sistema; densità `compact`);
  - componenti base portati da `componenti.html` con tutti gli stati;
  - layout a pannelli agganciabili con dimensioni ricordate, barra attività, barra di stato;
  - command palette (`Ctrl+K`, e `Ctrl+Shift+P` che vale ovunque), scorciatoie mostrate nei tooltip e in `?`, ambiti di focus come in `architettura.md`;
  - pagina interna con tutti i componenti, usata per i test visivi.
- **Goal:**
  > Il design system è in codice (token → Tailwind, componenti base della 1c con i loro stati); layout a pannelli, barra di stato, command palette, scorciatoie con ambiti di focus e temi chiaro/scuro/sistema funzionano; la pagina componenti ha test visivi verdi e un E2E apre la palette e cambia tema; revisione impeccable senza gravi; memoria aggiornata.

## Fine fase

Il goal complessivo della Fase 3 (in `PIANO.md`) è l'unione dei tre. Alla chiusura: sintesi in `STORIA.md`, questo file archiviato, `SICUREZZA.md` con la checklist tutta spuntata.
