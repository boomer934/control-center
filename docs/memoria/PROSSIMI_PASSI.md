# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> La Fase 1 è chiusa (2026-11-14): sintesi in `STORIA.md`, voce "Chiusura Fase 1". La registrazione e la pulizia delle fixture sono in [`scripts/fixtures/README.md`](../../scripts/fixtures/README.md).

## Fatto

- ✅ **(F2, anticipata)** 5 sessioni reali registrate in `packages/fixtures/raw/` con `scripts/fixtures/capture-hook.mjs`; `check-raw.mjs` verde. PR #16 unita su `main` il 2026-11-14.
- ✅ **(F2)** Schema `AgentEvent`, normalizzatori (stream, hooks, merge, Ollama minimo), pulizia delle fixture e 5 sessioni ripulite in `packages/fixtures/sanitized/`. Branch `feat/event-schema`; ADR 0003.

## Ora

1. **(F2)** Merge a mano della PR #20 (CI verde dal 2026-11-14), poi chiusura della Fase 2 in `STORIA.md`.

## Dopo

2. **(F2, facoltativo)** Una sessione interattiva breve nel progetto di prova per catturare `Notification` (attesa utente) e aggiungere l'hook `PostToolUseFailure`. Poi `node scripts/fixtures/sanitize.mjs`, rilettura e aggiornamento degli snapshot.
3. **(F3)** Shell Electron sicura, logger e Console Errori. Le scorciatoie e gli ambiti di focus partono da `design/ricerca/architettura.md`.

## Quando capita

- **(F4)** Il ponte degli hooks deve consegnare gli eventi in tempo reale. `normalizeClaudeHooks` collega gli hooks dei subagent alla chiamata `Agent` solo a posteriori; dal vivo l'attribuzione va presa dallo stream (`parent_tool_use_id`).
- **(F5)** Passare il prototipo 1d a `AgentEvent` e alle fixture ripulite, così i suoi test Playwright girano anche in CI.
- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
