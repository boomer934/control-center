# Corsie di lavoro: Claude e Codex in parallelo

_Creato il 2026-11-17. Integra `PIANO.md` (sezione "Modello, effort, ultracode e goal"): le sue colonne Modello ed Effort restano valide per le sole sessioni Claude; per le fasi affidate a Codex valgono quelle di questo file. Obiettivo: due agenti che lavorano insieme su parti diverse senza pestarsi i piedi, e meno consumo dei limiti di Claude._

## Principi

1. **Claude (Opus 5.5) prende ciò che è delicato:** architettura nuova, contratti, sicurezza, bridge, scrittura di file dell'utente, audit. **Codex (`gpt-6.1-sol`) prende il lavoro già specificato:** UI su dati pronti, servizi con test come criterio di fine, pannelli, parser, packaging.
2. **Astra (`gpt-6-astra`) non è un modello di lavoro.** Premessa dell'utente: Opus è più forte e costa meno. Astra resta solo come seconda opinione indipendente (altra famiglia di modelli) sui tre punti di massimo rischio: pipe della 4.1, `mcp-bridge` della Fase 7, audit prima della pubblicazione. Effort `high`, una sola passata a PR.
3. **Effort come in `PIANO.md`:** `medium` per lavoro definito, `high` per logica non banale o sicurezza, tetto normale `high`. `xhigh`, `max` e `ultra` mai di default: solo per un problema bloccato, annotato in `STORIA.md`.
4. **Una sotto-fase per sessione**, chiusa con `fine-sessione` (anche in Codex: il file è in `.agents/skills/`).
5. **Revisione incrociata:** ogni PR di Codex che tocca IPC, processi, file system, permessi o file dell'utente passa da `/code-review high` in Claude prima del merge. Le PR di Claude passano da `/code-review` come da piano.

## Modelli e quando usarli

| Agente | Modello       | Uso                                                                          |
| ------ | ------------- | ---------------------------------------------------------------------------- |
| Claude | Opus 5.5      | Sicurezza, architettura, contratti, bridge, audit, revisione di PR sensibili |
| Claude | Sonnet 5.5    | Bookkeeping di sessione, piccole correzioni, memoria                         |
| Claude | Haiku 5.5     | Solo subagent `explorer`                                                     |
| Codex  | `gpt-6.1-sol` | Modello di lavoro (già in `config.toml`): implementazione specificata        |
| Codex  | `gpt-6-luna`  | Meccanico: fixture, bozze di test, documentazione. Effort `medium`           |
| Codex  | `gpt-6-astra` | Solo seconda opinione di sicurezza (vedi principio 2)                        |

`gpt-6.1-terra` e i modelli 5.x non si usano. Elenco e livelli di effort letti dalla cache locale di Codex (`~/.codex/models_cache.json`).

## Regole di convivenza

- **Due cartelle, due branch.** Claude lavora in `control-center`; Codex in un worktree separato: `git worktree add ..\control-center-codex -b feat/<nome> main`, poi `npx pnpm@10.34.9 install` lì dentro. Mai due agenti nella stessa cartella.
- **`AGENTS.md`, `.agents/` e `.codex/` sono ancora non tracciati:** vanno committati su `main` (PR piccola) prima di creare il worktree, altrimenti Codex non li vede.
- **File caldi:** `packages/ipc-contract/src/contract.ts`, `pnpm-lock.yaml`, `package.json`. Il contratto IPC lo cambia una corsia per volta (vedi onde). Dopo un rebase, il lockfile si rigenera con `pnpm install`, non si risolve a mano.
- **Memoria:** `STATO.md` ha una sezione per corsia ("Corsia Claude", "Corsia Codex"); ogni agente modifica solo la propria. `PROSSIMI_PASSI.md` marca ogni voce `[Claude]` o `[Codex]`. La voce di `STORIA.md` si aggiunge a fine sotto-fase, dopo il rebase su `main`.
- **Merge:** a mano, a CI verde. Chi finisce per primo unisce; l'altro fa rebase.
- **ADR:** le scrive chi introduce la dipendenza o la scelta. Il numero si prende dopo il rebase.
- **Limiti Claude:** resta la regola del 95% (handoff in `STATO.md`, commit locale, niente push).

## Ripartizione per fase

