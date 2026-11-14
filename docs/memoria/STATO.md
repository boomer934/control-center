# Stato attuale

_Ultimo aggiornamento: 2026-11-14 (chiusura Fase 2)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: non iniziata. Il brief operativo è pronto in `FASE_3.md`, con tre sotto-fasi (3a shell e IPC, 3b Console Errori, 3c design system in codice) e i loro goal.

## Branch

`main` (ultimo merge: `689ce2c`, PR #20). La memoria di chiusura è sul branch `docs/memoria-phase-2-close`. La Fase 3 parte da `main` su un branch nuovo, proposto `feat/desktop-shell`.

## Punto di ripresa

- **Prossimo:** sotto-fase 3a, shell Electron sicura e IPC. Opus 5.5, effort xhigh, niente ultracode, niente subagent. Il goal da copiare in `/goal` è in `FASE_3.md`.
- **Da leggere prima di iniziare:** `FASE_3.md`, `SICUREZZA.md` (checklist Electron), `PIANO.md` §6.
- **Cosa c'è già da usare:**
  - `@control-center/event-schema`: `AgentEvent` (16 tipi, ADR 0003), normalizzatori batch, `redactSecrets` e `makeTextCleaner` per log e Console;
  - `@control-center/fixtures`: le 5 sessioni ripulite e il loader, utili anche come dati finti per la UI;
  - `design/tokens.json`, `design/sistema/` e `design/ricerca/architettura.md` per la 3c.
- **Prima di aggiungere dipendenze di runtime** (logger, pannelli, palette) serve un'ADR: l'ADR 0001 copre solo lo stack di base.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema`, `packages/fixtures` e, solo per sviluppo, `design/prototipo-live`. `apps/desktop` contiene solo il README.
- ✅ `pnpm verify` (format, typecheck, lint, test) verde: 110 test, 0 errori di lint, restano 86 warning del plugin security.
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, controllo delle fixture ripulite (`sanitize.mjs --check`), gitleaks su tutta la cronologia, commitlint, controllo memoria, audit.
- ✅ Registrazione (`capture-hook.mjs`, `check-raw.mjs`) e pulizia (`sanitize.mjs`) delle fixture.
- ✅ Design: ricerca UX (1a), direzione `precisione fluida` (1b), design system e schermate (1c), prototipo Live (1d).

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR, merge a mano a CI verde.
- gitleaks non è installato in locale: lo controlla il job CI, oltre a `sanitize.mjs --check`.
- Mancano fixture reali per `Notification` e `PostToolUseFailure`, coperti solo da test sintetici. Servono prima della Fase 4 (richieste di permesso).
- Le fixture grezze vivono solo in locale. Il prototipo 1d legge ancora quelle, quindi in CI i suoi test Playwright si saltano.
- Playwright 1.65 vuole Chromium 1255, in locale c'è il 1248 (vedi `PROBLEMI_NOTI.md`). Per `_electron` in Fase 3 conta invece la versione di Electron.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
