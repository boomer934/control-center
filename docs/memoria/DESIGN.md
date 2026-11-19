# Design

> Da completare nella **Fase 1** (ricerca UX → direzioni estetiche → token e design system HTML → prototipo). Qui sono fissati i vincoli già decisi nel piano.

## Ricerca UX (Fase 1a) ✅

- [Persona](../../design/ricerca/persona.md):
  - "Dev quotidiano": Windows, Claude Code ogni giorno, 2-5 progetti, Docker e Ollama, app sul secondo monitor;
  - "Di passaggio": sguardo da 2 secondi;
  - anti-persona: team/enterprise;
  - 6 scenari chiave.
- [Domande chiave](../../design/ricerca/domande-chiave.md): per ognuna delle 5 domande, il punto dello schermo che risponde (primario nella Live, di riserva nella barra di stato), i dati necessari e il "test dei 2 secondi".
- [Architettura](../../design/ricerca/architettura.md):
  - finestra, sezioni, dock, layout interno della Live, barra di stato a priorità;
  - command palette con prefissi, scorciatoie per ambito di focus, notifiche;
  - flussi F1-F7 e S1-S5.
- [Schermate](../../design/ricerca/schermate.md): inventario P0/P1/P2 × stati (vuoto, caricamento, normale, denso, errore, offline), casi d'errore specifici, onboarding in 3 passi.
- **Densità:** `compact` "da IDE" di default, con l'opzione `Comfortable` (deciso in 1b).

## Direzioni estetiche (Fase 1b) ✅ scelta: `precisione fluida`

Tre direzioni della Vista Live sullo stesso [brief](../../design/direzioni/BRIEF.md), ciascuna con `live.html`, `README.md` e screenshot:

- [`precisione`](../../design/direzioni/precisione/README.md): strumento di misura da IDE, mono protagonista, quasi monocromo;
- [`sala-controllo`](../../design/direzioni/sala-controllo/README.md): sala di strumentazione, grotesk condensato, sigle di canale e annunciatori;
- [`carta-inchiostro`](../../design/direzioni/carta-inchiostro/README.md): editoriale chiaro-first, segni di correzione, evidenziatore per l'attesa.

Revisione in [`REVISIONE.md`](../../design/direzioni/REVISIONE.md), confronto in [`CONFRONTO.md`](../../design/direzioni/CONFRONTO.md).

**Scelta dell'utente (2026-11-14): [`precisione fluida`](../../design/direzioni/precisione-fluida/README.md)**, la base di token e componenti della 1c:

- `precisione` (palette, stati, linguaggio da IDE) resa **più fluida, con meno spigoli**: raggi 4 / 6 / 10 px più le pillole, eventi della timeline a capsula, collegamenti con curve raccordate, glifi arrotondati, sans per l'interfaccia e mono per i dati, attesa che respira (1.6 s) invece di lampeggiare;
- innesti: sigle di canale (`CL`, `EX`, `QW` + segno cloud/locale) e telemetria da `sala-controllo`; legenda `Key` e titolo display del dialog da `carta-inchiostro`;
- densità predefinita `compact`;
- nome **Vernier** (deciso in 1c il 2026-11-14), con ripiego su Control Center dove le collisioni creano problemi.

**Regole emerse dalla revisione** (già applicate in `precisione fluida`, da portare nei token della 1c):

- testo funzionale mai sotto 11 px;
- nella timeline la corsia si allarga per ogni chiamata parallela, gli eventi non si sovrappongono mai;
- nel tema chiaro il pulsante primario non è un pieno scuro che compete con l'attesa;
- la mappa applica `Fit` all'apertura (se il grafo non entra si nasconde la legenda, poi scala);
- l'unico blocco pieno è l'attesa: pulsante primario, chip `Live` e avatar sono a contorno;
- scala di spaziatura e durate dei cicli come token.

## Domande a cui l'app risponde in meno di 2 secondi

1. Cosa sta facendo l'agente adesso?
2. Quali file ha toccato e cosa ha cambiato?
3. Aspetta me? Ha sbagliato?
4. Cosa gira sulla mia macchina?
5. Quanto ho consumato, e quanto è stato fatto in locale?

## Architettura dell'informazione

Dettaglio completo in [`architettura.md`](../../design/ricerca/architettura.md).

