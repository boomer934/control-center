# Direzione scelta — `precisione fluida`

Mockup: [`live.html`](live.html) · parametri `?theme=dark|light&density=compact|comfortable&scenario=normal|dense&gray=1` (default `dark`, `compact`, `normal`). Screenshot in [`screenshot/`](screenshot/).

## Da dove nasce

È la sintesi scelta dall'utente il 2026-11-14 dopo il [confronto](../CONFRONTO.md):

- base [`precisione`](../precisione/README.md), con i suoi colori, stati e linguaggio da IDE;
- tre innesti dalle altre due direzioni;
- la richiesta esplicita di un design **più fluido, con meno spigoli**.

Il file parte da una copia di `precisione/live.html`. Uno strato CSS in coda e poche modifiche allo script cambiano la forma, non i dati. Palette, contrasti e glifi degli stati restano quelli del [README di `precisione`](../precisione/README.md); qui sono descritte solo le differenze.

## Meno spigoli: forma

| Elemento                   | `precisione`                     | `precisione fluida`                                                                                                                                                                          |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raggi                      | 0-2 px                           | scala `--r-1` 4 px (kbd, badge, sigle), `--r-2` 6 px (celle, pulsanti, tabelle), `--r-3` 10 px (card, contenitori, dialog, input), `--r-pill` (chip agente, tag di stato, segmento d'attesa) |
| Celle della mappa          | rettangoli vivi                  | angoli a 6 px; l'errore passa dal triangolo nell'angolo a un **punto rosso** con anello                                                                                                      |
| Chip degli agenti in mappa | rettangoli                       | **pillole**: a colpo d'occhio un agente non si confonde con un file                                                                                                                          |
| Collegamenti in mappa      | tracce ortogonali ad angolo vivo | stesse tracce, con **curve raccordate** (raggio 8 px) e terminale tondo                                                                                                                      |
| Eventi in timeline         | celle esagonali                  | **capsule**; quelle aperte sono arrotondate solo all'inizio e continuano fino a "now"                                                                                                        |
| Forcelle in timeline       | angolo retto                     | gomito curvo, punto d'origine tondo                                                                                                                                                          |
| Checkpoint e `Live`        | bandierina a punta, blocco pieno | etichetta a pillola; `Live` a contorno                                                                                                                                                       |
| Card degli agenti          | righe separate da filetti        | card staccate con angoli a 10 px                                                                                                                                                             |
| Messaggio dell'utente      | filetto a sinistra               | fumetto a 10 px su `--bg-1`                                                                                                                                                                  |
| Segmento d'attesa          | blocco pieno a tutta altezza     | **pillola** dentro la barra di stato                                                                                                                                                         |
| Glifi                      | spigoli vivi                     | giunzioni e terminali arrotondati, idle è un punto, running è una barra a pillola                                                                                                            |

## Meno spigoli: tipografia e movimento

- **Sans per l'interfaccia, mono per i dati.** Instrument Sans va su schede, toolbar, pulsanti, nomi degli agenti, parole di stato, legenda e intestazioni. Martian Mono resta su percorsi, numeri, comandi e diff.
- **Il mono condensato** (`--mono-cell`, 75 %) resta solo nelle celle della mappa. Il resto passa a 87,5 %.
- **Testo minimo 11 px** (`--fs-xs`: da 10,5 a 11 px in compact). Nuovo token `--fs-xl` (16/17 px) per i numeri della telemetria e il titolo del dialog.
- **Curva più morbida:** `--ease-out` diventa `cubic-bezier(0.22, 1, 0.36, 1)`. Nuova curva `--ease-io` `cubic-bezier(0.65, 0, 0.35, 1)`. Durate invariate: 150, 200, 300 ms.
- **L'attesa respira invece di lampeggiare.** Il cursore del segmento d'attesa non va più a scatti (`steps(1)`) ma sfuma da 100 % a 25 % in 1,6 s (`--breathe`). Resta l'unico impulso continuo.
- **Movimento ridotto:** con `prefers-reduced-motion: reduce` resta tutto fermo, come prima.

## Innesti

1. **Sigle di canale** (da `sala-controllo`). Ogni agente ha una targhetta con:
   - il glifo d'identità;
   - un codice di due lettere: `CL`, `C2`, `EX`, `PL`, `QW`;
   - un segno per il cloud (antenna) o per il locale (massa).

   Le sigle compaiono nei chip della mappa, nelle card e nelle corsie della timeline, e sostituiscono le etichette `cloud`/`local`. Si leggono anche in scala di grigi.

2. **Telemetria in testa ad Agents** (da `sala-controllo`, ridimensionata). Due riquadri:
   - token della sessione, con la barra della quota locale;
   - VRAM, con il modello caricato.

   I numeri sono a 16 px, non a 30, così non battono l'attesa.

   In fondo alla colonna c'è `Changed files`, con prima i file in scrittura e il resto come "N more in Git". Le card in mezzo scorrono e, se non entrano, l'ultima sfuma.

3. **Legenda `Key` in mappa** (da `carta-inchiostro`). I 7 stati e i segni cloud/locale, in una pillola sopra il contatore. Se il grafo è troppo alto si nasconde.
4. **Titolo del dialog in stile display** (da `carta-inchiostro`). "Claude wants to run a command" sta su una riga a 16 px, con l'attesa sotto.

## Correzioni dalla revisione

| Problema in [`REVISIONE.md`](../REVISIONE.md)      | Correzione                                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Approve` in inverse video compete con l'attesa    | `Approve` a contorno spesso (2 px `--fg-1` su `--bg-3`) in entrambi i temi; l'avatar `cc` e il chip `Live` non sono più blocchi pieni. L'unico blocco pieno resta l'attesa. |
| Testo sotto 11 px, mono condensato ovunque         | minimo 11 px; condensato solo nelle celle; sans per la cornice                                                                                                              |
| Eventi paralleli sovrapposti in timeline (`dense`) | una corsia con chiamate parallele si alza di 1,6 volte e le divide in due righe                                                                                             |
| `Fit` non applicato                                | Fit vero: se il grafo non entra, la legenda si nasconde e la mappa scala (`zoom` nella toolbar mostra il valore)                                                            |
| Kbd `Enter` sotto soglia                           | tolta l'opacità                                                                                                                                                             |
| `.req` tagliato senza ellissi                      | ellissi sul comando                                                                                                                                                         |

Restano aperti i minori di `precisione` non elencati: il verde di running vicino al turchese locale, l'etichetta dell'errore in timeline e il numero di letture nella timeline `normal`. Si chiudono in 1c, quando la palette diventa `design/tokens.json`.

## Token nuovi o cambiati

| Token                                    | Valore                                  | Note                                     |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------- |
| `--r-1` / `--r-2` / `--r-3` / `--r-pill` | 4 / 6 / 10 / 999 px                     | prima 1 / 2 px                           |
| `--mono-narrow`                          | 87.5 %                                  | prima 75 %                               |
| `--mono-cell`                            | 75 %                                    | nuovo, solo celle della mappa            |
| `--fs-xs`                                | 11 px (compact) · 11.5 px (comfortable) | prima 10.5 / 11                          |
| `--fs-s`                                 | 11.5 px (compact)                       | prima 11                                 |
| `--fs-xl`                                | 16 px · 17 px                           | nuovo                                    |
| `--ease-out`                             | `cubic-bezier(0.22, 1, 0.36, 1)`        | prima `(0.2, 0, 0, 1)`                   |
| `--ease-io`                              | `cubic-bezier(0.65, 0, 0.35, 1)`        | nuovo                                    |
| `--breathe`                              | 1600 ms                                 | sostituisce `--blink` (1060 ms a scatti) |

## Densità

Predefinita **`compact`**, scelta dell'utente. `comfortable` resta nelle impostazioni.

## Rischi

- **500 nodi.** Valgono gli stessi rischi di `precisione`: serve lo zoom semantico. I raggi costano poco anche a molti nodi. Per i collegamenti curvi, ELK fornisce i punti di piega e l'arrotondamento lo fa il renderer, come `rpath` nel mockup.
- **Meno "strumento".** Raggi e sans ammorbidiscono il carattere da IDE: oltre il livello di adesso diventerebbe una dashboard generica. Nei token della 1c i raggi non devono superare 10 px, tranne le pillole.
- **Sigle di due lettere.** Con più agenti dello stesso tipo servono regole di assegnazione (`C2`, `C3`…, prime lettere del nome dei subagent) e un controllo delle collisioni.
- **Colonna Agents in `dense`.** Con 5 agenti le card scorrono: nell'app serve uno scroll vero, con la card selezionata sempre visibile.

## Nome

Candidato per la 1c: **Vernier** (scelta dell'utente). Prima di adottarlo vanno verificati marchi, nome del pacchetto e dominio. Il mockup resta `Control Center`.

## Checklist di accettazione

- [x] Contenuti dello scenario `normal` e `dense` come in `precisione`, più telemetria, file modificati e legenda.
- [x] Colori invariati rispetto a `precisione`: AA in entrambi i temi, come da sua tabella. `Approve` ora è testo `--fg-1` su `--bg-3` (12.69:1 scuro, 15.59:1 chiaro).
- [x] `gray=1`: stati e agenti si distinguono per forma; le sigle aggiungono codice e segno cloud/locale.
- [x] `prefers-reduced-motion` rispettato; con il movimento consentito pulsa solo il segmento d'attesa.
- [x] 0 errori di console in `dark`, `light`, `dense`, `gray`, `dense+comfortable`, `light+comfortable`, `light+gray` (Chromium headless).
