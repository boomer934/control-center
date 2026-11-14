# 0003 — Schema AgentEvent, normalizzatori e fixture ripulite

- **Stato:** accettata
- **Data:** 2026-11-14

## Contesto

Ogni parte dell'app parla di cosa fanno gli agenti:

- la mappa;
- la timeline;
- il pannello agenti;
- la Console Errori;
- la telemetria.

I dati arrivano da sorgenti diverse e instabili:

- lo stream-json di Claude Code, che sa _cosa_ succede ma ha tempi grossolani;
- gli hooks, che sanno _quando_ succede ma non vedono negazioni ed errori dello stream;
- Ollama.

Serve un formato unico, validato ai confini, che resti riproducibile nel replay. Le fixture reali su cui testarlo devono poter finire in una repo open source.

## Decisione

- **Un evento piatto** per tipo, unione discriminata su `type` (zod, `packages/event-schema/src/schema.ts`).
  - **Envelope:** `schemaVersion`, `id`, `sessionId`, `seq` (posizione nella sessione, senza buchi), `timestamp` ISO, `source` (`stream | hooks | ollama | app`), `provider` e `agentId`.
  - **Forme di `agentId`:** `main`, `sub:<toolUseId>` (il subagent si identifica con la chiamata che l'ha creato) e `ollama:<modello>`.
  - **Oggetti stretti:** un campo in più è un errore.
- **Tipi:**
  - `session.started|ended`, `message.user|assistant`;
  - `tool.called|completed|failed`, `file.read|written`;
  - `agent.spawned|finished`, `mcp.called`;
  - `permission.requested|resolved`, `usage.updated`, `notification`.

  `error.detected` arriverà con la Fase 5e.

- **Percorsi:**
  - i file del workspace sono sempre POSIX relativi alla radice;
  - quelli fuori dal workspace sono `external: true`, con la home mascherata `~`;
  - lo schema rifiuta drive, `/` iniziale, `..` e home in chiaro.
- **Niente contenuti nei campi liberi.** Gli eventi non portano contenuti di file. Ogni testo libero (comandi, messaggi, output) passa da `makeTextCleaner`: la radice diventa `.`, la home `~` e i segreti vengono redatti (`redact.ts`).
- **Normalizzatori puri per sorgente** (`normalizeClaudeStream`, `normalizeClaudeHooks`, `normalizeOllamaChat`), più `mergeClaudeSession`. Il merge prende il contenuto dallo stream e i tempi dagli hooks, aggiunge ciò che sanno solo gli hooks (`Notification`) e rinumera.
- **Esiti derivati:**
  - i test falliti nell'output di un comando shell diventano `tool.failed` con `reason: tests-failing`;
  - un rifiuto di permesso diventa `permission.requested` + `permission.resolved(denied)` + `tool.failed(denied)`.
- **Fixture.**
  - Si committano solo quelle in `packages/fixtures/sanitized/`, prodotte da `scripts/fixtures/sanitize.mjs`.
  - La pulizia è un'allowlist per tipo di riga: si tengono solo le chiavi note e i contenuti dei file diventano righe `<redacted>` (restano i conteggi `+/-`).
  - Su ogni stringa si sostituiscono workspace, home, utente, host, identità git ed email, e si redigono i segreti.
  - `--check` cerca segreti, percorsi personali, chiavi vietate e stringhe ad alta entropia, e gira in CI insieme a gitleaks.
- **Versionamento:** `schemaVersion` resta 1. È il primo schema completo e nessun evento è ancora stato salvato. Da qui in poi ogni cambio incompatibile alza la versione e porta una migrazione testata.

## Alternative considerate

- **Envelope + `payload` annidato:** più verboso da leggere e da filtrare, e non aggiunge nulla.
- **Una sola sorgente** (solo stream o solo hooks): con il solo stream si perdono i tempi precisi; con i soli hooks si perdono negazioni, errori e uso dei token.
- **Committare gli eventi normalizzati al posto dei grezzi ripuliti:** non si potrebbero più testare i normalizzatori sul formato reale.
- **Pulizia per lista nera di chiavi:** un campo nuovo di Claude Code finirebbe in chiaro. Con l'allowlist, un campo nuovo viene scartato.

## Conseguenze

- La UI e il replay leggono un solo formato, già pulito. Il renderer può importare `@control-center/event-schema` senza tipi Node.
- Un cambio del formato di Claude Code si vede nei test: snapshot delle timeline e invarianti sulle fixture.
- I subagent negli hooks si collegano alla chiamata `Agent` solo a posteriori, tramite `tool_response.agentId`. In tempo reale (Fase 4) l'attribuzione viene dallo stream, che porta `parent_tool_use_id` su ogni riga.
- Mancano ancora fixture per `Notification` interattivo e `PostToolUseFailure`: i due casi sono coperti solo da test sintetici.
