# Stato attuale

_Ultimo aggiornamento: 2026-11-17 (sotto-fase 3a completata in locale)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: in corso.

- **3a**, shell sicura e IPC: ✅ fatta sul branch `feat/desktop-shell` (ADR 0004). Manca il merge della PR con la CI verde.
- **3b**, logger e Console Errori: da fare.
- **3c**, design system in codice: da fare.

## Branch

`feat/desktop-shell`, da `main` (`b8e785b`). Contiene la 3a e la memoria aggiornata.

## Punto di ripresa

- **Prossimo:** controllare la CI della PR di `feat/desktop-shell` (job Windows con `pnpm e2e` ed `e2e:packaged`), poi merge a mano. In seguito la 3b (Sonnet 5.5, effort high) in una sessione nuova, su `feat/errors-console`, con il goal di `FASE_3.md`.
- **Per la 3b:**
  - i messaggi del gate IPC oggi vanno in `console.warn` (`apps/desktop/src/main/ipc.ts`): li sostituisce il logger;
  - "copia report" non può usare `navigator.clipboard`, perché tutti i permessi web sono negati: serve un metodo IPC o l'apertura esplicita di `clipboard-sanitized-write`;
  - un nuovo metodo IPC va aggiunto in `packages/ipc-contract/src/contract.ts` e nel test `declares exactly the reviewed channels`.

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Il renderer di produzione si carica da `app://control-center/`, con la CSP sia come header sia come `<meta>`.
- ✅ `packages/ipc-contract`: 2 metodi (`app:get-info`, `shell:open-external`), validazione zod di richiesta e risposta, controllo del mittente, envelope; `window.api` generato e congelato.
- ✅ Checklist Electron di `SICUREZZA.md` tutta spuntata, ogni voce con i suoi test.
- ✅ In locale, il 2026-11-17:
  - `pnpm verify` verde: 165 test, 0 errori di lint, 110 warning del plugin security;
  - `pnpm e2e`: 19 test verdi (sicurezza + modalità sviluppo);
  - `pnpm e2e:packaged`: 6 test verdi (Fuses);
  - `pnpm audit --audit-level high` passa (2 moderate in `minimatch`, strumenti di sviluppo).
- ✅ CI: il job Windows ora esegue anche il controllo della versione di Electron, `pnpm e2e` ed `e2e:packaged`. **Non ancora provato su GitHub.**
- ✅ Già da prima: `@control-center/event-schema` e `@control-center/fixtures`, hook git, gitleaks in CI, design della Fase 1.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR, merge a mano a CI verde.
- gitleaks non è installato in locale: lo controlla il job CI.
- Mancano fixture reali per `Notification` e `PostToolUseFailure` (servono prima della Fase 4).
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/` e `release/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
