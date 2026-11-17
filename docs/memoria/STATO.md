# Stato attuale

_Ultimo aggiornamento: 2026-11-17 (sotto-fase 3c unita su `main`)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: quasi chiusa.

- **3a**, shell sicura e IPC: ✅ unita su `main` (PR #23, `985130d`, ADR 0004).
- **3b**, logger e Console Errori: ✅ unita su `main` (PR #25, `2c64bf8`, ADR 0005).
- **3c**, design system in codice: ✅ unita su `main` (PR #27, `1765186`, ADR 0006), 6 check verdi compreso Verify (Windows) con i test visivi.

## Branch

`main` (ultimo merge: `1765186`, PR #27). La Fase 3 è chiusa dal punto di vista del codice; manca solo archiviare `FASE_3.md`.

## Punto di ripresa

- **Prossimo:** chiudere la Fase 3 (sintesi in `STORIA.md`, archiviare `FASE_3.md`, rivedere il goal complessivo in `PIANO.md`), poi la Fase 4.1 (bridge degli hooks, Opus 5.5 high).

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Renderer da `app://control-center/`, CSP in header e `<meta>`; `packages/ipc-contract` con 6 metodi (`app:get-info`, `shell:open-external`, e i 4 di `errors:*`). La 3c non ha aggiunto IPC.
- ✅ `packages/app-log` e Console Errori (3b), ora nel dock inferiore "Problems".
- ✅ Design system in codice (3c): token → Tailwind v4, `componenti.css` importato, componenti base, temi `system|dark|light` (preferenza in `localStorage`, `system` segue l'OS) e densità, shell a pannelli ridimensionabili con layout ricordato, barra attività, barra di stato, command palette (`Ctrl+K`, `Ctrl+Shift+P`), dialog `?`, scorciatoie con ambiti di focus (terminale, campi di testo, Live, dialog), `Ctrl+1…7`, pagina `#/components` con test visivi.
- ✅ In locale, il 2026-11-17, sulla 3c:
  - `pnpm verify` verde: 203 test (19 nuovi), 0 errori di lint;
  - `pnpm e2e`: 46 test verdi (17 nuovi in `ui.spec.ts`, di cui 12 screenshot di 6 sezioni in 2 temi);
  - `pnpm e2e:packaged`: 8 test verdi.
- ✅ Revisione impeccable (un solo contesto, senza detector né subagent): trovati e corretti 2 problemi gravi (trappola del focus nei dialog, anello di focus dell'input). Restano come osservazioni minori: nessun `aria-live` per il contatore errori, nessuna prova su schermo piccolo.
- ✅ Già da prima: `@control-center/event-schema` e `@control-center/fixtures`, hook git, gitleaks in CI, design della Fase 1.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR, merge a mano a CI verde.
- **Screenshot di riferimento** (`apps/desktop/e2e/app/ui.spec.ts-snapshots/`): sono quelli del runner `windows-latest` (artifact `playwright-results` del run 44100672540), perché i caratteri locali differivano di circa il 4% dei pixel. **In locale i 12 test visivi falliscono**: per rigenerarli o confrontarli si usa l'artifact della CI, non `--update-snapshots` locale. Le asserzioni sono `expect.soft`, così un run fallito salva tutti i candidati.
- **Font non inclusi:** Instrument Sans e Martian Mono non sono nel pacchetto (la CSP vieta Google Fonts); l'app usa i font di ripiego dei token. Vedi `PROSSIMI_PASSI.md`.
- Nessuna title bar personalizzata: cornice nativa di Windows.
- Mappatura degli stack nel pacchetto (`app.asar`) provata solo in `out/` e con test unitari, non end to end: vedi `PROBLEMI_NOTI.md`.
- "Clic su un frame → apri l'editor" della Console non c'è: serve un metodo IPC che apra file, da progettare con i controlli di percorso della Fase 4.
- gitleaks non è installato in locale: lo controlla il job CI.
- Mancano fixture reali per `Notification` e `PostToolUseFailure` (servono prima della Fase 4).
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/`, `release/` e `test-results/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
