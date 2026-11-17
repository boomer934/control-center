# Storia del progetto

Diario delle sessioni, con la voce più recente in alto. Ogni voce: cosa è stato fatto, decisioni prese, problemi incontrati.

---

## 2026-11-17 — Fase 3c: design system in codice e interfaccia di base (PR #27, `1765186`)

**Fatto**

- Tailwind v4 come ponte dei token (`@theme inline`, niente preflight); `componenti.css` della 1c importato com'è; componenti React in `ui/primitives.tsx` (Button, Kbd, Tag, StateTag, Sigil, Switch, Check, TextInput, Field…) e sprite delle icone generato da `shell.js`.
- Shell a pannelli (`react-resizable-panels`, layout ricordato), barra attività con link `#/…`, barra di stato del design system, dock destro e dock inferiore (Problems = Console Errori), temi `system|dark|light` e densità.
- Command palette (`cmdk`, `Ctrl+K` e `Ctrl+Shift+P`), dialog `?` con tutte le scorciatoie, motore di scorciatoie puro con ambiti di focus (terminale, campi, Live, dialog), `Ctrl+1…7`.
- Pagina componenti (`#/components`, dalla palette) e test visivi con screenshot di riferimento in `ui.spec.ts-snapshots/` (6 sezioni × 2 temi).
- Test: 19 unitari nuovi (scorciatoie, tema), 17 E2E nuovi; `pnpm verify` verde (203 test), `pnpm e2e` 46 test verdi, `e2e:packaged` 8 verdi.

**Decisioni**

- ADR 0006: `react-resizable-panels` e `cmdk` (devDependencies del renderer); componenti.css non copiato; font non ancora inclusi nel pacchetto.
- Revisione impeccable in un solo contesto (nessun subagent, per la regola sul consumo): due problemi gravi trovati e corretti, cioè i dialog `aria-modal` senza trappola del focus (ora `useModalInert`) e l'`input` reale senza anello di focus (`.input:focus-within`). Aggiunti test per entrambi.

**Problemi**

- Gli screenshot generati in locale non coincidevano con `windows-latest` (1375 pixel, 4%): primo run CI rosso sui soli 2 test visivi. Rimedio: asserzioni `expect.soft` per far salvare alla CI tutti i 12 candidati, scaricati dall'artifact e committati come riferimento. In locale i test visivi ora falliscono (font diversi).
- La title bar personalizzata non c'è: la finestra usa la cornice nativa (la finestra senza cornice richiede lavoro nel main, da fare con la sicurezza della 3a in mente).

---

## 2026-11-17 — Fase 3b: logger, cattura errori e Console Errori (PR #25, `2c64bf8`)

**Fatto** (branch `feat/errors-console`, commit `faac590`)

- `packages/app-log`: logger JSONL ruotato (1 MiB × 5 file in `<userData>/logs`), parser degli stack V8 con frame `project`/`dependency`/`internal`, `ErrorStore` con raggruppamento e contatore, testo di "copia report". Tutto passa da `makeTextCleaner`/`redactSecrets`.
- Main: cattura di `uncaughtException`/`unhandledRejection`, `render-process-gone`/`child-process-gone`, errori del gate IPC (al posto di `console.warn`) e `superviseChild` per stderr e uscite dei processi figli. `stack-mapper.ts` riscrive i frame di `out/` con le source map.
- IPC: namespace `errors` con `list`, `reportRenderer`, `copyReport`, `clear`. Renderer: `window.onerror`, `unhandledrejection`, Error Boundary, barra di stato con contatore e pannello Console (frame del progetto in evidenza, dipendenze collassate, copia report, svuota).
- Test: 13 unit su `app-log`, 5 sul mapper, 1 sul contratto; `errors.spec.ts` (10 E2E: main, renderer, figlio, righe esatte dei sorgenti, segreti, log, appunti) e `build.spec.ts` sul pacchetto. `verify` 184 test; E2E app 29/29; packaged 8/8.

**Decisioni:** ADR 0005. Logger scritto in casa invece di pino; niente canale push (la Console interroga ogni secondo); fault injector solo con `--mode e2e` (alias di build nel main, `define` nel renderer); source map incluse nel pacchetto.

