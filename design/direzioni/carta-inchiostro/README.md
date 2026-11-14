# Direzione `carta-inchiostro` — Carta e inchiostro

Mockup: [`live.html`](live.html). Parametri: `?theme=dark|light&density=compact|comfortable&scenario=normal|dense&gray=1`, combinabili; la barra sopra la finestra fa le stesse cose e aggiorna l'URL.

## Idea

La Live è una **bozza corretta a penna**. La mappa è uno _stemma_: un albero di cartelle e file tracciato a filo d'inchiostro, come lo schema di un filologo. Gli agenti sono **sigilli**: rotondi se lavorano in cloud, quadrati se girano sulla macchina. Gli stati sono **segni di correzione**: sottolineatura per chi legge, riquadro pieno e nota a margine `+N −M` per chi scrive, tratteggio che scorre per chi esegue, cerchiatura e croce per l'errore, spunta e alone che sbiadisce per il fatto, **evidenziatore giallo** per ciò che aspetta te. Per il "Dev quotidiano", che guarda l'app di sfuggita dal secondo monitor, funziona perché la pagina è calma, quasi tutta carta e inchiostro. L'unica cosa che salta all'occhio è il giallo dell'evidenziatore, cioè proprio la domanda "aspetta me?". Il resto si legge come un foglio che conosce già: chi ha toccato cosa, dove, con quale segno.

## Palette

Tutti i colori sono variabili CSS su `:root[data-theme=…]`; nel file non c'è nessun colore scritto fuori da lì. I rapporti di contrasto WCAG 2.x sono stati calcolati con uno script, non stimati. Soglie: 4.5:1 per il testo, 3:1 per gli elementi grafici e i bordi dei controlli. Le righe "decorativo" non portano informazione da sole.

### Tema chiaro — "carta" (il tema di riferimento)

