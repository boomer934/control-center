# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Dettagli, goal e prerequisiti della Fase 1 sono in [`FASE_1.md`](FASE_1.md).

## Fatto

- ✅ **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `design/ricerca/` + riassunto in `docs/memoria/DESIGN.md`. Revisionata dall'utente; PR #10 unita su `main` il 2026-11-13.
- ✅ **(F1b)** Tre direzioni estetiche, revisione, confronto e scelta dell'utente: `precisione fluida` (`design/direzioni/precisione-fluida/`), densità `compact`, nome candidato Vernier. PR #12 unita su `main` il 2026-11-14.

## Ora

1. **(F1c, a metà)** Sul branch `feat/design-1c` (locale):
   - ✅ token, componenti, 9 schermate P0, flussi F1-F7, verifica di Vernier;
   - restano le 9 schermate P1, gli screenshot nella repo, la revisione impeccable (gravi all'utente prima di correggerli), push e PR.

   Dettagli nel "Punto di ripresa" di `STATO.md`.

2. **(F1c, utente)** Decidere il nome: Vernier ha collisioni (pacchetto npm `vernier` nello stesso ambito, marchi in classe 9).
3. **(F2, in parallelo)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).

## Dopo

4. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
5. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture. Usare la sezione "Dati necessari" di `design/ricerca/domande-chiave.md` come lista di controllo dello schema.
6. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- Opzionale in locale: `winget install gitleaks` e `npm i -g pnpm@10`.
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.
