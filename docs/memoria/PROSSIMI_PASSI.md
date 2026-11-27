# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1, 2, 3, 4 e 5 sono chiuse: sintesi in `STORIA.md`, voci "Chiusura Fase 1"…"Chiusura Fase 5" (il brief `FASE_4.md` è archiviato lì).

## Ora

**Priorità di prodotto · Codex e uso simultaneo con Claude Code.** I due filoni avanzano in worktree distinti secondo [CORSIE.md](CORSIE.md#priorità-codex-e-lavoro-simultaneo).

- **[Claude] (5f.1)** Aprire la specifica Codex App Server. Definire i campi `model`/`effort` per provider, la validazione e gli argomenti CLI, quindi pubblicare contratto ed esempi con `session.configChanged` prima di integrare nel main sessione, login, permessi e interruzione. Verificare su Windows l'effort di Claude Code e i parametri per turno dell'App Server di Codex.
- **[Codex] (5f.2)** Preparare fixture e test (le azioni rapide 5e+ sono già su `main`, PR #68 e #70) mentre Claude lavora al main. Collegare selettore e avviso nel compositore, pannello agenti, ispettore, normalizzatore, Vista Live e replay quando i contratti sono su `main`.
- **[Claude + Codex] (5g)** Dopo la prima sessione Codex funzionante, dare priorità all'esecuzione simultanea nello stesso repository con worktree separati. Claude prende l'isolamento nel main. Codex prende la Vista Live e la verifica con le due CLI.

Prima di chiudere la 5g, eseguire i [criteri di accettazione](PIANO.md#criteri-di-accettazione-per-le-sessioni-simultanee) su Windows. Includere due richieste pendenti, un arresto con l'altra sessione attiva, lo stesso percorso relativo in due worktree e la revisione UI in Electron.

### Altri passi aperti

1. **[Codex] (F6, dopo la 5g)** Infrastruttura: pannelli Docker (sola lettura di default), porte locali e GPU/Ollama, con stati vuoti corretti quando Docker, GPU o Ollama mancano; test di integrazione con servizi simulati. Parte dall'inventario in sola lettura della 5d (ADR 0014). Comprende i log dei container Docker nello stesso scanner del terminale (`createTerminalErrorScanner`, origine `docker`) e i dev server rilevati dalle porte oltre che dai banner. Revisione: Claude `/code-review high` su socket Docker e processi. Prima: riallineare il worktree `control-center-codex` a `main`.
2. **[Claude]** Riprendere `feat/revisione-frontend` (orchestratore, icone dei file, dock della sessione): verificare che esista sul computer dell'utente e aprire la PR.

## Dopo

3. ✅ **[Codex] (F4.1, revisione)** Seconda opinione di Astra sulla pipe fatta; correzioni di Claude su `fix/hooks-bridge-hardening` (vedi `STATO.md`). Resta la revisione incrociata di Codex sulla PR.
   - **[Claude] (F4.1, manuale)** Provare l'accesso alla pipe da un secondo account locale (atteso: solo lettura) e da un AppContainer (atteso: nessun accesso). Serve un account creato dall'utente.
   - **[Claude] (F4.1, ADR)** Valutare un Job Object con `KILL_ON_JOB_CLOSE` per le run di `claude`: `taskkill /T` non prende i processi rimasti senza genitore. Dipendenza nativa → ADR.
4. **[Codex o Claude] (F4.3, test)** E2E `claude.spec.ts` › "streams the chat, answers permissions…" già risultato instabile in locale. Passato nella suite della 5c. Il 2026-11-26 la causa locale era la CLI reale avviata al posto del finto `claude` (`cleanEnv`, ora corretto): 6/6 in locale.

## Quando capita

- **(F3, test)** `e2e/app/dev.spec.ts` › "navigation to another loopback port is still blocked in dev" fallisce in locale il 2026-11-27: l'URL atteso è senza `#/live`. La navigazione resta bloccata; il test va aggiornato alla vista iniziale.

- **(F5b, dall'audit della 5e)** Con il dock del terminale aperto la mappa si rimpicciolisce e la legenda copre l'ultima cartella (`test`): rifare il Fit quando cambia l'altezza della mappa. Nei nodi stretti una nota d'errore lascia pochi caratteri al nome del file.

- **(F4.2, dalla revisione)** Primo: filtrare l'ambiente passato al pty (oggi eredita tutto `process.env`, regola 3 sui segreti). Poi: i link dei Problems si risolvono rispetto alla cartella dell'app, quindi aprono solo se il workspace è il repo stesso; i link del terminale non coprono `file.ts(12,5):` né `file.ts:12:5:`; `chooseFolder` lancia un errore per una cartella non disponibile e finisce nei Problems (meglio un risultato esplicito); un `id` duplicato è segnalato come `limit` e il tetto di 8 terminali è globale; una voce dei recenti non più risolvibile non si può togliere; Notepad apre il percorso verificato come stringa (finestra TOCTOU, impatto basso); la regex su xterm in `apps/desktop/xterm-csp.ts` e l'ordine dei passi CI (il pacchetto ricompila node-pty prima dell'E2E) sono fragili.
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
- **(F7)** Il bridge Ollama vero: `normalizeOllamaChat` oggi è minimo.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10)** Icona dell'app, installer NSIS, firma e aggiornamenti: oggi `electron-builder.config.ts` serve solo per `--dir` e i test dei Fuses. Togliere `packageExtensions` per `@peculiar/utils` quando dichiarerà `tslib` (vedi `PROBLEMI_NOTI.md`).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
- **(F5b+)** Mappa: anteprima dell'ultima modifica dell'agente (oggi è il diff non committato del file: gli eventi portano solo i conteggi); simboli nello zoom semantico (serve il modello); menu `@` della palette per scegliere l'agente da seguire; anteprima diff anche da tastiera.
- **(F5a+)** Modello del progetto: ruoli per FastAPI e altri framework Python; `paths` dei `tsconfig` delle sottocartelle ed `extends`; moduli Python fuori da radice e `src/`; cache su disco del modello; pool di worker se l'indicizzazione di progetti grandi diventa lenta.
