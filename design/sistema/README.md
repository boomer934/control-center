# Design system — Fase 1c

Design system della direzione [`precisione fluida`](../direzioni/precisione-fluida/README.md), in HTML statico. In Fase 3 diventa il tema Tailwind e la pagina componenti dell'app.

## File

| File                                 | Cosa                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [`../tokens.json`](../tokens.json)   | token in formato DTCG: colori dei due temi, tipografia, densità, spaziatura, raggi, misure, ombre, movimento |
| [`tokens.css`](tokens.css)           | generato con `node scripts/build-tokens.mjs` (`--check` verifica che sia aggiornato); non si modifica a mano |
| [`componenti.css`](componenti.css)   | stili dei componenti, solo con `var(--…)`: niente colori, misure, durate o curve scritti a mano              |
| [`shell.js`](shell.js)               | guscio comune: parametri URL, icone SVG, title bar, barra attività, barra di stato, barra di revisione       |
| [`componenti.html`](componenti.html) | tutti i componenti con tutti gli stati                                                                       |
| [`schermate/`](schermate/)           | schermate a finestra intera; ognuna ha i suoi stati                                                          |

**Parametri di ogni pagina:** `?theme=dark|light`, `density=compact|comfortable`, `gray=1`, `state=<stato>`. Con `shot=1` sparisce la barra di revisione, che serve per gli screenshot. Le schermate generano mappa e timeline da dati in JS (`live-data.js`, `<pagina>-data.js`): le coordinate sono dati, come l'output di ELK, non stile.

**Font:** Instrument Sans e Martian Mono da Google Fonts, solo nei mockup. Nell'app andranno inclusi nel pacchetto (Fase 3, con ADR).

## Schermate

| #     | Pagina                                                                                          | Stati                                                                                 | P   |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --- |
| 1     | [`live.html`](schermate/live.html)                                                              | `empty` `loading` `normal` `dense` `error` `offline`                                  | P0  |
| 2     | [`sessione.html`](schermate/sessione.html)                                                      | `empty` `starting` `normal` `dense` `cli-missing` `not-logged-in` `crashed` `offline` | P0  |
| 3     | [`permesso.html`](schermate/permesso.html)                                                      | `bash` `write` `mcp` `queue` `long`                                                   | P0  |
| 4     | [`ispettore.html`](schermate/ispettore.html)                                                    | `human` `raw` `error` `ollama` `none`                                                 | P0  |
| 5     | [`diff.html`](schermate/diff.html)                                                              | `one-file` `many-files` `new-deleted-renamed` `binary` `huge`                         | P0  |
| 6     | [`conferma.html`](schermate/conferma.html)                                                      | `restore-all` `restore-some` `discard` `stop-container`                               | P0  |
| 7     | [`git.html`](schermate/git.html)                                                                | `empty` `loading` `normal` `dense` `error` `offline`                                  | P0  |
| 8     | [`problems.html`](schermate/problems.html)                                                      | `empty` `normal` `dense`                                                              | P0  |
| 9     | [`palette.html`](schermate/palette.html)                                                        | `recent` `mixed` `prefixes` `no-results` `destructive`                                | P0  |
| 10-18 | onboarding, replay, infra, local agents, MCP & Skills, settings, terminal, workspace, notifiche | da fare                                                                               | P1  |

La barra di stato in tutti i suoi stati, la title bar senza workspace e i toast sono in `componenti.html`.

## Flussi F1-F7 sulle schermate

Flussi di [`architettura.md`](../ricerca/architettura.md#flussi-principali), ripercorsi sulla sequenza delle schermate.

| Flusso                   | Sequenza                                                                                                                           | Esito                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| F1 Apro il progetto      | `live?state=loading` → `live?state=empty`                                                                                          | ok: scheletro con la forma finale, poi le cartelle principali e "No session yet" con il focus sull'input         |
| F2 Lancio un task        | `sessione?state=empty` → `starting` → `normal`                                                                                     | ok: esempi, modello, MCP e checkpoint sopra l'input; `Starting…` dice cosa sta facendo                           |
| F3 Guardo l'agente       | `live?state=normal` → `ispettore?state=human`/`raw`                                                                                | ok: chip a pillola agganciati ai file, corsia del subagent con forcella; `R` passa alla vista raw                |
| F4 Approvo un permesso   | `live?state=normal` (segmento d'attesa, card) → `permesso?state=bash`/`write`/`mcp`/`queue`/`long`                                 | ok: l'attesa è l'unico blocco pieno; il dialog ha comando, motivo e diff; con più richieste un contatore e `Tab` |
| F5 Vedo il diff          | badge `+N −M` in `live` → `diff?state=one-file`                                                                                    | ok: elenco a sinistra, scelta tra ultima modifica / sessione / HEAD, `Show on map` e `Open in editor`            |
| F6 Ripristino checkpoint | marcatore `cp-3` in timeline o `git?state=normal` (Checkpoints) → `conferma?state=restore-all`/`restore-some`                      | ok: anteprima dei file, scelta tutto/alcuni, `Restore N files` esplicito, `Enter` non fa nulla, checkpoint prima |
| F7 Leggo un errore       | contatore `✖` in barra di stato → `problems?state=normal` → frame → editor; da mappa: `live?state=error` → `ispettore?state=error` | ok: errori raggruppati con contatore, frame del progetto evidenziati, `node_modules` collassati, azioni rapide   |

## Regole del sistema (oltre a `DESIGN.md`)

- L'unico blocco pieno è l'attesa. Primario, `Live` e avatar sono a contorno.
- Gli scheletri sono fermi, senza shimmer: l'unico impulso continuo resta il segmento d'attesa.
- Un evento d'errore in timeline porta il bersaglio (`schema.test.ts · 2 failing`), mai il nome del tool.
- Sigle: `CL` sessione principale, subagent con le prime due lettere del nome, modelli locali con la famiglia (`QW`, `LL`); in caso di collisione una cifra (`C2`, `E2`).
- Le assenze (Docker spento, nessuna GPU, Ollama assente) sono tratteggiate e neutre, mai rosse.
- Le conferme distruttive non hanno un'azione su `Enter`.