- **Barra attività a sinistra:** workspace + 7 sezioni con `Ctrl+1…7`: Live, Infra, Local agents, MCP & Skills, Git, Telemetry, Settings.
- **Area centrale:** la sezione attiva (default Live = mappa + timeline + colonna `Agents`/`Inspector`).
- **Dock destro "Session":** chat Claude, input del task, **dialog dei permessi**.
- **Dock inferiore:** `Terminal`, `Logs`, `Problems` (Console Errori).
- **Barra di stato:** segmenti a priorità. Il primo è `waiting-user` (solo quando c'è), poi errori, agenti, sessione, token, file modificati, VRAM, Docker.
- **Command palette:** `Ctrl+K`, oppure `Ctrl+Shift+P` anche dal terminale. Prefissi `> / @ # ! ?`.
- **Regole:**
  - i pannelli non si aprono da soli, tranne il dialog di un permesso;
  - le assenze (Docker, GPU, Ollama) sono stati neutri, non errori;
  - vista umana ↔ raw con `R`.

## Stati semantici (uguali ovunque)

| Stato        | Significato             | Trattamento                                        |
| ------------ | ----------------------- | -------------------------------------------------- |
| idle         | nessuna attività        | neutro                                             |
| reading      | l'agente legge          | colore info, un impulso per evento (mai in ciclo)  |
| writing      | l'agente modifica       | accento caldo, bordo pieno + badge diff            |
| running      | comando o tool in corso | progresso indeterminato                            |
| waiting-user | serve una tua decisione | colore attenzione: l'unico che richiama lo sguardo |
| error        | fallito                 | colore errore + icona (mai solo colore)            |
| done         | completato              | ritorno al neutro con una scia che sfuma           |

## Identità degli agenti

Colore e glifo stabili per agente (Claude, subagent Claude, agente Ollama). Gli agenti locali e quelli cloud devono distinguersi a colpo d'occhio, anche in scala di grigi.

## Movimento

Il movimento comunica stato, non decora. Durate 150-300 ms con curve dai token, `prefers-reduced-motion` rispettato, eventi accorpati per frame, nessuna animazione continua sui nodi inattivi. **L'unico impulso continuo è il segmento d'attesa nella barra di stato** (deciso in 1b): il blocco d'attesa in timeline resta fermo; `reading` fa un solo impulso per evento; la barra indeterminata di `running` è progresso, non impulso, e con movimento ridotto diventa statica.

## Design system (Fase 1c) ✅

- **Token:** [`design/tokens.json`](../../design/tokens.json) in formato DTCG → [`design/sistema/tokens.css`](../../design/sistema/tokens.css), generato da `scripts/build-tokens.mjs` (`--check` per verificarlo). I componenti usano solo `var(--…)`.
- **Pagine:** [`design/sistema/`](../../design/sistema/README.md), con la pagina componenti, le 9 schermate P0 e le 9 P1 (onboarding, replay, infra, local-agents, mcp-skills, settings, terminal, workspace, notifiche) con tutti i loro stati, la verifica dei flussi F1-F7 e gli screenshot.
- **Revisione impeccable (2026-11-14):** un solo grave, il sigillo d'agente sul fondo dell'attesa (contrasto 1,45:1), corretto con `--on-waiting`. Il contrasto del testo è AA in tutte le pagine, gli stati e i due temi. Gli avvisi del rilevatore sono scelte volute:
  - testo a 11 px (densità `compact`);
  - Instrument Sans (scelta in 1b);
  - barra indeterminata e righe di `reading` (stati semantici);
  - bordi di stato delle card.
- **Minori chiusi nei token:**
  - running e locale si distinguono meglio. La distanza OKLab tra running e locale passa da 0,117 a 0,189 nel tema scuro e da 0,098 a 0,160 nel chiaro; quella tra locale e reading resta ≥ 0,145. Tutti sono AA su `bg-0` e `bg-2`.

    | Token        | Scuro                 | Chiaro                |
    | ------------ | --------------------- | --------------------- |
    | `st-running` | `#7fd36a` → `#8fd357` | `#2c7520` → `#336e0b` |
    | `ag-local`   | `#4fd6c8` → `#5fd8f0` | `#00736a` → `#006d87` |
    | `st-reading` | `#6aaeff` → `#7b9dff` | `#1b62c9` → `#2a5bd7` |

  - l'errore in timeline è etichettato con il bersaglio;
  - la timeline `normal` ha Read ×4 + Grep ×2.
- **Nuovi token:**
  - spaziatura `sp-0…10` (2, 4, 6, 8, 12, 16, 20, 24, 32, 48 px);
  - misure `sz-*`, layout, `shadow-overlay` (solo per gli overlay), colori del diff e `scrim`;
  - cicli: `cycle-breathe` 1600 ms (solo l'attesa), `cycle-running` 1200 ms, `cycle-pulse-reading` 300 ms (uno per evento), `cycle-trail-done` 300 ms dopo `cycle-trail-delay` 400 ms.
- **Regole nuove:**
  - scheletri fermi, senza shimmer;
  - sigle con cifra in caso di collisione (`C2`, `E2`);
  - assenze tratteggiate e neutre;
  - conferme distruttive senza azione su `Enter`;
  - una notifica di Windows non approva mai un permesso: porta alla richiesta, dove si vede il contesto (confermato dall'utente il 2026-11-14);
  - sul fondo pieno dell'attesa sigle e glifi usano `--on-waiting`, mai il colore dell'agente.

## Mappa della Vista Live (Fase 5b)

Implementazione in `apps/desktop/src/renderer/src/live/` (ADR 0013). Riusa le classi di `componenti.css`: `.ctr`, `.node`, `.heat`, `.trail`, `.prog`, `.achip`, `.e-*`, `.legend`, `.readout` e i colori `.mm-*` della minimappa. Classi nuove, in `live/map.css`, solo con i token:

- `.mm-r` (file letti) e `.mm-c` (contenitore aperto, solo contorno) nella minimappa;
- `.e-imp`: i link degli import del file sotto il puntatore, tratteggiati e neutri;
- `.lmap-trip`: un solo viaggio di un punto lungo l'arco quando l'agente cambia bersaglio. Le letture vanno verso l'agente, le scritture verso il file. Con il movimento ridotto non c'è.

Regole:

- un contenitore per cartella di primo livello;
- i file toccati e i loro vicini diretti si vedono, il resto è collassato con le barre di calore (scritti `h`, letti `r`);
- l'arco di un chip corre nello spazio tra le righe e scende sul bordo superiore del file, così non attraversa gli altri nodi;
- zoom semantico sotto il 45%: spariscono nomi e glifi dei file, le etichette delle cartelle sono controscalate (`--map-zoom`) e restano leggibili;
- la mappa apre con `Fit` (massimo 100%) e resta inquadrata finché nessuno la muove;
- `F` segue l'agente, `0` inquadra, `Esc` chiude la pillola "Following stopped";
- l'anteprima del diff compare dopo 350 ms sopra un file con modifiche.
