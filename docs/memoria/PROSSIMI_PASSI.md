# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Dettagli, goal e prerequisiti della Fase 1 sono in [`FASE_1.md`](FASE_1.md).

## Fatto

- ✅ **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `design/ricerca/` + riassunto in `docs/memoria/DESIGN.md`. Revisionata dall'utente; PR #10 unita su `main` il 2026-11-13.
- ✅ **(F1b)** Tre direzioni estetiche, revisione, confronto e scelta dell'utente: `precisione fluida` (`design/direzioni/precisione-fluida/`), densità `compact`, nome candidato Vernier. PR #12 unita su `main` il 2026-11-14.
- ✅ **(F1c)** Design system e schermate HTML: token, componenti, 9 P0 + 9 P1 con tutti gli stati, flussi F1-F7, 55 screenshot, revisione impeccable (un grave, corretto). Nome deciso: Vernier, con ripiego su Control Center. PR #14 unita su `main` il 2026-11-14.

## Ora

1. **(F2, sblocca la F1d)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).

## Dopo

2. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
3. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture. Usare la sezione "Dati necessari" di `design/ricerca/domande-chiave.md` come lista di controllo dello schema.
4. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- Opzionale in locale: `winget install gitleaks` e `npm i -g pnpm@10`.
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.
