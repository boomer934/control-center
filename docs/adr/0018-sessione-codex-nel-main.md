# 0018 — Sessione Codex nel main

- **Stato:** accettata
- **Data:** 2026-11-27

## Contesto

La 5f.1 (PR B) porta Codex nel main con le stesse forme del namespace `claude`: avvio, invio, interruzione, ripresa, approvazioni e scelta di modello ed effort (ADR 0017). Restano da decidere come trovare la CLI, quale processo usare, come si comportano gli override per turno e quanto del normalizzatore consegnare con il main.

Prove su Windows del 2026-11-27 con `codex-cli 0.171.0-alpha.13.2` (app Codex dal Microsoft Store, `OpenAI.Codex` 26.1120), registrate in una cartella temporanea e non committate:

- `codex app-server` parla JSON-RPC su stdio, una riga per messaggio e senza il campo `jsonrpc`. Le richieste del server (approvazioni) hanno `id` e `method`.
- Avvio: `initialize` → `initialized` → `account/read`, `model/list`, `config/read` → `thread/start` oppure `thread/resume` per `threadId`. Il thread si salva in `~/.codex/sessions` dopo il primo turno.
- Con `approvalPolicy: untrusted` e `sandbox: workspace-write`, un comando che scrive chiede `item/commandExecution/requestApproval`. `accept` lo esegue; `decline` produce l'item `declined` e il modello lo riporta. `availableDecisions` può non contenere `acceptForSession`.
- `turn/interrupt` (con `threadId` e `turnId`) chiude il turno con `turn/completed` e `status: interrupted`.
- `thread/resume` riprende il contesto: il turno dopo la ripresa ricorda il file scritto prima. Subito dopo la ripresa arriva un `thread/tokenUsage/updated` del turno precedente.
- `turn/start` accetta `model` ed `effort` "per questo turno e i successivi": un override resta in vigore per il thread.
- Lo `stderr` del server scrive righe `ERROR` anche per casi normali, per esempio un comando rifiutato dall'utente.

## Decisione

