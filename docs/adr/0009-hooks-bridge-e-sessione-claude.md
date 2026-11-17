# 0009 — Hooks bridge e sessione Claude

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La 4.1 porta nell'app una sessione Claude Code dal vivo. Lo stream-json di `claude -p` dice cosa succede ma ha tempi grossolani; gli hooks danno i tempi precisi e gli eventi che lo stream non ha (`Notification`). Gli hooks sono comandi che Claude Code avvia con il payload su stdin: serve un canale dal processo dell'hook all'app che un altro processo locale non possa falsificare (`SICUREZZA.md`, "Hooks/MCP bridge"). I normalizzatori della Fase 2 ([ADR 0003](0003-agent-event-schema.md)) lavorano a blocchi su registrazioni complete.

## Decisione

- **Canale:** una named pipe per sessione, `\\.\pipe\control-center-<128 bit casuali>`, servita dal main con `node:net`. Niente TCP. Una connessione porta un solo messaggio: una riga JSON `{ v: 1, token, payload }`, con risposta `{ ok, code? }`. Il server rifiuta il messaggio senza token, con token sbagliato (confronto a tempo costante), malformato, con campi in più, di un'altra versione, con payload fuori schema, oltre 1 MiB, lento (5 s) o oltre 16 connessioni. Ogni rifiuto va in Console come `bridge-rejected` con il solo codice.
- **Token:** 256 bit casuali per sessione, scritti solo in `<userData>/claude-sessions/<id>/bridge.json`. Non va nell'ambiente: i comandi che l'agente lancia non lo ereditano. La cartella contiene anche `settings.json` con gli hooks. Si passa con `claude --settings` e non si toccano `~/.claude*`. Si cancella alla chiusura della sessione e, se resta dopo un crash, al primo avvio successivo.
- **Script degli hooks:** `packages/hooks-bridge/src/bin.ts`. Legge stdin fino a 16 MiB, valida il payload con zod e lo consegna. Se il messaggio supera il limite, toglie `tool_input`, `tool_response` e `prompt` e marca `truncated`. Esce sempre con 0 e non scrive su stdout, così un problema del bridge non cambia il comportamento dell'agente. Su stderr scrive solo un codice breve, mai il token. Lo esegue Node (≥ 22.18) dal sorgente TypeScript, con il type stripping nativo: niente build in sviluppo e nei test. Senza un Node adatto la sessione funziona sul solo stream, con un avviso `claude-setup` in Console.
- **Comando dell'hook:** tre percorsi tra virgolette con le barre in avanti, `"node" "bin.ts" "bridge.json"`. Claude Code lo esegue con una shell, quindi un percorso con caratteri interpretati dentro le virgolette (`" % $ \` ! ^ & | < >`) non viene escapato: è rifiutato e la sessione resta senza hooks.
- **Sessione:** ogni messaggio dell'utente è una run, cioè un processo `claude -p --input-format stream-json --output-format stream-json --verbose [--settings …] [--resume <id>]`. Lo avvia `superviseChild` senza shell, nella radice del workspace verificata. L'id di Claude per `--resume` arriva dalla riga `init` ed è validato prima di finire in argv. Stdin resta aperto fino alla riga `result`, così la 4.3 potrà rispondere ai permessi sullo stesso canale. Interruzione e chiusura terminano l'intero albero dei processi (`taskkill /T`). La CLI si cerca sul PATH: `claude.exe` nativo, oppure lo shim npm `claude.cmd`, eseguito come `node cli.js` perché un `.cmd` richiede una shell. Se la versione nella riga `init` non è tra quelle delle fixture, la Console mostra un avviso `claude-setup`, una volta per versione.
- **Normalizzatori incrementali:** `ClaudeStreamNormalizer` e `ClaudeHooksNormalizer` ricevono un elemento alla volta. Le funzioni batch li usano, quindi l'output resta identico e gli snapshot non cambiano. `LiveClaudeSession` unisce le due fonti dal vivo: vince la prima che riporta un fatto e la copia dell'altra si scarta. Gli hooks di un subagent attribuibili a più chiamate `Agent` attendono il `parent_tool_use_id` dello stream. Ogni run apre con `session.started`, chiude con `session.ended` e chiude come `interrupted` le chiamate rimaste aperte. `seq` prosegue tra le run.
- **IPC:** namespace `claude` nel contratto, con `start`, `send`, `interrupt`, `close` e l'evento `claude:updated` (AgentEvent validati, al massimo 200 per push, più lo stato). Come per i terminali, la sessione appartiene alla finestra che l'ha aperta. Accetta messaggi solo mentre il suo workspace è attivo e si chiude insieme alla finestra. Al massimo 4 sessioni.
- **Test:** `packages/fixtures/bin/fake-claude.mjs` sostituisce la CLI. Riproduce una registrazione ripulita: scrive lo stream su stdout ed esegue con una shell i comandi degli hooks presenti in `--settings`, uno per volta, come Claude Code. I test di integrazione e l'E2E passano così dallo script reale e dalla pipe reale; la CI non chiama mai il servizio vero.

## Alternative considerate

- **Server TCP su localhost con token:** lo raggiunge qualunque processo locale, anche di un altro utente, e allarga la superficie. Scartato da `SICUREZZA.md`.
- **Token in una variabile d'ambiente:** è il modo più semplice di passarlo allo script, ma lo erediterebbero tutti i comandi dell'agente (`env` lo stamperebbe nel transcript).
- **Hook in PowerShell senza Node:** non ci sarebbe la validazione zod condivisa con il server. Sarebbe una seconda implementazione del protocollo.
- **Script compilato a ogni build:** in sviluppo e nei test basta il type stripping di Node. Il pacchetto installabile ne avrà una copia bundled fuori da ASAR (Fase 10).
- **Un processo `claude` per tutta la sessione:** ogni `result` chiuderebbe la sessione per lo schema eventi (`session.ended`). Una run per messaggio con `--resume` rispetta lo schema senza migrazioni.
- **Merge dal vivo che riordina e rinumera, come quello batch:** gli eventi già mostrati non si possono ritirare. Al loro posto si usano la regola "vince il primo" e l'attesa dei soli hooks ambigui.

## Conseguenze

- Gli hooks dal vivo richiedono Node ≥ 22.18 sul PATH. Senza Node la timeline perde i tempi precisi e le `Notification`, ma resta completa nei fatti. Il pacchetto installabile resta senza hooks finché la Fase 10 non distribuisce lo script bundled (`PROBLEMI_NOTI.md`).
- Ogni hook aggiunge alla chiamata di un tool l'avvio di Node, circa 100 ms. È accettabile per l'osservazione; se pesa, si valuterà uno script precompilato.
- Una `PreToolUse` attende la risposta della pipe (timeout 3 s nel client), quindi un'app bloccata rallenta l'agente ma non lo ferma.
- La 4.3 usa `claude:*` così com'è. Per i permessi servirà un canale di risposta su stdin (control protocol di stream-json), da progettare lì.
- Le versioni della CLI testate sono quelle delle fixture (oggi 2.1.322). Una versione nuova va registrata e aggiunta a `TESTED_CLAUDE_VERSIONS`.
