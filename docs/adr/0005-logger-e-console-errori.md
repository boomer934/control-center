# 0005 — Logger JSONL e Console Errori

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La Fase 3b porta in app il livello 1 di "Errori e stack trace in tempo reale" (`PIANO.md`): ogni errore dell'app (main, renderer, processi figli, chiamate IPC rifiutate) deve finire in un log su disco e nella Console Errori, con lo stack che punta ai sorgenti TypeScript e senza segreti. Il piano indicava pino per il logger.

## Decisione

- **Logger scritto in casa, senza dipendenze nuove**, in `packages/app-log` (solo Node, nessun import di Electron, testabile con file veri in una cartella temporanea):
  - un oggetto JSON per riga (`ts`, `level`, `source`, `event`, `data`), file `control-center.jsonl` ruotato per dimensione (1 MiB, 5 file) in `<userData>/logs`;
  - scrittura sincrona e mai bloccante per l'app: un errore di scrittura viene ignorato;
  - ogni stringa passa da `makeTextCleaner` (`redactSecrets`, home → `~`, radice del progetto → `.`) e i valori sotto chiavi che sembrano credenziali (`token`, `secret`, `password`, `apiKey`…) sono sostituiti per intero.
- **Un solo percorso per ogni errore:** `createErrorReporter` scrive nel log e conta nello `ErrorStore` (gruppi con impronta, contatore, al massimo 200). Nessun testo grezzo esce da lì.
- **Source map lette dal main:** `process.setSourceMapsEnabled` in Electron non riscrive `error.stack` del main, quindi `stack-mapper.ts` usa `SourceMap` di `node:module` (nessuna dipendenza) per riscrivere i frame di `out/main`, `out/preload` e `app://control-center/assets`. Le mappe si cercano solo dentro `out/` con `resolveAssetPath`: un frame costruito ad arte non può far leggere altri file. In sviluppo gli URL del dev server si convertono nei sorgenti.
- **Quattro metodi IPC** nel contratto, con schemi stretti e limiti di lunghezza: `errors:list`, `errors:report-renderer`, `errors:copy-report`, `errors:clear`. Il renderer vede solo gruppi già ripuliti.
  - **Niente canale push:** la Console interroga `errors:list` ogni secondo, usando `revision` per non rifare lavoro. Un canale main → renderer sarebbe una nuova classe di IPC da rivedere; se serve (Fase 4, flusso eventi) si decide lì.
  - **"Copia report"** scrive negli appunti dal main (`clipboard.writeText`): i permessi web restano tutti negati.
  - Le segnalazioni del renderer hanno un tetto (100 ogni 10 s).
- **Processi figli:** `superviseChild` (solo uso interno al main, nessun canale IPC) avvia senza shell, scarta stdout, raccoglie lo stderr (senza codici ANSI) in un solo errore per scoppio e segnala uscite non zero.
- **Fault injector solo nella build E2E:** i test provocano gli errori con `electron-vite build --mode e2e`. Nel main un alias di build (`#e2e-faults`) sceglie `faults.ts` o un modulo vuoto; nel renderer un `define` costante. Un test sul pacchetto verifica che il codice di produzione non li contenga e che le source map ci siano.

## Alternative considerate

- **pino:** il formato è lo stesso, ma serve `pino-roll` (o un worker thread) per la rotazione, due dipendenze e un worker da far convivere con il bundle; la redazione resterebbe comunque nostra.
- **`electron-log`:** pensato per scrivere anche nella console del renderer e in file per processo; qui il renderer non scrive mai su disco.
- **`source-map` / `@jridgewell/trace-mapping`:** dipendenza in più per ciò che `node:module` già offre.
- **Canale push (`webContents.send`):** vedi sopra.
- **Abilitare in produzione una variabile d'ambiente per i fault:** apre una superficie di attacco inutile; il flag di build non lascia traccia nel pacchetto.

## Conseguenze

- Nessuna dipendenza di runtime nuova: la regola 7 di `CLAUDE.md` non scatta.
- Le source map entrano nel pacchetto (`electron-builder.config.ts` non le esclude più): servono a mappare gli stack in produzione. In Fase 10 si decide se l'installer le includa o le tenga a parte.
- Il parser degli stack è generico (formato V8): i parser per Python, Go e Rust del livello 2 (Fase 5e) sono un'altra cosa.
- "Clic su un frame → apri l'editor" non c'è: richiederebbe un metodo IPC che apre file, da progettare con i controlli di percorso della Fase 4.
