# Corsie di lavoro: Claude e Codex in parallelo

_Creato il 2026-11-17. Modelli aggiornati il 2026-11-18. Questa tabella assegna corsia, modello, effort e revisione. I criteri di completamento e i testi per `/goal` sono nel [piano](PIANO.md#goal-per-ogni-fase)._

## Principi

1. **Claude (Opus 5.5) prende ciò che è delicato:** architettura nuova, contratti, sicurezza, bridge, scrittura di file dell'utente, audit. **Codex (`gpt-6.2-sol`) prende il lavoro già specificato:** UI su dati pronti, servizi con test come criterio di fine, pannelli, parser, packaging.
2. **Codex usa GPT-6.2 Astra per una seconda opinione indipendente**, a effort `high`, in una sola passata per PR: pipe della 4.1, `mcp-bridge` della Fase 7 e audit prima della pubblicazione.
3. **Effort:** `medium` per lavoro definito, `high` per logica non banale o sicurezza, tetto normale `high`. `xhigh`, `max` e `ultra` mai di default: solo per un problema bloccato, annotato in `STORIA.md`.
4. **Una sotto-fase per sessione**, chiusa con `fine-sessione` (anche in Codex: il file è in `.agents/skills/`).
5. **Revisione incrociata:** ogni PR di Codex che tocca IPC, processi, file system, permessi o file dell'utente passa da `/code-review high` in Claude prima del merge. Le PR di Claude passano da `/code-review` come da piano.

## Modelli e quando usarli

| Agente | Modello         | Uso                                                                          |
| ------ | --------------- | ---------------------------------------------------------------------------- |
| Claude | Opus 5.5        | Sicurezza, architettura, contratti, bridge, audit, revisione di PR sensibili |
| Claude | Sonnet 5.5      | Bookkeeping di sessione, piccole correzioni, memoria                         |
| Claude | Haiku 5.5       | Solo subagent `explorer`                                                     |
| Codex  | `gpt-6.2-sol`   | Implementazione specificata. Effort `medium` o `high` secondo la tabella     |
| Codex  | `gpt-6-luna`    | Meccanico: fixture, bozze di test, documentazione. Effort `medium`           |
| Codex  | `gpt-6.2-astra` | Solo seconda opinione di sicurezza (vedi principio 2)                        |

`gpt-6.1-terra` e i modelli 5.x non si usano. Sol, Astra e Luna sono presenti nel catalogo locale di Codex. [Annuncio OpenAI di GPT-6.2](https://openai.com/index/introducing-gpt-6-2-astra-sol/).

## Regole di convivenza

- **Due cartelle, due branch.** Claude lavora in `control-center`; Codex in un worktree separato: `git worktree add ..\control-center-codex -b feat/<nome> main`, poi `npx pnpm@10.34.9 install` lì dentro. Mai due agenti nella stessa cartella.
- **Istruzioni condivise:** `AGENTS.md`, `CLAUDE.md` e le skill di sessione sono tracciati su `main`. Un nuovo worktree eredita queste istruzioni.
- **File caldi:** `packages/ipc-contract/src/contract.ts`, `pnpm-lock.yaml`, `package.json`. Il contratto IPC lo cambia una corsia per volta (vedi onde). Dopo un rebase, il lockfile si rigenera con `pnpm install`, non si risolve a mano.
- **Memoria:** `STATO.md` ha una sezione per corsia ("Corsia Claude", "Corsia Codex"); ogni agente modifica solo la propria. `PROSSIMI_PASSI.md` marca ogni voce `[Claude]` o `[Codex]`. La voce di `STORIA.md` si aggiunge a fine sotto-fase, dopo il rebase su `main`.
- **Merge:** a mano, a CI verde. Chi finisce per primo unisce; l'altro fa rebase.
- **ADR:** le scrive chi introduce la dipendenza o la scelta. Il numero si prende dopo il rebase.
- **Limiti Claude:** resta la regola del 95% (handoff in `STATO.md`, commit locale, niente push).

## Ripartizione per fase

### Lavoro da fare

| Fase                                                 | Corsia | Modello         | Effort | Revisione                                                        |
| ---------------------------------------------------- | ------ | --------------- | ------ | ---------------------------------------------------------------- |
| 4b Git e checkpoint                                  | Codex  | `gpt-6.2-sol`   | high   | Claude `/code-review` medium                                     |
| 4.1 Seconda opinione sulla named pipe                | Codex  | `gpt-6.2-astra` | high   | Una passata mirata su `packages/hooks-bridge`                    |
| 5a Modello del progetto, scanner e watcher           | Claude | Opus 5.5        | high   | `/code-review` medium                                            |
| 5b Mappa                                             | Claude | Opus 5.5        | high   | impeccable e budget 60 fps in CI                                 |
| 5c Timeline e replay                                 | Codex  | `gpt-6.2-sol`   | high   | impeccable                                                       |
| 5d Pannello agenti e ispettore                       | Codex  | `gpt-6.2-sol`   | medium | impeccable                                                       |
| 5e Schema `error.detected` e migrazione              | Claude | Opus 5.5        | high   | —                                                                |
| 5e Parser di stack trace e colorazione               | Claude | Opus 5.5        | high   | impeccable sulla UI (fatta da Claude su goal dell'utente)        |
| 6 Infrastruttura: Docker, porte, GPU e stato Ollama  | Codex  | `gpt-6.2-sol`   | medium | Claude `/code-review` high su socket Docker e processi           |
| 7 Client Ollama e comandi diretti                    | Codex  | `gpt-6.2-sol`   | medium | Claude `/code-review` medium                                     |
| 7 `mcp-bridge`, allowlist e skill `delegate-local`   | Claude | Opus 5.5        | high   | `/code-review` high e `gpt-6.2-astra` high                       |
| 8 Registry MCP, skill library ed editor              | Codex  | `gpt-6.2-sol`   | high   | Claude `/code-review` high sui file utente e impeccable sulla UI |
| 8 Toggle per sessione e generazione config           | Claude | Opus 5.5        | high   | `/code-review` high                                              |
| 9 Telemetria locale e risparmio Ollama               | Codex  | `gpt-6.2-sol`   | medium | `/code-review` medium                                            |
| 10 Packaging NSIS e auto-update                      | Codex  | `gpt-6.2-sol`   | medium | Claude `/code-review` high                                       |
| 10 Audit e verifica termini Anthropic                | Claude | Opus 5.5        | high   | `/code-review ultra` prima di pubblicare e `gpt-6.2-astra` high  |
| Trasversale: fixture, bozze di test e documentazione | Codex  | `gpt-6-luna`    | medium | Verifica nel contesto della fase                                 |

### Priorità Codex e lavoro simultaneo

| Sotto-fase                                      | Corsia | Modello       | Effort | Consegna e verifica                                                                                                          |
| ----------------------------------------------- | ------ | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 5f.1 · Codex, processo e contratti              | Claude | Opus 5.5      | high   | Specifica ed eventi di esempio, poi schema e IPC, ciclo di vita, login e approvazioni. Revisione incrociata prima del merge. |
| 5f.2 · Codex, chat e Vista Live                 | Codex  | `gpt-6.2-sol` | high   | Fixture, normalizzazione, selettore, attribuzione in chat, timeline e replay. Impeccable ed E2E su Windows.                  |
| 5g.1 · Sessioni simultanee, isolamento nel main | Claude | Opus 5.5      | high   | Sessioni per worktree, autorizzazioni e interruzioni isolate. Revisione incrociata prima del merge.                          |
| 5g.2 · Sessioni simultanee, UI e verifica       | Codex  | `gpt-6.2-sol` | high   | Corsie per sessione e ripresa dalla cronologia. Impeccable, E2E con fixture e prova con entrambe le CLI reali.               |

Claude consegna per primi esempi di eventi e firme del contratto. Codex può chiudere la 5e+ e preparare le fixture e i test in un branch proprio mentre Claude lavora al main. Il collegamento di normalizzatore e UI parte quando il relativo contratto è su `main`. Per la 5g si segue lo stesso ordine: Claude definisce il contratto di isolamento, Codex prepara le verifiche del doppio flusso, poi li collega. Le due corsie mantengono worktree e branch distinti per tutto il lavoro.

**Coordinamento delle due corsie.** Prima di implementare, scambiare base Git, file assegnati, contratto ed esempi con eventi simultanei. Claude ha la responsabilità di schema, IPC e main. Codex ha la responsabilità di normalizzatore, renderer e test di integrazione. Dichiarare in `STATO.md` eventuali eccezioni e l'ordine di consegna. Se i test richiedono un file di proprietà dell'altra corsia, far passare la modifica nella PR del proprietario prima di collegarla. Usare fixture di contratto per proseguire sulla UI durante lo sviluppo del main. Integrare prima il contratto, riallineare i branch e validare il flusso completo sul commit che li riunisce.

### Fasi chiuse

Le righe riportano le assegnazioni del piano precedente. I risultati e le PR sono in [STORIA.md](STORIA.md).

| Fase                                           | Corsia | Modello previsto | Effort | Revisione o nota                           |
| ---------------------------------------------- | ------ | ---------------- | ------ | ------------------------------------------ |
| 0 Fondamenta della repo                        | Claude | Sonnet 5.5       | medium | Opus per le istruzioni di progetto         |
| 1a Ricerca UX e architettura dell'informazione | Claude | Opus 5.5         | high   | Revisione dell'utente                      |
| 1b Direzioni estetiche                         | Claude | Opus 5.5         | high   | Ultracode per esplorare tre direzioni      |
| 1c Token e design system HTML                  | Claude | Opus 5.5         | high   | impeccable                                 |
| 1d Prototipo Vista Live                        | Claude | Opus 5.5         | high   | Playwright e impeccable                    |
| 2 Fixture, schema eventi e normalizzatori      | Claude | Opus 5.5         | high   | Sanitizzazione e test                      |
| 3a Shell e IPC                                 | Claude | Opus 5.5         | high   | `/code-review` high                        |
| 3b Logger e Console Errori                     | Claude | Sonnet 5.5       | high   | `/code-review` medium                      |
| 3c Design system in codice                     | Claude | Sonnet 5.5       | medium | impeccable                                 |
| 4.0 Canale push nel contratto IPC              | Claude | Opus 5.5         | high   | `/code-review` high                        |
| 4.1 Hooks bridge e sessione Claude             | Claude | Opus 5.5         | high   | `/code-review` high                        |
| 4.2 Workspace e terminale                      | Codex  | `gpt-6.1-sol`    | high   | Claude `/code-review` high                 |
| 4.3 Chat, permessi e cronologia                | Codex  | `gpt-6.1-sol`    | high   | Claude Opus high sui permessi e impeccable |

## Ordine di lavoro (onde)

Le onde sono dipendenze, non date. Dentro un'onda le due corsie vanno insieme.

| Onda | Claude                            | Codex                                                                                                | Si aspetta                                 |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0    | Preparazione istruzioni e fixture | nulla (si crea il worktree)                                                                          | PR di `AGENTS.md` unita                    |
| 1    | 4.0 canale push, poi 4.1          | 4.2: prima workspace e modulo percorsi (non servono il push), poi il terminale quando la 4.0 è unita | —                                          |
| 2    | 5a, poi schema `error.detected`   | 4.3 poi 4b                                                                                           | 4.3 parte quando 4.1, 4.2 e 4.0 sono unite |
| 3    | 5b                                | 5c (dopo 5a), 5d, parser 5e (puri, partono anche prima), 6 (tampone se si aspetta 5a)                | 5c e 5d aspettano il contratto di 5a       |
| 4    | 7 `mcp-bridge`, 8 toggle          | 7 `ollama-client`, 8 registry e UI, 9                                                                | `mcp-bridge` aspetta il bridge della 4.1   |
| 5    | audit e `ultra` della 10          | packaging della 10                                                                                   | tutto unito su `main`                      |

Fine della Fase 4 = prima versione usabile ogni giorno; da lì le onde 3-5 sono incrementi.

## Prompt di avvio per la chat Codex

> Lavori sul progetto Control Center nel worktree `C:\Users\david\Desktop\control-center-codex`. Leggi `AGENTS.md`, `docs/memoria/STATO.md` e `docs/memoria/CORSIE.md`: sei la corsia Codex. Prendi solo le fasi marcate Codex, sul branch indicato, e aggiorna solo la sezione "Corsia Codex" di `STATO.md`. Non toccare `contract.ts` fuori dalla tua sotto-fase. Chiudi con `fine-sessione` e una PR; il merge lo fa l'utente a CI verde.
