# Prossimi passi

In ordine. Il riferimento tra parentesi è alla fase di `PIANO.md`. Le voci fatte restano segnate con ✅ finché la fase non si chiude; poi passano in `STORIA.md`.

> Le Fasi 1, 2, 3 e 4 sono chiuse: sintesi in `STORIA.md`, voci "Chiusura Fase 1", "Chiusura Fase 2", "Chiusura Fase 3" e "Chiusura Fase 4" (il brief `FASE_4.md` è archiviato lì).

## Ora

Due corsie in parallelo (vedi [`CORSIE.md`](CORSIE.md)).

1. **[Utente] (F0)** Decidere sulla versione `1.0.0` (release `control-center-v1.0.0`, PR #46): `PIANO.md` la prevede alla Fase 10 e il manifest partiva da `0.0.0`. Tenerla, oppure eliminare release e tag e riportare il manifest a 0.x (vedi `PROBLEMI_NOTI.md`).
2. **[Claude] (F4.3, revisione)** Correggere con test i due rilievi di gravità media (voci 1 e 2 in "Quando capita"): permessi con dettagli oltre 16 KiB e ordine degli eventi nello storico. Tocca il flusso dei permessi: lavoro Claude, non da delegare.

## Dopo

3. **[Codex] (F4b)** Git e checkpoint (`gpt-6.1-sol`, high). Crediti Codex finiti il 2026-11-17: riprendere quando tornano; prima riportare il worktree `..control-center-codex` su `main`.
4. **[Codex] (F4.1, revisione)** Seconda opinione di `gpt-6-astra` sulla pipe (`packages/hooks-bridge`), quando tornano i crediti.
5. **[Claude] (F5a)** Modello del progetto (Opus 5.5, high).

## Quando capita

- **(F4.3, dalla revisione, PR #47)** Nove rilievi di `/code-review high`, tutti ancora aperti, dal più grave:
  1. **Medio.** `permissions.ts:77`: una richiesta il cui JSON ripulito supera `MAX_CLAUDE_PERMISSION_DETAILS` (16 384 caratteri) è rifiutata senza chiedere, quindi un `Write` o `Edit` da circa 16 KB o più non si approva mai dalla chat. Mostrare il testo troncato con un marcatore `… (troncato, N caratteri)`, tenendo impronta e risposta sull'input originale.
  2. **Medio.** `service.ts:169`: `session.send()` emette `run.start` prima che il prompt sia registrato. Al primo turno lo scrittore scarta quegli eventi; dai turni successivi storico e renderer ricevono `run.start` prima di `prompt`. Lo storico riaperto perde o riordina gli inizi di turno. Registrare il prompt prima di `send()`, oppure accodare gli eventi finché è scritto.
  3. **Basso.** `ipc.ts:266`: `listHistory` e `readHistory` controllano solo `isActive(workspaceId)` e ignorano `senderId`, a differenza di `start`, `send` e `respond`. Richiedere `windowOwner(senderId)`, come dice `SICUREZZA.md` ("solo la finestra proprietaria").
  4. **Basso.** `permissions.ts:90`: un'impronta ricordata è approvata anche se il workspace della sessione non è più attivo, mentre la decisione manuale lo richiede. È coerente con l'ADR 0010 (regola legata alla sessione): scriverlo in `SICUREZZA.md` oppure passare `isActive` a `receive`.
  5. **Basso.** `permissions.ts:107`: `canRemember` è calcolato all'arrivo, quindi due richieste pendenti possono offrire entrambe "sessione". Alla 128ª regola la seconda `respond('session')` torna `false` e la UI scrive "richiesta scaduta" mentre è ancora pendente. Ripubblicare le viste dopo ogni `remembered.add`, o ripiegare su `approve`.
  6. **Basso.** `permissions.ts:67`: un `control_request` con un `request_id` già pendente è scartato senza `control_response`; se la CLI lo facesse, il turno resterebbe appeso fino all'interruzione. Rispondere con `subtype: 'error'`, come alla riga 70.
  7. **Basso.** `useClaudeChat.ts:75`: il flag globale `busy` fa tornare `respond` in silenzio mentre un'altra azione è in corso, quindi un clic su Approva o Rifiuta può perdersi senza segnalazione.
  8. **Efficienza.** `history.ts:70`: a ogni record ci sono 2× `mkdirSync`, diversi `lstatSync`/`fstatSync`, `openSync`, `writeFileSync` e `closeSync` sul thread principale; i turni lunghi bloccano IPC e terminale. Validare la cartella una volta per scrittore e tenere aperto il descrittore, oppure accodare le scritture in modo asincrono.
  9. **Test.** `permissions.test.ts:31`: mancano test committati per una seconda decisione su una richiesta già risolta, per la regola "sessione" che non sopravvive a una nuova sessione, per l'isolamento dello storico tra workspace e per un id di ripresa non valido (per esempio `--x`) ignorato nel JSONL. Oggi tutto regge (verificato con prove fuori dalla repo).
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
