# Direzione `sala-controllo` — Sala controllo

Mockup: [`live.html`](live.html) (finestra simulata 1440×900, parametri `?theme=dark|light&density=compact|comfortable&scenario=normal|dense&gray=1` e barra di toggle sopra la finestra).

## Idea

Un pannello di controllo di notte: tutto è spento finché qualcosa non ha uno stato. La mappa è un piano quotato (griglia fine, righelli, staffe d'angolo al posto dei riquadri delle cartelle, collegamenti ortogonali come un cablaggio), la timeline è un registratore a striscia con tacche ogni 5 s, gli agenti sono **canali** con sigla (`CL`, `C2`, `EX`, `PL`, `QW`) come su un mixer, e la barra di stato è una fila di **annunciatori**: si accende solo il segmento che deve essere letto. Per il "Dev quotidiano" che guarda l'app dal secondo monitor funziona perché lo sguardo va subito all'unica spia accesa in giallo (attesa) o rossa (errore); i numeri che contano (token, tok/s, VRAM, tempo) sono grandi e condensati, leggibili da lontano. Il tema chiaro è la sala di giorno: carta tecnica grigio-verde, inchiostri densi, l'attesa è un nastro giallo con bordo d'inchiostro.

## Palette

Tutti i colori sono variabili CSS definite per tema su `html[data-theme=…]` (generate da un'unica tabella). Rapporti calcolati con la formula WCAG 2.x (luminanza relativa) da uno script, non stimati. Soglie: 4.5:1 testo, 3:1 elementi grafici e bordi dei controlli.

### Tema scuro ("di notte")

| Ruolo                                            | Token                          | Hex                   | Contrasto (sul fondo d'uso)                                                           |
| ------------------------------------------------ | ------------------------------ | --------------------- | ------------------------------------------------------------------------------------- |
| Superficie 0 (mappa, timeline, campi)            | `--s0`                         | `#0A1117`             | fondo                                                                                 |
| Superficie 1 (pannelli)                          | `--s1`                         | `#0F181F`             | fondo                                                                                 |
| Superficie 2 (title bar, card, etichette corsie) | `--s2`                         | `#16212A`             | fondo                                                                                 |
| Superficie 3 (selezione, chip di codice)         | `--s3`                         | `#1F2D39`             | fondo                                                                                 |
| Pagina attorno alla finestra                     | `--page`                       | `#05090D`             | —                                                                                     |
| Testo primario                                   | `--tx-1`                       | `#E2EBF1`             | 15.73 su s0 · 14.85 su s1 · 13.53 su s2 · 11.65 su s3                                 |
| Testo secondario                                 | `--tx-2`                       | `#97A9B7`             | 7.85 su s0 · 7.41 su s1 · 6.75 su s2 · 5.81 su s3                                     |
| Testo disattivo (placeholder)                    | `--tx-3`                       | `#6C7F8E`             | 4.33 su s1 · 3.94 su s2 (esente, ma ≥ 3)                                              |
| Bordo divisorio (decorativo)                     | `--line`                       | `#22313D`             | 1.35 su s1 (non porta informazione)                                                   |
| Bordo controlli, righelli, staffe                | `--line-2`                     | `#5B7184`             | 3.75 su s0 · 3.54 su s1 · 3.22 su s2                                                  |
| Griglia minore / maggiore (decorative)           | `--grid-1` / `--grid-2`        | `#101B23` / `#172631` | —                                                                                     |
| Accento ("luce", focus, selezione, playhead)     | `--accent`                     | `#CFE4F3`             | 13.70 su s1 · 12.49 su s2                                                             |
| Testo su accento                                 | `--on-accent`                  | `#0A1117`             | 14.51 su accent                                                                       |
| idle                                             | `--st-idle`                    | `#71879A`             | 5.10 su s0 · 4.81 su s1                                                               |
| reading                                          | `--st-read`                    | `#3CC8F0`             | 9.69 su s0 · 9.15 su s1 · 8.24 su tinta `#0D2330`                                     |
| writing                                          | `--st-write`                   | `#FF9442`             | 8.65 su s0 · 8.17 su s1 · 7.58 su tinta `#2A1B0F`; badge `--on-state` 8.65            |
| running                                          | `--st-run`                     | `#3FD68A`             | 10.13 su s0 · 9.56 su s1 · 8.20 su tinta `#0D2A1D`                                    |
| waiting-user (riempimento)                       | `--st-wait`                    | `#FFD23A`             | 12.41 su s1 (confine del riempimento); testo `--on-wait #17130A` 12.81 sopra          |
| waiting-user (testo/bordo)                       | `--st-wait-tx` / `--wait-edge` | `#FFD23A`             | 13.15 su s0 · 11.31 su s2                                                             |
| error                                            | `--st-error`                   | `#FF5E5E`             | 6.35 su s0 · 5.99 su s1 · 5.82 su tinta `#2C1215`                                     |
| done                                             | `--st-done`                    | `#B4C3CE`             | 10.53 su s0 · 9.94 su s1; scia `--st-done-trace #2C3E4C` (tx-1 9.15, tx-2 4.56 sopra) |
| Eventi passati in timeline                       | `--ev-past`                    | `#5A6E7E`             | 3.59 su s0 · 3.39 su s1                                                               |
| Identità Claude                                  | `--id-claude`                  | `#B89EFF`             | 8.01 su s1 · 7.29 su s2                                                               |
| Identità subagent                                | `--id-sub`                     | `#D6C9FF`             | 11.67 su s1 · 10.63 su s2                                                             |
| Identità Ollama (locale)                         | `--id-local`                   | `#FF8DCB`             | 8.48 su s1 · 7.72 su s2                                                               |

### Tema chiaro ("di giorno", carta tecnica)

| Ruolo                                           | Token                   | Hex                   | Contrasto (sul fondo d'uso)                                                                                 |
| ----------------------------------------------- | ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Superficie 0 (mappa: carta millimetrata)        | `--s0`                  | `#E3E9E5`             | fondo                                                                                                       |
| Superficie 1 (pannelli)                         | `--s1`                  | `#EBF0EC`             | fondo                                                                                                       |
| Superficie 2 (title bar, card, tracce timeline) | `--s2`                  | `#F6F8F6`             | fondo                                                                                                       |
| Superficie 3 (selezione, chip di codice)        | `--s3`                  | `#D6DED9`             | fondo                                                                                                       |
| Pagina attorno alla finestra                    | `--page`                | `#BCC6C1`             | tx-2 4.95 · tx-1 10.01                                                                                      |
| Testo primario (inchiostro)                     | `--tx-1`                | `#0D1B22`             | 14.25 su s0 · 15.21 su s1 · 16.44 su s2 · 12.79 su s3                                                       |
| Testo secondario                                | `--tx-2`                | `#3B4E59`             | 7.05 su s0 · 7.52 su s1 · 8.13 su s2 · 6.33 su s3                                                           |
| Testo disattivo                                 | `--tx-3`                | `#5F717B`             | 4.40 su s1 · 4.76 su s2                                                                                     |
| Bordo divisorio (decorativo)                    | `--line`                | `#C0CAC4`             | 1.46 su s1                                                                                                  |
| Bordo controlli, nodi, righelli, staffe         | `--line-2`              | `#74847D`             | 3.19 su s0 · 3.41 su s1 · 3.69 su s2                                                                        |
| Griglia minore / maggiore                       | `--grid-1` / `--grid-2` | `#D3DCD6` / `#BFCBC4` | —                                                                                                           |
| Accento (inchiostro pieno)                      | `--accent`              | `#0D1B22`             | 15.21 su s1 · 16.44 su s2                                                                                   |
| Testo su accento                                | `--on-accent`           | `#F6F8F6`             | 16.44                                                                                                       |
| idle                                            | `--st-idle`             | `#677883`             | 3.71 su s0 · 3.97 su s1 (solo spia; il nome usa tx-2)                                                       |
| reading                                         | `--st-read`             | `#08668A`             | 5.20 su s0 · 5.55 su s1 · 5.07 su tinta `#D5E8EF`                                                           |
| writing                                         | `--st-write`            | `#A84300`             | 4.92 su s0 · 5.25 su s1 · 4.73 su tinta `#F3E0D2`; badge `--on-state #F6F8F6` 5.67                          |
| running                                         | `--st-run`              | `#136E37`             | 5.15 su s0 · 5.50 su s1 · 5.05 su tinta `#D5EBDC`                                                           |
| waiting-user (riempimento)                      | `--st-wait`             | `#F7C81C`             | testo `--on-wait #17130A` 11.67 sopra; il confine è il bordo d'inchiostro `--wait-edge #17130A` 16.06 su s1 |
| waiting-user (testo su carta)                   | `--st-wait-tx`          | `#6B4F00`             | 6.22 su s0 · 6.64 su s1 · 7.17 su s2                                                                        |
| error                                           | `--st-error`            | `#B91F28`             | 5.18 su s0 · 5.54 su s1 · 4.80 su tinta `#F4D9D9`                                                           |
| done                                            | `--st-done`             | `#46565F`             | 6.19 su s0 · 6.60 su s1; scia `#C9D3CD` (tx-1 11.43, tx-2 5.65 sopra)                                       |
| Eventi passati in timeline                      | `--ev-past`             | `#6E7F88`             | 3.89 su s2 (traccia) · 3.60 su s1                                                                           |
| Identità Claude                                 | `--id-claude`           | `#5A3CCB`             | 6.19 su s1 · 6.68 su s2                                                                                     |
| Identità subagent                               | `--id-sub`              | `#6E52D6`             | 4.74 su s1 · 5.12 su s2                                                                                     |
| Identità Ollama (locale)                        | `--id-local`            | `#A32F75`             | 5.65 su s1 · 6.11 su s2                                                                                     |

Correzioni fatte dopo il calcolo: `--line-2` scuro da `#536879` a `#5B7184` (era 2.82 su s2) e chiaro da `#7A8A83` a `#74847D` (era 2.94 su s0). Il giallo dell'attesa nel tema chiaro non regge da solo su carta (1.38): per questo ha **sempre** il bordo d'inchiostro e le strisce di pericolo, e il testo giallo diventa ocra (`--st-wait-tx`).

L'accento non è un colore di marca: è "luce" (quasi bianco di notte, inchiostro di giorno). Così l'unico colore saturo sullo schermo è uno stato o un'identità.

## Tipografia

| Ruolo                                        | Font                                                                                                                       | Licenza                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Interfaccia, frasi, etichette                | **Barlow Semi Condensed** 400/500/600                                                                                      | SIL Open Font License 1.1 |
| Telemetria e numeri grandi, sigle dei canali | **Barlow Condensed** 500/600, `font-variant-numeric: tabular-nums` (verificato: "1111" e "0000" hanno la stessa larghezza) | SIL Open Font License 1.1 |
| Percorsi, comandi, nodi, diff, scorciatoie   | **Iosevka Charon Mono** 400/500 (mono stretto, 0.5 em per carattere: `PermissionDialog.tsx` sta in 110 px)                 | SIL Open Font License 1.1 |

Nel mockup arrivano da Google Fonts; nell'app vanno inclusi nel pacchetto (tutti OFL). La famiglia Barlow ha i condensati veri, non schiacciati: è il "grotesk da pannello". Iosevka è stato scelto dopo aver misurato Martian Mono (126 px per lo stesso nome anche a larghezza minima): con 40 nodi i nomi dei file non entravano.

Scala (compact / comfortable):

| Token       | Compact | Comfortable | Uso                                      |
| ----------- | ------- | ----------- | ---------------------------------------- |
| `--fs-2xs`  | 9.5 px  | 10.5 px     | micro-etichette                          |
| `--fs-xs`   | 10.5 px | 11.5 px     | etichette secondarie, cartelle, eventi   |
| `--fs-node` | 11 px   | 12 px       | nomi dei nodi (mono)                     |
| `--fs-s`    | 12 px   | 13 px       | barra di stato, toolbar, pulsanti        |
| `--fs-m`    | 13 px   | 14 px       | frasi (chat, task)                       |
| `--fs-l`    | 15 px   | 16.5 px     | nome agente, comando del permesso        |
| `--fs-xl`   | 22 px   | 25 px       | letture nelle card (2m14, 41k, 38 tok/s) |
| `--fs-2xl`  | 30 px   | 34 px       | telemetria di sessione (182k, 9.1 GB)    |

Niente maiuscolo per le etichette: sono maiuscole solo le sigle dei canali, che sono codici.

## Stati e agenti

Ogni stato ha **spia (forma) + trattamento della piastra + colore**, uguali in mappa, card, timeline e barra di stato.

| Stato        | Spia              | Piastra in mappa / timeline                                                                                                       | In scala di grigi si riconosce da             |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| idle         | cerchio vuoto     | bordo spento, nome in tx-2                                                                                                        | spia vuota, nessun riempimento                |
| reading      | anello con punto  | bordo 1 px + tinta info; un "blip" ad anello di 280 ms ogni 2.8 s; in timeline blocco aperto con bordo sinistro spesso            | anello con punto, blip, arco **tratteggiato** |
| writing      | quadrato pieno    | bordo **2 px** pieno + badge diff `+12 −3` a fondo pieno; arco di scrittura continuo                                              | bordo doppio, badge pieno                     |
| running      | triangolo ▶       | bordo tratteggiato (nodi temporanei a pillola) + barra indeterminata di 2 px che scorre; in timeline blocco tratteggiato          | triangolo, barra, tratteggio                  |
| waiting-user | triangolo con `!` | piastra **piena** gialla, testo d'inchiostro, strisce di pericolo a sinistra; in timeline blocco pieno aperto con strisce in coda | unico elemento pieno e chiaro + strisce       |
| error        | ottagono con ×    | bordo + **barra sinistra 3 px**, etichetta "2 failing"/"TS2345"; in timeline marcatore ottagono                                   | ottagono, barra sinistra, testo               |
| done         | segno di spunta   | bordo neutro + **scia** (sfumatura dal bordo sinistro) e badge diff a contorno; all'arrivo il bordo si spegne in 300 ms           | spunta + scia statica                         |

Identità degli agenti (stabili ovunque):

| Tipo                   | Glifo           | Colore               | Segni aggiuntivi                                                                                                                  |
| ---------------------- | --------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Claude (cloud)         | ◆ rombo pieno   | viola `--id-claude`  | bordo pieno; simbolo antenna (uplink) sulla piastra del canale                                                                    |
| Subagent Claude        | ◇ rombo vuoto   | lilla `--id-sub`     | bordo **tratteggiato** (avatar e piastra canale), corsia figlia agganciata                                                        |
| Agente Ollama (locale) | ⬢ esagono pieno | magenta `--id-local` | simbolo di **massa** ⏚ e bordo inferiore spesso: è "a terra", sulla tua macchina; nel totale token la quota locale è tratteggiata |

In scala di grigi i tre tipi restano diversi per forma (pieno, vuoto, esagono) e per tratto (pieno, tratteggiato, base spessa); locale e cloud si distinguono per massa vs antenna. Verificato con `gray=1` in entrambi i temi e in entrambi gli scenari.

## Movimento

| Cosa                                                          | Durata e curva                                                   | Quando                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Segmento di attesa nella barra di stato (unico che **pulsa**) | ciclo 1.6 s, `cubic-bezier(.45,0,.25,1)`                         | solo se c'è un'attesa               |
| Blip dei nodi `reading`                                       | lampo di 280 ms in un ciclo di 2.8 s, `cubic-bezier(.2,.7,.2,1)` | solo sui nodi letti in quel momento |
| Barra indeterminata `running` (nodo e card)                   | 1.3 s lineare                                                    | solo sui comandi e task in corso    |
| Ritorno al neutro di `done`                                   | 300 ms, una volta                                                | all'arrivo dello stato              |
| Token di durata                                               | `--dur-1` 150 ms · `--dur-2` 220 ms · `--dur-3` 300 ms           | interazioni                         |

Nodi idle, cartelle, archi, timeline storica: fermi. Con `prefers-reduced-motion: reduce` tutte le animazioni sono spente (verificato: 0 animazioni attive); la barra `running` diventa un tratteggio statico, il blip sparisce, il segmento d'attesa resta pieno ma non pulsa. Tutto è trasformazione o opacità: nessun blur, nessuna ombra.

## Densità

|                                       | Compact (default) | Comfortable     |
| ------------------------------------- | ----------------- | --------------- |
| Title bar / toolbar / barra di stato  | 34 / 34 / 26 px   | 38 / 38 / 28 px |
| Altezza timeline                      | 212 px            | 246 px          |
| Nodo in mappa (altezza, testo)        | 20 px, 11 px      | 24 px, 12 px    |
| Passo righe in mappa (normal / dense) | 40 / 24 px        | 44 / 28 px      |
| Pulsanti                              | 22 px             | 26 px           |
| Padding pannelli                      | 8 px              | 11 px           |
| Scala testo                           | 9.5 → 30 px       | 10.5 → 34 px    |

In `dense` + `comfortable` la colonna Agents scorre (circa 108 px in più: la lista "Changed files" va sotto la piega).

## Punti di forza

- Risponde alle 5 domande in un'occhiata: spia gialla piena (aspetta me), ottagoni rossi (errori), letture grandi (token, tok/s, VRAM), lista "Changed files" e badge diff in mappa.
- Il silenzio è il default: con nulla da segnalare lo schermo è grigio-blu e fermo.
- Le forme portano lo stato da sole (prova `gray=1`), il colore è un rinforzo.
- Il tema chiaro non è un'inversione: carta tecnica, inchiostri e nastro giallo.
- Linguaggio economico per i nodi: rettangoli con bordo, niente ombre o filtri; le animazioni sono solo sui pochi nodi attivi.

## Rischi

- **500 nodi:** la piastra con nome a 20 px funziona fino a qualche centinaio di nodi visibili; oltre servirà lo zoom semantico (piastra → spia + sigla). I collegamenti ortogonali che passano sopra le colonne possono intrecciarsi con molti agenti.
- **Metà schermo:** tre colonne di file più la corsia dei comandi chiedono ~770 px di mappa; sotto i 1100 px il dock Session deve sovrapporsi (come da architettura).
- **Tema chiaro in scala di grigi:** il giallo diventa un grigio chiaro vicino alla carta; l'attesa resta riconoscibile per bordo, strisce e icona, non per il valore.
- **Austerità:** senza un colore di marca, l'app può sembrare fredda; i colori d'identità degli agenti sono l'unico "calore".
- **Etichette corte in timeline:** gli eventi brevi mostrano solo la forma (il dettaglio è nel tooltip e nell'Inspector).
- **Avatar sul nodo:** in `dense` l'avatar `EX` è agganciato sopra l'estremità destra di `channels.ts` (sovrapposizione voluta, non copre il nome).
- **Iosevka** è un font molto diffuso tra gli sviluppatori: va controllato che `precisione` non scelga lo stesso mono.

## Nomi proposti

- **Annunciator**: il pannello di spie delle sale controllo, che si accendono solo quando c'è qualcosa da leggere.
- **Patchbay**: il quadro dove si collegano i canali; qui i canali sono gli agenti, cloud e locali.
- **Nightdesk**: la postazione di turno di notte, calma finché una spia non chiama.

## Checklist di accettazione

- [x] `live.html` mostra tutti i contenuti dello scenario `normal`: 7 stati in mappa, 3 tipi di agente, dialog permesso aperto, timeline con corsie figlie, checkpoint e scrubber, barra di stato completa con il segmento di attesa.
- [x] Lo scenario `dense` mostra 5 agenti e ~40 nodi senza sovrapposizioni illeggibili (41 nodi; unica sovrapposizione voluta: avatar `EX` agganciato a `channels.ts`).
- [x] I quattro parametri URL e la barra di toggle funzionano in ogni combinazione, senza errori in console (verificato in Chromium headless su tutte le 16 combinazioni, più i clic sulla barra di toggle; URL aggiornato con `history.replaceState`).
- [x] Contrasto AA verificato per testo e indicatori di stato in **entrambi** i temi (rapporti nelle tabelle della palette).
- [x] Con `gray=1` si distinguono i 7 stati e i 3 tipi di agente.
- [x] Nessun colore usato fuori dalla palette dichiarata (tutti i colori sono variabili CSS sul tema; scansione del CSS senza colori letterali fuori dai blocchi tema).
- [x] `prefers-reduced-motion` rispettato: niente impulsi né scie animate; solo il segmento di attesa pulsa quando il movimento è consentito. Nota: con movimento consentito si muovono anche il blip `reading` e la barra `running`, solo nel punto in cui l'agente lavora (come chiede la tabella degli stati).
- [x] Font solo OFL o MIT, con licenza indicata.
- [x] Nessuna libreria JS, nessuna immagine esterna.
