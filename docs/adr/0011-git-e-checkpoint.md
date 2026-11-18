# 0011 — Git e checkpoint per workspace

- **Stato** accettata
- **Data** 2026-11-18

## Contesto

La Fase 4b aggiunge il pannello Git e consente di recuperare le modifiche che precedono una sessione Claude, comprese le modifiche in staging e i file non tracciati inclusi da Git.

## Decisione

- Il main usa Git for Windows dal PATH per lo stato, i diff, lo staging e i commit. Ogni azione passa da un canale esplicito del contratto IPC e richiede il workspace attivo. Il commit preparato nel pannello usa l'indice esistente e il messaggio inserito dall'utente.
- Prima del primo turno di una sessione Claude in una radice Git, anche dopo una ripresa, il main copia l'indice in un file temporaneo. Salva due alberi Git separati, quello in staging e quello su disco, sotto `refs/control-center/checkpoints/<workspace>/<id>`. La cronologia della chat conserva l'ID e l'ora. Se la cattura della radice Git fallisce, Claude aspetta un nuovo invio.
- La timeline apre il confronto fra stato corrente e checkpoint. La conferma usa un token valido cinque minuti, associato alla finestra e al workspace. Prima di scrivere, il main ricontrolla ramo, HEAD e alberi. Crea un riferimento di recupero in `refs/control-center/recovery/<workspace>/<id>`, poi applica i percorsi confermati al working tree e all'indice. Il riferimento resta disponibile nel pannello Git anche dopo un errore di scrittura.

## Alternative considerate

- Lo stash modifica il working tree durante la cattura e usa una pila visibile all'utente. I riferimenti dedicati permettono invece di conservare più checkpoint per la stessa cronologia.
- Una copia esterna di tutta la cartella richiede uno spazio separato e un secondo formato per l'indice. Gli alberi Git condividono gli oggetti già disponibili.

## Conseguenze

- Il ripristino lascia invariati branch, HEAD e stash. I file ignorati da Git sono esclusi, salvo quelli già tracciati. Il confronto usa le normalizzazioni di Git del repository.
- I checkpoint sono oggetti Git locali. Un push ordinario del branch li esclude. Un push con `--mirror` include i riferimenti personalizzati e i relativi contenuti.
- La 4b richiede la radice del repository. Supporta i linked worktree con il collegamento reciproco di Git. Sparse checkout, indice in conflitto, filtri esterni applicati e ripristini che coinvolgono symlink, gitlink o attraversamenti di directory sono rifiutati.
- Il pannello usa comandi Git senza shell, hook esterni, firma automatica o driver esterni. Le operazioni native che richiedono questi strumenti si eseguono dal terminale.
