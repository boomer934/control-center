# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1, 2 e 3 sono chiuse: sintesi in `STORIA.md`, voci "Chiusura Fase 1", "Chiusura Fase 2" e "Chiusura Fase 3". Il brief della Fase 4 è in [`FASE_4.md`](FASE_4.md).

## Ora

Due corsie in parallelo (vedi [`CORSIE.md`](CORSIE.md)).

1. ✅ **[Utente + Claude] (F2, prima della F4.1)** Fixture di `Notification`: `sessione-07` registrata e ripulita (branch `feat/fixture-notification`, commit `3ec6f97`). Resta il merge della PR a CI verde (l'utente).
2. ✅ **[Claude] (F4.0)** Canale push: unito su `main` (PR #35, ADR 0007).
3. **[Codex] (F4.2)** Workspace e terminale: `feat/workspace-terminal`, `gpt-6.1-sol`, high. Risoluzione percorsi e persistenza recenti pronte nel main. Collegare il workspace a IPC e UI, poi aggiungere il terminale con output raggruppato via push (ADR 0007) e verificare i flussi E2E.

## Dopo

4. **[Claude] (F4.1)** Hooks bridge e sessione Claude: `feat/hooks-bridge`, Opus 5.5, high, sbloccata: parte dopo il merge della PR delle fixture. Il goal è in `FASE_4.md`.
5. **[Codex] (F4.3)** Chat, permessi e cronologia (`gpt-6.1-sol`, high), dopo 4.0, 4.1 e 4.2. Poi 4b.
6. **[Claude] (F5a)** Modello del progetto (Opus 5.5, high).

## Quando capita

- **(F3, minore)** Includere i font (Instrument Sans, Martian Mono) nel pacchetto: file locali con `@font-face`, CSP `font-src 'self'` già a posto; decidere la licenza/fonte nell'ADR.
- **(F3, minore)** `aria-live` per il contatore errori; provare il layout a finestra stretta; title bar personalizzata solo se serve (richiede lavoro nel main).
- **(F4+)** Prefissi della palette (`/` file, `@` agenti, `#` sessioni, `!` locali) e scorciatoie `Ctrl+O`, `Ctrl+Shift+A`, `Ctrl+L`: arrivano con le funzioni che servono.
- **(F4)** Metodo IPC per aprire un frame dello stack nell'editor, con i controlli di percorso.
- **(F10)** Provare a mano la mappatura degli stack nel pacchetto (`app.asar`); decidere se l'installer include le source map.

- **(F4)** Il ponte degli hooks deve consegnare gli eventi in tempo reale. `normalizeClaudeHooks` collega gli hooks dei subagent alla chiamata `Agent` solo a posteriori; dal vivo l'attribuzione va presa dallo stream (`parent_tool_use_id`). I normalizzatori oggi sono funzioni batch: dal vivo serviranno versioni incrementali.
- **(F5)** Passare il prototipo 1d a `AgentEvent` e alle fixture ripulite, così i suoi test Playwright girano anche in CI.
- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.
- **(F5e)** Aggiungere `error.detected` allo schema. Ogni cambio incompatibile di `AgentEvent` alza `schemaVersion` e richiede una migrazione testata (ADR 0003).
- **(F7)** Il bridge Ollama vero: `normalizeOllamaChat` oggi è minimo.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10)** Icona dell'app, installer NSIS, firma e aggiornamenti: oggi `electron-builder.config.ts` serve solo per `--dir` e i test dei Fuses. Togliere `packageExtensions` per `@peculiar/utils` quando dichiarerà `tslib` (vedi `PROBLEMI_NOTI.md`).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
