# Brief comune — Fase 1b: tre direzioni estetiche

> Unico input per chi disegna una direzione. Tutte e tre le direzioni usano **gli stessi vincoli e gli stessi dati finti**, così il confronto è alla pari. Il testo è in italiano; i testi dell'interfaccia sono in inglese.

## Cosa si consegna

Per ogni direzione, nella sua cartella `design/direzioni/<slug>/` e **solo lì**:

1. **`live.html`**: un solo file statico che mostra la **Vista Live** dentro una finestra simulata di 1440×900 px.
   - CSS inline nel file; JavaScript minimo, solo per i toggle e per leggere i parametri.
   - Parametri URL, combinabili: `?theme=dark|light&density=compact|comfortable&scenario=normal|dense&gray=1`. Default: `theme=dark&density=compact&scenario=normal`.
   - Una piccola barra di toggle **fuori** dalla finestra simulata (sopra o sotto), con gli stessi quattro controlli. Quando si cambia un toggle, l'URL si aggiorna (`history.replaceState`).
   - `gray=1` applica `filter: grayscale(1)` alla finestra simulata: serve a verificare che stati e agenti si distinguano senza colore.
   - Niente librerie JS, niente immagini esterne, niente richieste di rete tranne i font. I font possono venire da Google Fonts **solo nel mockup**; nell'app saranno inclusi nel pacchetto.
   - Le icone si disegnano in SVG inline o con glifi Unicode.
   - Nessun errore in console.
2. **`README.md`** in italiano con queste sezioni:
   - **Idea** (3-5 righe): la metafora e perché funziona per la persona di `design/ricerca/persona.md`.
   - **Palette:** tabelle per il tema scuro e per quello chiaro. Righe: superfici (almeno 3 livelli), testo (primario, secondario, disattivo), bordi, accento, e i 7 stati. Colonne: nome del token, hex, contrasto sul fondo su cui si usa (rapporto WCAG).
   - **Tipografia:** sans per l'interfaccia + mono con **cifre tabulari**; scala delle dimensioni; licenza di ogni font (**solo OFL o MIT**, perché andranno inclusi nell'app open source).
   - **Stati e agenti:** come si riconosce ognuno dei 7 stati (colore + forma/icona/tratto), glifi e colori d'identità dei 3 tipi di agente, e perché si distinguono anche in scala di grigi.
   - **Movimento:** cosa si muove, durate (150-300 ms) e curve; cosa succede con `prefers-reduced-motion`.
   - **Densità:** differenze tra `compact` e `comfortable` (altezze di riga, padding, dimensioni del testo).
   - **Punti di forza** e **rischi** (onesti: cosa potrebbe non funzionare con 500 nodi, su metà schermo, in tema chiaro…).
   - **Nomi proposti:** 2-3 nomi per il prodotto, coerenti con la direzione, con una riga di motivazione ciascuno. Nel mockup il nome resta `Control Center`.
   - **Checklist di accettazione** (sotto), spuntata.

## Vincoli comuni

Fonti complete: [`docs/memoria/DESIGN.md`](../../docs/memoria/DESIGN.md), [`architettura.md`](../ricerca/architettura.md), [`schermate.md`](../ricerca/schermate.md), [`domande-chiave.md`](../ricerca/domande-chiave.md), [`persona.md`](../ricerca/persona.md).

- **Le 5 domande in meno di 2 secondi:** cosa fa l'agente adesso; quali file ha toccato; aspetta me o ha sbagliato; cosa gira sulla macchina; quanto ho consumato e quanto in locale. La schermata deve rispondere a colpo d'occhio.
- **Struttura della finestra** (da `architettura.md`): barra attività a sinistra (~48 px, avatar workspace + 7 sezioni + Settings in basso, Live attiva), title bar personalizzata (workspace ▾ · branch · titolo sessione · pulsanti dock · controlli finestra di Windows), area centrale con la Live, **dock destro "Session"** aperto, dock inferiore chiuso (si vede solo la sua linguetta o nulla), **barra di stato** sempre visibile.
- **Layout interno della Live:** toolbar (`Follow ▾` · `Filters` · `Fit` · `Replay ⏵`), **mappa** (cartelle → file, avatar degli agenti agganciati ai nodi, archi di lettura/scrittura, minimap), **timeline** in basso (swimlane per agente, corsie figlie agganciate al punto di nascita, scrubber), **colonna destra** a due schede `Agents` | `Inspector` (attiva `Agents`).
- **7 stati semantici**, uguali ovunque (mappa, card, timeline, barra di stato):

  | Stato        | Trattamento richiesto                                  |
  | ------------ | ------------------------------------------------------ |
  | idle         | neutro                                                 |
  | reading      | colore info, un impulso per evento (mai in ciclo)      |
  | writing      | accento caldo, bordo pieno + badge diff `+N −M`        |
  | running      | progresso indeterminato                                |
  | waiting-user | colore attenzione: **l'unico** che richiama lo sguardo |
  | error        | colore errore + icona (mai solo colore)                |
  | done         | ritorno al neutro con una scia che sfuma               |

