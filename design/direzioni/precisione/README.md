# Direzione `precisione` — Strumento di precisione

Mockup: [`live.html`](live.html) · parametri `?theme=dark|light&density=compact|comfortable&scenario=normal|dense&gray=1` (default `dark`, `compact`, `normal`).

## Idea

La Vista Live è uno **strumento di misura per il codice**: un editor da tastiera incrociato con un analizzatore logico. Ogni file è una cella con una **colonna dei segni** a sinistra (come il gutter di un editor): lì vive lo stato, prima come forma e poi come colore. La timeline è un **analizzatore logico**: ogni agente è un canale, ogni evento è una cella di decodifica esagonale (`rd`, `gr`, `ed`, `sh`), le corsie figlie escono dal canale padre con una forcella nel punto di nascita. L'attesa è il **cursore a blocco che lampeggia**, come quello dell'editor: "tocca a te scrivere". Per il "Dev quotidiano", che tiene l'app sul secondo monitor accanto all'editor, è un linguaggio che già conosce (gutter, diff, cursore, scorciatoie), quasi monocromo: l'occhio va solo dove c'è uno stato, e il colore più forte esiste in un solo punto, quello che aspetta lui.

## Palette

Grigi **neutri e calibrati** (R = G = B, nessuna tinta). Il colore è riservato ai 7 stati e alle 3 identità d'agente; selezione, focus e pulsante primario sono **inverse video** (testo e fondo scambiati), non un colore d'accento. Rapporti WCAG 2.x calcolati con uno script che legge i token direttamente da `live.html` (minimo sui fondi su cui il token è usato davvero).

### Tema scuro

