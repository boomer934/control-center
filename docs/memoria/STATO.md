# Stato attuale

_Ultimo aggiornamento: 2026-11-17 (sotto-fase 3b completata su `feat/errors-console`, non ancora committata)_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Fase 1 — UX e design**: ✅ completata il 2026-11-14 (PR #10, #12, #14, #18). Sintesi in `STORIA.md`, voce "Chiusura Fase 1".

**Fase 2 — Schema eventi**: ✅ completata il 2026-11-14 (PR #16, #20). Sintesi in `STORIA.md`, voce "Chiusura Fase 2".

**Fase 3 — Shell sicura**: in corso.

- **3a**, shell sicura e IPC: ✅ unita su `main` (PR #23, `985130d`, ADR 0004).
- **3b**, logger e Console Errori: ✅ completata in locale (ADR 0005), da committare, aprire in PR e unire.
- **3c**, design system in codice: da fare.

## Branch

`feat/errors-console` (da `main` a `0ac5fa4`), con le modifiche **non ancora committate**. La 3c parte da `main` dopo il merge, branch proposto `feat/desktop-ui`.

## Punto di ripresa

- **Subito:** `pnpm verify` è verde, quindi committare la 3b (`feat(desktop): phase 3b …`), aprire la PR e unirla a mano a CI verde.
- **Poi:** la 3c (Sonnet 5.5, effort medium), con il goal di `FASE_3.md`.
- **Per la 3c:**
  - la shell attuale (`App.tsx`) ha un layout provvisorio con barra di stato e pannello Errori: la 3c lo sostituisce con pannelli, barra attività e palette, e porta dentro il contatore e la Console;
  - la Console usa solo token, ma in `shell.css`; da riportare nei componenti del design system;
  - la Console interroga `errors:list` ogni secondo: se la Fase 4 introduce un flusso eventi, decidere lì un canale push (nuova classe di IPC, da rivedere).

## Cosa funziona

- ✅ `apps/desktop` (electron-vite, Electron 45.3.3, React 19): `pnpm dev`, `pnpm build`, `pnpm e2e`, `pnpm e2e:packaged`.
- ✅ Renderer da `app://control-center/`, CSP in header e `<meta>`; `packages/ipc-contract` con 6 metodi (`app:get-info`, `shell:open-external`, e i 4 di `errors:*`).
- ✅ `packages/app-log`: logger JSONL ruotato con redazione, parser degli stack, raggruppamento, report. Logger e Console Errori collegati: errori del main, del renderer (`onerror`, `unhandledrejection`, Error Boundary), dei processi figli (`superviseChild`) e del gate IPC.
- ✅ Gli stack mostrano file e riga del sorgente TypeScript (riga esatta verificata dai test E2E, anche per il processo figlio). Source map incluse nel pacchetto.
- ✅ Checklist Electron di `SICUREZZA.md` tutta spuntata; sezione "Errori e log" aggiunta con i suoi test.
- ✅ In locale, il 2026-11-17, sulla 3b:
  - `pnpm verify` verde: 184 test, 0 errori di lint, 136 warning del plugin security;
  - `pnpm e2e` (build `--mode e2e`): 29 test verdi, di cui 10 sulla Console Errori;
  - `pnpm e2e:packaged`: 8 test verdi (Fuses, nessun fault injector, source map nel pacchetto).
- ✅ CI su GitHub: ultima verifica sulla 3a (corsa 44087946083). **La 3b non è ancora passata dalla CI**: in particolare il processo figlio dell'E2E esegue un `.ts` con Node (type stripping, Node 24 in CI) e va controllato lì.
- ✅ Già da prima: `@control-center/event-schema` e `@control-center/fixtures`, hook git, gitleaks in CI, design della Fase 1.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per le repo private con il piano gratuito di GitHub. Si lavora solo su branch + PR, merge a mano a CI verde.
- Mappatura degli stack nel pacchetto (`app.asar`) provata solo in `out/` e con test unitari, non end to end: vedi `PROBLEMI_NOTI.md`.
- "Clic su un frame → apri l'editor" della Console non c'è: serve un metodo IPC che apra file, da progettare con i controlli di percorso della Fase 4.
- gitleaks non è installato in locale: lo controlla il job CI.
- Mancano fixture reali per `Notification` e `PostToolUseFailure` (servono prima della Fase 4).
- Il prototipo 1d legge ancora le fixture grezze: in CI i suoi test Playwright si saltano.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
- Le cartelle `node_modules`, `out/` e `release/` sono escluse dalla lettura nei permessi di Claude: le build si verificano con i test.