- **Identità degli agenti:** colore + glifo stabili per Claude, subagent Claude e agente Ollama. Locale e cloud si distinguono a colpo d'occhio, anche in scala di grigi.
- **Movimento:** comunica stato, non decora. 150-300 ms, nessuna animazione continua sui nodi inattivi; con `prefers-reduced-motion` niente impulsi. Solo il segmento di attesa può pulsare.
- **Accessibilità:** contrasto **AA** (4.5:1 testo normale, 3:1 testo grande ed elementi grafici) in **entrambi** i temi; mai solo il colore per indicare uno stato.
- **Prestazioni:** il linguaggio visivo dei nodi deve poter reggere **500 nodi a 60 fps** (niente blur, ombre pesanti o filtri per nodo).
- **Calma per default:** se nulla richiede attenzione, nulla si muove fuori dal punto in cui lavora l'agente.
- **Cifre tabulari** ovunque ci siano contatori (barra di stato, card, timeline).
- **Non deve sembrare un template:** niente "dashboard SaaS" generica, niente gradienti viola, niente card arrotondate tutte uguali, niente Inter + emoji di default. La direzione deve avere un punto di vista.

## Dati finti (identici per tutte le direzioni)

### Scenario `normal`

- **Title bar:** workspace `control-center`, branch `feat/live-map`, sessione `Refactor IPC client`.
- **Agenti:**

  | Agente              | Tipo          | Stato          | Dettaglio                                                                  |
  | ------------------- | ------------- | -------------- | -------------------------------------------------------------------------- |
  | `Claude`            | Claude (Opus) | `waiting-user` | chiede di eseguire `npm test -- ipc`; prima ha scritto `src/ipc/client.ts` |
  | `Explore`           | subagent      | `reading`      | legge `packages/ipc-contract/src/channels.ts` · 0m41                       |
  | `qwen2.5-coder:14b` | Ollama locale | `running`      | "Draft tests for client.ts" · 38 tok/s · 1m02                              |

  Card `Claude`: modello `opus-5.5`, task "Refactor IPC client to typed channels", tool `Bash`, `2m14`, `41k tok`, azioni `Interrupt` · `Open log` · `Follow on map`.

- **Mappa** (cartelle → file; almeno un nodo per ogni stato):

  | Nodo                                                     | Stato                 | Note                                                        |
  | -------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
  | `src/ipc/client.ts`                                      | `writing`→ vedi sotto | badge `+12 −3`; ultimo file scritto da Claude               |
  | `src/ipc/server.ts`                                      | `done`                | scia che sfuma, badge `+4 −1`                               |
  | `packages/ipc-contract/src/channels.ts`                  | `reading`             | avatar `Explore` agganciato, arco di lettura                |
  | `packages/ipc-contract/src/schema.test.ts`               | `error`               | icona errore, "2 failing"                                   |
  | `npm test -- ipc`                                        | `waiting-user`        | nodo temporaneo collegato a `Claude`, in attesa di permesso |
  | `ollama: draft tests`                                    | `running`             | nodo temporaneo collegato a `qwen2.5-coder:14b`             |
  | `src/main/index.ts`, `src/preload/index.ts`, `README.md` | `idle`                | vicini diretti, neutri                                      |
  | cartelle `src/`, `packages/`, `docs/` (collassata)       | —                     | contenitori                                                 |

  Per avere in mappa anche un nodo `writing` vivo, `src/ipc/client.ts` è mostrato `writing` (Claude ha appena scritto e ora chiede il permesso per i test): avatar Claude in attesa vicino a `npm test`, arco di scrittura verso `client.ts`.

- **Timeline:** 3 swimlane (`Claude`, corsia figlia `Explore` nata a 1m30, corsia `qwen2.5-coder:14b` nata a 1m10). Eventi: Read ×4, Grep ×2, Edit `client.ts`, Edit `server.ts`, **marcatore checkpoint** prima della prima Edit, Bash `npm test` in attesa (blocco aperto in colore attenzione), un errore su `schema.test.ts`. Scrubber al presente (`Live`), scala temporale `0:00 … 2:14`.
- **Dock Session** (chat + dialog permesso aperto):
  - due o tre messaggi di conversazione brevi (utente: "Refactor the IPC client to use the typed channels from ipc-contract"; Claude: riassunto di cosa ha fatto);
  - **dialog permesso:** tool `Bash`; comando `npm test -- ipc`; cwd `C:\dev\control-center`; motivo "Run the IPC tests to verify the refactor"; pulsanti `Approve` (`Ctrl+Enter`), `Deny` (`Ctrl+Backspace`), `Always this session` (`Ctrl+Shift+Enter`); nota "Esc closes without denying";
  - sopra l'input del task: modello `opus-5.5`, `3 MCP`, `Checkpoint on`; input disabilitato con placeholder "Waiting for your decision…".
