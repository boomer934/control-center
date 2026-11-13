# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`.

> Dettagli, goal e prerequisiti della Fase 1 sono in [`FASE_1.md`](FASE_1.md).

## Ora (in parallelo)

1. **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `docs/memoria/DESIGN.md`.
2. **(F2)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).
3. **(F1b)** Tre direzioni estetiche con /frontend-design (ultracode, una direzione per agente) → `design/direzioni/`. Scelta dell'utente.

## Dopo

4. **(F1c)** Autorizzare Figma (`/mcp`), design system e schermate in alta fedeltà.
5. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
6. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture.
7. **(F3)** Shell Electron sicura, logger e Console Errori.

## Quando capita

- Opzionale in locale: `winget install gitleaks` e `npm i -g pnpm@10`.
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.
