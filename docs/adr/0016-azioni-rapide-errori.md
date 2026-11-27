# 0016 — Azioni rapide sugli errori della Vista Live

- **Stato:** accettata
- **Data:** 2026-11-27

## Contesto

La Vista Live mostra la causa segnalata dal progetto e la posizione ricavata dallo stack. Dall'ispettore serve poter passare alla sorgente, a Claude o a una spiegazione locale.

## Decisione

- **Ask Claude to fix** aggiunge alla bozza della chat il riepilogo dell'errore. L'utente può modificarlo e decide quando inviarlo. La chat conserva i permessi esistenti. La cronologia archiviata rimane consultabile, con le azioni di lettura.
- **Explain locally** invia a Ollama il messaggio ripulito e i metadati selezionati. Il main sceglie il modello di testo locale installato più piccolo in base alla dimensione riportata, verificando i metadati prima della generazione. Lo scambio con Ollama usa soltanto l'indirizzo di loopback e la risposta appare nell'ispettore, come testo.
- **Go to file** apre il sorgente UTF-8 in un visualizzatore interno di sola lettura e scorre alla riga indicata. Il main riusa il risolutore canonico della Fase 4.2 e rilegge l'identità del file prima di accedere ai dati dal descrittore aperto.

## Alternative considerate

- Aprire un programma esterno selezionato per estensione. Il visualizzatore interno permette di raggiungere la riga senza usare le associazioni di file di Windows.
- Inviare subito la richiesta a Claude dall'ispettore. La bozza permette di correggere il contesto e scegliere il momento dell'invio.

## Conseguenze

Il visualizzatore supporta file UTF-8 fino a 1 MiB e richiede una riga esistente. L'anteprima usa il file corrente del workspace anche quando il riferimento viene dal replay. La spiegazione locale richiede un modello Ollama installato con capacità di generazione testuale. Si mantiene un solo lavoro di inferenza alla volta.

La verifica dell'identità del file rifiuta un inode pari a zero (`ino === 0n`). Questo include i file su volumi FAT o exFAT quando Windows restituisce zero per l'identificativo, come previsto per i file system che non espongono un ID a 64 bit. [Microsoft FileInternalInformation](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/7d796611-2fa5-41ac-8178-b6fea3a017b3).
