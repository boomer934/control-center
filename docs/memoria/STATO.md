# Stato attuale

_Ultimo aggiornamento 2026-11-27. Fase 5 (5a–5e+) chiusa: tutte le sotto-fasi su `main`, sintesi in `STORIA.md`. La specifica documentale della 5f è nella PR #67 (da `codex/roadmap-codex-claude`), prima dell'implementazione. Seguono 5f e 5g, poi la Fase 6 (Codex)._

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: ✅ completata il 2026-11-17 (PR #23, #25, #27). Sintesi in `STORIA.md`, voce "Chiusura Fase 3".

**Fase 5 — Vista Live**: ✅ 5a–5e+ completate e unite su `main`. Sintesi in `STORIA.md`, voce "Chiusura Fase 5".

- **5f, specifica modello ed effort:** piano, corsie, prossimi passi e storia aggiornati; PR #67 aperta da `codex/roadmap-codex-claude`. `pnpm verify` verde (439 test, 1 saltato). Prima dell'implementazione: contratto/processo in 5f.1 Claude, UI e replay in 5f.2 Codex.

**Fase 4 — Prima versione usabile**: ✅ completata il 2026-11-18 (PR #35, #40, #42, #44, #47). Sintesi in `STORIA.md`, voce "Chiusura Fase 4"; il brief `FASE_4.md` è archiviato lì. Sotto-fasi: 4.0 (canale push, da `CORSIE.md`), 4.1 (bridge e sessione), 4.2 (workspace e terminale) e 4.3 (chat e permessi).

- **4.0**, canale push nel contratto IPC: ✅ unita su `main` (PR #35, `4c2ef5c`, ADR 0007).
- **4.2**, workspace e terminale: ✅ unita su `main` (PR #40, `4b928ab`, ADR 0008), CI verde dopo la correzione del test dei percorsi. `/code-review high` di Claude: 9 punti minori, in `PROSSIMI_PASSI.md`.
- **4.1**, hooks bridge e sessione Claude: ✅ unita su `main` (PR #42, `ecb78f3`, ADR 0009). La CI è verde: Verify (Windows), gitleaks, Conventional commits, memoria e GitGuardian. Con `/code-review high` sono emersi 7 punti: 6 corretti, 1 risolto dalla prova con la CLI vera. Dopo il merge, un test della sessione è risultato instabile sul runner (EPERM nella pulizia dopo `taskkill /T`) e ha fatto fallire la PR #43, che conteneva solo documentazione. È corretto con la PR #44 (`54bce84`).
- **4.3**, chat, permessi e cronologia: ✅ unita su `main` (PR #47, `fe3cb61`, ADR 0010). `/code-review high` di Claude sul flusso dei permessi: 9 punti, tutti corretti nella PR #49 (unita su `main`, `f06cd09`).
- **4b**, Git e checkpoint: ✅ unita su `main` con la [PR #52](https://github.com/boomer934/control-center/pull/52) (`e59beb7`, ADR 0011), nella versione precedente alla revisione. Le correzioni degli otto rilievi sono unite con la [PR #55](https://github.com/boomer934/control-center/pull/55) (`6a17d71`, CI verde).
- **Release:** 1.1.0 (PR #50, #51), 1.2.0 (PR #54, `06525e4`) e 1.3.0 (PR #57, `3dadb8e`) unite.

- **3a**, shell sicura e IPC: ✅ unita su `main` (PR #23, `985130d`, ADR 0004).
- **3b**, logger e Console Errori: ✅ unita su `main` (PR #25, `2c64bf8`, ADR 0005).
- **3c**, design system in codice: ✅ unita su `main` (PR #27, `1765186`, ADR 0006), 6 check verdi compreso Verify (Windows) con i test visivi.

**Fase 5 — Vista Live**: ✅ completata il 2026-11-27 (PR #56, #58, #59, #62, #63, #64, #68, #70; ADR 0012–0016). Sintesi in `STORIA.md`, voce "Chiusura Fase 5".

**Fase 6 — Infrastruttura**: da iniziare, corsia Codex (`CORSIE.md`).

## Branch

Claude: `feat/revisione-frontend` (orchestratore, icone dei file, dock della sessione), non ancora in PR e non presente sul remoto al 2026-11-27: va verificato sul computer dell'utente. La chiusura della Fase 5 è sul branch della sessione cloud `claude/funny-archimedes-8ecsji`. Codex: il worktree `control-center-codex` va riallineato a `main` prima della Fase 6.

## Punto di ripresa

Dal 2026-11-17 il lavoro va su due corsie parallele, Claude e Codex (ripartizione in [`CORSIE.md`](CORSIE.md)). Ogni agente modifica solo la propria sezione.

### Corsia Claude

- **Fatto:** PR #30 (brief della Fase 4), #31 (`sessione-06`) e #32 (plugin di progetto) unite.
- **Fatto (fixture `Notification`, PR #38):** `sessione-07` registrata di nuovo il 2026-11-17 e ripulita (12 righe di hooks, nessuno stream): un `Read`, un permesso approvato dopo l'attesa (`Notification` con `notification_type: permission_prompt`) e un rifiuto fatto da una persona. Il blocco della 4.1 è tolto. Due lezioni: `npx --version` e `git log -1` sono di sola lettura e Claude Code non chiede il permesso, quindi non nasce `Notification` (serve un comando che scrive, per esempio `Set-Content`); e `VERNIER_HOOKS_SESSION` va impostata nella stessa finestra PowerShell che lancia `claude`, altrimenti gli hooks finiscono in `unnamed.hooks.jsonl`. Un permesso rifiutato a mano lascia solo `PreToolUse`: `mergeClaudeSession` chiude le chiamate rimaste aperte a fine sessione come `tool.failed` con motivo `interrupted` (è un'inferenza: nel live della 4.1 il rifiuto va letto da un altro segnale). Unita su `main` con la PR #38 (`d6d08da`).
- **Fatto (4.0):** canale push main → renderer nel contratto (ADR 0007), unito su `main` con la PR #35 (`4c2ef5c`). Eventi `event('ns:nome', schema)` accanto ai metodi; `createEventEmitter` nel main (solo eventi del contratto, payload validato, solo finestre fidate); `window.api.<ns>.onX(listener)` nel preload (un listener `ipcRenderer` per canale, payload rivalidato, mai l'`IpcRendererEvent`). Primo evento `errors:changed`: la Console Errori non interroga più ogni secondo. `/code-review high`: 5 punti trovati e corretti (ciclo di segnalazione da un iscritto che lancia, `targets()` fuori dal `try`, iscritto orfano, test del raggruppamento, E2E con attesa fissa).
- **Fatto (4.2, revisione e CI):** il test dei percorsi su Windows cadeva nel runner perché `tmpdir()` è un percorso corto 8.3 (`RUNNER~1`): corretto nel test con `realpath` (commit `7264c75`, modulo invariato). `/code-review high` sulla PR #40: 9 punti minori, nessuno bloccante.
- **Fatto (4.1, PR #42, `ecb78f3`, ADR 0009):**
  - normalizzatori incrementali (`ClaudeStreamNormalizer`, `ClaudeHooksNormalizer`) e merge dal vivo `LiveClaudeSession`, che sulle 7 fixture dà gli stessi fatti del batch;
  - `packages/hooks-bridge`: named pipe e token casuali per sessione. I rifiuti vanno in Console con il solo codice. Lo script degli hooks lo esegue Node dal sorgente TS;
  - sessione nel main:
    - una run `claude -p` stream-json per messaggio, con `--resume`;
    - file temporanei in `<userData>/claude-sessions/`;
    - interruzione e chiusura terminano l'intero albero dei processi;
    - avviso se la versione della CLI non è tra quelle testate;
  - namespace IPC `claude` (`start`, `send`, `interrupt`, `close`, evento `claude:updated`);
  - finto `claude` (`packages/fixtures/bin/fake-claude.mjs`).
- **Verificato in locale:**
  - `pnpm verify` verde: 323 test (più la prova reale, saltata senza `CC_REAL_CLAUDE=1`), 0 errori di lint;
  - E2E `claude.spec.ts` verde (IPC → main → finto claude → hooks → pipe);
  - suite `app`: 51 verdi e 3 rossi:
    - i 2 test visivi, che in locale falliscono sempre;
    - il test dell'editor di `workspace-terminal.spec.ts`, instabile nella suite completa ma verde da solo e insieme a `claude.spec.ts`;
  - `pnpm e2e:packaged` non rieseguito.
- **Prova con la CLI vera (Claude Code 2.1.326):** una run breve che legge un file. Claude Code ha eseguito il comando degli hooks tra virgolette e la pipe ha accettato tutti i messaggi (zero rifiuti), con `file.read` arrivato dagli hooks. La prova ha mostrato che `SessionStart` e `UserPromptSubmit` arrivano prima della riga `init`: ora il merge dal vivo li trattiene finché arriva `init`, così `session.started` conserva modello e versione. Il test resta nella repo, saltato salvo `CC_REAL_CLAUDE=1` (`real-claude.smoke.test.ts`). La 2.1.326 è stata aggiunta alle versioni testate.
- **Non verificato:** manca la seconda opinione di Astra sulla pipe.
- **Fatto (4.3, revisione):** `/code-review high` sulla PR #47 (flusso dei permessi): 9 punti, tutti corretti da Codex nella PR #49 (`f06cd09`) dopo una passata `/code-review medium` di Claude.
- **Fatto (chiusura Fase 4):** memoria chiusa con la PR `docs/chiusura-fase-4`; `FASE_4.md` archiviato in `STORIA.md`.
- **Fatto (4b, correzioni):** su richiesta dell'utente, cherry-pick delle correzioni di Codex (`5bc30ae`) su `origin/main` nella [PR #55](https://github.com/boomer934/control-center/pull/55), con il test del terminale di `main` e una correzione in più (commit con hook: timeout di 5 minuti, niente `GIT_LITERAL_PATHSPECS` agli hook).
- **Fase 5 chiusa (2026-11-27):** sintesi in `STORIA.md`, voce "Chiusura Fase 5".
- **Ora (punto di ripresa):** la Fase 6 (infrastruttura) spetta a Codex; Claude fa poi `/code-review high` su socket Docker e processi. Per Claude restano aperti `feat/revisione-frontend` (vedi "Branch") e le voci "Quando capita" di `PROSSIMI_PASSI.md`.

### Corsia Codex

- **Prossima priorità:** 5f, Codex in Vernier, poi 5g, uso simultaneo con Claude Code prima della Fase 6. La 5e+ è unita su `main` (PR #68 e #70, ADR 0016). La corsia Codex prepara fixture e verifiche e collega UI e normalizzatore dopo la consegna dei contratti su `main`. Il [collaudo 5g](PIANO.md#criteri-di-accettazione-per-le-sessioni-simultanee) richiede una prova parallela reale su Windows e una revisione Impeccable in Electron.
- **Dopo la 5g (Fase 6):** pannelli Docker (sola lettura di default), porte locali e GPU/Ollama con stati vuoti corretti, a partire dall'inventario della 5d (ADR 0014). Goal in `PIANO.md`, modello ed effort in `CORSIE.md`. Prima riallineare il worktree a `main`.
- **Fatto (2026-11-17):** la 4.3 aggiunge chat in streaming nel dock Session, Markdown e codice, strumenti richiudibili, permessi via stdin, Stop, riapertura e ripresa dalla cronologia JSONL per workspace. La Vista Live mostra la timeline essenziale.
- **Verificato in locale:** `pnpm verify` verde (326 test passati, smoke test con CLI reale saltato) e 53 E2E Electron funzionali verdi, inclusi i due casi con il finto `claude`. Gli snapshot preesistenti dei componenti sono esclusi da questa esecuzione locale.
- **Verifica visiva:** Electron a 960×600 nei due temi. Le azioni dei permessi e il focus sugli argomenti sono verificati dall'E2E. Rilevatore Impeccable senza rilievi.
- **Fatto (2026-11-18):** i nove rilievi della revisione 4.3 sono corretti e uniti con la PR #49 (`f06cd09`). `pnpm verify` verde con 332 test passati.
- **Fatto (4b):** il pannello Git mostra branch, modifiche in staging e su disco, diff e commit recenti. Consente stage, unstage e commit. Il main salva il checkpoint prima del primo turno Claude in un workspace Git e la timeline apre il confronto e il ripristino di un file o di tutti i file. Branch, HEAD e stash restano invariati durante cattura e ripristino.
- **Verificato (4b):** `pnpm verify` verde con 340 test passati e smoke test Claude reale saltato. Sette test di integrazione su repository Git temporanei e 54 E2E Electron funzionali, incluso il ripristino dalla timeline. Controllo del pannello e del dialogo in entrambi i temi a 960×600 e rilevatore Impeccable senza rilievi. I due test degli snapshot dei componenti restano alla CI Windows.
- **Verificato (2026-11-19):** `pnpm verify` passato con 340 test e 8 E2E locali passati nelle suite Claude e terminale dopo le correzioni ai test Windows.

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Renderer da `app://control-center/`, CSP in header e `<meta>`. `packages/ipc-contract` ha i namespace `app`, `errors`, `shell`, `workspace`, `terminal` e `claude` (4.1) e gli eventi push `errors:changed`, `terminal:updated` e `claude:updated`.
- ✅ Sessione Claude dal main con hooks via named pipe (4.1, su `main`). È provata con il finto `claude` e con una run reale di Claude Code 2.1.326.
- ✅ Chat, permessi e cronologia (4.3, su `main`): dock Session con streaming, Markdown, strumenti richiudibili, Approva/Rifiuta/Sempre, Stop, cronologia JSONL per workspace con ripresa, timeline semplice nella Vista Live. Sulla PR #47: `pnpm verify` 326 test, 53 E2E funzionali verdi (snapshot visivi esclusi in locale), impeccable senza rilievi.
- ✅ Sulla 4.0, il 2026-11-17 (prima del merge): `pnpm verify` verde (237 test, 0 errori di lint); `pnpm e2e` 46 verdi su 48, i 2 rossi sono i test visivi che in locale falliscono sempre per i font (vedi sotto). `pnpm e2e:packaged` non rieseguito.
- ✅ `packages/app-log` e Console Errori (3b), ora nel dock inferiore "Problems".
- ✅ Design system in codice (3c): token → Tailwind v4, `componenti.css` importato, componenti base, temi `system|dark|light` (preferenza in `localStorage`, `system` segue l'OS) e densità, shell a pannelli ridimensionabili con layout ricordato, barra attività, barra di stato, command palette (`Ctrl+K`, `Ctrl+Shift+P`), dialog `?`, scorciatoie con ambiti di focus (terminale, campi di testo, Live, dialog), `Ctrl+1…7`, pagina `#/components` con test visivi.
- ✅ In locale, il 2026-11-17, sulla 3c:
  - `pnpm verify` verde: 203 test (19 nuovi), 0 errori di lint;
  - `pnpm e2e`: 46 test verdi (17 nuovi in `ui.spec.ts`, di cui 12 screenshot di 6 sezioni in 2 temi);
  - `pnpm e2e:packaged`: 8 test verdi.
- ✅ Revisione impeccable della 3c (un solo contesto, con detector: sorgente pulito): 2 problemi gravi trovati e corretti (trappola del focus nei dialog, anello di focus dell'input). Minori aperti: `aria-live` per il contatore errori, prova a finestra stretta.
- ✅ Già da prima: `@control-center/event-schema` e `@control-center/fixtures`, hook git, gitleaks in CI, design della Fase 1.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR, merge a mano a CI verde.
- **Screenshot di riferimento** (`apps/desktop/e2e/app/ui.spec.ts-snapshots/`): sono quelli del runner `windows-latest` (artifact `playwright-results` del run 44100672540), perché i caratteri locali differivano di circa il 4% dei pixel. **In locale i 12 test visivi falliscono**: per rigenerarli o confrontarli si usa l'artifact della CI, non `--update-snapshots` locale. Le asserzioni sono `expect.soft`, così un run fallito salva tutti i candidati.
- **Font non inclusi:** Instrument Sans e Martian Mono non sono nel pacchetto (la CSP vieta Google Fonts); l'app usa i font di ripiego dei token. Vedi `PROSSIMI_PASSI.md`.
- Nessuna title bar personalizzata: cornice nativa di Windows.
- Mappatura degli stack nel pacchetto (`app.asar`) provata solo in `out/` e con test unitari, non end to end: vedi `PROBLEMI_NOTI.md`.
- "Clic su un frame → apri l'editor" della Console non c'è: serve un metodo IPC che apra file, da progettare con i controlli di percorso della Fase 4.
- gitleaks non è installato in locale: lo controlla il job CI.
- Il pacchetto installabile non contiene lo script degli hooks: lì le sessioni Claude girano sul solo stream (Fase 10, `PROBLEMI_NOTI.md`).
- Gli hooks dal vivo richiedono Node ≥ 22.18 sul PATH. Senza, la Console mostra un avviso `claude-setup` e la sessione usa solo lo stream.
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/`, `release/` e `test-results/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
