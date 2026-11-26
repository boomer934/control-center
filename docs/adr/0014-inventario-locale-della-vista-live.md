# 0014 — Inventario locale della Vista Live

- **Stato:** accettata
- **Data:** 2026-11-26

## Contesto

Il replay deve mostrare l'attività registrata e permettere di vedere cosa gira sulla macchina corrente. Le fixture degli agenti non contengono lo stato di Docker, porte o GPU.

## Decisione

La riga **Machine now** chiede al main un riepilogo tramite `infra:snapshot`, senza argomenti. Il main conta i container da `GET /containers/json?all=0` sulla named pipe locale di Docker. Rileva le porte TCP in ascolto con PowerShell, la VRAM con `nvidia-smi` e i modelli caricati da `GET /api/ps` su loopback. Ogni fonte assente o indisponibile ha uno stato distinto da un conteggio pari a zero.

Il riepilogo usa lo stato corrente anche durante il replay. Non entra nel JSONL e la posizione del playhead non cambia i dati della macchina. L'E2E fornisce un inventario deterministico nel main della build di test e passa dal canale IPC e dalla UI effettivi.

## Alternative considerate

- Salvare l'inventario nelle registrazioni avrebbe cambiato il significato della domanda e aumentato i dati raccolti nello storico.
- Il client Docker completo resta pertinente per il monitor della Fase 6. Un singolo endpoint GET sulla pipe serve al riepilogo senza aggiungere una dipendenza.

## Conseguenze

Le richieste concorrenti condividono il risultato per 10 secondi. I probe hanno un timeout e output limitato. Il riepilogo espone conteggi, memoria e nomi dei modelli. La schermata Infra completa e le azioni sui servizi restano nella Fase 6.
