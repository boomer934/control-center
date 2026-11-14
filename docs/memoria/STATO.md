# Stato attuale

_Ultimo aggiornamento: 2026-11-14 (seconda sessione)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                        | Stato                                              |
| --------------------------------- | -------------------------------------------------- |
| 1a Ricerca UX e architettura      | ✅ fatta e revisionata, PR #10 unita il 2026-11-13 |
| 1b Tre direzioni estetiche        | ✅ `precisione fluida`, PR #12 unita il 2026-11-14 |
| 1c Design system e schermate HTML | ✅ fatta e revisionata, PR #14 unita il 2026-11-14 |
| 1d Prototipo in codice Vista Live | da fare (bloccata: serve almeno una fixture)       |

## Branch

`docs/memoria-1c-merge`, solo per registrare il merge della 1c. Dopo il suo merge si riparte da `main`.

## Punto di ripresa

- **1c finita e unita su `main`** (PR #14, commit `93a8677`, CI verde):
  - token, componenti, 9 schermate P0 e 9 P1 con tutti gli stati;
  - flussi F1-F7 e 55 screenshot;
  - revisione impeccable: un solo grave, corretto (sigillo sul fondo dell'attesa); contrasto AA in tutte le pagine, gli stati e i due temi.
- **Decisioni chiuse il 2026-11-14:**
  - nome **Vernier**, con ripiego su Control Center dove le collisioni creano problemi;
  - le notifiche di Windows non approvano mai.
- **Prossimo:** registrare le fixture (F2), che sbloccano la 1d. È l'unico blocco rimasto per chiudere la Fase 1.
- Strumenti locali: `.local/shot.mjs` (screenshot + console + testo < 11 px). La scansione del contrasto pagina × stato × tema era uno script temporaneo; si riscrive facilmente sullo stesso schema di `shot.mjs`.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI. Ci sono 24 warning del plugin security sugli script, nessun errore. In locale servono `.local/*.mjs` formattati con prettier e `/* global document, getComputedStyle */` in testa a `shot.mjs`, altrimenti `verify` fallisce (la CI non li vede).
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, gitleaks, commitlint, controllo memoria, audit. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Documenti open source, `CLAUDE.md`, memoria, ADR 0001-0002, skill di sessione.
- ✅ Design:
  - ricerca UX (1a);
  - direzioni (1b);
  - **design system 1c** in `design/tokens.json` e `design/sistema/` (componenti, P0 e P1, revisionati).

## Cosa manca per chiudere la Fase 1

- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Per la 1d serve almeno una sessione registrata in `packages/fixtures/raw/` (vedi `FASE_1.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- I file HTML/JS molto grandi vanno scritti a pezzi: la generazione in un colpo solo si è bloccata.
