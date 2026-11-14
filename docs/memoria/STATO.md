# Stato attuale

_Ultimo aggiornamento: 2026-11-14_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                        | Stato                                              |
| --------------------------------- | -------------------------------------------------- |
| 1a Ricerca UX e architettura      | ✅ fatta e revisionata, PR #10 unita il 2026-11-13 |
| 1b Tre direzioni estetiche        | ✅ scelta `precisione fluida`, PR #12 da unire     |
| 1c Design system e schermate HTML | da fare: parte da `precisione-fluida/`             |
| 1d Prototipo in codice Vista Live | da fare (bloccata: serve almeno una fixture)       |

## Branch

`feat/design-1b`, pushato, con la PR verso `main` aperta. `main` è fermo a `b9433a8`.

## Punto di ripresa (1b → 1c)

La 1b è chiusa: l'utente ha scelto **`precisione fluida`** (`design/direzioni/precisione-fluida/`, con `README.md` e 4 screenshot). È `precisione` più fluida e con meno spigoli, con le sigle di canale e la telemetria di `sala-controllo` e la legenda di `carta-inchiostro`. Densità `compact`; nome candidato Vernier.

- Resta da fare: revisione dell'utente e merge della PR #12 con la CI verde.
- Poi la **1c**: `design/tokens.json` e `design/sistema/` partendo dai token di `precisione-fluida/live.html` e dalle regole di `DESIGN.md` § "Direzioni estetiche". Restano aperti i minori di `REVISIONE.md` elencati nel README della sintesi.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI (job "Verify (Windows)").
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verifica su Windows, gitleaks (CLI, cronologia completa), commitlint e controllo memoria sulle PR, audit. Verificato con la PR #7 che un errore di tipo blocca la CI.
- ✅ release-please v5; Dependabot con le Actions raggruppate. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Documenti open source: LICENSE (MIT), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- ✅ `CLAUDE.md`, memoria completa con `PIANO.md`, ADR 0001-0002, skill `inizio-sessione`/`fine-sessione`, hook `SessionStart`.
- ✅ **Direzioni estetiche della 1b** in `design/direzioni/`: tre direzioni, revisione, confronto e la sintesi scelta `precisione-fluida/`.
- ✅ **Ricerca UX della 1a** in `design/ricerca/`:
  - persona;
  - domande chiave con il punto dello schermo che risponde;
  - architettura dell'informazione (finestra, dock, barra di stato, palette, scorciatoie, flussi F1-F7 e S1-S5);
  - schermate × stati con priorità P0/P1/P2;
  - riassunto e link in `DESIGN.md`.

## Cosa manca per chiudere la Fase 1

- 1b: merge della PR #12.
- 1c: token in `design/tokens.json`, pagina componenti e schermate P0 e P1 in alta fedeltà come HTML statico in `design/sistema/` (Figma tolto dal piano il 2026-11-14).
- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Per la 1d serve almeno una sessione registrata in `packages/fixtures/raw/` (vedi `FASE_1.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