| Fase                                                                               | Corsia | Modello       | Effort                                  | Revisione                                            |
| ---------------------------------------------------------------------------------- | ------ | ------------- | --------------------------------------- | ---------------------------------------------------- |
| 0. Chiusura PR #31 (`Notification`) e commit di `AGENTS.md`, `.agents/`, `.codex/` | Claude | Sonnet 5.5    | medium                                  | —                                                    |
| 4.0 Canale push nel contratto IPC (nuovo, piccolo: serve a 4.2, 4.3, 6)            | Claude | Opus 5.5      | high                                    | `/code-review` high                                  |
| 4.1 Hooks bridge e sessione Claude                                                 | Claude | Opus 5.5      | high                                    | `/code-review` high + Astra high sulla pipe          |
| 4.2 Workspace e terminale                                                          | Codex  | `gpt-6.1-sol` | high (era medium: tocca percorsi e pty) | Claude `/code-review` high                           |
| 4.3 Chat, permessi, cronologia                                                     | Codex  | `gpt-6.1-sol` | high                                    | Claude Opus high sul flusso dei permessi; impeccable |
| 4b Git e checkpoint                                                                | Codex  | `gpt-6.1-sol` | high                                    | Claude `/code-review` medium                         |
| 5a Modello del progetto                                                            | Claude | Opus 5.5      | high                                    | `/code-review` medium                                |
| 5b Mappa                                                                           | Claude | Opus 5.5      | high                                    | impeccable; budget 60 fps in CI                      |
| 5c Timeline e replay                                                               | Codex  | `gpt-6.1-sol` | high                                    | impeccable                                           |
| 5d Pannello agenti e ispettore                                                     | Codex  | `gpt-6.1-sol` | medium                                  | impeccable                                           |
| 5e Schema `error.detected` e migrazione                                            | Claude | Opus 5.5      | high                                    | —                                                    |
| 5e Parser di stack trace e colorazione                                             | Codex  | `gpt-6.1-sol` | medium                                  | bozze di test a `gpt-6-luna`                         |
| 6 Infrastruttura (Docker, porte, GPU)                                              | Codex  | `gpt-6.1-sol` | medium                                  | Claude `/code-review` high (socket Docker, processi) |
| 7 `ollama-client`                                                                  | Codex  | `gpt-6.1-sol` | medium                                  | Claude `/code-review` medium                         |
| 7 `mcp-bridge`, allowlist, skill `delegate-local`                                  | Claude | Opus 5.5      | high                                    | `/code-review` high + Astra high                     |
| 8 Registry MCP, skill library, editor                                              | Codex  | `gpt-6.1-sol` | high                                    | Claude `/code-review` high (scrive file utente)      |
| 8 Toggle per sessione e generazione config                                         | Claude | Opus 5.5      | high                                    | `/code-review` high                                  |
| 9 Telemetria                                                                       | Codex  | `gpt-6.1-sol` | medium                                  | `/code-review` medium                                |
| 10 Packaging NSIS e auto-update                                                    | Codex  | `gpt-6.1-sol` | medium                                  | Claude `/code-review` high                           |
| 10 Audit, termini Anthropic, `/code-review ultra`                                  | Claude | Opus 5.5      | high                                    | Astra high come controllo indipendente               |
| Trasversale: fixture, bozze di test, documentazione                                | Codex  | `gpt-6-luna`  | medium                                  | —                                                    |

**Carico:** Claude ha 8 voci Opus (4.0, 4.1, 5a, 5b, schema 5e, `mcp-bridge`, toggle 8, audit 10) più la voce 0 in Sonnet; Codex ha le altre 12 righe di fase. Il lavoro "da Sonnet" del piano passa quasi tutto a Codex, così i limiti di Claude si spendono dove serve Opus.

## Ordine di lavoro (onde)

Le onde sono dipendenze, non date. Dentro un'onda le due corsie vanno insieme.

| Onda | Claude                          | Codex                                                                                                | Si aspetta                                 |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0    | Voce 0 della tabella            | nulla (si crea il worktree)                                                                          | PR di `AGENTS.md` unita                    |
| 1    | 4.0 canale push, poi 4.1        | 4.2: prima workspace e modulo percorsi (non servono il push), poi il terminale quando la 4.0 è unita | —                                          |
| 2    | 5a, poi schema `error.detected` | 4.3 poi 4b                                                                                           | 4.3 parte quando 4.1, 4.2 e 4.0 sono unite |
| 3    | 5b                              | 5c (dopo 5a), 5d, parser 5e (puri, partono anche prima), 6 (tampone se si aspetta 5a)                | 5c e 5d aspettano il contratto di 5a       |
| 4    | 7 `mcp-bridge`, 8 toggle        | 7 `ollama-client`, 8 registry e UI, 9                                                                | `mcp-bridge` aspetta il bridge della 4.1   |
| 5    | audit e `ultra` della 10        | packaging della 10                                                                                   | tutto unito su `main`                      |

Fine della Fase 4 = prima versione usabile ogni giorno; da lì le onde 3-5 sono incrementi.

## Prompt di avvio per la chat Codex

> Lavori sul progetto Control Center nel worktree `C:\Users\david\Desktop\control-center-codex`. Leggi `AGENTS.md`, `docs/memoria/STATO.md` e `docs/memoria/CORSIE.md`: sei la corsia Codex. Prendi solo le fasi marcate Codex, sul branch indicato, e aggiorna solo la sezione "Corsia Codex" di `STATO.md`. Non toccare `contract.ts` fuori dalla tua sotto-fase. Chiudi con `fine-sessione` e una PR; il merge lo fa l'utente a CI verde.
