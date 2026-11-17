---
name: inizio-sessione
description: Avvia una sessione di lavoro su Control Center. Legge lo stato del progetto e i prossimi passi, controlla la repo e propone il task da fare con modello, effort e goal suggeriti. Usala all'inizio di ogni sessione o quando l'utente chiede "da dove riprendiamo?".
---

# Inizio sessione

1. Leggi `docs/memoria/STATO.md` e `docs/memoria/PROSSIMI_PASSI.md`. Non leggere gli altri file di memoria finché non servono.
2. Controlla la repo:
   - `git status --short` e `git branch --show-current`;
   - `git log --oneline -10`.
     Se ci sono modifiche non committate o il branch non corrisponde a quello in `STATO.md`, segnalalo prima di tutto.
3. Individua il primo task aperto in `PROSSIMI_PASSI.md` e la sua fase. In `docs/memoria/PIANO.md`, sezione "Modello, effort, ultracode e goal", trova la riga di quella fase e il testo del goal.
4. Rispondi all'utente in italiano, in modo breve:
   - dove eravamo rimasti (2-3 righe);
   - il task proposto;
   - modello ed effort consigliati, e se serve ultracode;
   - il testo esatto da usare con `/goal`;
   - eventuali blocchi da `STATO.md` (es. una fixture mancante).
5. Se il task richiede un branch nuovo, proponi un nome `feat/…` o `fix/…`.

Non iniziare a modificare file finché l'utente non conferma il task.
