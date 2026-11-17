# Stato attuale

_Ultimo aggiornamento: 2026-11-17 (4.2 workspace e terminale unita su `main` con la PR #40; `pnpm verify` verde, 256 test; crediti Codex finiti)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: ✅ completata il 2026-11-17 (PR #23, #25, #27). Sintesi in `STORIA.md`, voce "Chiusura Fase 3".

**Fase 4 — Prima versione usabile**: in corso. Il brief è in [`FASE_4.md`](FASE_4.md), con le sotto-fasi 4.0 (canale push, da `CORSIE.md`), 4.1 (bridge e sessione), 4.2 (workspace e terminale) e 4.3 (chat e permessi).

- **4.0**, canale push nel contratto IPC: ✅ unita su `main` (PR #35, `4c2ef5c`, ADR 0007).
- **4.2**, workspace e terminale: ✅ unita su `main` (PR #40, `4b928ab`, ADR 0008), CI verde dopo la correzione del test dei percorsi. `/code-review high` di Claude: 9 punti minori, in `PROSSIMI_PASSI.md`.
- **4.1** (hooks bridge, Claude) e **4.3** (chat e permessi, Codex) restano da fare.

- **3a**, shell sicura e IPC: ✅ unita su `main` (PR #23, `985130d`, ADR 0004).
- **3b**, logger e Console Errori: ✅ unita su `main` (PR #25, `2c64bf8`, ADR 0005).
- **3c**, design system in codice: ✅ unita su `main` (PR #27, `1765186`, ADR 0006), 6 check verdi compreso Verify (Windows) con i test visivi.

## Branch

Claude: nessun branch di lavoro aperto (solo memoria su `docs/memoria-4-2-merge`). Codex: `feat/workspace-terminal` è unito (PR #40); il worktree `..control-center-codex` va riportato su `main` prima della 4.3. `main` include la ripartizione in corsie (PR #33), la 4.0 (PR #35, #36, #37), la fixture `Notification` (PR #38) e la 4.2 (PR #40, `4b928ab`).

## Punto di ripresa

Dal 2026-11-17 il lavoro va su due corsie parallele, Claude e Codex (ripartizione in [`CORSIE.md`](CORSIE.md)). Ogni agente modifica solo la propria sezione.

### Corsia Claude

- **Fatto:** PR #30 (brief della Fase 4), #31 (`sessione-06`) e #32 (plugin di progetto) unite.
- **Fatto (fixture `Notification`, PR #38):** `sessione-07` registrata di nuovo il 2026-11-17 e ripulita (12 righe di hooks, nessuno stream): un `Read`, un permesso approvato dopo l'attesa (`Notification` con `notification_type: permission_prompt`) e un rifiuto fatto da una persona. Il blocco della 4.1 è tolto. Due lezioni: `npx --version` e `git log -1` sono di sola lettura e Claude Code non chiede il permesso, quindi non nasce `Notification` (serve un comando che scrive, per esempio `Set-Content`); e `VERNIER_HOOKS_SESSION` va impostata nella stessa finestra PowerShell che lancia `claude`, altrimenti gli hooks finiscono in `unnamed.hooks.jsonl`. Un permesso rifiutato a mano lascia solo `PreToolUse`: `mergeClaudeSession` chiude le chiamate rimaste aperte a fine sessione come `tool.failed` con motivo `interrupted` (è un'inferenza: nel live della 4.1 il rifiuto va letto da un altro segnale). Unita su `main` con la PR #38 (`d6d08da`).
- **Fatto (4.0):** canale push main → renderer nel contratto (ADR 0007), unito su `main` con la PR #35 (`4c2ef5c`). Eventi `event('ns:nome', schema)` accanto ai metodi; `createEventEmitter` nel main (solo eventi del contratto, payload validato, solo finestre fidate); `window.api.<ns>.onX(listener)` nel preload (un listener `ipcRenderer` per canale, payload rivalidato, mai l'`IpcRendererEvent`). Primo evento `errors:changed`: la Console Errori non interroga più ogni secondo. `/code-review high`: 5 punti trovati e corretti (ciclo di segnalazione da un iscritto che lancia, `targets()` fuori dal `try`, iscritto orfano, test del raggruppamento, E2E con attesa fissa).
- **Fatto (4.2, revisione e CI):** il test dei percorsi su Windows cadeva nel runner perché `tmpdir()` è un percorso corto 8.3 (`RUNNER~1`): corretto nel test con `realpath` (commit `7264c75`, modulo invariato). `/code-review high` sulla PR #40: 9 punti minori, nessuno bloccante.
- **Ora:** nessun task aperto; PR della sola memoria (`docs/memoria-4-2-merge`).
- **Poi:** 4.1 hooks bridge (`feat/hooks-bridge`, Opus 5.5, high), sbloccata: parte subito; poi 5a.

### Corsia Codex

- **Fatto (2026-11-17):** implementazione 4.2 su `feat/workspace-terminal` (ADR 0008). Dialog nativo, recenti e `Ctrl+P`, layout per workspace, apertura dei file verificati in Notepad, terminali a schede PowerShell e Git Bash con output push. Le schede restano attive durante i cambi di workspace.
- **Verificato in locale:** `pnpm verify` verde, 51 E2E funzionali, 9 E2E del pacchetto con il prebuild di node-pty. Rivisti selettore e terminale a 960×600 nei due temi, rilevatore impeccable senza rilievi. Gli screenshot di regressione dei componenti vengono verificati in CI.
- **Fatto:** 4.2 unita (PR #40). La build del pacchetto ricompila node-pty per Electron; per il pacchetto di prova locale si può usare il prebuild perché nell'installazione MSVC locale manca il componente Spectre.
- **Ora:** nessun task. Crediti Codex finiti il 2026-11-17: riprendere quando tornano.
- **Poi:** 4.3 (dopo la 4.1; 4.0 e 4.2 sono già su `main`), poi 4b.

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Renderer da `app://control-center/`, CSP in header e `<meta>`; `packages/ipc-contract` con 6 metodi (`app:get-info`, `shell:open-external`, e i 4 di `errors:*`) e 1 evento push (`errors:changed`, dalla 4.0).
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
- La fixture reale di `Notification` c'è (`sessione-07`, su `main`); `PostToolUseFailure` è in `sessione-06`, già su `main`. La 4.1 non è più bloccata.
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/`, `release/` e `test-results/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
