# Fase 5h — Capacità, Novità e aggiornamento automatico

_Piano approvato dall'utente il 2026-11-27. Si parte dopo il merge della PR #79 (5f.1 PR B), da un branch nuovo creato da `main`. Corsie, modelli ed effort delle sotto-fasi sono in [CORSIE.md](CORSIE.md#priorità-codex-e-lavoro-simultaneo); il goal è in [PIANO.md](PIANO.md#goal-per-ogni-fase)._

**Corsia:** Claude per architettura, IPC, processi e config di deploy · **Modello:** Opus 5.5 · **Effort:** high. Fixture, sonda del bot e vista vanno a Codex (vedi "Ripartizione per corsia").

**Decisione aperta (prima del Livello 3):** electron-updater richiede l'installer NSIS e le release con `latest.yml`, oggi previsti in Fase 10. Anticipare l'updater vuol dire anticipare anche il packaging NSIS (non la firma). Da confermare con l'utente prima di iniziare il Livello 3.

**Prove già fatte (passo 0, 2026-11-27):**

- Claude Code 2.1.326, richiesta `initialize` senza prompt e senza consumo di token: 14 modelli con nome ed effort propri (la lista fissa attuale sbaglia: offre `xhigh` a tutti, ma Haiku 4.5 non accetta effort e i modelli 4.6 non hanno `xhigh`), 129 comandi, 13 agenti, 5 stili di risposta e un elenco di capacità (per esempio `ui_surface_v1`, `ui_pane_widget_v1`). La risposta contiene anche un campo account con email e organizzazione: **non entra mai nello schema**, resta nel main e fuori dalle fixture.
- Codex 0.171.0-alpha.13.2: vedi "Piano Codex".

## Context

Oggi una parte di ciò che l'app sa degli agenti è scritta a mano e invecchia a ogni rilascio di Claude Code o Codex:

- `apps/desktop/src/main/claude/models.ts`: `CLAUDE_MODELS` (alias fable/opus/sonnet/haiku) e `CLAUDE_EFFORTS`;
- `apps/desktop/src/main/claude/cli.ts:20` `TESTED_CLAUDE_VERSIONS`, `apps/desktop/src/main/codex/cli.ts:15` `TESTED_CODEX_VERSIONS`;
- nessuna consegna automatica dell'app aggiornata (electron-updater previsto solo in Fase 10).

Codex invece è già "giusto": il catalogo arriva da `model/list` dell'app-server (`codex/models.ts`). L'obiettivo è estendere quel principio a tutto e chiudere il ciclo: **novità della CLI → l'app la mostra da sola; se serve codice → un bot lo verifica, apre la PR, la unisce a CI verde, release-please pubblica, electron-updater installa.**

Scelte dell'utente: auto-merge delle PR del bot solo se toccano dati e la CI è verde; prove in CI **senza login** (niente segreti Anthropic); electron-updater **anticipato** qui.

## Principio: tre livelli

1. **Scoperta a runtime** (copre modelli, effort, comandi, skill, agenti, MCP): la fonte di verità è la CLI installata, non il codice. Un modello nuovo compare in app il giorno stesso, senza rilasci.
2. **Dati di compatibilità + bot**: ciò che non si può chiedere alla CLI (versioni provate, fallback) sta in un file JSON, non nel codice. Un workflow pianificato lo aggiorna da solo.
3. **Consegna**: electron-updater porta la nuova release sul PC.

## Livello 1 — Scoperta a runtime