- **Barra di stato** (tutti i segmenti, in ordine): `control-center · feat/live-map` · `● Session active` · `◆ Claude · waiting · +2` · **`⚠ Waiting for you: npm test -- ipc`** · `✖ 2` · `2 changed` · `182k tok · 31k local` · `▮▮▮▯ 9.1/16 GB` · `Docker · 4`.
- **Barra attività:** badge `2` su Git, nessun altro badge.

### Scenario `dense`

Serve a vedere se la direzione regge 4+ agenti. Stessa finestra, ma:

- **5 agenti:** `Claude` (writing `src/ipc/client.ts`), `Claude #2` (running `pnpm typecheck`), subagent `Explore` (reading), subagent `Plan` (idle, appena finito → done), `qwen2.5-coder:14b` (running, 41 tok/s).
- **~40 nodi** in mappa: aggiungere file plausibili in `src/ipc/`, `src/main/`, `src/renderer/components/`, `packages/ipc-contract/src/`, `packages/event-schema/src/`; distribuire gli stati (maggioranza idle, 3-4 done, 2 reading, 2 writing, 2 running, 1 waiting-user, 2 error).
- **Timeline fitta:** 5 corsie, 40-60 eventi, 2 checkpoint.
- Barra di stato: `◆ Claude · writing · +4`, `✖ 3`, `7 changed`, `412k tok · 96k local`, `▮▮▮▮ 13.8/16 GB`.

## Le tre direzioni

Devono restare **lontane** tra loro: metafora, tipografia, uso del colore, forma dei nodi, ritmo.

### `precisione` — Strumento di precisione

Linguaggio da IDE e terminale. Il mono è protagonista (etichette, contatori, nomi di file), la sans solo dove serve leggere frasi. Densità alta, griglia rigorosa, bordi a 1 px, **zero ombre**, angoli quasi retti. Quasi monocromo: il colore è riservato agli stati e alle identità degli agenti, tutto il resto è scala di grigi calibrata. Gli stati si leggono prima dalla forma e dal tratto (pieno, tratteggiato, barra di progresso, marcatore) e poi dal colore. Riferimenti di spirito: strumenti di misura, oscilloscopi digitali, editor da tastiera. Tema scuro e chiaro di pari dignità.

### `sala-controllo` — Sala controllo

Strumentazione e telemetria. Fondo scuro profondo, griglie e righelli sottili, tacche di scala sulla timeline, grotesk condensato per le etichette e numeri grandi per la telemetria (token, tok/s, VRAM). I segnali sono **luminosi e forti, ma solo dove c'è uno stato**: il resto è spento, come un pannello di controllo di notte. Gli agenti hanno sigle e indicatori come canali di un mixer o tracce radar. Il tema chiaro è "sala controllo di giorno" (carta tecnica, inchiostri densi), non un'inversione automatica.

### `carta-inchiostro` — Carta e inchiostro

Editoriale e calma. **Chiaro-first:** carta calda, inchiostro scuro, molto spazio bianco, tipografia espressiva (serif o humanist per titoli e nomi degli agenti, mono discreto per percorsi e numeri). La mappa sembra uno schema disegnato a mano con precisione tipografica; gli stati sono **segni d'inchiostro**: sottolineature, cerchiature, timbri, tratteggi, evidenziatore per l'attesa. Il colore è scarso e caldo. La variante scura è "inchiostro su carta notturna", non un tema scuro generico. Deve restare usabile in densità `compact`.

## Checklist di accettazione (da copiare e spuntare nel README)

- [ ] `live.html` mostra tutti i contenuti dello scenario `normal`: 7 stati in mappa, 3 tipi di agente, dialog permesso aperto, timeline con corsie figlie, checkpoint e scrubber, barra di stato completa con il segmento di attesa.
- [ ] Lo scenario `dense` mostra 5 agenti e ~40 nodi senza sovrapposizioni illeggibili.
- [ ] I quattro parametri URL e la barra di toggle funzionano in ogni combinazione, senza errori in console.
- [ ] Contrasto AA verificato per testo e indicatori di stato in **entrambi** i temi (rapporti nelle tabelle della palette).
- [ ] Con `gray=1` si distinguono i 7 stati e i 3 tipi di agente.
- [ ] Nessun colore usato fuori dalla palette dichiarata (tutti i colori sono variabili CSS su `:root` / tema).
- [ ] `prefers-reduced-motion` rispettato: niente impulsi né scie animate; solo il segmento di attesa pulsa quando il movimento è consentito.
- [ ] Font solo OFL o MIT, con licenza indicata.
- [ ] Nessuna libreria JS, nessuna immagine esterna.
