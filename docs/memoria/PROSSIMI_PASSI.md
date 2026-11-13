# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`.

## Ora

1. **(F0)** PR di prova con un errore di tipo per verificare che la CI la blocchi; poi chiuderla senza merge.
2. **(F0)** Opzionale: `winget install gitleaks` e `npm i -g pnpm@10` in locale.
3. **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA.

## Poi (in parallelo)

4. **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `docs/memoria/DESIGN.md`.
5. **(F2)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).
6. **(F1b)** Tre direzioni estetiche con /frontend-design → `design/direzioni/`. Scelta dell'utente.

## Dopo

7. **(F1c)** Autorizzare Figma (`/mcp`), design system e schermate in alta fedeltà.
8. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
9. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture.
10. **(F3)** Shell Electron sicura, logger e Console Errori.
