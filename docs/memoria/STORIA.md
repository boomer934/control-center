# Storia del progetto

Diario delle sessioni, con la voce più recente in alto. Ogni voce: cosa è stato fatto, decisioni prese, problemi incontrati.

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