**1a. Catalogo Claude dalla CLI.** La sessione usa già `--input-format stream-json` e i `control_request` (`claude/permissions.ts`). Si invia la richiesta `initialize` (quella dell'Agent SDK) a inizio run e si legge la risposta: `models` (value, displayName, efforts se presenti) e `commands`.

- **Passo 0:** ✅ prova fatta (vedi sopra). Resta da registrare la fixture ripulita in `packages/fixtures/sanitized/`, senza i campi account.
- Nuovo `claude/catalog.ts`: schema zod `looseObject` sulla risposta (come `codexModelSchema`), `toAgentModel` che passa da `safeModelId` / `effortSchema` / `MAX_AGENT_MODELS`. `claudeCatalog()` in `models.ts` riceve i modelli scoperti; `CLAUDE_MODELS` diventa solo fallback.
- Cache in `<userData>/agent-catalog.json` (validata con zod alla lettura) così la prima apertura mostra subito l'ultimo catalogo noto; si rinfresca a ogni sessione.
- I valori restano filtrati come oggi: mai un id che sembra un segreto, mai un argomento che inizia con `-` (`claudeConfigArgs` invariato).

**1b. Capacità mostrate, non elencate.** La riga `system/init` (già letta in `session.ts:299`) porta `tools`, `slash_commands`, `mcp_servers`, skill e plugin: si espongono nel catalogo della sessione (contratto IPC, campo opzionale) così la UI li elenca senza liste fisse. Utile anche alla Fase 8.

**1b+. Scoperta delle feature nuove.** Non solo modelli: anche funzioni come quella degli artifact che creano app in tempo reale. Per ogni agente il main costruisce un **inventario delle capacità** da più fonti, tutte locali o della CLI installata:

- Claude: risposta di `initialize` (comandi, modelli, output style, agenti), riga `init` (tool, slash command, skill, plugin, server MCP con i loro tool), flag di `claude --help`;
- Codex: `model/list`, metodi e notifiche dello schema dell'app-server, elenco delle feature (`codex features list` o equivalente: da verificare al passo 0);
- note di rilascio: il `CHANGELOG.md` del pacchetto CLI installato se presente; altrimenti, solo se l'utente lo attiva nelle impostazioni, le release GitHub del progetto (unica chiamata di rete, nessun dato inviato).

Ogni voce ha `id`, `kind` (model, tool, command, skill, plugin, mcp, flag, method, feature), `agent`, `label`, `description` e `firstSeen` (versione e data). Il main confronta l'inventario con l'ultima istantanea salvata in `<userData>/capabilities.json` (zod alla lettura) e marca le voci **nuove**, **cambiate** e **rimosse**. Tutto il testo che viene dalla CLI passa da `redactSecrets` e da limiti di lunghezza; nel renderer è solo testo (Markdown sanitizzato per il changelog). Contratto IPC: `capabilities:list` e l'evento `capabilities:changed` in `packages/ipc-contract`.

**1b++. Sezione "Novità e capacità" nella UI.** Una vista dedicata (voce nella barra attività, rotta `#/capabilities`, scorciatoia dopo `Ctrl+7`, comando nella palette):

- in alto **Novità**: le voci nuove o cambiate dall'ultima apertura, raggruppate per agente e versione, con la nota di rilascio accanto e "segna come viste";
- sotto l'**inventario completo** per agente e tipo, con ricerca e filtri; ogni voce mostra da quale versione esiste;
- badge con il numero di novità sulla voce della barra attività e un avviso discreto nella barra di stato quando cambia la versione di una CLI;
- stati vuoti corretti (CLI assente, catalogo non ancora letto, rete disattivata);
- solo token del design system e stati semantici di `DESIGN.md`; revisione impeccable nei due temi.

La UI su dati pronti va alla corsia Codex (`gpt-6.2-sol`, medium) dopo che contratto e inventario sono su `main`.

**1c. Eventi sconosciuti non si perdono.** Verificare in `packages/event-schema/src/normalize/` che un tipo di riga o di notifica nuovo diventi un evento generico (`unknown` con tipo originale e payload redatto) mostrato nella timeline, invece di essere scartato; più un conteggio in Console. Se manca, aggiungerlo senza cambio incompatibile di schema (altrimenti migrazione v3 → v4).

## Piano Codex (provider)

Prova del 2026-11-27 con `codex-cli 0.171.0-alpha.13.2` (pacchetto Store `OpenAI.Codex_26.1120.6357.0`), senza login né turni:

- `codex features list`: 230 feature flag con stato (`stable`, `experimental`, `under development`, `deprecated`, `removed`) e attivazione;
- lo schema dell'app-server (`codex app-server generate-json-schema --out <dir>`) conta 110 richieste e 87 notifiche;
- `experimentalFeature/list` dà per ogni feature `name`, `stage`, `enabled`, `defaultEnabled` e, per quelle in beta, `displayName`, `description` e `announcement` (il testo con cui Codex presenta la novità).

Codex ha quindi già una fonte strutturata delle novità, più ricca di quella di Claude.

**C1. Inventario Codex dalla sessione.** La sessione (`codex/session.ts`, `codex/rpc.ts`) usa già l'app-server per `model/list`. Dopo `initialize`, e solo con metodi in **sola lettura**, legge:

| Metodo                                                      | Diventa nell'inventario                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `model/list` (già usato)                                    | `model` con efforts                         |
| `experimentalFeature/list`                                  | `feature` con stage, attivazione e annuncio |
| `skills/list`, `hooks/list`                                 | `skill`, `hook`                             |
| `plugin/list` / `plugin/installed`, `app/list`              | `plugin`, `app`                             |
| `mcpServerStatus/list`                                      | `mcp` con i suoi tool                       |
| `modelProvider/capabilities/read`, `permissionProfile/list` | `capability`, `profile`                     |

Le notifiche `skills/changed`, `app/list/updated`, `mcpServer/startupStatus/updated` e `deprecationNotice` aggiornano l'inventario mentre la sessione è aperta. `deprecationNotice` va anche in Console.

**Fatto nella 5h.2 (2026-11-27):** `plugin/list` e `app/list` esclusi (vanno in rete, oltre 20 s nella prova); al loro posto `plugin/installed`, locale. Solo `skills/changed` rinnova la lettura: `app/list/updated` e `mcpServer/startupStatus/updated` arrivano a ogni thread e riguardano dati che l'inventario non tiene. `deprecationNotice` va in Console. Skill di repository e hook di progetto esclusi.

**C2. Allowlist dei metodi (sicurezza).** L'app-server espone anche scritture potenti (`experimentalFeature/enablement/set`, `config/value/write`, `plugin/install`, `fs/*`, `command/exec`, `account/*`). `codex/rpc.ts` riceve un elenco chiuso dei metodi che l'app può chiamare. Un metodo fuori elenco viene rifiutato prima di partire e segnalato in Console. Nessun canale IPC permette al renderer di scegliere il metodo. L'app **mostra** le feature ma non le attiva: si attivano da Codex (`config.toml` o la sua UI), coerente con la regola 8. Da annotare in `SICUREZZA.md`.

**C3. Senza sessione aperta.** La sezione Novità deve funzionare anche prima di aprire una chat. Una sonda breve nel main avvia `codex app-server`, chiede solo `initialize` + i metodi C1 e chiude l'albero dei processi (riusa `resolveCodex`, `killTree`, i limiti di `rpc.ts`). Gira all'avvio solo se la versione della CLI è cambiata, altrimenti si usa l'istantanea. Lo stesso vale per Claude: un `claude -p` con il solo `initialize`, senza prompt, che non consuma token del modello (verificato al passo 0).

**C4. Testi che vengono dalla CLI.** `displayName`, `description`, `announcement` e le descrizioni di skill e plugin passano da `redactSecrets`, hanno un limite di lunghezza e nel renderer sono solo testo. I campi `account*` non entrano mai nello schema dell'inventario, né per Codex né per Claude.

**C5. Compatibilità Codex nel bot (2b).** La sonda usa `@openai/codex@<v>`:

- `codex --version`, `codex features list` (diff delle feature: nuove, cambiate di stato, rimosse);
- `generate-json-schema`: confronto dei metodi e campi usati dall'app (`initialize`, `thread/start|resume`, `turn/start|interrupt`, `model/list`, i metodi C1 e le notifiche lette dal normalizzatore `packages/event-schema/src/normalize/codex.ts`) con uno snapshot committato in `packages/agent-compat/codex-protocol.json`.

Un metodo usato che sparisce o cambia tipo dà `broken`. Metodi o feature nuovi danno `compatible` e finiscono nella descrizione della PR.

**C6. Fixture.** Si registrano le risposte di `experimentalFeature/list`, `skills/list` e `mcpServerStatus/list`, ripulite in `packages/fixtures/sanitized/`. `packages/fixtures/bin/fake-codex.mjs` le serve, così i test non dipendono dalla CLI vera.

### Ripartizione per corsia

| Lavoro                                                              | Corsia | Modello · effort       | Revisione                           |
| ------------------------------------------------------------------- | ------ | ---------------------- | ----------------------------------- |
| Schema `Capability` + contratto `capabilities:*`, istantanea e diff | Claude | Opus 5.5 · high        | Codex `gpt-6.2-astra` sul contratto |
| C1 + C2 + C3 (sessione, allowlist, sonde)                           | Claude | Opus 5.5 · high        | Codex (IPC, processi)               |
| C6 fixture e `fake-codex` esteso                                    | Codex  | `gpt-6-luna` · medium  | Claude                              |
| C5 sonda Codex nel bot (script + test)                              | Codex  | `gpt-6.2-sol` · high   | Claude                              |
| Vista "Novità e capacità" (1b++)                                    | Codex  | `gpt-6.2-sol` · medium | Claude + impeccable                 |

Ordine: il contratto per primo, su `main`. Poi Claude fa C1–C3 mentre Codex fa C6 e C5, che dipendono solo dal contratto e dalle fixture. La vista arriva per ultima, sui dati veri. Le righe vanno aggiunte a `CORSIE.md`.

## Livello 2 — Dati di compatibilità e bot

**2a. File dati.** `packages/agent-compat/compat.json` + schema zod e loader (pacchetto senza dipendenze di runtime nuove):

```json
{ "claude": { "tested": ["2.1.322","2.1.326"], "fallbackModels": [...], "fallbackEfforts": [...] },
  "codex":  { "tested": ["0.171.0-alpha.13.2"] } }
```

`TESTED_*_VERSIONS` e `CLAUDE_MODELS/EFFORTS` leggono da qui (re-export, così i test esistenti non cambiano firma).

**2b. Sonda senza login** `scripts/compat/probe.mjs`, che per una versione data:

- installa la CLI in una cartella temporanea (`npm i @anthropic-ai/claude-code@<v>`, `@openai/codex@<v>`);
- `claude --version`, `claude --help` → controlla che esistano i flag usati dall'app (`-p`, `--input-format`, `--output-format`, `--resume`, `--model`, `--effort`, `--permission-prompt-tool`, `--settings`) e legge i livelli di `--effort`;
- `codex app-server generate-json-schema` → confronta i metodi e i campi usati (`model/list`, `turn/start`, notifiche lette dal normalizzatore) con uno snapshot committato;
- esce con un report JSON: `compatible` / `changed` (diff) / `broken`.
- Test Vitest dello script con output finti.

**2c. Workflow** `.github/workflows/compat-watch.yml` (cron giornaliero + `workflow_dispatch`):

- confronta l'ultima versione npm con `compat.json`; se nuova, esegue la sonda;
- `compatible` → aggiorna solo `compat.json` (versione aggiunta, efforts/fallback se cambiati), apre la PR `chore(compat): …` e attiva l'auto-merge;
- `changed`/`broken` → apre una issue con il diff e la etichetta per la corsia Claude, **niente PR automatica**.
- **Vincoli GitHub:** le PR aperte con `GITHUB_TOKEN` non avviano la CI; serve un GitHub App token (o PAT fine-grained, solo `contents`+`pull-requests` su questa repo) come segreto. Abilitare "Allow auto-merge" nel repo. La protezione di `main` resta com'è: l'auto-merge aspetta i 4 check obbligatori.
- **Guardia dell'auto-merge:** un job verifica che il diff della PR tocchi solo `packages/agent-compat/compat.json`; altrimenti toglie l'auto-merge. Il job "Project memory updated" deve accettare le PR `chore(compat)` senza memoria (eccezione per percorso) oppure il bot aggiunge una riga in `STORIA.md`: decidere guardando `ci.yml`.
- Permessi del workflow minimi (`contents: write`, `pull-requests: write`, `issues: write`), azioni fissate per SHA, nessun segreto Anthropic.

## Livello 3 — Consegna con electron-updater

- ADR nuova (dipendenza di runtime `electron-updater`) e aggiornamento di `SICUREZZA.md` (superficie "aggiornamenti").
- `electron-builder` `publish: github`; release-please (già presente) crea la release, un job di build Windows allega installer NSIS + `latest.yml`.
- Nel main: `autoUpdater` controlla all'avvio e ogni 6 h, scarica in background, installa alla chiusura; nessun riavvio forzato. Stato esposto con un evento IPC `app:updateStatus` nel contratto (zod, mittente verificato) e un indicatore nella barra di stato con "Riavvia per aggiornare". Canale stable; beta in seguito.
- Integrità: sha512 di `latest.yml` su HTTPS. Le build non firmate non hanno la verifica dell'editore: va scritto in `SICUREZZA.md` e nel README; la firma del codice resta opzionale (Fase 10).
- Nessuna telemetria: l'unica chiamata è il controllo della release su GitHub; disattivabile nelle impostazioni.

## Ordine delle PR

1. Passo 0 (prova `initialize`) + 1a + 1b — PR `feat(main): discover the Claude catalog from the CLI`.
2. 1b+ inventario delle capacità, istantanea e contratto `capabilities:*` — `feat(main): capability inventory` (Claude).
   2b. C1–C3 inventario Codex, allowlist dei metodi e sonde senza sessione — `feat(main): Codex capability discovery` (Claude); in parallelo C6 e C5 (Codex).
3. 1b++ sezione "Novità e capacità" — `feat(renderer): capabilities view` (Codex, revisione Claude + impeccable).
4. 1c (eventi sconosciuti) se manca.
5. 2a + 2b — `feat(compat): compatibility data and probe`.
6. 2c — `ci(compat): daily watch with auto-merge` (config di deploy: Claude).
7. Livello 3 — `feat(main): auto-update from GitHub Releases` + ADR.
8. Memoria aggiornata a ogni PR; a fine fase questo file si archivia in `STORIA.md`.

**Coordinamento con la 5f.2 di Codex**, che lavora in parallelo nel renderer: la 5h tocca `claude/models.ts`, `claude/session.ts`, `codex/session.ts`, `codex/rpc.ts`, `agent-config.ts` e `contract.ts`, che sono della corsia Claude. Se la 5f.2 ha bisogno di uno di questi file, la modifica passa da una PR Claude. Il contratto `capabilities:*` va su `main` per primo, poi Codex può partire con fixture (C6) e sonda (C5).

## File critici

- `apps/desktop/src/main/claude/models.ts`, `cli.ts`, `session.ts` (init/control_request), nuovo `claude/catalog.ts`
- `apps/desktop/src/main/codex/cli.ts` (versioni da `compat.json`)
- `packages/ipc-contract/src/agent-config.ts` (capacità opzionali), `contract.ts` (`app:updateStatus`)
- `packages/event-schema/src/normalize/*` (eventi sconosciuti)
- nuovi `packages/agent-compat/`, `scripts/compat/probe.mjs`, `.github/workflows/compat-watch.yml`
- `.github/workflows/release-please.yml`, config electron-builder, `docs/adr/`, `docs/memoria/SICUREZZA.md`

Da riusare: `toAgentModel`/`codexCatalog` come modello per Claude; `safeModelId`, `readLimited`, `isConfigInCatalog`; `createEventEmitter` per l'evento di update; il pattern "warn once" di `UntestedClaudeVersion`.

## Verifica

- `pnpm verify` verde a ogni PR.
- 1a: test con il finto `claude` (`packages/fixtures/bin/fake-claude.mjs` esteso per rispondere a `initialize`) per: catalogo dalla CLI, risposta assente → fallback, valori ostili scartati; E2E `claude.spec.ts`; prova reale con `CC_REAL_CLAUDE=1`.
- 1b+: test dell'inventario con due istantanee (voce nuova, cambiata, rimossa), testo ostile (segreti, lunghezze, Markdown) ripulito; finto `claude` con un tool e un comando in più → compare come novità.
- 1b++: E2E della vista (badge, "segna come viste", filtri, stati vuoti), screenshot nei due temi, impeccable.
- 2b: `node scripts/compat/probe.mjs --claude 2.1.326 --codex 0.171.0-alpha.13.2` dà `compatible`; con un help finto senza `--effort` dà `broken`.
- 2c: `workflow_dispatch` su un fork o con una versione forzata: la PR si apre, la CI parte, l'auto-merge si attiva solo con diff limitato a `compat.json`.
- 3: release di prova `x.y.z-beta` su GitHub, installare la versione precedente, controllare che l'app scarichi e proponga il riavvio; `pnpm e2e:packaged`.
