# Stato attuale

_Ultimo aggiornamento: 2026-11-14_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design: in corso.** Il brief operativo è in [`FASE_1.md`](FASE_1.md).

| Sotto-fase                        | Stato                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| 1a Ricerca UX e architettura      | ✅ fatta e revisionata, PR #10 unita il 2026-11-13         |
| 1b Tre direzioni estetiche        | ✅ `precisione fluida`, PR #12 unita il 2026-11-14         |
| 1c Design system e schermate HTML | **in corso**: tutto fatto tranne revisione impeccable e PR |
| 1d Prototipo in codice Vista Live | da fare (bloccata: serve almeno una fixture)               |

## Branch

`feat/design-1c`, pushato su `origin` (nessuna PR ancora: si apre dopo la revisione impeccable).

## Punto di ripresa (1c, quasi finita)

Sessione del 2026-11-14 fermata vicino al limite delle 5 ore (stop chiesto dall'utente al 95 %). Il limite si azzera alle 6:30.

- **Fatto:**
  - token in `design/tokens.json`, con il generatore `scripts/build-tokens.mjs`;
  - `design/sistema/` con `componenti.css`, `shell.js` e `componenti.html`;
  - le 9 schermate P0 con tutti gli stati;
  - **le 9 schermate P1 con tutti gli stati** (commit `55c5e54`): onboarding (7 stati), replay (6, con barra di modalità read-only), infra (5), local-agents (8, compresa la proposta di diff da approvare/approvata/rifiutata), mcp-skills (6), settings (6 sezioni + valore non valido), terminal (5), workspace (4), notifiche (toast + 3 notifiche di Windows). Tutte passano `.local/shot.mjs` (console pulita, niente testo sotto 11 px);
  - `README.md` con i flussi F1-F7;
  - `DESIGN.md` e `FASE_1.md` aggiornati (non ancora per le P1).
- **Scelta di design da confermare:** la notifica di Windows non approva mai un permesso, porta solo alla richiesta (dove si vede il contesto).
- **Da fare, in ordine:**
  1. ✅ `design/sistema/README.md` con le P1, i loro stati e le nuove regole (commit `703c03c`).
  2. ✅ 55 screenshot WebP in `design/sistema/screenshot/` (scuro e chiaro dello stato predefinito + stato più carico, per pagina; 5,3 MB). Tema chiaro delle P1 controllato a campione: ok. Si rigenerano con `.local/shot.mjs` e si convertono in WebP (qualità 88).
  3. **La revisione impeccable:** mostrare i gravi all'utente e **aspettare conferma** prima di correggerli.
  4. Ancora `fine-sessione`, poi `pnpm verify`, push e PR verso `main`. Il merge solo con CI verde e dopo la revisione dell'utente.
- **Da decidere (utente):** il nome Vernier, viste le collisioni in `FASE_1.md` § Decisioni aperte.

## Cosa funziona

- ✅ Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- ✅ `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI. Ci sono 24 warning del plugin security sugli script, nessun errore. In locale servono `.local/*.mjs` formattati con prettier e `/* global document, getComputedStyle */` in testa a `shot.mjs`, altrimenti `verify` fallisce (la CI non li vede).
- ✅ Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- ✅ CI GitHub Actions: verify su Windows, gitleaks, commitlint, controllo memoria, audit. Sulle PR girano anche CodeRabbit e GitGuardian.
- ✅ Documenti open source, `CLAUDE.md`, memoria, ADR 0001-0002, skill di sessione.
- ✅ Design:
  - ricerca UX (1a);
  - direzioni (1b);
  - **design system 1c** in `design/tokens.json` e `design/sistema/` (componenti + P0).

## Cosa manca per chiudere la Fase 1

- 1c: revisione impeccable, `fine-sessione`, PR.
- 1d: prototipo in codice della Vista Live su una fixture reale, con i test Playwright.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR.
- Per la 1d serve almeno una sessione registrata in `packages/fixtures/raw/` (vedi `FASE_1.md`).
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- I file HTML/JS molto grandi vanno scritti a pezzi: la generazione in un colpo solo si è bloccata.
