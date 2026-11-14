# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Dettagli, goal e prerequisiti della Fase 1 sono in [`FASE_1.md`](FASE_1.md).

## Fatto

- ✅ **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `design/ricerca/` + riassunto in `docs/memoria/DESIGN.md`. Revisionata dall'utente; PR #10 unita su `main` il 2026-11-13.
- ✅ **(F1b)** Tre direzioni estetiche, revisione, confronto e scelta dell'utente: `precisione fluida` (`design/direzioni/precisione-fluida/`), densità `compact`, nome candidato Vernier. PR #12 unita su `main` il 2026-11-14.
- ✅ **(F1c)** Design system e schermate HTML: token, componenti, 9 P0 + 9 P1 con tutti gli stati, flussi F1-F7, 55 screenshot, revisione impeccable (un grave, corretto). Nome deciso: Vernier, con ripiego su Control Center. PR #14 unita su `main` il 2026-11-14.

- ✅ **(F2, anticipata)** 5 sessioni reali registrate in `packages/fixtures/raw/` con `scripts/fixtures/capture-hook.mjs`; `check-raw.mjs` verde. PR #16 unita su `main` il 2026-11-14.

- ✅ **(F1d)** Prototipo in codice della Vista Live in `design/prototipo-live/`: replay delle 5 fixture con mappa, chip, timeline con scrubber e movimento ridotto; 11 test Playwright di screenshot e comportamento (solo locali); revisione impeccable senza gravi. Branch `feat/live-prototype`, PR da unire.

## Ora

1. **(F1d)** Revisione del prototipo da parte dell'utente e merge della PR; poi chiudere la Fase 1 (archiviare `FASE_1.md` in `STORIA.md`).

## Dopo

2. **(F2, facoltativo)** Una sessione interattiva breve nel progetto di prova per catturare `Notification` (attesa utente) e aggiungere l'hook `PostToolUseFailure`.
3. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture. Usare la sezione "Dati necessari" di `design/ricerca/domande-chiave.md` come lista di controllo dello schema; il normalizzatore del prototipo (`design/prototipo-live/src/replay/normalize.ts`) mostra quali campi delle fixture servono davvero.
4. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.

- Opzionale in locale: `winget install gitleaks` e `npm i -g pnpm@10`.
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.
