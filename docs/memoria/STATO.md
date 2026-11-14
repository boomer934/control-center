# Stato attuale

_Ultimo aggiornamento: 2026-11-14 (terza sessione)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                        | Stato                                              |
| --------------------------------- | -------------------------------------------------- |
| 1a Ricerca UX e architettura      | ✅ fatta e revisionata, PR #10 unita il 2026-11-13 |
| 1b Tre direzioni estetiche        | ✅ `precisione fluida`, PR #12 unita il 2026-11-14 |
| 1c Design system e schermate HTML | ✅ fatta e revisionata, PR #14 unita il 2026-11-14 |
| 1d Prototipo in codice Vista Live | da fare, sbloccata (fixture registrate)            |

## Branch

`docs/memoria-fixtures-merge`, solo per registrare il merge della PR #16. Dopo il suo merge si riparte da `main`.

## Punto di ripresa

- **Fixture registrate (F2 anticipata), PR #16 unita su `main` il 2026-11-14** (`e111c0a`, 6 check verdi): 5 sessioni in `packages/fixtures/raw/` (ignorata da git), stream-json + hooks, coprono modifiche a più file, test, subagent, permesso negato ed errore. `node scripts/fixtures/check-raw.mjs` passa. Dettagli e lacune in `FASE_1.md`, sezione "Fixture per 1d".
- Il progetto di prova è `~/Desktop/vernier-fixture-lab` (fuori dalla repo); per nuove registrazioni: `./record.sh NN "<prompt>"`.
- Note per lo schema della F2: su Windows la shell arriva anche come tool `PowerShell`, non solo `Bash`; lo stream-json contiene eventi `system/*` (hook_started, task_progress, permission_denied, ui_panes…) oltre a assistant/user/result.
- **Prossimo:** la 1d (prototipo della Vista Live sulle fixture), da un branch `feat/live-prototype` partito da `main`.
- 1c unita su `main` (PR #14). Decisioni chiuse: nome **Vernier** (ripiego Control Center); le notifiche di Windows non approvano mai.
- Strumenti locali: `.local/shot.mjs` (screenshot + console + testo < 11 px). La scansione del contrasto pagina × stato × tema era uno script temporaneo; si riscrive facilmente sullo stesso schema di `shot.mjs`.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI. Ci sono 28 warning del plugin security sugli script, nessun errore. In locale servono `.local/*.mjs` formattati con prettier e `/* global document, getComputedStyle */` in testa a `shot.mjs`, altrimenti `verify` fallisce (la CI non li vede).
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, gitleaks, commitlint, controllo memoria, audit. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Registrazione delle fixture: `scripts/fixtures/capture-hook.mjs` (hooks) e `scripts/fixtures/check-raw.mjs` (validazione e copertura).
- ✅ Documenti open source, `CLAUDE.md`, memoria, ADR 0001-0002, skill di sessione.
- ✅ Design:
  - ricerca UX (1a);
  - direzioni (1b);
  - **design system 1c** in `design/tokens.json` e `design/sistema/` (componenti, P0 e P1, revisionati).

## Cosa manca per chiudere la Fase 1

- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Le fixture grezze vivono solo in locale (`packages/fixtures/raw/`): su un'altra macchina o in CI vanno registrate di nuovo, finché la F2 non produce le versioni ripulite.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- I file HTML/JS molto grandi vanno scritti a pezzi: la generazione in un colpo solo si è bloccata.
