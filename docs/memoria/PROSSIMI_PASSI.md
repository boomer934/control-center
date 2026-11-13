# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Dettagli, goal e prerequisiti della Fase 1 sono in [`FASE_1.md`](FASE_1.md).

## Fatto

- ✅ **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `design/ricerca/` + riassunto in `docs/memoria/DESIGN.md`. Revisionata dall'utente; PR #10 unita su `main` il 2026-11-13.

## Ora

1. **(F1b)** Tre direzioni estetiche con /frontend-design (ultracode, effort high, una direzione per agente) → `design/direzioni/`. Ogni direzione disegna la Live in stato normale (ed eventualmente denso) con i contenuti indicati in `design/ricerca/schermate.md` ("Cosa serve a 1b e 1c"). Revisione impeccable e **scelta dell'utente**, decidendo anche densità e nome del prodotto. Branch `feat/design-1b`.
2. **(F2, in parallelo)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).

## Dopo

3. **(F1c)** Autorizzare Figma (`/mcp`), design system, schermate P0 e P1 in alta fedeltà, prototipo cliccabile sui flussi F1-F7.
4. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
5. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture. Usare la sezione "Dati necessari" di `design/ricerca/domande-chiave.md` come lista di controllo dello schema.
6. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- Opzionale in locale: `winget install gitleaks` e `npm i -g pnpm@10`.
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.
