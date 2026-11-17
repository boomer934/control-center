# 0007 — Canale push nel contratto IPC (main → renderer)

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

Il contratto della 3a (ADR 0004) conosce solo richiesta/risposta: il renderer chiede, il main risponde. La Console Errori interroga `errors:list` ogni secondo. Dalla Fase 4 arrivano flussi continui che il polling non regge: output del pty (4.2), eventi della sessione Claude e richieste di permesso (4.1, 4.3), più avanti lo stato dell'infrastruttura (6). Serve un canale dal main al renderer con le stesse garanzie dei metodi: elenco unico da rivedere, schema zod, nessun canale generico, nessun accesso grezzo a `ipcRenderer` dal renderer.

## Decisione

- **Gli eventi stanno nel contratto**, accanto ai metodi, nello stesso namespace: `event('namespace:nome', schema)` crea un `EventSpec` (`kind: 'event'`) con uno schema `.strict()` e limitato in dimensione. Il primo è `errors:changed` con `{ revision }`.
- **Main: `createEventEmitter`** in `packages/ipc-contract/src/main.ts` (senza import di Electron). `emit(spec, payload)`:
  1. accetta solo un `EventSpec` del contratto (stesso oggetto, non solo lo stesso nome);
  2. valida il payload con lo schema e invia il valore validato;
  3. lo consegna solo ai destinatari che l'app indica (`targets()`); un errore di invio su un destinatario non blocca gli altri;
  4. ogni rifiuto va a `onFailure` con canale e codice (`unknown-event`, `invalid-event`, `send-failed`), mai il payload.
- **Destinatari:** in `apps/desktop/src/main/ipc.ts` solo le finestre create dall'app (`trustWindow`), non distrutte, con un URL dell'app (stessa regola del mittente fidato). Si invia con `webContents.send`, cioè al solo frame principale. Per ora è un broadcast: c'è una sola finestra. Un destinatario per finestra (o per pty) si aggiunge quando serve, sempre dentro `ipc.ts`.
- **Preload: `createApi(invoke, subscribe)`.** Per ogni evento `x` di un namespace, `window.api.<ns>.onX(listener)` restituisce una funzione che annulla l'iscrizione (idempotente). Il preload:
  - tiene **un solo** listener di `ipcRenderer` per canale e lo smista agli iscritti; lo toglie quando l'ultimo se ne va;
  - **non passa mai l'`IpcRendererEvent`** al renderer (il suo `sender` è `ipcRenderer`): il listener riceve solo il payload;
  - rivalida il payload con lo stesso schema e scarta i messaggi con più argomenti o non validi;
  - isola gli iscritti: se uno lancia un'eccezione gli altri ricevono comunque l'evento, e l'errore va alla Console come errore del renderer;
  - rifiuta un listener che non è una funzione.
- **Tipi:** `Api` deriva `onX` dagli eventi; `Handlers` contiene solo i metodi. Un nome `onX` che collide con un metodo fa fallire la costruzione del contratto.
- **Console Errori:** `ErrorStore.onChange` → il main raggruppa le modifiche (un invio ogni 50 ms al massimo) ed emette `errors:changed`; il renderer ricarica `errors:list` solo quando la revisione è più nuova e non tiene più di una richiesta in volo. Niente più polling. Un errore di invio proprio di `errors:changed` va solo nel log, non nella Console, per non creare un ciclo.
- **Flussi ad alta frequenza** (pty, stream-json): chi emette raggruppa i dati prima di inviarli (per esempio ogni 16 ms o per dimensione) e lo schema ne limita la grandezza. Il contratto non fa buffering per conto suo.

## Alternative considerate

- **Polling** per tutto: latenza e lavoro inutile; con il pty non è praticabile.
- **`MessagePort`** per canale: utile per flussi enormi, ma le porte arrivano al renderer come oggetti con `postMessage` libero e vanno validate a mano; non serve finché `webContents.send` regge il carico. Si riconsidera se il terminale lo richiede (nuova ADR).
- **Un canale unico `events` con un discriminante:** un solo listener, ma l'elenco dei tipi esce dal contratto e un payload sbagliato di un tipo passa per il canale di tutti.
- **Iscrizione dichiarata al main** (il renderer chiede `subscribe` e il main invia solo agli iscritti): più IPC e più stato nel main senza guadagno di sicurezza, perché il destinatario è già solo la finestra fidata.

## Conseguenze

- Ogni nuovo evento è una voce del contratto con schema e test: il test `declares exactly the reviewed channels` elenca anche gli eventi.
- `IpcFailure.code` comprende anche i codici degli eventi; l'envelope delle risposte non cambia.
- La forma di `window.api` cambia (`errors.onChanged`): il test E2E della forma congelata la elenca.
- 4.2 (output del pty) e 4.1/4.3 (eventi della sessione) aggiungono i propri eventi qui, ognuno nella propria sotto-fase.