- **Trovare `codex`:** prima il PATH, come per `claude`: `codex.exe`, oppure lo shim npm `codex.cmd`, il cui `bin/codex.js` si esegue con Node, perché un `.cmd` non parte senza shell. Poi l'app Codex del Microsoft Store. La cartella `WindowsApps` non si può elencare, quindi il nome completo del pacchetto si legge dal registro con `reg.exe query` (percorso assoluto da `SystemRoot`, argomenti fissi, timeout 5 s). Si accettano solo pacchetti `OpenAI.Codex_<versione>_<arch>__2p2nqsd0c76g0`, con l'editore fissato, e si sceglie la versione più alta. Il percorso è `<ProgramW6432>\WindowsApps\<pacchetto>\app\resources\codex.exe`. Nessuna variabile dedicata, oltre al PATH, sceglie il programma.
- **Un processo per sessione:** `codex app-server` resta vivo per tutta la sessione, senza shell, nella radice verificata del workspace. L'ambiente è quello dell'utente senza `ELECTRON_*`. Un thread per sessione: `thread/start`, oppure `thread/resume` con l'id salvato nella cronologia. L'id si salva dopo il primo turno confermato, perché prima il thread non esiste su disco.
- **Politica del thread:** `approvalPolicy: untrusted`, `approvalsReviewer: user` e `sandbox: workspace-write`, decisi dal main e ripetuti (politica e revisore) in ogni `turn/start`. Senza `approvalsReviewer` la CLI applica la configurazione dell'utente: con la 0.171.0-alpha.13.2 la revisione incrociata ha visto `auto_review`, cioè un sottoagente che approva al posto dell'utente. La risposta di `thread/start`/`thread/resume` deve riportare la stessa politica (`untrusted`, `user`, sandbox `workspaceWrite`), altrimenti l'apertura fallisce con `CodexPolicyRejected`. La configurazione di Codex (`config.toml`) si legge con `config/read` e non si scrive mai. Il login resta alla CLI: se `account/read` non restituisce un account, l'apertura fallisce con `CodexNotSignedIn`.
- **Modello ed effort:** il catalogo viene da `model/list` (modelli non nascosti, id ed effort validati con gli schemi della v3, al massimo 64 modelli e 8 effort). I default vengono da `config/read` (`model`, `model_reasoning_effort`). Siccome l'override vale anche per i turni successivi, ogni `turn/start` manda sempre un modello e un effort espliciti. `null` torna al valore configurato; l'effort `null` di un modello diverso da quello configurato diventa il suo `defaultReasoningEffort`. Un effort senza modello si valida sul modello configurato (`acceptsCodexConfig`), non su un modello qualsiasi del catalogo.
- **Approvazioni:** le richieste di comando e di patch diventano gli stessi `ClaudePermission` della chat (`Shell` e `Patch`). I dettagli sono il comando, i file della patch annunciati da `item/started`, il motivo e l'eventuale `grantRoot`, ripuliti. «Sempre in questa sessione» si offre solo se il server lo elenca (`acceptForSession`). Una richiesta di un altro thread o turno, oltre 16 in attesa, o arrivata prima che il server confermasse l'id del turno (risposta a `turn/start` o `turn/started`), viene rifiutata (`decline`). Le altre richieste del server ricevono l'errore JSON-RPC -32601. Interruzione e chiusura rispondono `cancel` alle richieste ancora aperte. Se `turn/interrupt` non è confermato entro il timeout, il main termina l'albero dei processi invece di liberare il workspace: il turno potrebbe essere ancora in corso.
- **Servizio comune:** `apps/desktop/src/main/agents/service.ts` contiene proprietà della finestra, cronologia, checkpoint Git, catalogo e `configure` per entrambi i provider; `claude/service.ts` e `codex/service.ts` lo configurano. La cronologia Codex sta in `userData/codex-history/`, con lo stesso formato di quella Claude. Un turno di un provider rende il workspace occupato anche per l'altro e per il pannello Git.
- **Normalizzatore minimo:** `LiveCodexSession` in `@control-center/event-schema` traduce turni, messaggi, comandi (con `file.read` dalle azioni `read`), patch (`file.written` con i conteggi del diff), MCP, ricerca web, approvazioni, uso dei token (`last`, con la cache separata dall'input) e `model/rerouted` (`session.configChanged`, `by: provider`). Scarta le notifiche di altri turni. Sottoagenti, piani e ragionamento restano alla 5f.2.

## Alternative considerate

- **`codex exec --json` per turno, come `claude -p`.** Non espone le approvazioni come richieste a cui rispondere, né `model/list`.
- **`Get-AppxPackage` da PowerShell.** Dà lo stesso percorso, ma avvia PowerShell a ogni apertura (circa un secondo) e dipende dai moduli Appx.
- **Variabile d'ambiente con il percorso di `codex`.** Un altro processo dell'utente potrebbe scegliere il programma: escluso, come per `claude`.
- **Lasciare `null` senza override in `turn/start`.** Dopo un override il thread resterebbe sull'ultimo modello scelto, non su quello configurato.

## Conseguenze

- **Prove:** `codex/session.test.ts` (finto `codex app-server`, `packages/fixtures/bin/fake-codex.mjs`), `e2e/app/codex.spec.ts` (shim npm sul PATH, due sessioni con approvazioni separate) e `codex/real-codex.smoke.test.ts` con la CLI vera (`CC_REAL_CODEX=1`): approvazione, interruzione durante lo streaming e ripresa con memoria, verdi il 2026-11-27.
- Lo `stderr` di Codex arriva in Console come `child-stderr`, comprese le righe `ERROR` di casi normali (comando rifiutato). Da filtrare se diventa rumore.
- La sandbox `workspace-write` su Windows usa gli eseguibili di sandbox del pacchetto Codex. Non è stata provata su un PATH con `codex` installato da npm.
- Con la ripresa, i default arrivano da `config/read`. Se `config/read` fallisce, valgono modello ed effort riportati dal thread, che dopo un override sono quelli dell'ultimo turno.
- La 5f.2 collega `window.api.codex` alla chat, al pannello agenti, alla Vista Live e al replay, e completa il normalizzatore.
