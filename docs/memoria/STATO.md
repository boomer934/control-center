# Stato attuale

_Ultimo aggiornamento: 2026-11-14 (quinta sessione, Fase 2)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: lavoro fatto sul branch `feat/event-schema`; manca il CI verde sulla PR e il merge.

## Branch

`feat/event-schema` (da `main`), 3 commit: schema e normalizzatori, fixture ripulite e pulizia, memoria. Dopo il merge si riparte da `main`.

## Punto di ripresa

- **Schema:** `packages/event-schema/src/schema.ts` definisce `AgentEvent`. È un'unione stretta su `type` con 16 tipi; l'envelope ha `seq`, `source`, `provider` e `agentId` (`main`, `sub:<toolUseId>` o `ollama:<modello>`). Le scelte sono nell'ADR 0003.
- **Percorsi e segreti:**
  - `path.ts`: `toFileRef` (percorsi relativi al workspace, `external` con home `~`) e `makeTextCleaner`;
  - `redact.ts`: `redactSecrets` e `findSecrets`, senza dipendenze.
- **Normalizzatori** (`src/normalize/`):
  - `normalizeClaudeStream` e `normalizeClaudeHooks`;
  - `mergeClaudeSession`, che prende il contenuto dallo stream e i tempi dagli hooks; `normalizeClaudeSession` fa i due passi insieme;
  - `normalizeOllamaChat`, minimo: il bridge vero è in Fase 7.
- **Fixture:**
  - `packages/fixtures/sanitized/` contiene le 5 sessioni ripulite più `ollama-chat.synthetic.jsonl`;
  - `@control-center/fixtures` è il loader;
  - `scripts/fixtures/sanitize.mjs` fa la pulizia ad allowlist, e con `--check` gira anche in CI e in Vitest.
- **Test:** 110 test in `pnpm verify`. Coprono:
  - lo schema;
  - redazione e percorsi;
  - i normalizzatori su input sintetici;
  - le 5 fixture: validazione, invarianti e snapshot della timeline;
  - la pulizia, incluso `--check` sulle fixture committate.
- **Prossimo:** push di `feat/event-schema`, PR, CI verde (verify, gitleaks su tutta la cronologia, commitlint), merge a mano.
- `.claude/settings.json` nega a Claude la lettura di `packages/fixtures/raw/`. Le fixture ripulite invece si leggono, e vanno rilette a mano prima di ogni commit.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema`, `packages/fixtures` e, solo per sviluppo, `design/prototipo-live`.
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale: 110 test, 0 errori di lint, restano 86 warning del plugin security.
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, controllo delle fixture ripulite, gitleaks, commitlint, controllo memoria, audit. Il controllo delle fixture è nuovo e non ha ancora girato in CI.
- ✅ Registrazione delle fixture (`capture-hook.mjs`, `check-raw.mjs`), pulizia (`sanitize.mjs`).
- ✅ Design: ricerca UX (1a), direzioni (1b), design system 1c, prototipo Live 1d.

## Cosa manca per chiudere la Fase 2

- CI verde sulla PR di `feat/event-schema` e merge su `main`.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- gitleaks non è installato in locale: le fixture ripulite le controlla solo il job CI, oltre a `sanitize.mjs --check`.
- Mancano fixture reali per `Notification` (sessione interattiva) e `PostToolUseFailure`. I due casi sono coperti solo da test sintetici.
- Le fixture grezze vivono solo in locale. Il prototipo 1d legge ancora quelle, quindi in CI i suoi test Playwright si saltano.
- Playwright 1.65 vuole Chromium 1255, in locale c'è il 1248 (vedi `PROBLEMI_NOTI.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
