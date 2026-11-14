# Design

> Da completare nella **Fase 1** (ricerca UX → direzioni estetiche → Figma → prototipo). Qui sono fissati i vincoli già decisi nel piano.

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
- **Proposta aperta:** densità compatta "da IDE" di default, con l'opzione `Comfortable`. Si decide in 1b.

## Direzioni estetiche (Fase 1b) 🟡 in attesa della scelta

Tre direzioni della Vista Live sullo stesso [brief](../../design/direzioni/BRIEF.md), ciascuna con `live.html`, `README.md` e screenshot:

- [`precisione`](../../design/direzioni/precisione/README.md): strumento di misura da IDE, mono protagonista, quasi monocromo;
- [`sala-controllo`](../../design/direzioni/sala-controllo/README.md): sala di strumentazione, grotesk condensato, sigle di canale e annunciatori;
- [`carta-inchiostro`](../../design/direzioni/carta-inchiostro/README.md): editoriale chiaro-first, segni di correzione, evidenziatore per l'attesa.

Revisione in [`REVISIONE.md`](../../design/direzioni/REVISIONE.md), confronto, raccomandazione e domande all'utente in [`CONFRONTO.md`](../../design/direzioni/CONFRONTO.md). Raccomandazione: `precisione` come base con le sigle di canale e la telemetria di `sala-controllo` e la legenda di `carta-inchiostro`; densità `compact`.

**Regole emerse dalla revisione** (valgono per la direzione scelta, da portare nei token della 1c):

- testo funzionale mai sotto 11 px;
- nella timeline la corsia si allarga per ogni chiamata parallela, gli eventi non si sovrappongono mai;
- nel tema chiaro il pulsante primario non è un pieno scuro che compete con l'attesa;
- la mappa applica `Fit` all'apertura;
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

## Da definire (Fase 1)

- Direzione estetica: scelta dell'utente tra le 3 proposte (vedi sopra).
- Token (colori, tipografia, spaziatura, raggi, ombre, movimento) → `design/tokens.json`.
- Link al file Figma.
