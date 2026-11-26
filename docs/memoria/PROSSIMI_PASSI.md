# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1, 2, 3 e 4 sono chiuse: sintesi in `STORIA.md`, voci "Chiusura Fase 1", "Chiusura Fase 2", "Chiusura Fase 3" e "Chiusura Fase 4" (il brief `FASE_4.md` è archiviato lì).

## Ora

Due corsie in parallelo (vedi [`CORSIE.md`](CORSIE.md)).

1. ✅ **[Codex] (F5a, revisione)** Sette rilievi corretti sulla [PR #56](https://github.com/boomer934/control-center/pull/56) (ADR 0012).

2. ✅ **[Claude] (F5b)** Mappa unita con la [PR #58](https://github.com/boomer934/control-center/pull/58) (ADR 0013): baseline visive dal runner, budget dei 60 fps verde in CI (64 fps, main thread 15,8%).

3. ✅ **[Claude] (F5b, rifinitura)** Audit e prova reale fatti, tre correzioni unite con la [PR #59](https://github.com/boomer934/control-center/pull/59). Baseline visive della mappa rigenerate dalla CI.
4. ✅ **[Codex] (F5c)** Timeline e replay uniti su `main` con la [PR #62](https://github.com/boomer934/control-center/pull/62) a CI verde.
5. **[Codex] (F4b, bug)** Correzione dei percorsi lunghi di Git su Windows nella [PR #61](https://github.com/boomer934/control-center/pull/61). Revisione Claude a effort `medium` completata senza bug confermati. Branch riallineato dopo la #62. Esito di CI e integrazione nella PR.

## Dopo

6. **[Codex] (F5d)** Pannello agenti, ispettore e riepilogo in sola lettura verificati nella [PR #63](https://github.com/boomer934/control-center/pull/63). Riallineata alla 5c e al branch della #61. Revisione Claude su IPC e probe locali completata senza rilievi bloccanti. Ordine di integrazione: #61, poi #63. Esito di CI e integrazione nelle rispettive PR. La schermata Infra completa resta nella Fase 6.
7. **[Codex] (F4.1, revisione)** Seconda opinione sulla pipe (`packages/hooks-bridge`) con `gpt-6.2-astra`, effort `high`.
8. **[Codex o Claude] (F4.3, test)** E2E `claude.spec.ts` › "streams the chat, answers permissions…" già risultato instabile in locale. Passato nella suite della 5c.

## Quando capita

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
- **(F5e)** Aggiungere `error.detected` allo schema. Ogni cambio incompatibile di `AgentEvent` alza `schemaVersion` e richiede una migrazione testata (ADR 0003).
- **(F7)** Il bridge Ollama vero: `normalizeOllamaChat` oggi è minimo.
- Opzionale in locale: `winget install gitleaks`, `npm i -g pnpm@10`, `npx playwright install chromium` (Chromium 1255 per Playwright 1.65).
- **(F10)** Icona dell'app, installer NSIS, firma e aggiornamenti: oggi `electron-builder.config.ts` serve solo per `--dir` e i test dei Fuses. Togliere `packageExtensions` per `@peculiar/utils` quando dichiarerà `tslib` (vedi `PROBLEMI_NOTI.md`).
- **(F10, prima di rendere pubblica la repo)** Attivare la protezione di `main` e fissare le GitHub Actions a SHA. Riverificare il nome Vernier (marchi `VERNIER…` in classe 9 negli USA, pacchetto npm `vernier` già esistente, domini `vernier.com`/`.dev` in uso); dove crea problemi si resta con Control Center.
- **(F5b+)** Mappa: anteprima dell'ultima modifica dell'agente (oggi è il diff non committato del file: gli eventi portano solo i conteggi); simboli nello zoom semantico (serve il modello); menu `@` della palette per scegliere l'agente da seguire; anteprima diff anche da tastiera.
- **(F5a+)** Modello del progetto: ruoli per FastAPI e altri framework Python; `paths` dei `tsconfig` delle sottocartelle ed `extends`; moduli Python fuori da radice e `src/`; cache su disco del modello; pool di worker se l'indicizzazione di progetti grandi diventa lenta.
