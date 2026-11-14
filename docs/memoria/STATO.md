# Stato attuale

_Ultimo aggiornamento: 2026-11-14_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                        | Stato                                                     |
| --------------------------------- | --------------------------------------------------------- |
| 1a Ricerca UX e architettura      | ✅ fatta e revisionata, PR #10 unita il 2026-11-13        |
| 1b Tre direzioni estetiche        | ✅ `precisione fluida`, PR #12 unita il 2026-11-14        |
| 1c Design system e schermate HTML | **in corso**: token, componenti e P0 fatti; restano le P1 |
| 1d Prototipo in codice Vista Live | da fare (bloccata: serve almeno una fixture)              |

## Branch

`feat/design-1c`, con 6 commit locali + la memoria, **non ancora pushato**.

## Punto di ripresa (1c, a metà)

Mi sono fermato vicino al limite delle 5 ore (circa 80 %).

- **Fatto:**
  - token in `design/tokens.json`, con il generatore `scripts/build-tokens.mjs`;
  - `design/sistema/` con `componenti.css`, `shell.js` e `componenti.html`;
  - le 9 schermate P0 con tutti gli stati;
  - `README.md` con i flussi F1-F7;
  - `DESIGN.md` e `FASE_1.md` aggiornati.
- **Da fare, in ordine:**
  1. **Le 9 schermate P1:** onboarding, replay, infra, local-agents (con la proposta di diff), mcp-skills, settings, terminal, workspace, notifiche. Si fanno come le P0: si copia `schermate/live.html`, si aggiunge `<pagina>-data.js` con `window.PAGE` e `window.LIVE` (varianti con `center`, `bdock`, `overlay`, `noDock`, `inspector`) e si aggiungono le pagine in `PAGES` di `shell.js` (già fatto).
  2. **Gli screenshot nella repo** (`design/sistema/screenshot/`: scuro, chiaro e denso per pagina). Lo script è nella scratchpad della sessione, `shot.mjs`: va rifatto se la scratchpad sparisce. Usa playwright-core dalla cache npx e Chromium 1248, controlla la console e il testo sotto 11 px.
  3. **La revisione impeccable:** mostrare i gravi all'utente e **aspettare conferma** prima di correggerli.
  4. Ancora `fine-sessione`, poi `pnpm verify`, push e PR verso `main`. Il merge solo con CI verde e dopo la revisione dell'utente.
- **Da decidere (utente):** il nome Vernier, viste le collisioni in `FASE_1.md` § Decisioni aperte.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI. Ci sono 17 warning del plugin security sugli script, nessun errore.
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, gitleaks, commitlint, controllo memoria, audit. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Documenti open source, `CLAUDE.md`, memoria, ADR 0001-0002, skill di sessione.
- ✅ Design:
  - ricerca UX (1a);
  - direzioni (1b);
  - **design system 1c** in `design/tokens.json` e `design/sistema/` (componenti + P0).

## Cosa manca per chiudere la Fase 1

- 1c: P1, screenshot, revisione impeccable, PR.
- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Per la 1d serve almeno una sessione registrata in `packages/fixtures/raw/` (vedi `FASE_1.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- I file HTML/JS molto grandi vanno scritti a pezzi: la generazione in un colpo solo si è bloccata.
