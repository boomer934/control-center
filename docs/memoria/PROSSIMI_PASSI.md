# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Dettagli, goal e prerequisiti della Fase 1 sono in [`FASE_1.md`](FASE_1.md).

## Fatto

- ✅ **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `design/ricerca/` + riassunto in `docs/memoria/DESIGN.md`. Revisionata dall'utente; PR #10 unita su `main` il 2026-11-13.
- ✅ **(F1b)** Tre direzioni estetiche, revisione, confronto e scelta dell'utente: `precisione fluida` (`design/direzioni/precisione-fluida/`), densità `compact`, nome candidato Vernier. PR #12 unita su `main` il 2026-11-14.

## Ora

1. **(F1c)** Partendo da `design/direzioni/precisione-fluida/`: `design/tokens.json`, pagina componenti e schermate P0 e P1 in alta fedeltà come HTML statico in `design/sistema/`; flussi F1-F7 verificati sulla sequenza delle schermate. Niente Figma. Verificare anche il nome Vernier (marchi, pacchetto, dominio). Branch `feat/design-1c`.
2. **(F2, in parallelo)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).

## Dopo

3. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
4. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture. Usare la sezione "Dati necessari" di `design/ricerca/domande-chiave.md` come lista di controllo dello schema.
5. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- Opzionale in locale: `winget install gitleaks` e `npm i -g pnpm@10`.
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.