**Problemi:** `process.setSourceMapsEnabled` non rimappa lo stack nel main di Electron; lo stderr dei figli ha `
` e codici ANSI (Playwright forza i colori); il test dell'asar manomesso usava il vecchio prefisso `[ipc] `; `sourcesContent` delle mappe contiene anche codice eliminato dal bundle. Vedi `PROBLEMI_NOTI.md`.

---

## 2026-11-17 — Merge della sotto-fase 3a

**Fatto:** PR #23 unita su `main` (`985130d`, squash) con tutti i check verdi: Verify su Windows (compresi gli E2E `_electron` e i Fuses del pacchetto), gitleaks, commitlint, memoria.

**Decisioni:** nessun auto-merge di GitHub: senza protezione di `main` non è garantito che aspetti i check. Il merge si fa a mano dopo aver letto i check.

**Problemi:** nessuno.

---

## 2026-11-17 — Fase 3a: shell Electron sicura e IPC

**Fatto** (branch `feat/desktop-shell`)

- `apps/desktop` con electron-vite, Electron 45.3.3 e React 19. Il renderer di produzione è servito da `app://control-center/` con CSP sia in header sia in `<meta>`.
- `packages/ipc-contract`: metodi zod `.strict()`, gate nel main (mittente → richiesta → handler → risposta, con envelope) e `window.api` generato e congelato. ESLint vieta l'IPC grezzo fuori dai due file ponte.
- Hardening: `secureWebPreferences`, `app.enableSandbox()`, navigazione e nuove finestre bloccate, link `https:` al browser di sistema, permessi web negati, istanza singola.
- Fuses tramite `electronFuses` di electron-builder.
- Test: 165 unitari; 19 E2E `_electron` (sicurezza e modalità sviluppo); 6 sul pacchetto (fuse wire, `ELECTRON_RUN_AS_NODE`, `--inspect`, `NODE_OPTIONS`, ASAR manomesso con prova di controllo).
- In CI: `scripts/check-electron-support.mjs`, `pnpm e2e` ed `e2e:packaged` nel job Windows. Checklist Electron di `SICUREZZA.md` tutta spuntata.
- Dipendenze solo di sviluppo e build: `@electron/fuses`, `@playwright/test` (nel pacchetto desktop), `vite`, `@vitejs/plugin-react`.

**Decisioni:** ADR 0004. Le dipendenze dell'app sono tutte `devDependencies` messe in bundle, quindi il pacchetto non ha `node_modules`. Gli E2E girano sulla build non impacchettata, perché il fuse dell'inspector impedisce a Playwright di collegarsi al pacchetto.

