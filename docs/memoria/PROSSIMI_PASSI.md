# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1 e 2 sono chiuse (2026-11-14): sintesi in `STORIA.md`, voci "Chiusura Fase 1" e "Chiusura Fase 2". Il brief della Fase 3 è in [`FASE_3.md`](FASE_3.md).

## Ora

1. ✅ **(F3a)** Shell Electron sicura e IPC, unita su `main` con la PR #23 (`985130d`, ADR 0004), E2E e Fuses verdi in CI su `windows-latest`.
2. ✅ **(F3b)** Logger, cattura errori e Console Errori con stack sorgente, ADR 0005, unita su `main` con la PR #25 (`2c64bf8`), 6 check verdi.

## Dopo

3. **(F3c)** Design system in codice, layout a pannelli, command palette, scorciatoie con ambiti di focus (da `design/ricerca/architettura.md`), temi e pagina componenti con test visivi. Branch proposto `feat/desktop-ui`.

## Quando capita

- **(F3c)** Portare la barra di stato e la Console Errori provvisorie nei componenti del design system.
- **(F4)** Metodo IPC per aprire un frame dello stack nell'editor, con i controlli di percorso; valutare un canale push al posto del polling di `errors:list`.
- **(F10)** Provare a mano la mappatura degli stack nel pacchetto (`app.asar`); decidere se l'installer include le source map.

- **(F2, prima della F4)** Una sessione interattiva breve nel progetto di prova per catturare `Notification` (attesa utente) e aggiungere l'hook `PostToolUseFailure`. Poi `node scripts/fixtures/sanitize.mjs`, rilettura e aggiornamento degli snapshot (`npx vitest run packages/fixtures -u`).
- **(F4)** Il ponte degli hooks deve consegnare gli eventi in tempo reale. `normalizeClaudeHooks` collega gli hooks dei subagent alla chiamata `Agent` solo a posteriori; dal vivo l'attribuzione va presa dallo stream (`parent_tool_use_id`). I normalizzatori oggi sono funzioni batch: dal vivo serviranno versioni incrementali.
- **(F5)** Passare il prototipo 1d a `AgentEvent` e alle fixture ripulite, così i suoi test Playwright girano anche in CI.
- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.
- **(F5e)** Aggiungere `error.detected` allo schema. Ogni cambio incompatibile di `AgentEvent` alza `schemaVersion` e richiede una migrazione testata (ADR 0003).
- **(F7)** Il bridge Ollama vero: `normalizeOllamaChat` oggi è minimo.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10)** Icona dell'app, installer NSIS, firma e aggiornamenti: oggi `electron-builder.config.ts` serve solo per `--dir` e i test dei Fuses. Togliere `packageExtensions` per `@peculiar/utils` quando dichiarerà `tslib` (vedi `PROBLEMI_NOTI.md`).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
