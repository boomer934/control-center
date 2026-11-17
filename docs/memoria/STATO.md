# Stato attuale

_Ultimo aggiornamento: 2026-11-17 (4.0 canale push pronto per la PR)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: ✅ completata il 2026-11-17 (PR #23, #25, #27). Sintesi in `STORIA.md`, voce "Chiusura Fase 3".

**Fase 4 — Prima versione usabile**: in corso. Il brief è in [`FASE_4.md`](FASE_4.md), con le sotto-fasi 4.0 (canale push, da `CORSIE.md`), 4.1 (bridge e sessione), 4.2 (workspace e terminale) e 4.3 (chat e permessi).

- **4.0**, canale push nel contratto IPC: fatta sul branch `feat/ipc-push-channel` (`b0f0b0f`, ADR 0007), PR da aprire.

- **3a**, shell sicura e IPC: ✅ unita su `main` (PR #23, `985130d`, ADR 0004).
- **3b**, logger e Console Errori: ✅ unita su `main` (PR #25, `2c64bf8`, ADR 0005).
- **3c**, design system in codice: ✅ unita su `main` (PR #27, `1765186`, ADR 0006), 6 check verdi compreso Verify (Windows) con i test visivi.

## Branch

Claude: `feat/ipc-push-channel` (4.0, un commit sopra `main` `7cc14e1`). Codex: `feat/workspace-terminal`. `main` include la ripartizione in corsie (PR #33).

## Punto di ripresa

Dal 2026-11-17 il lavoro va su due corsie parallele, Claude e Codex (ripartizione in [`CORSIE.md`](CORSIE.md)). Ogni agente modifica solo la propria sezione.

### Corsia Claude

- **Fatto:** PR #30 (brief della Fase 4), #31 (`sessione-06`) e #32 (plugin di progetto) unite.
- **Bloccante, serve l'utente:** la `sessione-07` registrata il 2026-11-17 **non contiene `Notification`**. Controllo fatto con uno script, perché `raw/` non è leggibile da Claude: 10 righe di hooks (`SessionStart`, `UserPromptSubmit`×2, `PreToolUse`×2, `PostToolUse`×2, `Stop`×2, `SessionEnd`) e nessuna `Notification`; entrambi i `PowerShell` hanno un `PostToolUse`, quindi sono stati approvati. Va ripetuta come da `scripts/fixtures/README.md` (passi 6-11), controllando con `/hooks` che `Notification` sia caricato nel progetto di prova. Fino ad allora la 4.1 non parte. `sessione-07` non è stata ripulita né committata.
- **Fatto (4.0):** canale push main → renderer nel contratto (ADR 0007), branch `feat/ipc-push-channel`, commit `b0f0b0f`. Eventi `event('ns:nome', schema)` accanto ai metodi; `createEventEmitter` nel main (solo eventi del contratto, payload validato, solo finestre fidate); `window.api.<ns>.onX(listener)` nel preload (un listener `ipcRenderer` per canale, payload rivalidato, mai l'`IpcRendererEvent`). Primo evento `errors:changed`: la Console Errori non interroga più ogni secondo. `/code-review high`: 5 punti trovati e corretti (ciclo di segnalazione da un iscritto che lancia, `targets()` fuori dal `try`, iscritto orfano, test del raggruppamento, E2E con attesa fissa).
- **Ora:** aprire la PR di `feat/ipc-push-channel`; il merge lo fa l'utente a CI verde. Dopo il merge Codex può fare il terminale della 4.2 (output del pty come evento nuovo, con raggruppamento nel main).
- **Poi:** 4.1 hooks bridge (`feat/hooks-bridge`, Opus 5.5, high) appena `Notification` è catturato; poi 5a.

### Corsia Codex

- **Ora:** 4.2 workspace e terminale (`gpt-6.1-sol`, high), branch `feat/workspace-terminal`, nel worktree `..\control-center-codex`. Prima workspace e modulo dei percorsi; il terminale dopo il merge della 4.0.
- **Poi:** 4.3 (dopo 4.0, 4.1 e 4.2 unite), poi 4b.

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Renderer da `app://control-center/`, CSP in header e `<meta>`; `packages/ipc-contract` con 6 metodi (`app:get-info`, `shell:open-external`, e i 4 di `errors:*`) e, sul branch della 4.0, 1 evento push (`errors:changed`).
- ✅ Sul branch della 4.0, il 2026-11-17: `pnpm verify` verde (237 test, 0 errori di lint); `pnpm e2e` 46 verdi su 48, i 2 rossi sono i test visivi che in locale falliscono sempre per i font (vedi sotto). `pnpm e2e:packaged` non rieseguito.
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
- **Bloccante per la 4.1:** manca la fixture reale di `Notification`, che richiede una sessione interattiva dell'utente (la prima prova, `sessione-07`, non l'ha catturata). `PostToolUseFailure` è in `sessione-06`, già su `main`.
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/`, `release/` e `test-results/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
