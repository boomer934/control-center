# Domande chiave

> Fase 1a. Le 5 domande a cui l'app deve rispondere **in meno di 2 secondi**, senza leggere la chat. Il testo delle domande è quello di `docs/memoria/DESIGN.md`, la versione più recente: la quinta include il lavoro fatto in locale, che `PIANO.md` §4.1 non aveva ancora.

## Regole comuni

- **Due punti di risposta per ogni domanda:**
  - un **primario** nella Vista Live, per chi guarda con attenzione;
  - un **di riserva** nella **barra di stato**, sempre visibile in ogni sezione, per la persona "di passaggio".
- **Mai solo il colore:** ogni risposta usa anche forma, icona o testo (vedi gli stati semantici in `DESIGN.md`).
- **Test dei 2 secondi**, da usare nella revisione di 1b/1c, nel prototipo 1d e nella Fase 5:
  - si mostra la schermata per 2 secondi a chi non l'ha mai vista;
  - poi la si nasconde e si fa la domanda;
  - la risposta è giusta in almeno 4 casi su 5.
- I nomi degli eventi sono indicativi: lo schema vero è della Fase 2 (`packages/event-schema`).

## 1. Cosa sta facendo l'agente adesso?

**Risposta attesa.** «Claude sta **modificando** `src/api/client.ts`», oppure «sta **eseguendo** `npm test` da 40 s», oppure «è fermo».

**Dove si vede**

| Punto          | Dettaglio                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primario       | **Mappa:** l'avatar dell'agente agganciato al nodo, con l'arco animato (lettura ≠ scrittura). **Pannello agenti:** la card con verbo + oggetto ("Editing client.ts") e il tempo trascorso. |
| Di riserva     | **Barra di stato:** segmento "agenti" con il glifo dell'agente, il verbo corto e il conteggio (es. `◆ Claude · editing · +2`).                                                             |
| Fuori dall'app | Tooltip dell'icona nella barra delle applicazioni con lo stato corrente.                                                                                                                   |

- **Stati coinvolti:** `reading`, `writing`, `running`, `idle`.
- **Dati necessari:**
  - `tool_use` dallo stream-json (Read, Edit, Write, Bash, Grep, Task…) con l'input del tool;
  - hooks `PreToolUse`/`PostToolUse` per inizio e fine;
  - `SubagentStop`;
  - eventi del ponte MCP per gli agenti Ollama.
- **Insidia:** i tool molto brevi (decine di ms) farebbero sfarfallare la UI. Gli stati vanno accorpati per frame, con una durata minima di visualizzazione dai token di movimento.

## 2. Quali file ha toccato e cosa ha cambiato?

**Risposta attesa.** «7 file: 5 letti, 2 modificati (+48 −12)», con la possibilità di vedere il diff di uno di essi in un passaggio.

**Dove si vede**

| Punto      | Dettaglio                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primario   | **Mappa:** per default mostra solo i file toccati e i loro vicini. I file scritti hanno il bordo pieno e il badge diff (`+48 −12`); al passaggio del mouse compare il diff dell'ultima modifica. |
| Secondario | **Timeline:** le scritture sono blocchi collegati al loro diff. **Sezione Git:** l'elenco dei file modificati e non committati.                                                                  |
| Di riserva | **Barra di stato:** un contatore dei file modificati nella sessione (es. `2 changed`). Al clic si apre il Diff viewer con l'elenco.                                                              |

- **Stati coinvolti:** `writing` e poi `done`, che torna neutro con una scia che sfuma; `reading`.
- **Dati necessari:**
  - input di Edit/Write/MultiEdit (percorso, vecchio e nuovo testo);
  - `git diff` del workspace;
  - checkpoint della Fase 4b, per i diff rispetto all'inizio della sessione.
