# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1, 2 e 3 sono chiuse: sintesi in `STORIA.md`, voci "Chiusura Fase 1", "Chiusura Fase 2" e "Chiusura Fase 3". Il brief della Fase 4 è in [`FASE_4.md`](FASE_4.md).

## Ora

1. **(F2, prima della F4.1, utente)** `PostToolUseFailure` ✅ catturato in `sessione-06`. Resta `Notification`: una sessione interattiva breve nel progetto di prova (`claude` senza `-p`, con `VERNIER_HOOKS_SESSION=sessione-07`), con almeno una richiesta di permesso lasciata in attesa qualche secondo. Serve un file di stream vuoto `raw/sessione-07.jsonl` (vedi `scripts/fixtures/README.md`). Poi:
   1. `node scripts/fixtures/sanitize.mjs`;
   2. rilettura a mano;
   3. aggiornamento degli snapshot (`npx vitest run packages/fixtures -u`).
2. **(F4.1)** Hooks bridge e sessione Claude: branch `feat/hooks-bridge`, Opus 5.5, effort high. Il goal è in `FASE_4.md`.

## Dopo

3. **(F4.2)** Workspace e terminale (Sonnet 5.5, medium).
4. **(F4.3)** Chat, permessi e cronologia (Sonnet 5.5, high).

## Quando capita

- **(F3, minore)** Includere i font (Instrument Sans, Martian Mono) nel pacchetto: file locali con `@font-face`, CSP `font-src 'self'` già a posto; decidere la licenza/fonte nell'ADR.
- **(F3, minore)** `aria-live` per il contatore errori; provare il layout a finestra stretta; title bar personalizzata solo se serve (richiede lavoro nel main).
- **(F4+)** Prefissi della palette (`/` file, `@` agenti, `#` sessioni, `!` locali) e scorciatoie `Ctrl+O`, `Ctrl+Shift+A`, `Ctrl+L`: arrivano con le funzioni che servono.
- **(F4)** Metodo IPC per aprire un frame dello stack nell'editor, con i controlli di percorso; valutare un canale push al posto del polling di `errors:list`.
- **(F10)** Provare a mano la mappatura degli stack nel pacchetto (`app.asar`); decidere se l'installer include le source map.

- **(F4)** Il ponte degli hooks deve consegnare gli eventi in tempo reale. `normalizeClaudeHooks` collega gli hooks dei subagent alla chiamata `Agent` solo a posteriori; dal vivo l'attribuzione va presa dallo stream (`parent_tool_use_id`). I normalizzatori oggi sono funzioni batch: dal vivo serviranno versioni incrementali.
- **(F5)** Passare il prototipo 1d a `AgentEvent` e alle fixture ripulite, così i suoi test Playwright girano anche in CI.
- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.
- **(F5e)** Aggiungere `error.detected` allo schema. Ogni cambio incompatibile di `AgentEvent` alza `schemaVersion` e richiede una migrazione testata (ADR 0003).
- **(F7)** Il bridge Ollama vero: `normalizeOllamaChat` oggi è minimo.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10)** Icona dell'app, installer NSIS, firma e aggiornamenti: oggi `electron-builder.config.ts` serve solo per `--dir` e i test dei Fuses. Togliere `packageExtensions` per `@peculiar/utils` quando dichiarerà `tslib` (vedi `PROBLEMI_NOTI.md`).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
