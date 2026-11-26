# 0015 — Errori del progetto sulla mappa e schema `error.detected`

- **Stato:** accettata
- **Data:** 2026-11-26

## Contesto

La Fase 5e porta sulla Vista Live gli errori del progetto su cui lavorano gli agenti. Quando un comando, un test o un dev server stampa uno stack trace, il file colpevole deve colorarsi sulla mappa e l'errore deve comparire nella timeline accanto all'azione che lo ha preceduto. L'ADR 0003 rimandava `error.detected` a questa fase e chiede una migrazione testata per ogni cambio incompatibile dello schema. La cronologia della chat (4.3) salva già eventi `schemaVersion: 1` su disco.

## Decisione

- **Schema v2.** `error.detected` entra nell'unione `AgentEvent` e `SCHEMA_VERSION` passa a 2. I campi sono:
  - `origin` (`terminal | command | docker | dev-server | test`) e `language` (`node | python | go | rust | browser`; `node` comprende TypeScript);
  - `message` ripulito (massimo 500 caratteri);
  - `file`, `line` e `column` del colpevole;
  - `frames` (massimo 20, `FileRef` come ogni percorso dello schema);
  - `toolUseId` facoltativo, per il comando dell'agente che ha prodotto l'output.

  `detectedErrorSchema` è il solo payload, senza envelope: lo usano i parser e il push del terminale.

- **Migrazione.** `migrateAgentEvent` applica passi `n → n + 1`. Il passo 1 → 2 cambia solo la versione: ogni evento v1 è un v2 valido. La cronologia migra gli eventi prima di validarli; versioni sconosciute o future vengono scartate.
- **Parser a registro** (`packages/event-schema/src/stack/`), uno per linguaggio:
  - JavaScript: stack V8, stack Firefox, diagnostica di `tsc` ed errori di esbuild/Vite;
  - Python, Go (panic ed errori di build), Rust (panic, backtrace ed errori del compilatore).

  Prima dei parser si tolgono le sequenze ANSI. I movimenti del cursore di ConPTY diventano a capo o spazi, e cadono i prefissi di Docker Compose (che rendono l'origine `docker`). Ogni riga va a un solo parser. I frame vanno dal più interno al più esterno. Il colpevole è il primo frame fuori dalle dipendenze (`node_modules`, `site-packages`, toolchain), nel workspace se possibile. Fixture reali e scritte a mano in `packages/fixtures/stacks/`.

- **Sorgenti.**
  - **Comandi degli agenti:** il normalizzatore dello stream analizza l'output degli strumenti shell. L'origine viene dalla riga di comando (`docker`, test runner, dev server, altrimenti `command`). Nel merge batch l'evento prende l'ora della fine della chiamata.
  - **Terminale integrato:** il main analizza l'output del pty dopo 250 ms di quiete (al massimo ogni secondo). Un terminale che stampa il banner di un dev server segnala da lì in poi `dev-server`. Ripetizioni entro 10 s scartate, tetto di 30 errori al minuto per terminale. Gli errori vanno al proprietario come aggiornamento `errors` di `terminal:updated`. Entrano anche nelle sessioni Claude aperte da quella finestra sullo stesso workspace (`source: app`), quindi finiscono nella timeline e nella cronologia.
  - **Docker e dev server:** per ora arrivano dal terminale e dai comandi degli agenti. I log dei container della Fase 6 useranno lo stesso scanner.
- **Mappa.** `MapActivity` tiene i segni di errore per file e scarta i doppioni per contenuto (ora, messaggio, posto), così lo stesso errore arrivato da terminale e sessione conta una volta. Il nodo diventa `error` con la nota `L<riga> <Nome>` finché non succede una di queste cose: una scrittura successiva sul file, oppure lo stesso comando (senza pipe e redirezioni) che termina bene. Un'operazione in corso sul nodo ha la precedenza. Un percorso che il progetto non contiene (crate in una sottocartella, percorso di container) si risolve per suffisso univoco. Un errore da solo non crea il chip di un agente.

## Alternative considerate

- **`error.detected` senza alzare la versione (cambio additivo):** una versione precedente dell'app scarterebbe in silenzio gli eventi nuovi. Alzare la versione rende esplicito il confine e mette in opera le migrazioni.
- **Canale IPC dedicato agli errori:** l'output del terminale appartiene già a una finestra e passa da `terminal:updated`; un canale in più duplicherebbe controlli di mittente e proprietà.
- **Errori solo dentro le sessioni Claude:** senza una chat aperta, un dev server che va in crash non comparirebbe sulla mappa.
- **Parser come dipendenza esterna** (per esempio `stacktrace-parser`): coprono solo JavaScript e non leggono i formati di Python, Go e Rust né lo schermo di ConPTY.

## Conseguenze

- Ogni nuovo linguaggio è un modulo con la sua fixture. Ogni nuovo cambio dello schema aggiunge un passo in `migrate.ts`.
- Gli errori del terminale entrano nella cronologia della sessione: quanto si vede nel terminale finisce su disco ripulito come il resto (radice, home e segreti).
- Le euristiche (banner, comandi, prefissi di Compose) possono sbagliare l'origine; il colpevole resta corretto perché dipende dai frame.
- Restano da fare le azioni rapide sull'errore ("chiedi a Claude", "spiegalo in locale", "vai al file") e i log dei container della Fase 6.