| Token               | Hex       | Contrasto (minimo sui fondi d'uso) | Uso                                                 |
| ------------------- | --------- | ---------------------------------- | --------------------------------------------------- |
| `--bg-0`            | `#0E0E0E` | testo fg-1 16.19:1                 | cornice: title bar, barra attività, barra di stato  |
| `--bg-1`            | `#151515` | testo fg-1 15.32:1                 | tela: mappa, timeline                               |
| `--bg-2`            | `#1B1B1B` | testo fg-1 14.45:1                 | pannelli Agents e Session, celle dei nodi           |
| `--bg-3`            | `#262626` | testo fg-1 12.69:1                 | rialzo: hover, celle `ed` passate                   |
| `--fg-1`            | `#EBEBEB` | 12.69:1 su bg-3                    | testo primario                                      |
| `--fg-2`            | `#A3A3A3` | 6.00:1 su bg-3                     | testo secondario, etichette                         |
| `--fg-3`            | `#858585` | 4.67:1 su bg-2                     | disattivo (placeholder dell'input bloccato)         |
| `--line`            | `#2E2E2E` | 1.27:1 su bg-2                     | divisori (strutturali, mai indicatori)              |
| `--line-2`          | `#4A4A4A` | 1.94:1 su bg-2                     | bordi dei nodi idle e dei contenitori (strutturali) |
| `--line-3`          | `#6E6E6E` | 3.38:1 su bg-2                     | bordi di controlli, chip agente, connettori         |
| `--accent`          | `#EBEBEB` | 14.45:1 su bg-2                    | selezione, focus, `Approve` (inverse video)         |
| `--on-accent`       | `#0E0E0E` | 16.19:1 su accent                  | testo sull'accento                                  |
| `--st-idle`         | `#8F8F8F` | 5.33:1 su bg-2                     | idle                                                |
| `--st-reading`      | `#6AAEFF` | 7.47:1 su bg-2                     | reading                                             |
| `--st-writing`      | `#FF9A4D` | 8.19:1 su bg-2                     | writing                                             |
| `--st-running`      | `#7FD36A` | 9.37:1 su bg-2                     | running                                             |
| `--st-waiting`      | `#FFD43B` | 12.08:1 su bg-2                    | waiting-user: piastra piena                         |
| `--on-waiting`      | `#141414` | 12.92:1 su st-waiting              | testo e glifi sulla piastra                         |
| `--st-waiting-text` | `#FFD43B` | 12.08:1 su bg-2                    | waiting-user usato come testo                       |
| `--st-error`        | `#FF6B6B` | 6.21:1 su bg-2                     | error                                               |
| `--st-done`         | `#B3B3B3` | 8.21:1 su bg-2                     | done                                                |
| `--ag-claude`       | `#C4A5FF` | 8.34:1 su bg-2                     | identità Claude e subagent                          |
| `--ag-local`        | `#4FD6C8` | 9.67:1 su bg-2                     | identità Ollama (locale)                            |

### Tema chiaro

| Token               | Hex       | Contrasto (minimo sui fondi d'uso) | Uso                                         |
| ------------------- | --------- | ---------------------------------- | ------------------------------------------- |
| `--bg-0`            | `#E6E6E6` | testo fg-1 14.76:1                 | cornice                                     |
| `--bg-1`            | `#F4F4F4` | testo fg-1 16.75:1                 | tela: mappa, timeline                       |
| `--bg-2`            | `#FFFFFF` | testo fg-1 18.42:1                 | pannelli, celle dei nodi                    |
| `--bg-3`            | `#ECECEC` | testo fg-1 15.59:1                 | rialzo                                      |
| `--fg-1`            | `#141414` | 14.76:1 su bg-0                    | testo primario                              |
| `--fg-2`            | `#575757` | 5.79:1 su bg-0                     | testo secondario                            |
| `--fg-3`            | `#6E6E6E` | 4.64:1 su bg-1                     | disattivo                                   |
| `--line`            | `#DCDCDC` | 1.25:1 su bg-1                     | divisori (strutturali)                      |
| `--line-2`          | `#B5B5B5` | 1.86:1 su bg-1                     | bordi nodi idle e contenitori (strutturali) |
| `--line-3`          | `#7A7A7A` | 3.44:1 su bg-0                     | bordi di controlli, chip, connettori        |
| `--accent`          | `#141414` | 14.76:1 su bg-0                    | selezione, focus, `Approve`                 |
| `--on-accent`       | `#FFFFFF` | 18.42:1 su accent                  | testo sull'accento                          |
| `--st-idle`         | `#636363` | 5.46:1 su bg-1                     | idle                                        |
| `--st-reading`      | `#1B62C9` | 4.63:1 su bg-0                     | reading                                     |
| `--st-writing`      | `#A64A05` | 4.67:1 su bg-0                     | writing                                     |
| `--st-running`      | `#2C7520` | 4.58:1 su bg-0                     | running                                     |
| `--st-waiting`      | `#141414` | 14.76:1 su bg-0                    | waiting-user: piastra piena (inchiostro)    |
| `--on-waiting`      | `#FFD43B` | 12.92:1 su st-waiting              | testo e glifi gialli sulla piastra          |
| `--st-waiting-text` | `#7A5A00` | 5.11:1 su bg-0                     | waiting-user usato come testo               |
| `--st-error`        | `#C4272A` | 4.58:1 su bg-0                     | error                                       |
| `--st-done`         | `#474747` | 7.44:1 su bg-0                     | done                                        |
| `--ag-claude`       | `#6A3FD1` | 5.19:1 su bg-0                     | identità Claude e subagent                  |
| `--ag-local`        | `#00736A` | 4.60:1 su bg-0                     | identità Ollama (locale)                    |

Note:

- **waiting-user è una "targa di pericolo"** giallo + nero in entrambi i temi: nel tema scuro piastra gialla con inchiostro nero; nel chiaro piastra nera con testo giallo. Un giallo pieno su bianco avrebbe 1.43:1 come elemento grafico e in scala di grigi sparirebbe; la piastra nera è l'unico blocco pieno scuro della schermata chiara e resta l'elemento più evidente anche con `gray=1`.
- `--line` e `--line-2` sono sotto 3:1 di proposito: sono struttura (griglia, contenitori). Nessuno stato si legge solo da loro; ogni nodo è identificato dal nome (≥ 5:1) e ogni stato da glifo + tratto ≥ 3:1.
- `--page` (`#080808` / `#D4D4D4`) è solo il fondo della pagina del mockup, fuori dalla finestra.

## Tipografia

| Ruolo               | Font                                                           | Licenza     | Uso                                                                                  |
| ------------------- | -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Mono (protagonista) | **Martian Mono** (variabile: `wdth` 75-112.5, `wght` 300-700)  | SIL OFL 1.1 | nomi file, contatori, etichette, timeline, barra di stato, pulsanti                  |
| Sans (solo frasi)   | **Instrument Sans** (variabile: `wdth` 75-100, `wght` 400-700) | SIL OFL 1.1 | messaggi della chat, motivo del permesso, compito dell'agente, titolo della sessione |

- Il mono usa l'asse di larghezza come strumento: **87.5 %** per cornice e letture, **75 %** (condensato) per celle della mappa e decodifica della timeline. Così un mono resta leggibile a 11 px e regge 40 nodi in 760 px.
- **Cifre tabulari** ovunque (`font-variant-numeric: tabular-nums`; nel mono lo sono per costruzione): contatori, tempi, token, VRAM non "ballano" mentre cambiano.
- Pesi: 400 di base, 600 solo per il titolo del dialog di permesso e il comando in attesa. Niente maiuscolo spaziato: le etichette sono minuscole, come in un terminale.

Scala (px):

| Token      | compact | comfortable | Uso                                                     |
| ---------- | ------- | ----------- | ------------------------------------------------------- |
| `--fs-xs`  | 10.5    | 11          | assi, scorciatoie, metadati delle celle, barra di stato |
| `--fs-s`   | 11      | 12          | etichette mono, nomi agenti                             |
| `--fs-map` | 11      | 11.5        | nomi dei file in mappa (mono condensato)                |
| `--fs-m`   | 12.5    | 13.5        | frasi in sans                                           |
| `--fs-l`   | 13.5    | 14.5        | comando nel dialog di permesso                          |

Nel mockup i font arrivano da Google Fonts; nell'app vanno inclusi nel pacchetto (entrambi OFL).

## Stati e agenti

Ogni stato ha **glifo nella colonna dei segni + tratto del bordo**; il colore arriva per terzo. Gli stessi segni valgono in mappa, card, timeline e barra di stato.

| Stato        | Glifo (gutter)     | Tratto / forma                                          | Colore        | Timeline                              |
| ------------ | ------------------ | ------------------------------------------------------- | ------------- | ------------------------------------- |
| idle         | quadratino `▪`     | bordo 1 px strutturale, nome in grigio                  | `--st-idle`   | linea di bus piatta                   |
| reading      | doppio chevron `»` | bordo **tratteggiato**                                  | info blu      | cella tratteggiata `rd`               |
| writing      | pennino pieno      | bordo **pieno 2 px** + badge diff `+N −M` riquadrato    | arancio caldo | cella con bordo 2 px `ed`             |
| running      | barra di progresso | **barra indeterminata** sul fondo della cella           | verde         | cella **tratteggiata a 45°** (hatch)  |
| waiting-user | triangolo `⚠`      | **piastra piena** (giallo/nero) + cursore a blocco      | giallo + nero | cella piena con cursore che lampeggia |
| error        | croce `✕`          | bordo + **tacca triangolare** nell'angolo + "2 failing" | rosso         | cella con `✕`                         |
| done         | spunta `✓`         | bordo neutro + **scia a tre tacche decrescenti**        | grigio chiaro | cella `ed` neutra, piena `--bg-3`     |

Storia calma: nella timeline gli eventi **passati sono grigi** (si distinguono per forma: tratteggio = lettura, pieno = scrittura, contorno = comando); colorati restano solo gli eventi aperti e gli errori.

Agenti (glifo stabile + colore d'identità):

| Tipo            | Glifo                           | Colore                         | Locale/cloud                                  |
| --------------- | ------------------------------- | ------------------------------ | --------------------------------------------- |
| Claude          | rombo **pieno** `◆`             | lilla `--ag-claude`            | etichetta `cloud`                             |
| subagent Claude | rombo **vuoto con punto** `◇`   | stesso lilla (stessa famiglia) | etichetta `cloud`, corsia figlia con forcella |
| Ollama          | **chip** (quadrato con piedini) | verde acqua `--ag-local`       | etichetta `local` con bordo pieno             |

In scala di grigi: gli stati restano distinti perché nessuna coppia condivide sia glifo sia tratto (tratteggio, 2 px, piastra piena, tacca, barra, tre tacche); waiting è l'unica piastra piena (chiara nel tema scuro, nera nel chiaro). Gli agenti si distinguono per sagoma: rombo pieno, rombo vuoto, chip; locale contro cloud è sagoma (chip contro rombo) più etichetta testuale. Verificato con `gray=1` in entrambi i temi.

Sulla mappa gli agenti stanno su una **rotaia** a destra (chip con glifo, nome, stato e il loro nodo temporaneo agganciato sotto, bordo sinistro doppio). Gli archi sono **tracce ortogonali** stile circuito stampato che passano nei corridoi tra le colonne e su bus sopra le cartelle: scrittura piena 1.5 px, lettura tratteggiata. Sul nodo di destinazione il glifo dell'agente è "agganciato" a destra.

## Movimento

Il movimento esiste solo dove c'è uno stato; a riposo non si muove nulla.

| Cosa                                                | Come                                                                                                                     | Durata / curva                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| cambio di stato di una cella (bordo, fondo, colore) | transizione                                                                                                              | 200 ms, `cubic-bezier(.2,0,0,1)`                       |
| reading: impulso leggero                            | il glifo passa da 35 % a 100 % **una volta per lettura**                                                                 | 300 ms, stessa curva                                   |
| done: scia che sfuma                                | glifo e tre tacche vanno dal colore writing al neutro, una volta                                                         | 300 ms                                                 |
| running: progresso indeterminato                    | segmento che scorre sul fondo della cella e della card                                                                   | 1200 ms lineare, solo su celle running                 |
| waiting-user                                        | **cursore a blocco che lampeggia** solo nel segmento di attesa della barra di stato (in timeline il cursore resta fisso) | 1060 ms `steps(1)` (il ritmo del cursore di un editor) |

Durate 150-300 ms per tutte le transizioni (`--dur-1/2/3`). Niente blur, ombre o filtri per nodo.

Con `prefers-reduced-motion: reduce`: tutte le animazioni sono dichiarate solo dentro `@media (prefers-reduced-motion: no-preference)`, quindi spariscono; il cursore resta acceso fisso, la barra running diventa un tratteggio statico, la scia done resta come tre tacche ferme.

## Densità

|                              | compact (default) | comfortable         |
| ---------------------------- | ----------------- | ------------------- |
| altezza riga / cella         | 20 px             | 24 px               |
| spazio tra celle             | 2 px              | 3 px                |
| altezza corsia timeline      | 34 px             | 40 px               |
| testo mono / mappa / sans    | 11 / 11 / 12.5 px | 12 / 11.5 / 13.5 px |
| padding orizzontale pannelli | 8 px              | 12 px               |
| padding card agente          | 8 px              | 12 px               |

La larghezza dei dock e delle colonne non cambia: cambia il ritmo verticale. La mappa applica una **priorità semantica**: se un nome di file non entra, prima si accorcia la nota d'errore ("2 failing" → "2"), poi spariscono diff dei file `done` e la parola di stato sulla rotaia; nome, glifo di stato e diff dei file `writing` non spariscono mai.

## Punti di forza

- **Si legge in 2 secondi anche senza colore**: gutter + tratto rendono ogni stato riconoscibile in scala di grigi; l'unica piastra piena è l'attesa.
- **Linguaggio nativo per chi usa un IDE**: gutter, badge diff, cursore, scorciatoie sempre visibili accanto alle azioni.
- **Regge la densità**: celle da 20 px in mono condensato, 40 nodi in 760 px senza sovrapposizioni; la timeline a decodifica rimane ordinata con 50 eventi.
- **Prestazioni**: ogni nodo è un rettangolo con bordo 1-2 px e un glifo; nessuna ombra, blur o gradiente per nodo. Solo le celle running e il cursore d'attesa animano.
- **Due temi di pari dignità**: il chiaro non è un'inversione, ha la sua targa d'attesa nera.

## Rischi

- **500 nodi**: a quella scala le celle da 20 px diventano puntini; serve lo zoom semantico (cartelle collassate in celle "impilate" a doppio bordo, già nel mockup per `docs/`) e un livello di dettaglio senza testo. Le tracce ortogonali con molti agenti possono affollare i corridoi: servirà un instradamento (ELK) con canali dedicati.
- **Metà schermo**: con dock Session aperto la mappa scende sotto i 500 px; il mono, anche condensato, tronca presto i nomi lunghi (già visibile con `agent-event.test.ts` e `PermissionDialog.tsx` in `dense`).
- **Monotonia**: quasi tutto grigio può sembrare freddo o "tecnico" a chi non vive nel terminale; il lilla d'identità è l'unico calore costante.
- **Testo piccolo**: 10.5-11 px condensato è al limite su schermi a 100 % di scala; `comfortable` aiuta, ma la scala minima va validata su un monitor reale.
- **Tema chiaro**: la targa nera d'attesa vicino al pulsante `Approve` (anch'esso nero, inverse video) nel dialog crea due blocchi scuri vicini; da verificare in Figma.
- **Stato misto in `dense`**: Claude scrive (`client.ts`) e intanto ha una richiesta `npm test -- ipc` in attesa (chiamata di tool parallela); è coerente con Claude Code ma va spiegato bene nella card.

## Nomi proposti

- **Vernier**: il calibro a nonio, lo strumento che misura il decimo di millimetro; promette precisione senza enfasi.
- **Gutter**: la colonna dei segni dell'editor, il cuore visivo di questa direzione; parla subito a chi programma.
- **Probe**: la sonda dell'oscilloscopio e dell'analizzatore logico; si "aggancia" agli agenti e mostra cosa passa sul bus.

## Checklist di accettazione

- [x] `live.html` mostra tutti i contenuti dello scenario `normal`: 7 stati in mappa, 3 tipi di agente, dialog permesso aperto, timeline con corsie figlie, checkpoint e scrubber, barra di stato completa con il segmento di attesa.
- [x] Lo scenario `dense` mostra 5 agenti e ~40 nodi senza sovrapposizioni illeggibili (40 nodi contati nel DOM; qualche nome lungo idle è troncato con ellissi, nessuna sovrapposizione).
- [x] I quattro parametri URL e la barra di toggle funzionano in ogni combinazione, senza errori in console (verificato in Edge headless: 5 combinazioni, valori non validi compresi, più un clic sui toggle con `history.replaceState` su `file://`).
- [x] Contrasto AA verificato per testo e indicatori di stato in **entrambi** i temi (rapporti nelle tabelle della palette; `--line`/`--line-2` sono strutturali e dichiarati sotto 3:1).
- [x] Con `gray=1` si distinguono i 7 stati e i 3 tipi di agente.
- [x] Nessun colore usato fuori dalla palette dichiarata (tutti i colori sono variabili CSS su `:root` / tema).
- [x] `prefers-reduced-motion` rispettato: niente impulsi né scie animate; solo il segmento di attesa pulsa quando il movimento è consentito (oltre alla barra indeterminata di running, che è progresso e non impulso; con movimento ridotto diventa statica).
- [x] Font solo OFL o MIT, con licenza indicata.
- [x] Nessuna libreria JS, nessuna immagine esterna.
