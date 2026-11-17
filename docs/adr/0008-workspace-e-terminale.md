# 0008 — Workspace e terminale Windows

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La 4.2 collega il selettore dei workspace al terminale interattivo e all'apertura di file nell'editor. [ADR 0001](0001-stack.md) adotta xterm.js e node-pty. [ADR 0007](0007-canale-push-ipc.md) definisce il canale per l'output.

## Decisione

- Il main apre il dialog nativo e salva in ordine di utilizzo fino a 20 radici canoniche in `<userData>/workspaces.json`. L'ID deriva dalla radice canonica e il renderer lo usa per la selezione dei recenti e per il layout. I terminali restano attivi al cambio workspace durante la stessa esecuzione dell'app.
- Il main avvia Windows PowerShell o Git Bash da posizioni note, con profilo disattivato e directory iniziale verificata. Associa ogni pty a workspace e finestra, ne limita il numero e recapita alla sola finestra proprietaria l'output in blocchi da 16 Ki caratteri. L'app conserva l'output solo nel buffer di xterm.
- Il resolver controlla i percorsi lessicali e reali per aprire file regolari interni al workspace. Usa Notepad con il percorso come argomento e senza shell. I frame della Console vengono risolti dalla radice del codice usata dal logger. I percorsi relativi del terminale partono dalla radice del workspace.
- Il renderer usa `@xterm/addon-fit` per ricavare righe e colonne dal pannello. La build adatta gli stili generati da xterm 6.0 alla CSSOM, mantenendo la CSP. Il controllo sulle trasformazioni impone la verifica manuale quando cambia il bundle a monte.
- `node-pty` è una dipendenza esterna del main. Electron Builder la ricompila e la distribuisce fuori da ASAR insieme al worker ConPTY. In sviluppo si può usare il prebuild Node-API fornito con il modulo. La compilazione Windows richiede MSVC con le librerie Spectre.

## Alternative considerate

- `shell.openPath` segue le associazioni di Windows e potrebbe avviare l'eseguibile selezionato. L'editor di testo fisso consente di aprire file anche quando l'estensione ha un'associazione eseguibile.
- Un percorso della shell indicato dal renderer amplierebbe la superficie IPC. La scelta tra i due profili previsti soddisfa la 4.2.

## Conseguenze

Windows PowerShell usa la versione di sistema. Bash richiede Git for Windows in una delle directory riconosciute. Le shell ereditano i permessi dell'utente Windows. La cronologia delle sessioni Claude arriva in 4.3.
