# 0012 — Modello del progetto: scansione, import e aggiornamenti

- **Stato:** accettata
- **Data:** 2026-11-19

## Contesto

La Fase 5a dà alla Vista Live il modello del progetto: i file del workspace, gli import tra di loro e i ruoli (pagine, componenti, route API, schemi…). Mappa (5b), timeline (5c) e ispettore (5d) si appoggiano a questo contratto. Il goal chiede la scansione in un worker, gli import con web-tree-sitter per TS/JS, Python, Go e Rust, un watcher incrementale e l'apertura di un progetto da 5.000 file in meno di 2 s.

## Decisione

- **Pacchetto `packages/project-model`.** È logica pura di Node, testabile senza Electron:
  - lo schema zod (`./schema`, che dipende solo da zod e serve a contratto IPC e renderer);
  - il protocollo del worker (`./protocol`);
  - scansione, regole `.gitignore`, estrazione e risoluzione degli import, ruoli, indicizzatore, watcher e l'entry del worker.
  - Gli import interni hanno l'estensione `.ts`, così Node esegue il worker anche dal sorgente (test di integrazione).
- **Contratto (`PROJECT_MODEL_VERSION = 1`).**
  - Un file è `{ path, language, size, roles, indexed, imports, importDirs, externals }`. I percorsi sono relativi alla radice, separati da `/`, senza `.` né `..`.
  - `imports` sono file del workspace. `importDirs` sono cartelle importate per intero (pacchetti Go), con la stringa vuota per la radice. `externals` sono i nomi fuori dal workspace (pacchetti npm, moduli Python, moduli Go, crate).
  - Le cartelle non sono nel contratto: si ricavano dai percorsi.
  - Lo snapshot ha `revision`, `status` (`scanning` | `indexing` | `ready`), `truncated` e `progress`. Un delta vale su `revision - 1`: `upsert` sostituisce voci intere, `remove` toglie percorsi. Un cambio incompatibile alza la versione, come per `AgentEvent`.
- **Due tempi.** Lo snapshot parte appena la lista dei file è nota: è l'apertura misurata, la mappa collassata. Gli import arrivano dopo, in delta ogni 100 ms. Un file modificato tiene i vecchi import finché non viene riletto, così la mappa non lampeggia.
- **Worker thread** (`worker_threads`), uno per il workspace attivo. Il main tiene uno specchio del modello e risponde a `project:open` da lì. Inoltra i delta con l'evento `project:updated` solo alle finestre che hanno aperto il modello, e valida con zod ogni messaggio del worker. Aprire un altro workspace ferma il worker precedente; chiudere l'ultima finestra iscritta lo ferma.
- **Scansione.**
  - Applica il `.gitignore` della radice, quelli delle sottocartelle e `.git/info/exclude`; `.git` e `node_modules` sono sempre esclusi. Non legge il file di esclusioni globale dell'utente.
  - Non segue symlink e junction. Si ferma a 20.000 file (`truncated`) e a 64 livelli.
  - Non legge i file oltre 1 MiB, che restano nodi senza import.
- **Import con Tree-sitter** da `@vscode/tree-sitter-wasm` (MIT, Microsoft, senza dipendenze), che contiene il runtime web-tree-sitter e le grammatiche già compilate in WASM, tra cui TS, TSX, JS, Python, Go e Rust. La risoluzione è pura (vede solo la lista dei file e la configurazione):
  - **TS/JS:** percorsi relativi con estensioni e `index`, `.js` → `.ts`, `paths`/`baseUrl` del `tsconfig.json`/`jsconfig.json` della radice, pacchetti del monorepo per nome ed `exports`.
  - **Python:** import relativi e assoluti dalla radice o da `src/`.
  - **Go:** moduli da `go.mod`, import verso cartelle.
  - **Rust:** `mod`, `use crate::/self::/super::` e moduli figli dichiarati.
- **Ruoli come plugin** (`RolePlugin`): ognuno dice se si applica (dalle dipendenze dei `package.json`) e quali ruoli ha un percorso. I ruoli vengono solo dai percorsi, mai dal contenuto. Primo set: convenzioni comuni (test, config, schema, entry), Next.js, React, server API Node.
- **Watcher:** `fs.watch` ricorsivo di Node, a lotti di 100 ms. L'indicizzatore rilegge con `lstat` ogni percorso segnalato. Un `.gitignore` cambiato, un nome mancante, troppi percorsi (oltre 2.000) o un errore del watcher portano a una nuova scansione completa. Un file di configurazione cambiato (tsconfig, package.json, go.mod, Cargo.toml) fa risolvere di nuovo tutti gli import.
- **Dipendenze di runtime nuove:** `@vscode/tree-sitter-wasm` (fissata a 0.3.1) e `ignore` (MIT, senza dipendenze, la semantica `.gitignore` usata da ESLint). Nel pacchetto il worker e i `.wasm` stanno fuori da `app.asar` (`asarUnpack`).

## Alternative considerate

- **`web-tree-sitter` e un pacchetto npm per grammatica:** i pacchetti ufficiali delle grammatiche portano con sé addon nativi e script di installazione; una sola dipendenza WASM già compilata è più semplice e più sicura.
- **Espressioni regolari al posto di Tree-sitter:** più veloci, ma sbagliano su commenti, stringhe e sintassi annidata; il piano chiede Tree-sitter.
- **chokidar** (previsto nel piano): `fs.watch` ricorsivo copre Windows, macOS e Linux con Node ≥ 20, e l'indicizzatore verifica comunque ogni percorso. Una dipendenza in meno.
- **`git ls-files`** per i file non ignorati: semantica esatta, ma richiede Git e un repository; il modello deve funzionare su qualsiasi cartella.
- **Un pool di worker per il parsing:** su 5.000 file l'indicizzazione completa richiede circa 2 s anche con un solo worker. Il pool si aggiunge se servirà.
- **`utilityProcess` di Electron:** isola di più, ma il worker non esegue codice dell'utente e non apre risorse oltre la lettura dei file; `worker_threads` si prova anche senza Electron.

## Conseguenze

- Misure in locale: 5.000 file elencati in meno di 100 ms (a cache calda) e indicizzati in circa 2 s. Il test `opens a 5,000-file project in under 2 s` controlla l'apertura in CI.
- Il worker legge i file del workspace: rischi e limiti in `SICUREZZA.md`. Gli errori del worker arrivano alla Console con un messaggio fisso, senza percorsi.
- Ruoli per FastAPI e simili, alias dei `tsconfig` delle sottocartelle (`extends` compreso) e moduli Python fuori da radice e `src/` non sono coperti: si aggiungono con nuovi plugin o nuove regole del resolver.
- Il modello si ricalcola a ogni avvio: nessuna cache su disco per ora.
