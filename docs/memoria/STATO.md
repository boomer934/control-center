# Stato attuale

_Ultimo aggiornamento: 2026-11-13_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                         | Stato                                              |
| ---------------------------------- | -------------------------------------------------- |
| 1a Ricerca UX e architettura       | ✅ fatta e revisionata, PR #10 unita il 2026-11-13 |
| 1b Tre direzioni estetiche         | 🟡 in corso: 3 direzioni fatte, manca la revisione |
| 1c Design system e schermate Figma | da fare (bloccata: Figma da autorizzare)           |
| 1d Prototipo in codice Vista Live  | da fare (bloccata: serve almeno una fixture)       |

## Branch

`feat/design-1b` (solo in locale, **non ancora pushato**, nessuna PR). `main` è fermo a `b9433a8`.

## Punto di ripresa (1b, sessione del 2026-11-13)

Sessione fermata vicino al limite delle 5 ore. Piano approvato: `~/.claude/plans/utilizza-il-comando-inizio-sessione-generic-toucan.md` (passi 1-4).

- ✅ **Passo 1:** brief comune in `design/direzioni/BRIEF.md` (vincoli, dati finti identici, scenari `normal`/`dense`, tre direzioni, checklist).
- ✅ **Passo 2, fase Design** (workflow ultracode): tre direzioni complete, ciascuna con `live.html` (parametri `theme`, `density`, `scenario`, `gray`) e `README.md` con la checklist tutta spuntata. Ogni agente ha verificato 0 errori in console con Chromium headless.
  - `precisione`: Martian Mono + Instrument Sans, celle mono con colonna dei segni, timeline "analizzatore logico", attesa come targa giallo-nera.
  - `sala-controllo`: Barlow (Semi) Condensed + Iosevka Charon Mono, piano quotato, sigle di canale, annunciatori, tutto spento tranne le spie.
  - `carta-inchiostro`: Alegreya + Alegreya Sans + Courier Prime, chiaro-first, stati come segni di correzione, evidenziatore per l'attesa, sigilli tondi (cloud) e quadrati (locale).
- ⛔ **Passo 2, fase Review:** interrotta. `design/direzioni/REVISIONE.md` **non esiste**.
- ⏭ **Da fare:**
  1. revisione `impeccable` delle tre direzioni → `REVISIONE.md`;
  2. correzione dei problemi gravi;
  3. screenshot in `design/direzioni/<slug>/screenshot/`;
  4. `CONFRONTO.md` con le domande all'utente (direzione, densità, nomi);
  5. memoria, poi push e PR.
- **Rischi già segnalati dagli agenti** (nei README):
  - 500 nodi richiedono lo zoom semantico in tutte e tre;
  - in tema chiaro con `gray=1` l'attesa gialla perde forza e la reggono icona e bordo;
  - `sala-controllo` usa un mono vicino a `precisione` e fa muovere anche reading/running;
  - `precisione` ha `--line` sotto 3:1 per scelta.
- **Ultracode alla ripresa: non conviene.** Il lavoro rimasto è sequenziale: una revisione, poi le correzioni e il confronto. Basta una sessione normale, Opus 5.5 effort high. La revisione si può fare con un solo subagent, o di persona, con la skill `impeccable`.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI (job "Verify (Windows)").
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

- 1b: tre direzioni estetiche e scelta dell'utente, decidendo anche la densità e il nome del prodotto.
- 1c: Figma, token in `design/tokens.json`, schermate P0 e P1 in alta fedeltà, prototipo cliccabile.
- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Il server MCP Figma va autorizzato con `/mcp` prima della Fase 1c.
- Per la 1d serve almeno una sessione registrata in `packages/fixtures/raw/` (vedi `FASE_1.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
