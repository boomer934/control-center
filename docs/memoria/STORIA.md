# Storia del progetto

Diario delle sessioni, con la voce più recente in alto. Ogni voce: cosa è stato fatto, decisioni prese, problemi incontrati.

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
