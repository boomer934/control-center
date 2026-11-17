---
name: fine-sessione
description: Chiude una sessione di lavoro su Control Center aggiornando la memoria di progetto (STATO, PROSSIMI_PASSI, STORIA e, se serve, PROBLEMI_NOTI, DECISIONI, GLOSSARIO) a partire da git log e git diff. Usala a fine sessione, prima di aprire una PR o quando un goal è raggiunto.
---

# Fine sessione

1. Raccogli i fatti, non i ricordi:
   - `git log --oneline` dei commit della sessione (dall'ultimo commit citato in `docs/memoria/STORIA.md`, oppure da `main` se sei su un branch);
   - `git status --short` per il lavoro non committato;
   - esito di `pnpm verify` (se non è stato appena eseguito, eseguilo).
2. Aggiorna `docs/memoria/STATO.md` (sostituisci, non accumulare):
   - data;
   - fase e task corrente;
   - branch;
   - cosa funziona;
   - cosa manca per chiudere la fase;
   - blocchi.
3. Aggiorna `docs/memoria/PROSSIMI_PASSI.md`: togli i task chiusi, aggiungi quelli nuovi, mantieni l'ordine e il riferimento alla fase.
4. Aggiungi **in cima** a `docs/memoria/STORIA.md` una voce `## AAAA-MM-GG — titolo` con **Fatto**, **Decisioni**, **Problemi**. Massimo circa 15 righe.
5. Solo se pertinente:
   - un nuovo problema o workaround → `PROBLEMI_NOTI.md`;
   - una nuova scelta architetturale o dipendenza → nuova ADR da `docs/adr/0000-template.md` + riga in `DECISIONI.md`;
   - un nuovo termine → `GLOSSARIO.md`;
   - una modifica al design system → `DESIGN.md`;
   - una nuova superficie d'attacco → `SICUREZZA.md`.
6. Committa la memoria con `docs(memoria): aggiorna stato e storia` (o includila nel commit della feature).
7. Riassumi all'utente in 3 righe: cosa è fatto, cosa resta, il prossimo passo.

Scrivi solo fatti verificati: se un test non passa o un passo è saltato, dillo così com'è.
