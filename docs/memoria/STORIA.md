# Storia del progetto

Diario delle sessioni, con la voce più recente in alto. Ogni voce: cosa è stato fatto, decisioni prese, problemi incontrati.

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
