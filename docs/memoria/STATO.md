# Stato attuale

_Ultimo aggiornamento: 2026-11-13_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                         | Stato                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| 1a Ricerca UX e architettura       | ✅ fatta il 2026-11-13, **in attesa della revisione dell'utente** |
| 1b Tre direzioni estetiche         | ⏭ prossima (ultracode, effort high)                               |
| 1c Design system e schermate Figma | da fare (bloccata: Figma da autorizzare)                          |
| 1d Prototipo in codice Vista Live  | da fare (bloccata: serve almeno una fixture)                      |

## Branch

`feat/design-1a` (da `main`), con la ricerca UX e la memoria aggiornata. Commit locali, non ancora pushati; nessuna PR aperta.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale (2026-11-13, su `feat/design-1a`) e in CI (job "Verify (Windows)").
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verifica su Windows, gitleaks (CLI, cronologia completa), commitlint e controllo memoria sulle PR, audit. Verificato con la PR #7 che un errore di tipo blocca la CI.
- ✅ release-please v5; Dependabot con le Actions raggruppate. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Documenti open source: LICENSE (MIT), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- ✅ `CLAUDE.md`, memoria completa con `PIANO.md`, ADR 0001-0002, skill `inizio-sessione`/`fine-sessione`, hook `SessionStart`.
- ✅ **Ricerca UX della 1a** in `design/ricerca/`:
  - persona;
  - domande chiave con il punto dello schermo che risponde;
  - architettura dell'informazione (finestra, dock, barra di stato, palette, scorciatoie, flussi F1-F7 e S1-S5);
  - schermate × stati con priorità P0/P1/P2;
  - riassunto e link in `DESIGN.md`.

## Cosa manca per chiudere la Fase 1

- Revisione della 1a da parte dell'utente, poi push e PR di `feat/design-1a`.
- 1b: tre direzioni estetiche e scelta dell'utente, decidendo anche la densità e il nome del prodotto.
- 1c: Figma, token in `design/tokens.json`, schermate P0 e P1 in alta fedeltà, prototipo cliccabile.
- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Il server MCP Figma va autorizzato con `/mcp` prima della Fase 1c.
- Per la 1d serve almeno una sessione registrata in `packages/fixtures/raw/` (vedi `FASE_1.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
