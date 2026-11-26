# 0013 — Mappa della Vista Live: React Flow, ELK in un worker, stato per nodo

- **Stato:** accettata
- **Data:** 2026-11-19

## Contesto

La Fase 5b disegna la mappa della Vista Live sopra il modello del progetto della 5a (ADR 0012). Il goal chiede gli stati dei nodi del design system pilotati dagli eventi, agenti agganciati ai nodi, Segui agente, anteprima diff e heatmap. Il budget è di 60 fps con 500 nodi e 20 eventi/s. L'ADR 0001 aveva già scelto React Flow ed elkjs; qui si fissa come usarli, insieme alle loro licenze.

## Decisione

- **Dipendenze del renderer** (nel bundle, quindi in `devDependencies` come React):
  - `@xyflow/react` ^12.12.1, licenza MIT;
  - `elkjs` ^0.12.1, licenza EPL-2.0. È una licenza copyleft debole: va bene in un'app MIT se si distribuisce il pacchetto senza modifiche e con la sua licenza;
  - sono le stesse versioni del prototipo 1d.
- **Cosa si vede** (`live/visible.ts`, funzione pura):
  - c'è un contenitore per cartella di primo livello, più la radice;
  - per default si vedono i file toccati nella sessione e i loro vicini diretti negli import, al massimo 8 per file;
  - il resto è collassato: cartelle con il numero di file e le barre di calore, e un nodo "+N file";
  - un clic apre una cartella, "Whole project" la apre tutta;
  - il tetto è di 600 nodi file: i primi a cadere sono i vicini;
  - la chiave della struttura cambia solo quando cambia la forma della mappa.
- **Layout:**
  - dentro un contenitore i nodi stanno su una griglia regolare, calcolata nel renderer;
  - ELK (`rectpacking`, con una larghezza obiettivo ricavata dall'area e dalla forma del riquadro) impacchetta i contenitori in un **Web Worker** (`layout.worker.ts`, CSP `worker-src 'self'` già presente);
  - si rifà il layout solo quando cambiano la chiave della struttura o la densità; durante l'attesa resta il layout precedente;
  - i cambi di stato non toccano mai il layout.
- **Stato dagli eventi** (`live/activity.ts`, puro):
  - `MapActivity` raccoglie le chiamate dei tool come operazioni;
  - `viewAt(t)` dà lo stato di file, nodi temporanei (comandi, server MCP, web) e agenti nell'istante `t`, così il replay della 5c potrà chiedere qualsiasi istante;
  - un'operazione resta attiva per almeno 900 ms e la scia di `done` dura 700 ms;
  - un comando finito lascia la mappa dopo 4 s;
  - un file letto o scritto si accende già da `tool.called`, perché `file.read` e `file.written` arrivano a chiamata finita;
  - il permesso aperto nella chat mette in attesa l'agente principale.
- **Prestazioni:**
  - la lista dei nodi di React Flow cambia solo con il layout o con i nodi temporanei;
  - ogni nodo legge il proprio stato da uno store esterno (`live/store.ts`, `useSyncExternalStore` per chiave), che avvisa solo le chiavi cambiate;
  - gli eventi sono accorpati per frame (`requestAnimationFrame`);
  - senza eventi la mappa si risveglia solo alla prossima scadenza (fine della tenuta, della scia o del ritiro), oppure una volta al secondo mentre un comando gira o un agente aspetta;
  - chip degli agenti, archi e link degli import stanno in un `ViewportPortal`, fuori dalla lista dei nodi.
- **Interazione:**
  - **Segui agente** (`F`): la camera segue l'agente scelto, oppure quello attivo più di recente; un input sulla mappa lo interrompe e mostra la pillola; `Esc` la chiude;
  - **Fit** (`0`): la mappa apre inquadrata e resta inquadrata finché nessuno la muove;
  - **zoom semantico**: da lontano restano cartelle, calore e nomi controscalati;
  - **minimappa**: colorata per attività, è la heatmap;
  - **anteprima diff**: compare passando sopra un file con modifiche. Usa il canale esistente `git:diff` (prima le modifiche su disco, poi quelle in staging), senza nuovo IPC. Un clic apre la sezione Git.
- **Map lab** (`#/map-lab`):
  - esiste solo nelle build di sviluppo ed E2E: la condizione letterale toglie il chunk e le fixture dalla build di produzione;
  - pilota la mappa con le fixture ripulite in istanti fissi, per i test visivi;
  - ha un banco sintetico di 500 file a 20 eventi/s, per il test di prestazioni.

## Alternative considerate

- **ELK `layered` con gli archi degli import:** dà un vero grafo, ma le posizioni saltano a ogni import nuovo e su progetti reali nasce un groviglio. Il raggruppamento per cartelle è stabile e si legge a colpo d'occhio. Gli import compaiono passando sopra un file.
- **Chip e comandi come nodi di React Flow:** cambierebbero la lista dei nodi a ogni evento. React Flow rifarebbe il confronto di 500 nodi 20 volte al secondo.
- **Zustand per lo store:** è nello stack dell'ADR 0001, ma uno store per chiave di poche righe evita una dipendenza e fa esattamente quello che serve, cioè avvisare solo le chiavi cambiate.
- **ELK nel thread dell'interfaccia (`elk.bundled.js` diretto):** su progetti grandi blocca l'interfaccia, e il piano chiede il worker.

## Conseguenze

- Il worker di layout pesa circa 2,7 MB, perché contiene ELK compilato da GWT. Si carica alla prima mappa.
- L'anteprima diff mostra le modifiche non committate del file, non l'ultima modifica dell'agente: gli eventi portano solo i conteggi `+N −M`. L'"ultima modifica" richiederà il contenuto del diff negli eventi o un checkpoint per turno.
- La mappa non mostra ancora i simboli: lo zoom semantico si ferma ai file. I simboli richiedono un'estensione del modello della 5a.
- Gli screenshot di riferimento dei test visivi vengono dall'artifact della CI Windows, come quelli della 3c.