- **Insidia:** "toccato" e "cambiato" sono due cose diverse. Lettura e scrittura devono distinguersi per forma (bordo, direzione dell'arco), non solo per colore.

## 3. Aspetta me? Ha sbagliato?

**Risposta attesa.** «Sì: chiede il permesso di eseguire `rm -rf dist`», oppure «Errore: 3 test falliti in `client.test.ts`», oppure «No, tutto procede».

**Dove si vede**

| Punto          | Dettaglio                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primario       | **Dialog del permesso**, ancorato al pannello della sessione e mai modale sull'intera app: comando, motivo, file coinvolti; Approve / Deny / Always this session. Sulla mappa l'agente passa a `waiting-user`, l'**unico** stato che richiama lo sguardo. |
| Errori         | Il nodo del file colpevole diventa rosso, con un'icona. Nella timeline compare un blocco `error` dopo l'azione che lo ha preceduto. La Console Errori ha il contatore.                                                                                    |
| Di riserva     | **Barra di stato:** il segmento `waiting-user` compare solo quando serve, in colore attenzione e con un'icona. Accanto c'è il contatore degli errori.                                                                                                     |
| Fuori dall'app | **Notifica di Windows** per `waiting-user` (cliccabile, porta al dialog) e badge sull'icona della barra delle applicazioni. Per gli errori niente notifica, salvo che l'agente si sia fermato.                                                            |

- **Stati coinvolti:** `waiting-user`, `error`.
- **Dati necessari:**
  - hook `Notification` (permessi e inattività) e `PreToolUse` (richiesta di permesso);
  - `is_error` nei `tool_result`;
  - uscita anomala del processo `claude`;
  - `error.detected` (Fase 5e).
- **Insidia:** `waiting-user` perde valore se lo si usa per altro. Mai per avvisi informativi, mai animato quando non serve una decisione.

## 4. Cosa gira sulla mia macchina?

**Risposta attesa.** «4 container attivi, 3 porte in ascolto (una esposta su `0.0.0.0`), `qwen-coder` caricato in VRAM (9,1/16 GB)».

**Dove si vede**

| Punto      | Dettaglio                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primario   | **Sezione Infra:** tre pannelli (Docker, Porte, GPU/Ollama). **Mappa:** nodi temporanei per i servizi e gli MCP chiamati dall'agente.                     |
| Di riserva | **Barra di stato:** segmento Docker (stato + numero di container), segmento VRAM (barra + valore). Le porte esposte all'esterno hanno un'icona di avviso. |

- **Stati coinvolti:** `running`, `idle`, `error` (container uscito con errore). Se Docker è spento si mostra un segmento neutro "Docker off", che **non è un errore**.
- **Dati necessari:** dockerode in sola lettura, `Get-NetTCPConnection`, `nvidia-smi`, Ollama `/api/ps`.
- **Insidia:** non tutti hanno Docker, GPU o Ollama. Le assenze sono stati normali e vanno disegnati come tali, senza allarmi.

## 5. Quanto ho consumato, e quanto è stato fatto in locale?

**Risposta attesa.** «Questa sessione: 182k token (di cui 140k da cache), 23 min. In locale: 4 compiti, 31k token su Ollama».

**Dove si vede**

| Punto      | Dettaglio                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Primario   | **Pannello agenti:** token per agente e tok/s per Ollama. **Sezione Telemetria:** per sessione, per giorno, pannello "lavoro fatto in locale". |
| Di riserva | **Barra di stato:** segmento token con cifre tabulari (es. `182k tok · 31k local`). Al passaggio del mouse si vede il dettaglio in/out/cache.  |

- **Stati coinvolti:** nessuno stato semantico; sono numeri. Colore neutro, cifre tabulari per non far "ballare" il layout.
- **Dati necessari:**
  - `usage` nei messaggi dello stream-json (input, output, cache read/creation);
  - `result` finale con durata;
  - Ollama `eval_count`/`eval_duration`.
- **Insidia:** la stima dei limiti dell'abbonamento è approssimativa e va dichiarata come tale nella UI ("≈", testo d'aiuto). Mai presentarla come un dato esatto.

## Riepilogo: chi risponde a cosa

| Domanda            | Mappa | Timeline | Pannello agenti | Sezione dedicata | Barra di stato |  Fuori dall'app  |
| ------------------ | :---: | :------: | :-------------: | :--------------: | :------------: | :--------------: |
| 1 Cosa fa adesso   |   ●   |    ○     |        ●        |        —         |       ●        |     tooltip      |
| 2 File toccati     |   ●   |    ●     |        —        |       Git        |       ○        |        —         |
| 3 Aspetta / errore |   ●   |    ●     |        ○        |  Console Errori  |       ●        | notifica + badge |
| 4 Cosa gira        |   ○   |    —     |        —        |      Infra       |       ●        |        —         |
| 5 Consumi          |   —   |    —     |        ●        |    Telemetria    |       ●        |        —         |

● risposta primaria · ○ risposta parziale · — non risponde
