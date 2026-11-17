# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1, 2 e 3 sono chiuse: sintesi in `STORIA.md`, voci "Chiusura Fase 1", "Chiusura Fase 2" e "Chiusura Fase 3". Il brief della Fase 4 è in [`FASE_4.md`](FASE_4.md).

## Ora

Due corsie in parallelo (vedi [`CORSIE.md`](CORSIE.md)).

1. ✅ **[Utente + Claude] (F2)** Fixture di `Notification`: `sessione-07` unita su `main` (PR #38).
2. ✅ **[Claude] (F4.0)** Canale push: unito su `main` (PR #35, ADR 0007).
3. ✅ **[Codex] (F4.2)** Workspace e terminale: uniti su `main` (PR #40, ADR 0008).
4. ✅ **[Claude] (F4.1)** Hooks bridge e sessione Claude: unita su `main` (PR #42, ADR 0009).

## Dopo

5. **[Codex] (F4.3)** Chat, permessi e cronologia (`gpt-6.1-sol`, high), sbloccata, sul namespace IPC `claude` della 4.1. Servirà il canale dei permessi su stdin (control protocol di stream-json). Crediti Codex finiti il 2026-11-17: se non tornano, la riassegna Claude. Poi 4b.
6. **[Codex] (F4.1, revisione)** Seconda opinione di `gpt-6-astra` sulla pipe (`packages/hooks-bridge`), quando tornano i crediti.
7. **[Claude] (F5a)** Modello del progetto (Opus 5.5, high).

## Quando capita

- **(F4.2, dalla revisione, da pesare prima o dentro la 4.3)** Primo: filtrare l'ambiente passato al pty (oggi eredita tutto `process.env`, regola 3 sui segreti). Poi: i link dei Problems si risolvono rispetto alla cartella dell'app, quindi aprono solo se il workspace è il repo stesso; i link del terminale non coprono `file.ts(12,5):` né `file.ts:12:5:`; `chooseFolder` lancia un errore per una cartella non disponibile e finisce nei Problems (meglio un risultato esplicito); un `id` duplicato è segnalato come `limit` e il tetto di 8 terminali è globale; una voce dei recenti non più risolvibile non si può togliere; Notepad apre il percorso verificato come stringa (finestra TOCTOU, impatto basso); la regex su xterm in `apps/desktop/xterm-csp.ts` e l'ordine dei passi CI (il pacchetto ricompila node-pty prima dell'E2E) sono fragili.
- **(F4.2, locale)** Riportare il worktree `..control-center-codex` su `main` (oggi è sul branch unito).
- **(F4.2, test)** `workspace-terminal.spec.ts` › "opens a canonical workspace file…" è instabile nella suite completa in locale (passaggio del mouse sul link di xterm); da solo è verde.
- **(F4+)** A ogni nuova versione di Claude Code: `CC_REAL_CLAUDE=1 npx vitest run apps/desktop/src/main/claude/real-claude.smoke.test.ts`, poi aggiungerla a `TESTED_CLAUDE_VERSIONS`.
- **(F10)** Distribuire lo script degli hooks già compilato in un solo file (`resources/hooks-bridge/bin.mjs`, fuori da ASAR): il main lo cerca già lì.
- **(F4.1, minore)** Se `claude` non parte (errore di spawn), la sessione non riceve eventi: c'è solo l'errore in Console e lo stato torna `idle`. Valutare un `session.ended` sintetico.

- **(F3, minore)** Includere i font (Instrument Sans, Martian Mono) nel pacchetto: file locali con `@font-face`, CSP `font-src 'self'` già a posto; decidere la licenza/fonte nell'ADR.
- **(F3, minore)** `aria-live` per il contatore errori; provare il layout a finestra stretta; title bar personalizzata solo se serve (richiede lavoro nel main).
- **(F4+)** Prefissi della palette (`/` file, `@` agenti, `#` sessioni, `!` locali) e scorciatoie `Ctrl+O`, `Ctrl+Shift+A`, `Ctrl+L`: arrivano con le funzioni che servono.
- **(F10)** Provare a mano la mappatura degli stack nel pacchetto (`app.asar`); decidere se l'installer include le source map.

- **(F5)** Passare il prototipo 1d a `AgentEvent` e alle fixture ripulite, così i suoi test Playwright girano anche in CI.
- **(F5)** Dalla revisione 1d: regione `aria-live` per `waiting-user` ed `error` nella colonna Agents; zoom massimo più alto a `Fit` per grafi piccoli; `viewAt` indicizzato per 500 nodi.
- **(F5e)** Aggiungere `error.detected` allo schema. Ogni cambio incompatibile di `AgentEvent` alza `schemaVersion` e richiede una migrazione testata (ADR 0003).
- **(F7)** Il bridge Ollama vero: `normalizeOllamaChat` oggi è minimo.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10)** Icona dell'app, installer NSIS, firma e aggiornamenti: oggi `electron-builder.config.ts` serve solo per `--dir` e i test dei Fuses. Togliere `packageExtensions` per `@peculiar/utils` quando dichiarerà `tslib` (vedi `PROBLEMI_NOTI.md`).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
