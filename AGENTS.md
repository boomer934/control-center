# Control Center: istruzioni di progetto

App desktop Electron (solo Windows fino alla v1) che mostra in tempo reale cosa fanno gli agenti AI sul progetto. Gli agenti sono Claude Code tramite la CLI ufficiale con `claude login` e i modelli locali Ollama. Accanto mostra l'infrastruttura locale (Docker, porte, GPU), MCP e skill, Git con checkpoint, e una Console Errori.

Il **cuore del prodotto è la Vista Live** (mappa + timeline + agenti). Oggi l'uso è personale, ma la repo è pensata per diventare open source (MIT): tutto deve poter essere pubblicato.

## Stack

- **Struttura e build:** monorepo pnpm 10, TypeScript 6 strict (non 7: vedi `docs/memoria/PROBLEMI_NOTI.md`), electron-vite, electron-builder.
- **Interfaccia:** React 19, Tailwind v4, Radix/shadcn, Lucide, Motion.
- **Componenti specialistici:** @xyflow/react + elkjs, xterm.js + node-pty, CodeMirror 6, web-tree-sitter.
- **Stato, dati e test:** Zustand, zod, Vitest, Playwright `_electron`.

## Struttura

```
apps/desktop/          app Electron (main, preload, renderer, e2e) — dalla Fase 3
packages/event-schema  schema unificato AgentEvent (zod), normalizzatori, redazione dei segreti
packages/fixtures      sessioni registrate e ripulite (sanitized/) con il loader
packages/*             ipc-contract (Fase 3), hooks-bridge, mcp-bridge, ollama-client (in arrivo)
docs/memoria/          memoria di progetto (vedi sotto)
docs/adr/              decisioni architetturali numerate
design/                ricerca UX, direzioni estetiche, token, design system HTML
scripts/               script di repo (gitleaks pre-commit, pulizia fixture…)
```

## Comandi

pnpm non è installato globalmente: si usa `npx pnpm@10.34.9 <comando>`, oppure si installa una volta con `npm i -g pnpm@10`.

- `pnpm verify`: format check + typecheck + lint + test. **Deve passare prima di ogni commit.**
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm format`
- In arrivo: `pnpm dev` (Fase 3), `pnpm e2e` (Fase 3), `pnpm dist` (Fase 10).

## Regole fisse

1. **Sicurezza Electron.**
   - Mai `nodeIntegration`; sempre `contextIsolation` + `sandbox`.
   - L'IPC passa solo da `packages/ipc-contract`, con validazione zod e controllo del mittente.
   - Nessun canale generico tipo "esegui comando".
   - Prima di toccare IPC, processi figli, file system o segreti leggi `docs/memoria/SICUREZZA.md`. Questo lavoro non si delega ai subagent.
2. **File system:** ogni percorso viene normalizzato e verificato dentro il workspace (path traversal, symlink).
3. **Privacy:**
   - nessuna telemetria verso l'esterno;
   - segreti mai in log, eventi, fixture o commit;
   - si committano solo le fixture ripulite (`packages/fixtures/sanitized/`).
4. **Confini:** ogni dato che entra (IPC, hooks, stream-json, Ollama, file di config) passa da uno schema zod. Gli eventi hanno `schemaVersion`, e ogni cambio incompatibile richiede una migrazione.
5. **Design system obbligatorio** nella UI: niente colori, spaziature o durate fuori dai token; gli stati semantici (idle, reading, writing, running, waiting-user, error, done) sono quelli di `docs/memoria/DESIGN.md`. Ogni PR di UI passa da impeccable.
6. **Commit:** Conventional Commits con scope (vedi `commitlint.config.mjs`). Branch brevi `feat/…`, `fix/…`. Merge su `main` solo via PR con CI verde.
7. **Dipendenze:** ogni nuova dipendenza di runtime richiede un'ADR in `docs/adr/`.
8. **Mai modificare** i file di configurazione dell'utente (`~/.claude*`, `~/.codex*`, `.mcp.json` altrui) senza conferma esplicita e backup.
9. **Lingue:** codice, commenti, README/CONTRIBUTING/SECURITY in inglese (repo open source); memoria di progetto e comunicazione con l'utente in italiano.

## Memoria di progetto (`docs/memoria/`)

Leggi solo ciò che serve al momento:

| File                | Leggi quando                        | Aggiorna quando                                            |
| ------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `STATO.md`          | **sempre a inizio sessione**        | a fine sessione e a ogni cambio di task                    |
| `PROSSIMI_PASSI.md` | scegli cosa fare                    | un task si chiude o nasce                                  |
| `STORIA.md`         | devi capire perché qualcosa è così  | a fine sessione (voce in cima)                             |
| `PIANO.md`          | apri una nuova fase o sotto-fase    | cambia il piano (con voce in STORIA)                       |
| `CORSIE.md`         | scegli la corsia, modello e effort  | cambia la ripartizione Claude/Codex                        |
| `DECISIONI.md`      | prima di cambiare architettura      | ogni nuova ADR                                             |
| `DESIGN.md`         | prima di toccare la UI              | cambia il design system                                    |
| `SICUREZZA.md`      | prima di IPC, processi, fs, segreti | nuova superficie d'attacco                                 |
| `GLOSSARIO.md`      | incontri un termine del progetto    | nasce un termine                                           |
| `PROBLEMI_NOTI.md`  | qualcosa si rompe                   | scopri o risolvi un problema                               |
| `FASE_<n>.md`       | inizi o riprendi quella fase        | chiudi una sotto-fase; a fine fase va archiviato in STORIA |

Skill di progetto:

- `inizio-sessione` legge stato e prossimi passi e propone il task;
- `fine-sessione` aggiorna STATO, PROSSIMI_PASSI e STORIA a partire dal `git log`.

## Modello di lavoro

Ogni fase ha modello, effort, uso di ultracode e un testo da usare con `/goal` in `docs/memoria/PIANO.md` (sezione "Modello, effort, ultracode e goal"). Per Codex, mantieni il livello di effort e i criteri del piano usando i modelli disponibili. Interpreta ultracode come orchestrazione multi-agente, secondo le regole di delega in vigore. Ogni goal si chiude con la memoria aggiornata.

Il lavoro è diviso in due corsie parallele, Claude e Codex, descritte in `docs/memoria/CORSIE.md` (fase per fase: corsia, modello, effort, revisione). Ogni agente lavora nel proprio worktree e aggiorna solo la propria sezione di `STATO.md`. Per le fasi Codex valgono modello ed effort di `CORSIE.md`.
