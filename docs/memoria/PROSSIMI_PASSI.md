# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`.

## Ora

1. **(F0)** Spostare `PIANO.md` in `docs/memoria/PIANO.md` e committare.
2. **(F0)** Creare la repo GitHub privata, push, protezione di `main`, PR di prova per verificare che la CI blocchi un errore di tipo.
3. **(F0)** Opzionale: `winget install gitleaks` e `npm i -g pnpm@10` in locale.

## Poi (in parallelo)

4. **(F1a)** Ricerca UX: persona, 5 domande chiave, architettura dell'informazione, mappa delle schermate e stati → `docs/memoria/DESIGN.md`.
5. **(F2)** Registrare le prime 5 sessioni reali di Claude Code (stream-json + hooks) in `packages/fixtures/raw/` (ignorata da git).
6. **(F1b)** Tre direzioni estetiche con /frontend-design → `design/direzioni/`. Scelta dell'utente.

## Dopo

7. **(F1c)** Autorizzare Figma (`/mcp`), design system e schermate in alta fedeltà.
8. **(F1d)** Prototipo in codice della Vista Live sulle fixture.
9. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture.
10. **(F3)** Shell Electron sicura, logger e Console Errori.
