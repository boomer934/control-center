# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> La Fase 1 è chiusa (2026-11-14): sintesi in `STORIA.md`, voce "Chiusura Fase 1". La registrazione delle fixture è in [`scripts/fixtures/README.md`](../../scripts/fixtures/README.md).

## Fatto

- ✅ **(F2, anticipata)** 5 sessioni reali registrate in `packages/fixtures/raw/` con `scripts/fixtures/capture-hook.mjs`; `check-raw.mjs` verde. PR #16 unita su `main` il 2026-11-14.

## Ora

1. **(F2)** Schema `AgentEvent` completo, normalizzatori, script di pulizia delle fixture. Usare la sezione "Dati necessari" di `design/ricerca/domande-chiave.md` come lista di controllo dello schema; il normalizzatore del prototipo (`design/prototipo-live/src/replay/normalize.ts`) mostra quali campi delle fixture servono davvero (tempi dagli hooks, agenti, esiti e permessi negati dallo stream).

## Dopo

2. **(F2, facoltativo)** Una sessione interattiva breve nel progetto di prova per catturare `Notification` (attesa utente) e aggiungere l'hook `PostToolUseFailure`.
3. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