**Problemi:** dentro `page.evaluate` DevTools permette `eval` (le prove CSP girano in un timer). `electron-vite dev --rendererOnly` avvia comunque Electron, quindi il test di sviluppo usa `createServer` di Vite. `getLastWebPreferences` manca nei tipi di Electron 45. electron-builder non legge `electron-builder.config.ts` senza `--config`. `@peculiar/utils` usa `tslib` senza dichiararlo. Il test ha scoperto che una cartella passava come asset di `app://`: corretto. In CI il test dei permessi falliva perché il runner non ha camera né microfono (`NotFoundError`): ora Electron parte con dispositivi finti. Dopo la correzione E2E e Fuses sono verdi su GitHub (PR #23).

---

## 2026-11-14 — Revisione di modelli ed effort per il consumo di token

**Fatto:** rivista la tabella "Modello, effort, ultracode e goal" di `PIANO.md` per le Fasi 3-10, dopo un forte aumento dell'uso di token. Aggiornati di conseguenza `FASE_3.md` e `STATO.md`.

**Decisioni**

- Sonnet 5.5 è il modello di default. Opus 5.5 resta solo per sicurezza e architettura nuova: 3a, 4.1 (bridge), 5a, 5b, il bridge della Fase 7 e l'audit della Fase 10.
- `high` è il tetto normale dell'effort; `xhigh` e `max` solo per un problema bloccato.
- Niente ultracode nelle Fasi 5 e 6.
- La Fase 4 è divisa in tre sotto-goal (4.1 bridge e sessione, 4.2 workspace e terminale, 4.3 chat e permessi).
- `/code-review` `medium` di default, `high` solo sulle PR di sicurezza.
- Regole di risparmio: una sessione per sotto-goal, verifiche a testo prima degli screenshot, a inizio sessione si leggono solo `STATO.md` e `FASE_<n>.md`, il lavoro meccanico va a OmniRoute.

**Problemi:** le cause dell'aumento erano Opus usato quasi ovunque, `xhigh` su fasi intere dentro i loop `/goal`, un goal unico per la Fase 4, l'ultracode previsto e le verifiche fatte con molti screenshot (55 nella 1c).

---

## 2026-11-14 — Chiusura Fase 2

**Fatto**

- PR #20 unita su `main` (`689ce2c`, squash) con i check verdi: verify su Windows (110 test, `sanitize.mjs --check` pulito su 11 file), gitleaks su tutta la cronologia, commitlint, controllo memoria.
- Fase 2 completa: 5 sessioni reali registrate (PR #16) e ripulite, `AgentEvent` con 16 tipi, normalizzatori per stream, hooks e Ollama, merge e pulizia controllata in CI (PR #20, ADR 0003).
- Preparata la Fase 3 senza iniziarla: brief `FASE_3.md` con le sotto-fasi 3a (shell e IPC), 3b (Console Errori) e 3c (design system in codice), ciascuna con branch proposto e goal.

**Decisioni:** la Fase 3 si fa a tre sotto-goal, come prevede `PIANO.md` per le fasi lunghe; il goal complessivo resta e ne è l'unione. Il facoltativo `Notification` passa a "prima della F4", dove servono le richieste di permesso.

**Problemi:** restano le fixture reali mancanti per `Notification` e `PostToolUseFailure`.

---

## 2026-11-14 — Fase 2: schema AgentEvent, normalizzatori e fixture ripulite

**Fatto** (branch `feat/event-schema`, `eddb07f`, `b9b7f8e`)

- `AgentEvent` in zod: 16 tipi stretti con envelope comune, percorsi relativi al workspace, `redactSecrets` e `makeTextCleaner` su ogni testo.
- Normalizzatori puri per stream-json, hooks e Ollama `/api/chat`, più `mergeClaudeSession`, che prende il contenuto dallo stream e i tempi dagli hooks.
- `scripts/fixtures/sanitize.mjs`:
  - pulizia ad allowlist: i contenuti dei file diventano righe `<redacted>` e i conteggi restano;
  - `--check`: nel grezzo trova più di mille problemi, nel ripulito zero;
  - gira in CI e in Vitest.
- 5 sessioni ripulite in `packages/fixtures/sanitized/`, rilette a mano: dall'`init` sono stati tolti i tool e i server MCP dell'account. 110 test verdi in `pnpm verify`.

**Decisioni:** ADR 0003. `schemaVersion` resta 1 perché nessun evento è ancora salvato. I test che leggono file stanno in `packages/fixtures`, così `event-schema` resta senza tipi Node. Un `Read` di un file mancante e un comando con test falliti diventano `tool.failed` (`not-found`, `tests-failing`).

**Problemi:** il test ha trovato un ordine sbagliato delle sostituzioni (un nome host che contiene il nome utente restava a metà), corretto ordinando dalla più lunga. Mancano fixture reali di `Notification` e `PostToolUseFailure`. gitleaks non è installato in locale.

---

## 2026-11-14 — Chiusura Fase 1

**Fatto**

- PR #18 (1d) unita su `main` (`dbaf4d4`, squash) con i 6 check verdi; insieme le regole `permissions.deny` di `.claude/settings.json`.
- Fase 1 completa: ricerca UX (PR #10), direzione `precisione fluida` (PR #12), design system e 18 schermate (PR #14), prototipo Live sulle fixture reali (PR #18). Decisioni chiuse: direzione `precisione fluida`, densità `compact`, nome **Vernier** con ripiego su Control Center, notifiche di Windows che non approvano mai.
- `FASE_1.md` archiviato qui: i vincoli (stati, accessibilità AA, 500 nodi a 60 fps, lingue) sono in `DESIGN.md`; la procedura di registrazione delle fixture è passata in `scripts/fixtures/README.md`; i controlli sul nome Vernier per la F10 in `PROSSIMI_PASSI.md`.

**Decisioni:** il merge si fa a mano a CI verde, perché l'auto-merge di GitHub non è disponibile su questa repo.

**Problemi:** CodeRabbit non ha revisionato la PR #18 (limite del piano gratuito).

---

## 2026-11-14 — Fase 1d: prototipo in codice della Vista Live

**Fatto** (branch `feat/live-prototype`)

- `design/prototipo-live/`: pacchetto del workspace solo per sviluppo (Vite, React 19, React Flow 12, elkjs) che riproduce le 5 fixture reali con mappa a contenitori (ELK), chip degli agenti agganciate ai nodi, timeline con corsie, forcella del subagent e scrubber, colonna `Agents`. Usa `tokens.css`, `componenti.css` e lo sprite di `shell.js` della 1c.
- Normalizzatore `stream-json + hooks → Replay` e `viewAt(replay, t)` puri, con 13 test unitari su una registrazione sintetica.
- 11 test Playwright: screenshot di reading, writing, running, error (×2), waiting, done (scuro e chiaro), più scrubbing, `Space` e movimento ridotto. Console pulita.
- Revisione impeccable: nessun grave, 16/20 (`design/prototipo-live/REVISIONE.md`).

**Decisioni:** le fixture grezze si normalizzano al volo nel dev server e non si scrive nulla di derivato; i test Playwright girano solo in locale. Un op resta attivo almeno 900 ms per essere visibile a 1×; il permesso negato da `claude -p` è mostrato come attesa simulata di 6 s, segnalata. Dipendenze solo di sviluppo e dentro il prototipo: nessuna ADR.

**Problemi:** React Flow non misura i nodi controllati senza `onNodesChange` (risolto passando le misure di ELK); Playwright 1.65 vuole un Chromium più nuovo di quello installato. Entrambi in `PROBLEMI_NOTI.md`. Un test ha trovato che l'etichetta d'errore troncata perdeva il motivo: ora il motivo resta sempre.

---

## 2026-11-14 — F2 anticipata: registrazione delle prime 5 fixture

**Fatto** (branch `feat/fixtures-recording`)

- `scripts/fixtures/capture-hook.mjs`: hook che salva ogni payload in `packages/fixtures/raw/<sessione>.hooks.jsonl`; nome di sessione validato, link simbolici rifiutati, esce sempre 0.
- `scripts/fixtures/check-raw.mjs`: valida le righe JSON e la copertura delle registrazioni.
- Progetto di prova `vernier-fixture-lab` fuori dalla repo, con hooks e permessi solo in `.claude/settings.local.json` (nessuna modifica a `~/.claude`).
- 5 sessioni registrate con Sonnet: rinomina su più file, test rotto e corretto, subagent, permesso negato (`npx tsc`), file mancante.

**Decisioni:** il progetto di prova è in JS con `node --test` invece che TS, per non installare dipendenze; il payload degli hooks è avvolto in `{capturedAt, payload}` perché gli hooks non hanno un orario.

**Problemi:** su Windows Claude ha usato il tool `PowerShell` per il comando negato, non `Bash`: lo schema della F2 deve trattarli entrambi come shell. In `-p` non c'è la richiesta interattiva di permesso, quindi manca l'evento `Notification`. Prima del push ho tolto dalla memoria il percorso personale del progetto di prova (vietato dal modello di PR).

**Merge:** PR #16 unita su `main` il 2026-11-14 (`e111c0a`), con i 6 check verdi. CodeRabbit non ha revisionato: limite del piano gratuito raggiunto.

---

## 2026-11-14 — Fase 1c (seconda parte): schermate P1, screenshot e revisione impeccable

**Fatto** (branch `feat/design-1c`, commit da `55c5e54` in poi)

- Le **9 schermate P1** con tutti gli stati: onboarding, replay, infra, local-agents, mcp-skills, settings, terminal, workspace, notifiche.
- `design/sistema/README.md` con le P1 e 55 screenshot WebP in `design/sistema/screenshot/`.
- **Revisione impeccable** (audit):
  - rilevatore su tutte le pagine: 0 errori;
  - scansione del contrasto su ogni pagina × stato × tema, anche del testo attenuato;
  - unico grave: il sigillo `CL` sul fondo dell'attesa (1,45:1 nel tema scuro, 2,85:1 nel chiaro), corretto con `.perm-h .sig { color: var(--on-waiting) }`;
  - rigenerato `componenti-dark.webp`, ora a pagina intera.

**Decisioni** (dell'utente, prese in anticipo per non bloccare la sessione)

- Nome **Vernier**, con ripiego su Control Center dove le collisioni creano problemi.
- La notifica di Windows non approva mai un permesso.
- I gravi della revisione si correggono subito se non toccano scelte di design.

**Problemi:** nessuno. Gli avvisi del rilevatore (11 px, Instrument Sans, barra indeterminata, righe di `reading`) sono scelte del design system.

**Merge:** PR #14 unita su `main` il 2026-11-14 (`93a8677`), con i 6 check verdi. CodeRabbit (piano gratuito) ha lasciato solo il riepilogo, senza osservazioni.

---

## 2026-11-14 — Fase 1c (prima parte): token, componenti e schermate P0

**Fatto** (branch `feat/design-1c`, commit da `2f76dc2` a `05ec3f8`, solo in locale)

- `design/tokens.json` in formato DTCG e `scripts/build-tokens.mjs`, che genera `design/sistema/tokens.css` e ha l'opzione `--check`.
- `componenti.css`, che usa solo token, e `shell.js`, il guscio comune con icone e parametri URL.
- `componenti.html` con tutti i componenti e i loro stati.
- Le **9 schermate P0** in `design/sistema/schermate/`, con 49 stati in totale. Sono generate da dati JS e controllate con playwright-core e Chromium 1248: nessun errore di console e nessun testo sotto 11 px.
- `design/sistema/README.md` con l'elenco delle pagine e la verifica dei flussi F1-F7.
- ESLint ha ora i globals del browser per `design/**/*.js`.

**Decisioni**

- Chiusi i minori: running va verso il verde-giallo, locale verso il ciano, reading un po' più blu (valori in `DESIGN.md`); l'errore in timeline porta il bersaglio; la timeline `normal` ha Read ×4 + Grep ×2.
- Nuovi token: scala di spaziatura e cicli.
- Gli scheletri restano fermi, senza shimmer.
- Le schermate P0 riusano il guscio della Live con varianti (dock, overlay, area centrale).
- Verifica di **Vernier**:
  - marchi `VERNIER…` di Vernier Software & Technology in classe 9;
  - il pacchetto npm `vernier` esiste già (giugno 2026) ed è un tool di feedback UI per agenti AI;
  - `vernier.com` e `vernier.dev` sono in uso.

  La decisione spetta all'utente.

**Problemi**

- La generazione di file molto grandi in un colpo solo si è bloccata. Ora i file si scrivono a pezzi.
- Non ho controllato il WHOIS dei domini, solo il DNS.

## 2026-11-14 — Fase 1b: scelta della direzione, `precisione fluida`

**Fatto**

- Nuova cartella `design/direzioni/precisione-fluida/` con `live.html`, `README.md` e 4 screenshot. È la sintesi scelta, ottenuta da una copia di `precisione` con:
  - uno strato CSS in coda;
  - collegamenti e timeline arrotondati nello script;
  - gli innesti: sigle di canale e telemetria da `sala-controllo`, legenda e titolo display del dialog da `carta-inchiostro`.
- Applicate nel mockup le correzioni trasversali della revisione: minimo 11 px, mono condensato solo in mappa, `Approve` a contorno, corsie della timeline che si alzano per le chiamate parallele, Fit vero.
- Nessun errore di console in 7 combinazioni (Chromium headless).
- Aggiornati `CONFRONTO.md` (decisione), `DESIGN.md`, `FASE_1.md` (1b ✅), `STATO.md` e `PROSSIMI_PASSI.md`.
- PR #12 revisionata dall'utente e unita su `main` con squash, CI verde (6/6).

**Decisioni** (con l'utente)

- Direzione: `precisione` con gli innesti raccomandati, **più fluida e con meno spigoli**. Grado "morbido": raggi 4 / 6 / 10 px più le pillole, nessun raggio oltre 10 px.
- Densità predefinita `compact`; nome candidato per la 1c: **Vernier**.
- L'attesa respira (1.6 s) invece di lampeggiare a scatti; resta l'unico impulso continuo.

**Problemi**

- Nessuno aperto. Nello scenario dense la colonna Agents non conteneva tutto: ora le card scorrono tra la telemetria e i file modificati, e sfumano quando non entrano.

---

## 2026-11-14 — Cambio di piano: via Figma, regole sui subagent

**Decisioni** (con l'utente)

- **Figma tolto dal piano.** Con il server MCP ogni schermata richiede molte chiamate e screenshot per verificare il risultato, e poi va ricostruita in codice. Qui non c'è un designer che lavora a mano, le direzioni della 1b sono già HTML e il movimento si valuta solo nel prototipo in codice della 1d. La 1c diventa: `design/tokens.json`, token CSS, pagina componenti e schermate P0 e P1 in HTML statico in `design/sistema/`, screenshot e revisione impeccable. Niente prototipo cliccabile: i flussi si verificano sulla sequenza delle schermate. Aggiornati `PIANO.md`, `FASE_1.md`, `STATO.md`, `PROSSIMI_PASSI.md`, `DESIGN.md`, `CLAUDE.md`, la skill `inizio-sessione` e i rimandi in `design/`.
- **Subagent solo se necessari** (regola globale in `~/.claude/CLAUDE.md`, backup fatto): si lanciano solo se sono necessari, migliorano il lavoro e fanno risparmiare token sull'intero task; mai Opus, solo haiku o sonnet; niente `fork`.

---

## 2026-11-14 — Fase 1b: tre direzioni estetiche, revisione e confronto

**Fatto**

- 13/11 (`ad5192a`): `design/direzioni/BRIEF.md` e tre direzioni con workflow ultracode: `precisione`, `sala-controllo` e `carta-inchiostro`, ciascuna con `live.html` e `README.md`. La revisione si era interrotta al limite delle 5 ore.
- 14/11 (`a03783f`), senza ultracode:
  - revisione impeccable con un solo subagent → `REVISIONE.md`: un grave (controlli finestra di `sala-controllo`), corretto;
  - 12 screenshot senza errori di console;
  - `CONFRONTO.md` con raccomandazione e domande all'utente.
- `DESIGN.md` e `FASE_1.md` aggiornati. `pnpm verify` verde. Branch pushato e PR aperta.

**Decisioni**

- Con l'utente: `reading` fa un solo impulso per evento. L'unico impulso continuo è il segmento d'attesa nella barra di stato, non il blocco in timeline (risolta la contraddizione del BRIEF).
- I problemi medi e minori non si correggono nei mockup: diventano regole dei token della 1c, tra cui il minimo di 11 px e le corsie della timeline che si allargano.
- Raccomandazione, da confermare: `precisione` con innesti dalle altre due, densità `compact`.

**Problemi**

- Il server MCP Playwright non funziona ancora. Gli screenshot si fanno con `playwright-core` dalla cache npx e Chromium 1248 (`PROBLEMI_NOTI.md`).

---

## 2026-11-13 — Fase 1a: ricerca UX e architettura dell'informazione

**Fatto**

- Su `feat/design-1a`, in `design/ricerca/`:
  - `persona.md`: Dev quotidiano, Di passaggio, anti-persona, 6 scenari;
  - `domande-chiave.md`: punto dello schermo, stati e dati per ognuna delle 5 domande; test dei 2 secondi;
  - `architettura.md`: finestra, sezioni, dock, layout della Live, barra di stato a priorità, palette con prefissi, scorciatoie per ambito, notifiche, flussi F1-F7 e S1-S5;
  - `schermate.md`: schermate × 6 stati con priorità P0/P1/P2, casi d'errore, onboarding in 3 passi.
- `DESIGN.md` con il riassunto e l'architettura aggiornata; `GLOSSARIO.md` con 5 nuovi termini; `FASE_1.md` con la 1a segnata ✅. `pnpm verify` verde.
- PR #10 revisionata dall'utente e unita su `main` con squash, con la CI verde. Una PR successiva ha allineato STATO e PROSSIMI_PASSI al merge.

**Decisioni**

- Per la 5ª domanda vale la versione di `DESIGN.md` ("…e quanto in locale"), non quella di `PIANO.md` §4.1.
- Proposta, da confermare in 1b: densità compatta "da IDE" di default, con l'opzione `Comfortable`.
- Il dialog dei permessi vive nel dock Session, non è modale sull'app; `Enter` da solo non approva e `Esc` non rifiuta.
- `PROSSIMI_PASSI.md` tiene le voci fatte segnate con ✅ fino alla chiusura della fase, su richiesta dell'utente.

**Problemi**

- Nessuno.

---

## 2026-11-13 — Passaggio alla Fase 1

**Fatto**

- Scritto il brief operativo `FASE_1.md`: prerequisiti, sotto-fasi 1a-1d con modello, effort e goal, registrazione delle fixture, vincoli e decisioni aperte. Collegato da STATO, PROSSIMI_PASSI e CLAUDE.md.
- Corretta un'incoerenza in `PIANO.md`: l'ultracode della Fase 1 è per la 1b (tre direzioni in parallelo), non per la 1c.

**Decisioni**

- Ogni fase lunga avrà un file `FASE_<n>.md` di passaggio, archiviato in STORIA a fine fase.
- La Fase 1 si fa in una nuova sessione, partendo da `inizio-sessione`.

---

## 2026-11-13 — Chiusura Fase 0

**Fatto**

- PR #6: aggiornate tutte le GitHub Actions (checkout v7, setup-node v7, pnpm/action-setup v6, release-please v5) e raggruppati gli aggiornamenti futuri di Dependabot per le Actions. Le PR Dependabot #1, #2, #3 e #5 sono state chiuse perché superate; la #4 (gitleaks-action) era già chiusa.
- PR #7 di prova: un errore di tipo voluto fa fallire "Verify (Windows)" con TS2322. Chiusa senza merge. **DoD della Fase 0 raggiunto.**

**Decisioni**

- Da qui in avanti anche la memoria si aggiorna tramite PR.

---

## 2026-11-13 — Repo su GitHub e prima CI

**Fatto**

- `PIANO.md` spostato in `docs/memoria/` (commit `fd39a80`).
- Creata la repo GitHub privata `control-center` e pushato `main`.
- Primo run della CI: Verify (Windows) verde, release-please ok, Dependabot attivo; gitleaks fallito per un difetto dell'action, non per segreti trovati.
- Gitleaks in CI sostituito con la CLI 8.24.3 su tutta la cronologia.

**Decisioni**

- Senza protezione dei branch (non disponibile nel piano gratuito per le repo private), la regola "solo PR con CI verde" è affidata alla disciplina fino alla pubblicazione.

**Problemi**

- `gitleaks-action@v2` e protezione dei branch: vedi `PROBLEMI_NOTI.md`.

---

## 2026-11-13 — Nascita del progetto e Fase 0

**Fatto**

- Brief iniziale rivisto: lo scope era troppo ampio per un progetto personale, quindi è diviso in fasi, ognuna utilizzabile da sola.
- Piano completo approvato (`PIANO.md`): Fasi 0-10 più 4b (Git e checkpoint) e 5e (errori live). Per ogni fase sono indicati modello, effort, ultracode e goal.
- Repo creata in `Desktop\control-center` con monorepo pnpm, tooling, CI, documenti open source, memoria di progetto e skill di sessione.

**Decisioni**

- Uso personale ora, open source dopo (MIT): repo "pubblicabile" fin dal primo commit.
- Solo Windows fino alla v1.
- La Vista Live è il cuore del progetto ed è obbligatoria.
- Agenti locali Ollama obbligatori e anticipati alla Fase 7, per consumare meno l'abbonamento Claude.
- Un solo runtime: Node/TypeScript, senza microservizio Python.
- Design prima del codice, validato su sessioni registrate (fixture).
- Lingue: codice e documenti pubblici in inglese, memoria in italiano.

**Problemi**

- typescript-eslint 8.72 non supporta TypeScript 7: fissato TypeScript 6 (vedi `PROBLEMI_NOTI.md`).
- Node 26 non include corepack: pnpm si usa via `npx pnpm@10.34.9`.
