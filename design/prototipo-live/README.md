# Prototipo Vista Live — Fase 1d

Prototipo **usa e getta** della Vista Live: riproduce una sessione reale di Claude Code registrata in `packages/fixtures/raw/` su mappa (React Flow + ELK), timeline con scrubber e colonna `Agents`. Usa i token e i componenti veri di [`design/sistema/`](../sistema/README.md). Non entra nell'app: la Vista Live vera si costruisce nella Fase 5 sullo schema `AgentEvent` della Fase 2.

## Avvio

```bash
npx pnpm@10.34.9 --filter @control-center/prototipo-live dev
```

Poi `http://127.0.0.1:5174/`. Parametri: `?fixture=01…05`, `t=<ms>|end` (istante iniziale), `play=1`, `theme=dark|light`, `density=compact|comfortable`.

**Tasti:** `Space` avvia o ferma; sulla timeline (con il focus) `←`/`→` vanno all'evento precedente o successivo, `Home`/`End` all'inizio o alla fine; trascinando sulla timeline ci si sposta nel tempo. Velocità 1×, 2×, 4×.

## Come funziona

| File                                                     | Cosa                                                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`vite.config.ts`](vite.config.ts)                       | il dev server espone `/fixtures/<NN>.json`: legge le registrazioni grezze e le normalizza al volo. Accetta solo id di due cifre; non scrive nulla su disco                                |
| [`src/replay/normalize.ts`](src/replay/normalize.ts)     | stream-json + hooks → `Replay`: tempi dagli hooks `PreToolUse`/`PostToolUse`, agenti, errori e permessi negati dallo stream. Percorsi relativi, home mascherata, niente contenuti di file |
| [`src/replay/state.ts`](src/replay/state.ts)             | `viewAt(replay, t)`: funzione pura che dà lo stato di nodi, comandi e agenti in un istante                                                                                                |
| [`src/layout.ts`](src/layout.ts)                         | layout con ELK: un contenitore per cartella di primo livello (più la radice e `shell`), una colonna di nodi ciascuno                                                                      |
| [`src/components/`](src/components/)                     | mappa, timeline, colonna agenti: riusano le classi di `componenti.css` (`.node`, `.achip`, `.ev-*`, `.card`…)                                                                             |
| [`src/replay/replay.test.ts`](src/replay/replay.test.ts) | test unitari su una registrazione sintetica ([`synthetic.ts`](src/replay/synthetic.ts)): girano in `pnpm verify` e in CI                                                                  |
| [`e2e/live.spec.ts`](e2e/live.spec.ts)                   | test Playwright: screenshot degli stati e comportamento (scrubbing, `Space`, movimento ridotto). **Solo in locale**: senza le fixture grezze vengono saltati                              |

## Scelte del prototipo (da rivedere nella Fase 5)

- **Tenuta minima di 900 ms.** I tool durano ~100 ms: un op resta visibile come attivo almeno 900 ms di tempo di sessione, altrimenti a 1× non si vede nulla. La timeline invece mostra la durata vera; la capsula si allarga per l'etichetta solo nello spazio libero prima dell'evento successivo dello stesso agente, così non nascono righe parallele finte.
- **Attesa simulata.** `claude -p` nega subito i permessi: un permesso negato viene mostrato come attesa di 6 s (`waiting-user`), segnalata nella testata della timeline. Manca ancora una registrazione interattiva con `Notification`.
- **Esito dei test.** Un comando con `fail N` / `N failing` / `N failed` nell'output è un errore con motivo `N failing`, anche se il processo esce con 0.
- **Agenti.** Sessione principale `CL`; subagent con le prime due lettere del tipo (`general-purpose` → `GE`), con una cifra in caso di collisione. Nella mappa una chip per agente vivo, agganciata al nodo su cui lavora; il padre che delega non ha chip.
- **Zoom.** La mappa apre con `Fit`, mai oltre il 100%.
- **Chromium.** Playwright 1.65 vuole Chromium 1255; se manca, la config usa il Chromium di Playwright più recente già installato (`PW_CHROMIUM_PATH` per forzarne uno). Per allinearsi: `npx playwright install chromium`.

## Test

```bash
npx pnpm@10.34.9 --filter @control-center/prototipo-live e2e
npx pnpm@10.34.9 --filter @control-center/prototipo-live e2e:update
```

Gli screenshot di riferimento sono in [`e2e/screenshots/`](e2e/screenshots/): `reading`, `writing`, `running`, `error` (test falliti e file mancante), `waiting`, `done` (scuro e chiaro). Mostrano solo percorsi relativi del progetto di prova `vernier-fixture-lab`.
