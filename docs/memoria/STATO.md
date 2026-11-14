# Stato attuale

_Ultimo aggiornamento: 2026-11-14 (quarta sessione)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso, ultima sotto-fase in revisione.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                        | Stato                                                    |
| --------------------------------- | -------------------------------------------------------- |
| 1a Ricerca UX e architettura      | ✅ fatta e revisionata, PR #10 unita il 2026-11-13       |
| 1b Tre direzioni estetiche        | ✅ `precisione fluida`, PR #12 unita il 2026-11-14       |
| 1c Design system e schermate HTML | ✅ fatta e revisionata, PR #14 unita il 2026-11-14       |
| 1d Prototipo in codice Vista Live | fatta su `feat/live-prototype`, da rivedere e unire (PR) |

## Branch

`feat/live-prototype`, partito da `main` (`258f87f`).

## Punto di ripresa

- **1d fatta:** `design/prototipo-live/` è un pacchetto del workspace solo per sviluppo (Vite + React 19 + React Flow 12 + elkjs) che riproduce le 5 sessioni reali di `packages/fixtures/raw/` con mappa, chip degli agenti, timeline con scrubber e colonna `Agents`, usando `tokens.css` e `componenti.css` della 1c. Dettagli e scelte in `design/prototipo-live/README.md`.
- Avvio: `npx pnpm@10.34.9 --filter @control-center/prototipo-live dev` → `http://127.0.0.1:5174/` (anche dalla configurazione `prototipo-live` di `.claude/launch.json`).
- Il dev server normalizza le fixture grezze al volo (`/fixtures/NN.json`): percorsi relativi, home mascherata, nessun contenuto di file. Nulla di derivato viene scritto su disco.
- **Test:** 13 test unitari del normalizzatore e di `viewAt` su una registrazione sintetica (in `pnpm verify` e in CI); 11 test Playwright (8 screenshot degli stati + scrubbing, `Space`, movimento ridotto), **solo in locale** perché in CI le fixture grezze non ci sono: lì vengono saltati.
- **Revisione impeccable:** nessun grave, 16/20, in `design/prototipo-live/REVISIONE.md`.
- **Prossimo:** commit, PR e revisione dell'utente; con la PR unita la Fase 1 è chiusa e si passa alla F2 (schema `AgentEvent`).
- Nella sessione l'utente ha aggiunto regole `permissions.deny` in `.claude/settings.json` (non committate da me).

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` e, solo per sviluppo, `design/prototipo-live`.
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale: 16 test. Restano solo warning del plugin security, nessun errore. `pnpm audit --audit-level high` passa (una vulnerabilità moderata).
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, gitleaks, commitlint, controllo memoria, audit. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Registrazione delle fixture: `scripts/fixtures/capture-hook.mjs` e `scripts/fixtures/check-raw.mjs`.
- ✅ Design: ricerca UX (1a), direzioni (1b), design system 1c (`design/tokens.json`, `design/sistema/`), prototipo Live 1d.

## Cosa manca per chiudere la Fase 1

- Revisione dell'utente del prototipo e merge della PR della 1d.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Le fixture grezze vivono solo in locale (`packages/fixtures/raw/`): su un'altra macchina il prototipo mostra "No recordings here" e i test Playwright si saltano.
- Playwright 1.65 vuole Chromium 1255, in locale c'è il 1248: la config usa quello installato (vedi `PROBLEMI_NOTI.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- I file HTML/JS molto grandi vanno scritti a pezzi: la generazione in un colpo solo si è bloccata.
