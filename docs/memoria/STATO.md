# Stato attuale

_Ultimo aggiornamento: 2026-11-17 (Fase 3 chiusa, brief della Fase 4 pronto)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: ✅ completata il 2026-11-17 (PR #23, #25, #27). Sintesi in `STORIA.md`, voce "Chiusura Fase 3".

**Fase 4 — Prima versione usabile**: da iniziare. Il brief è in [`FASE_4.md`](FASE_4.md), con le sotto-fasi 4.1 (bridge e sessione), 4.2 (workspace e terminale) e 4.3 (chat e permessi).

- **3a**, shell sicura e IPC: ✅ unita su `main` (PR #23, `985130d`, ADR 0004).
- **3b**, logger e Console Errori: ✅ unita su `main` (PR #25, `2c64bf8`, ADR 0005).
- **3c**, design system in codice: ✅ unita su `main` (PR #27, `1765186`, ADR 0006), 6 check verdi compreso Verify (Windows) con i test visivi.

## Branch

`feat/fixture-posttoolusefailure` (PR #31). `main` include il brief della Fase 4 (PR #30).

## Punto di ripresa

- **Ora:** merge della PR #31 (`feat/fixture-posttoolusefailure`: `sessione-06` con `PostToolUseFailure`, guida passo passo in `scripts/fixtures/README.md`) a CI verde. La PR #30 (brief della Fase 4) è già unita.
- **Handoff 2026-11-17 (limite 5 ore al 95%):** l'utente ha registrato `sessione-07` in modo interattivo. In `packages/fixtures/raw/`, che è git-ignorata, c'è `sessione-07.hooks.jsonl` e l'utente vede `Notification`. **Da fare:**
  1. controllare che esista anche il file di stream vuoto `raw/sessione-07.jsonl` e crearlo se manca;
  2. eseguire `node scripts/fixtures/check-raw.mjs`, `node scripts/fixtures/sanitize.mjs` e `npx vitest run packages/fixtures -u`;
  3. rileggere `sanitized/sessione-07.hooks.jsonl` e lo snapshot;
  4. committare sul branch della PR #31 o su uno nuovo da `main`, e aggiornare README, STORIA, PROSSIMI_PASSI e FASE_4 (`Notification` catturato, 4.1 sbloccata).
     Claude non può leggere `raw/`: i controlli si fanno con gli script.
- **Poi:** Fase 4.1, il bridge degli hooks, su `feat/hooks-bridge` con Opus 5.5, effort high. Il goal è in `FASE_4.md`.

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Renderer da `app://control-center/`, CSP in header e `<meta>`; `packages/ipc-contract` con 6 metodi (`app:get-info`, `shell:open-external`, e i 4 di `errors:*`). La 3c non ha aggiunto IPC.
- ✅ `packages/app-log` e Console Errori (3b), ora nel dock inferiore "Problems".
- ✅ Design system in codice (3c): token → Tailwind v4, `componenti.css` importato, componenti base, temi `system|dark|light` (preferenza in `localStorage`, `system` segue l'OS) e densità, shell a pannelli ridimensionabili con layout ricordato, barra attività, barra di stato, command palette (`Ctrl+K`, `Ctrl+Shift+P`), dialog `?`, scorciatoie con ambiti di focus (terminale, campi di testo, Live, dialog), `Ctrl+1…7`, pagina `#/components` con test visivi.
- ✅ In locale, il 2026-11-17, sulla 3c:
  - `pnpm verify` verde: 203 test (19 nuovi), 0 errori di lint;
  - `pnpm e2e`: 46 test verdi (17 nuovi in `ui.spec.ts`, di cui 12 screenshot di 6 sezioni in 2 temi);
  - `pnpm e2e:packaged`: 8 test verdi.
- ✅ Revisione impeccable della 3c (un solo contesto, con detector: sorgente pulito): 2 problemi gravi trovati e corretti (trappola del focus nei dialog, anello di focus dell'input). Minori aperti: `aria-live` per il contatore errori, prova a finestra stretta.
- ✅ Già da prima: `@control-center/event-schema` e `@control-center/fixtures`, hook git, gitleaks in CI, design della Fase 1.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR, merge a mano a CI verde.
- **Screenshot di riferimento** (`apps/desktop/e2e/app/ui.spec.ts-snapshots/`): sono quelli del runner `windows-latest` (artifact `playwright-results` del run 44100672540), perché i caratteri locali differivano di circa il 4% dei pixel. **In locale i 12 test visivi falliscono**: per rigenerarli o confrontarli si usa l'artifact della CI, non `--update-snapshots` locale. Le asserzioni sono `expect.soft`, così un run fallito salva tutti i candidati.
- **Font non inclusi:** Instrument Sans e Martian Mono non sono nel pacchetto (la CSP vieta Google Fonts); l'app usa i font di ripiego dei token. Vedi `PROSSIMI_PASSI.md`.
- Nessuna title bar personalizzata: cornice nativa di Windows.
- Mappatura degli stack nel pacchetto (`app.asar`) provata solo in `out/` e con test unitari, non end to end: vedi `PROBLEMI_NOTI.md`.
- "Clic su un frame → apri l'editor" della Console non c'è: serve un metodo IPC che apra file, da progettare con i controlli di percorso della Fase 4.
- gitleaks non è installato in locale: lo controlla il job CI.
- **Bloccante per la 4.1:** manca la fixture reale di `Notification`, che richiede una sessione interattiva dell'utente. `PostToolUseFailure` è in `sessione-06` (branch `feat/fixture-posttoolusefailure`).
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/`, `release/` e `test-results/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