| Ruolo                                                   | Token                | Hex       | Contrasto (sul fondo d'uso)                                                                           |
| ------------------------------------------------------- | -------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Superficie 0: mappa, carta                              | `--surface-0`        | `#F3EEE1` | fondo · `--ink` 13.81                                                                                 |
| Superficie 1: pannelli, timeline, dock                  | `--surface-1`        | `#ECE5D4` | fondo · `--ink` 12.74                                                                                 |
| Superficie 2: title bar, barra attività, barra di stato | `--surface-2`        | `#E2D9C3` | fondo · `--ink` 11.39                                                                                 |
| Superficie in rilievo: dialog permesso, badge           | `--surface-raised`   | `#FBF8F1` | fondo · `--ink` 15.09                                                                                 |
| Testo primario (inchiostro ferrogallico)                | `--ink`              | `#1D2130` | 13.81 su s-0 · 11.39 su s-2                                                                           |
| Testo secondario                                        | `--ink-2`            | `#4E4C47` | 7.40 su s-0 · 6.10 su s-2                                                                             |
| Testo disattivo, icone inattive                         | `--ink-3`            | `#6F6A5F` | 4.64 su s-0 · 3.83 su s-2                                                                             |
| Filetto sottile                                         | `--rule`             | `#CEC4AC` | 1.50 (decorativo: separatori)                                                                         |
| Bordo dei controlli                                     | `--rule-strong`      | `#7C7360` | 4.05 su s-0 · 3.34 su s-2                                                                             |
| Rami dell'albero                                        | `--tree`             | `#8A816C` | 3.33 su s-0 · 3.08 su s-1                                                                             |
| Accento (seppia)                                        | `--accent`           | `#8A4310` | 6.27 su s-0 · 5.79 su s-1                                                                             |
| Testo su accento                                        | `--on-accent`        | `#FBF8F1` | 6.85 su `--accent`                                                                                    |
| idle                                                    | `--idle`             | `#6F6A5F` | 4.64 su s-0                                                                                           |
| reading (blu inchiostro)                                | `--reading`          | `#24509A` | 6.74 su s-0 · 6.22 su s-1                                                                             |
| writing (seppia = accento)                              | `--writing`          | `#8A4310` | 6.27 su s-0 · 5.79 su s-1                                                                             |
| running (inchiostro: conta la forma)                    | `--running`          | `#1D2130` | 13.81 su s-0                                                                                          |
| waiting-user: evidenziatore                             | `--highlight`        | `#F4D53A` | campitura; testo `--on-highlight` 10.99; contro la carta 1.26 → il bordo `--waiting` fa da indicatore |
| waiting-user: bordo e icona                             | `--waiting`          | `#6B4F00` | 6.61 su s-0 · 5.45 su s-2 · 5.26 su evidenziatore                                                     |
| Testo su evidenziatore                                  | `--on-highlight`     | `#1D2130` | 10.99 su `--highlight`                                                                                |
| error (rosso penna)                                     | `--error`            | `#AE2318` | 5.94 su s-0 · 5.48 su s-1 · 4.90 su s-2                                                               |
| done (neutro)                                           | `--done`             | `#5E5A50` | 5.94 su s-0 · 4.67 sulla scia                                                                         |
| Scia del done                                           | `--trail`            | `#E6D2B6` | campitura; `--ink` 10.86 · `--ink-2` 5.82                                                             |
| Identità Claude e subagent (viola copiativo)            | `--claude` / `--sub` | `#5B3A8C` | 7.46 su s-0 · glifo chiaro sul sigillo 8.15                                                           |
| Identità Ollama (verde bottiglia)                       | `--ollama`           | `#2B6642` | 5.88 su s-0 · 6.42 su rilievo                                                                         |
| Puntinato della mappa                                   | `--grid`             | `#E7DFCC` | 1.15 (decorativo)                                                                                     |
| Pagina fuori dalla finestra                             | `--page`             | `#D8CFBA` | `--page-ink` 10.33 · `--page-ink-2` 5.54                                                              |

### Tema scuro — "inchiostro su carta notturna"

Non è l'inversione del chiaro. La carta diventa bruna e calda, l'inchiostro diventa avorio e i colori sono quelli di inchiostri gel su carta scura. L'evidenziatore resta giallo pieno con testo scuro sopra, come un pennarello fluorescente su un quaderno nero.

| Ruolo                       | Token                | Hex       | Contrasto (sul fondo d'uso)                                  |
| --------------------------- | -------------------- | --------- | ------------------------------------------------------------ |
| Superficie 0: mappa         | `--surface-0`        | `#211D18` | fondo · `--ink` 13.49                                        |
| Superficie 1: pannelli      | `--surface-1`        | `#27221C` | fondo · `--ink` 12.69                                        |
| Superficie 2: chrome        | `--surface-2`        | `#1A1713` | fondo · `--ink` 14.38                                        |
| Superficie in rilievo       | `--surface-raised`   | `#302A23` | fondo · `--ink` 11.41                                        |
| Testo primario (avorio)     | `--ink`              | `#EEE6D4` | 13.49 su s-0 · 14.38 su s-2                                  |
| Testo secondario            | `--ink-2`            | `#BDB39E` | 8.06 su s-0 · 8.59 su s-2                                    |
| Testo disattivo             | `--ink-3`            | `#958B77` | 4.98 su s-0 · 5.30 su s-2                                    |
| Filetto sottile             | `--rule`             | `#3B342B` | 1.37 (decorativo)                                            |
| Bordo dei controlli         | `--rule-strong`      | `#7A705D` | 3.43 su s-0 · 3.66 su s-2                                    |
| Rami dell'albero            | `--tree`             | `#7A705D` | 3.43 su s-0 · 3.23 su s-1                                    |
| Accento (ambra)             | `--accent`           | `#E3A262` | 7.67 su s-0 · 7.22 su s-1                                    |
| Testo su accento            | `--on-accent`        | `#1A1713` | 8.17 su `--accent`                                           |
| idle                        | `--idle`             | `#958B77` | 4.98 su s-0                                                  |
| reading                     | `--reading`          | `#8FB2EE` | 7.79 su s-0 · 7.34 su s-1                                    |
| writing                     | `--writing`          | `#E3A262` | 7.67 su s-0 · 7.22 su s-1                                    |
| running                     | `--running`          | `#EEE6D4` | 13.49 su s-0                                                 |
| waiting-user: evidenziatore | `--highlight`        | `#E9CB3C` | 10.43 contro la carta notturna; testo `--on-highlight` 11.12 |
| waiting-user: icona e testo | `--waiting`          | `#F2D45C` | 11.44 su s-0 · 12.20 su s-2                                  |
| Testo su evidenziatore      | `--on-highlight`     | `#1A1713` | 11.12 su `--highlight`                                       |
| error                       | `--error`            | `#F2837A` | 6.62 su s-0 · 6.23 su s-1 · 5.61 su rilievo                  |
| done                        | `--done`             | `#B3AA96` | 7.26 su s-0 · 4.83 sulla scia                                |
| Scia del done               | `--trail`            | `#4A3826` | campitura; `--ink` 8.97                                      |
| Identità Claude e subagent  | `--claude` / `--sub` | `#BCA3EC` | 7.65 su s-0 · glifo scuro sul sigillo 6.47                   |
| Identità Ollama             | `--ollama`           | `#7EC79A` | 8.39 su s-0                                                  |
| Puntinato della mappa       | `--grid`             | `#332D25` | 1.23 (decorativo)                                            |
| Pagina fuori dalla finestra | `--page`             | `#100E0B` | `--page-ink` 15.51                                           |

Nel corso del lavoro sono stati scuriti `--rule-strong` e `--tree` del tema chiaro: la prima versione stava sotto 3:1 sulla superficie 2 (2.94) e i rami dell'albero a 2.66.

## Tipografia

| Ruolo              | Font                                   | Licenza     | Uso                                                                                    |
| ------------------ | -------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Serif "letteraria" | **Alegreya** (Huerta Tipográfica)      | SIL OFL 1.1 | nomi degli agenti, cartelle (corsivo), titoli, testo di Claude in chat, note a margine |
| Sans umanista      | **Alegreya Sans**                      | SIL OFL 1.1 | interfaccia: pulsanti, schede, etichette, barra di stato, messaggi dell'utente         |
| Mono               | **Courier Prime** (Quote-Unquote Apps) | SIL OFL 1.1 | percorsi, nomi di file, comandi, **tutti i contatori**                                 |

- Alegreya e Alegreya Sans sono una famiglia nata per i testi letterari, con un ritmo calligrafico che richiama la penna. Courier Prime è la macchina da scrivere: un mono ridisegnato, più robusto di Courier, con cifre per costruzione tutte della stessa larghezza (tabulari). I contatori (tempi, token, tok/s, VRAM, `+N −M`) usano sempre il mono. Dove compaiono cifre in sans c'è `font-variant-numeric: tabular-nums lining-nums`.
- La larghezza fissa del mono (0.6 em, cioè 7.2 px a 12 px) rende prevedibile la lunghezza delle etichette in mappa. Il layout dei nodi la usa per agganciare archi e badge senza misurare il DOM.
- Niente maiuscolo spaziato: la gerarchia si fa con corsivo, peso e serif contro sans.

**Scala** (in px; compact / comfortable):

| Gradino | compact                                                   | comfortable | Dove                                                      |
| ------- | --------------------------------------------------------- | ----------- | --------------------------------------------------------- |
| xs      | 10.5                                                      | 11.5        | scala della timeline, tasti `kbd`, etichette sugli eventi |
| s       | 11.5                                                      | 12.5        | barra di stato, metadati delle card, dettagli del dialog  |
| ui      | 12.5                                                      | 13.5        | pulsanti, schede, toolbar                                 |
| body    | 13.5                                                      | 14.5        | testo della chat, compito dell'agente                     |
| title   | 15                                                        | 16.5        | nome dell'agente nella card, "Timeline", "Session"        |
| display | 19                                                        | 21          | titolo del dialog permesso                                |
| mappa   | 12 mono · 14 serif corsivo (cartelle) · 15 serif (radice) | uguale      | la mappa ha il suo zoom: la densità non la tocca          |

## Stati e agenti

Ogni stato ha un **segno** che resta leggibile anche senza colore. Lo stesso segno compare in mappa, nelle card, nella timeline e nella legenda "Key" in basso a sinistra della mappa.

| Stato        | Segno (forma)                                                                                                                                    | Colore                      | In scala di grigi                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| idle         | cerchietto vuoto, nome in inchiostro secondario                                                                                                  | `--idle`                    | il "nessun segno"                                                                                       |
| reading      | pallino pieno + **sottolineatura** sotto il nome; nella timeline cerchietti vuoti e una linea punteggiata aperta fino a "adesso"                 | `--reading`                 | l'unica sottolineatura                                                                                  |
| writing      | **riquadro pieno** a filo + quadratino pieno + **nota a margine** `+12 −3` su fondo seppia; nome in grassetto                                    | `--writing`                 | l'unico riquadro continuo con badge scuro                                                               |
| running      | **riquadro tratteggiato** + mezzo disco (◐) + barra a trattini che scorre (progresso indeterminato)                                              | `--running` (inchiostro)    | tratteggio                                                                                              |
| waiting-user | **evidenziatore** (campitura con bordi irregolari) + filo inferiore + icona ⚠; nella barra di stato è il segmento evidenziato, l'unico che pulsa | `--highlight` + `--waiting` | fascia piena + icona; in chiaro la fascia diventa grigio tenue, quindi icona e filo sono indispensabili |
| error        | **cerchiatura a mano** (ellisse irregolare, leggermente ruotata) + croce + nota "2 failing"                                                      | `--error`                   | l'unica ellisse + croce                                                                                 |
| done         | **spunta** + **scia** che sfuma da sinistra a destra; badge diff solo a contorno (è passato)                                                     | `--done` + `--trail`        | spunta + alone                                                                                          |

**Agenti: i sigilli.** La forma dice dove gira l'agente, il riempimento dice il ruolo, il glifo conferma.

| Agente                     | Sigillo                             | Glifo                     | Colore                                  |
| -------------------------- | ----------------------------------- | ------------------------- | --------------------------------------- |
| Claude (cloud, principale) | disco **pieno**                     | ◆ pieno, chiaro sul disco | `--claude` viola copiativo              |
| Subagent Claude            | disco **vuoto** con bordo           | ◇ vuoto                   | `--sub` (stesso viola: famiglia Claude) |
| Agente Ollama (locale)     | **quadrato** con tratteggio obliquo | ▲ pieno                   | `--ollama` verde bottiglia              |

- **Cloud contro locale:** rotondo contro quadrato, riconoscibile anche in grigio e a 16 px (timeline).
- **Principale contro subagent:** pieno contro vuoto.
- Il **nome** degli agenti è sempre in Alegreya corsivo, mai in mono: un agente è un attore, non un file.
- Un sigillo in attesa riceve un anello di evidenziatore (`.is-waiting`).
- In mappa gli **archi** collegano il sigillo al nodo: scrittura in tratto pieno seppia con punta piena, lettura a puntini blu con punta aperta, legame con i nodi temporanei (`$ npm test -- ipc`, `ollama: draft tests`) a trattini neutri. I nodi temporanei sono in mono corsivo, con il `$` per i comandi.
- Timeline: le corsie figlie partono con un gomito dal punto di nascita sulla corsia madre. I checkpoint sono un filo tratteggiato verticale con il segno di paragrafo **§** in fondo. Lo scrubber è un filo d'inchiostro con l'etichetta `Live`.

## Movimento

Il movimento segnala uno stato, non decora. Si muove solo ciò che sta lavorando.

| Cosa                                    | Come                                                                                                                                                                            | Durata / curva                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| reading                                 | **un impulso** della sottolineatura (si accorcia al 60 % e torna) a ogni evento di lettura; nel mockup parte una sola volta al caricamento (animazione di 3.2 s, 1 ripetizione) | ~240 ms, `cubic-bezier(.2,.7,.2,1)`                                               |
| running                                 | trattini che scorrono sotto il nodo (solo `transform`)                                                                                                                          | ciclo lineare da 900 ms: è un progresso indeterminato, quindi continuo per natura |
| waiting-user                            | il segmento della barra di stato pulsa con un anello che compare e scompare. **È l'unico impulso continuo**; il blocco aperto nella timeline resta fermo.                       | ciclo da 1.6 s, `cubic-bezier(.45,0,.25,1)`                                       |
| done                                    | la scia perde opacità a gradini, uno per evento successivo (nell'app); ogni gradino è una transizione                                                                           | 300 ms                                                                            |
| hover e focus su pulsanti, link, schede | cambio di fondo o colore                                                                                                                                                        | 150 ms ease-out                                                                   |

- Token: `--dur-1: 150ms`, `--dur-2: 220ms`, `--dur-3: 300ms`; `--ease-out`, `--ease-io`.
- **`prefers-reduced-motion: reduce`:** tutte le animazioni e transizioni sono spente. Resta la forma statica: sottolineatura, trattini fermi, evidenziatore fermo. Lo stato si capisce lo stesso perché nessun segno dipende dal movimento.
- I nodi idle non hanno nessuna animazione. Gli effetti usano solo `transform` e `opacity` su pseudo-elementi, senza `filter`, `blur` né ombre sfumate. L'unica "ombra" è un filo interno a sfocatura zero sul segmento d'attesa.

## Densità

| Elemento                               | compact (default)          | comfortable                                                     |
| -------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| Title bar / toolbar / barra di stato   | 34 / 34 / 24 px            | 40 / 40 / 28 px                                                 |
| Dock Session / colonna Agents          | 336 / 284 px               | 352 / 300 px                                                    |
| Testo interfaccia / corpo / piccolo    | 12.5 / 13.5 / 11.5 px      | 13.5 / 14.5 / 12.5 px                                           |
| Padding dei pannelli                   | 10 px                      | 14 px                                                           |
| Corsia della timeline (normal / dense) | 34 / 30 px                 | 40 / 35 px                                                      |
| Altezza pulsanti                       | 26 px (+6 nel dialog)      | 30 px (+6 nel dialog)                                           |
| Mappa                                  | invariata (ha il suo zoom) | invariata; perde circa 40 px di altezza a favore della timeline |

Compact resta leggibile perché la gerarchia non si appoggia allo spazio ma al cambio di carattere: serif contro sans contro mono, e corsivo contro tondo.

## Punti di forza

- **Una sola cosa grida:** l'evidenziatore giallo è l'unico colore saturo e luminoso della pagina. Lo si trova in mappa, nella card, nella timeline, nel dialog e nella barra di stato, sempre con lo stesso segno.
- **Stati leggibili senza colore:** sottolineatura, riquadro, tratteggio, evidenziatore, cerchiatura, spunta. In `gray=1` si distinguono tutti, e anche cloud/locale e principale/subagent.
- **Mono a larghezza fissa:** il layout della mappa è calcolabile e i contatori non ballano.
- **Molto distante da un "dashboard scuro":** chiaro per primo, tipografia letteraria, segni di correzione al posto di badge e pillole.
- **Leggero da disegnare:** ogni nodo è testo + un bordo + al massimo un pseudo-elemento, senza filtri. Lo sfondo puntinato è un solo `background-image` sul contenitore.

## Rischi

- **500 nodi:** i segni restano economici, ma la mappa "a stemma" con etichette di testo intere diventa illeggibile oltre poche decine di file visibili. Servono zoom semantico (sotto una certa scala i file diventano trattini colorati, come nella minimap) e cartelle collassate con conteggio. L'animazione `running` va limitata ai nodi nel viewport.
- **Metà schermo:** la mappa a colonne (largh. ~740 px qui) soffre sotto i 600 px. La colonna Agents dovrà ridursi alla striscia di sigilli prevista in `architettura.md`.
- **Tema chiaro in scala di grigi:** l'evidenziatore diventa una fascia grigio chiaro poco staccata dalla carta (1.26:1). Lo reggono l'icona ⚠ e il filo inferiore `--waiting`, ma è il punto più debole del test in grigio. Nel tema scuro invece la fascia spicca (10.4:1).
- **Tema scuro:** la carta notturna bruna è calda ma vicina a molti temi "seppia". Il carattere qui sta più nella tipografia e nei segni che nel fondo.
- **Courier Prime** ha personalità: in liste di percorsi lunghi può sembrare "retrò". Un mono più neutro (per esempio IBM Plex Mono, OFL) è l'alternativa se stanca.
- **Font su Google Fonts** solo nel mockup; nell'app vanno inclusi i file con la licenza OFL.
- **Timeline densa:** con chiamate di tool in parallelo, i due blocchi sovrapposti sulla stessa corsia (vedi `Claude #2` nello scenario `dense`) sono stretti; nell'app serve una corsia che si allarga quando ci sono richieste parallele.
- Il **giallo evidenziatore** deve restare riservato: se un giorno servisse anche a "selezionato" o "cerca", la direzione perderebbe il suo unico richiamo.

## Nomi proposti

- **Postilla:** la nota a margine con cui si corregge un testo; l'app annota a margine il lavoro degli agenti.
- **Marginalia:** stessa idea, più internazionale; suona bene in inglese per una repo open source.
- **Stemma:** l'albero dei manoscritti; richiama la mappa a filo d'inchiostro e la discendenza dei subagent.

## Checklist di accettazione

- [x] `live.html` mostra tutti i contenuti dello scenario `normal`: 7 stati in mappa, 3 tipi di agente, dialog permesso aperto, timeline con corsie figlie, checkpoint e scrubber, barra di stato completa con il segmento di attesa.
- [x] Lo scenario `dense` mostra 5 agenti e ~40 nodi senza sovrapposizioni illeggibili. In mappa ci sono 34 file, 3 nodi temporanei, 8 cartelle aperte più `docs/` collassata; la timeline ha 56 eventi e 2 checkpoint. Unica zona stretta: i due blocchi paralleli di `Claude #2` nella timeline, ancora leggibili.
- [x] I quattro parametri URL e la barra di toggle funzionano in ogni combinazione, senza errori in console (verificato in Chromium headless su più di 10 combinazioni, più i click sulla barra e un valore non valido, che torna al default).
- [x] Contrasto AA verificato per testo e indicatori di stato in **entrambi** i temi (rapporti nelle tabelle della palette). Sotto 3:1 restano solo i filetti e il puntinato decorativi e la campitura dell'evidenziatore in chiaro, che ha comunque il bordo `--waiting` a 6.61.
- [x] Con `gray=1` si distinguono i 7 stati e i 3 tipi di agente.
- [x] Nessun colore usato fuori dalla palette dichiarata: tutti gli hex stanno solo nelle due regole `:root[data-theme=…]`.
- [x] `prefers-reduced-motion` rispettato: niente impulsi né scie animate; solo il segmento di attesa pulsa quando il movimento è consentito. Nota: quando il movimento è consentito si muovono anche l'impulso di lettura (una volta per lettura) e il progresso indeterminato di `running`, come chiede la tabella degli stati.
- [x] Font solo OFL o MIT, con licenza indicata: Alegreya, Alegreya Sans, Courier Prime, tutte SIL OFL 1.1.
- [x] Nessuna libreria JS, nessuna immagine esterna. Le icone sono SVG inline; l'unica richiesta di rete è Google Fonts.
