# 0009 — Hooks bridge e sessione Claude

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La 4.1 porta nell'app una sessione Claude Code dal vivo. Lo stream-json di `claude -p` dice cosa succede ma ha tempi grossolani; gli hooks danno i tempi precisi e gli eventi che lo stream non ha (`Notification`). Gli hooks sono comandi che Claude Code avvia con il payload su stdin: serve un canale dal processo dell'hook all'app che un altro processo locale non possa falsificare (`SICUREZZA.md`, "Hooks/MCP bridge"). I normalizzatori della Fase 2 ([ADR 0003](0003-agent-event-schema.md)) lavorano a blocchi su registrazioni complete.

## Decisione

- **Canale:** una named pipe per sessione, `\\.\pipe\control-center-<128 bit casuali>`, servita dal main con `node:net`. Niente TCP. Una connessione porta un solo messaggio: una riga JSON `{ v: 1, token, payload }`, con risposta `{ ok, code? }`. Il server rifiuta il messaggio senza token, con token sbagliato (confronto a tempo costante), malformato, con campi in più, di un'altra versione, con payload fuori schema, oltre 1 MiB, lento (5 s dalla connessione, scadenza assoluta), in più di 1024 frammenti o oltre 16 connessioni. I rifiuti vanno in Console come `bridge-rejected`, raggruppati per codice: solo codici e conteggi.
- **Token:** 256 bit casuali per sessione, scritti solo in `<userData>/claude-sessions/<id>/bridge.json`. Non va nell'ambiente: i comandi che l'agente lancia non lo ereditano. `bridge.json` si scrive solo dopo che la pipe ascolta. Gli hooks passano a `claude --settings` come JSON inline, senza file su disco, e non si toccano `~/.claude*`. La cartella si cancella alla chiusura della sessione; quelle rimaste dopo un crash si tenta di cancellarle all'avvio successivo, e i fallimenti si segnalano in Console.
- **Script degli hooks:** `packages/hooks-bridge/src/bin.ts`. Legge stdin fino a 16 MiB, valida il payload con zod e lo consegna. Se il messaggio supera il limite, toglie `tool_input`, `tool_response` e `prompt` e marca `truncated`. Una volta avviato esce con 0 in ogni caso che gestisce (configurazione o input non validi, pipe irraggiungibile, rifiuto) e non scrive su stdout, così un problema del bridge non cambia il comportamento dell'agente; se Node non riesce ad avviarlo, l'uscita è di Node e Claude Code la tratta come errore non bloccante. Su stderr scrive solo un codice breve, mai il token. Lo esegue Node (≥ 22.18) dal sorgente TypeScript, con il type stripping nativo: niente build in sviluppo e nei test. Senza un Node adatto la sessione funziona sul solo stream, con un avviso `claude-setup` in Console.
- **Comando dell'hook:** tre percorsi tra virgolette con le barre in avanti, `"node" "bin.ts" "bridge.json"`. Claude Code lo esegue con una shell, quindi un percorso con caratteri interpretati dentro le virgolette (`" % $ \` ! ^ & | < >`) non viene escapato: è rifiutato e la sessione resta senza hooks.
- **Sessione:** ogni messaggio dell'utente è una run, cioè un processo `claude -p --input-format stream-json --output-format stream-json --verbose [--settings …] [--resume <id>]`. Lo avvia `superviseChild` senza shell, nella radice del workspace verificata. L'id di Claude per `--resume` arriva dalla riga `init` ed è validato prima di finire in argv. Stdin resta aperto fino alla riga `result`, così la 4.3 potrà rispondere ai permessi sullo stesso canale. Interruzione e chiusura condividono un'unica terminazione per run con `taskkill /T /F`, che raggiunge i discendenti ancora collegati al processo `claude` ma non garantisce l'intero albero (vedi `SICUREZZA.md`). La CLI si cerca sul PATH: `claude.exe` nativo, oppure lo shim npm `claude.cmd`, eseguito come `node cli.js` perché un `.cmd` richiede una shell. Se la versione nella riga `init` non è tra quelle delle fixture, la Console mostra un avviso `claude-setup`, una volta per versione.
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
- Le versioni della CLI testate sono quelle delle fixture (2.1.322) e quelle provate con `real-claude.smoke.test.ts` (2.1.326). Il test resta saltato salvo `CC_REAL_CLAUDE=1`. Una versione nuova va provata con quel test e poi aggiunta a `TESTED_CLAUDE_VERSIONS`.
- Con la CLI vera, `SessionStart` e `UserPromptSubmit` arrivano prima della riga `init`. Il merge dal vivo trattiene gli eventi degli hooks fino a `init`, così `session.started` viene dallo stream con modello e versione.

## Aggiornamento 2026-11-27 (correzioni dalla revisione Astra)

- Gli hooks passano a `claude --settings` come JSON inline: la cartella della sessione contiene solo `bridge.json`, scritto dopo che la pipe ascolta.
- La scadenza di 5 s per connessione è assoluta; un messaggio in più di 1024 frammenti è rifiutato (`fragmented`). I rifiuti arrivano in Console raggruppati (un riepilogo ogni 2 s al massimo, 20 per sessione, poi un conteggio finale alla chiusura).
- Lo script apre `bridge.json` una volta sola, lo controlla sull'handle e ne legge al massimo 4 KiB + 1.
- `taskkill` che fallisce si ritenta e poi si segnala; la pulizia delle cartelle rimaste ritenta e segnala i fallimenti. `taskkill /T` non garantisce l'intero albero: un Job Object resta da valutare con un'ADR.
- DACL reale e limiti del modello delle minacce in `docs/memoria/SICUREZZA.md`.

## Aggiornamento 2026-11-27 (revisione incrociata della PR 76)

- Una sola terminazione per run, condivisa da interruzione, chiusura e scrittura fallita su stdin. Nessun `taskkill` parte dopo l'uscita di `claude` (il PID può essere riassegnato): un nuovo tentativo in attesa si annulla all'uscita del processo. `close()` attende al massimo 3 s, poi abbandona la terminazione (ferma `taskkill`, termina `claude` e segnala) prima di risolversi.
- Alla chiusura del server i timer delle connessioni si annullano in modo sincrono e nessun rifiuto si conta dopo il riepilogo finale. La scadenza della connessione si controlla anche all'arrivo dei dati, con un orologio monotono.
- Il controllo `dev`/`ino` di `bridge.json` vale su NTFS locale; su ReFS l'ID a 64 bit di libuv può coincidere per file distinti (limite documentato in `SICUREZZA.md`).
