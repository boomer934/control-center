# Persona

> Fase 1a. Fonte dei vincoli: `docs/memoria/PIANO.md` §4.1 e `docs/memoria/DESIGN.md`. Le persone sono archetipi di lavoro, non persone reali: servono a decidere cosa mettere in primo piano e cosa togliere.

## Persona principale — "Dev quotidiano"

**Chi è.** Sviluppatore o sviluppatrice full-stack che lavora da solo o in un piccolo team. Usa Claude Code tutti i giorni dalla CLI, con il proprio `claude login` (abbonamento Pro o Max). Alterna 2-5 progetti nella stessa settimana (un'app web, un servizio backend, qualche script), spesso con Docker Desktop acceso e almeno un modello locale su Ollama.

**Ambiente tipico**

| Aspetto      | Valore tipico                                                                         |
| ------------ | ------------------------------------------------------------------------------------- |
| Sistema      | Windows 11, PowerShell e Git Bash                                                     |
| Schermi      | portatile + monitor esterno; l'app spesso vive sul secondo schermo                    |
| Hardware     | GPU NVIDIA con 8-24 GB di VRAM, 32 GB di RAM                                          |
| Strumenti    | VS Code (o un altro editor) aperto in parallelo, terminale, browser con il dev server |
| Infra locale | 2-6 container (database, cache, servizi), qualche dev server su porte locali          |
| Agenti       | 1 sessione Claude principale, a volte 2-3 subagent; 1 modello Ollama "coder"          |

**Cosa vuole ottenere**

1. Affidare un compito lungo all'agente e **continuare a fare altro** senza perdere il controllo.
2. Capire **in un colpo d'occhio** se l'agente lavora, è fermo, aspetta una risposta o ha sbagliato.
3. Vedere **quali file sono stati toccati** e cosa è cambiato, prima di fidarsi del risultato.
4. Poter **tornare indietro** se l'agente ha fatto un disastro, senza sporcare il proprio branch.
5. Spostare in locale (Ollama) il lavoro ripetitivo, per consumare meno i limiti d'uso dell'abbonamento.

**Frustrazioni di oggi** (perché il prodotto esiste)

- L'output della CLI scorre veloce: **non si capisce cosa sta facendo l'agente adesso**, solo cosa ha fatto.
- Le **richieste di permesso si perdono** in un terminale nascosto dietro altre finestre: l'agente resta fermo per minuti.
- I file modificati sono sparsi nel log: per capire l'impatto serve `git diff` a mano.
- Gli **errori sono sepolti** nell'output di test, container e dev server, lontani dall'azione che li ha causati.
- Non sa **quanto ha consumato** dei limiti d'uso né quanto lavoro poteva fare in locale.
- Docker, porte, VRAM: per sapere cosa gira deve aprire tre strumenti diversi.

**Momenti d'uso**

| Momento               | Durata       | Cosa fa con l'app                                                        |
| --------------------- | ------------ | ------------------------------------------------------------------------ |
| Avvio di un task      | 1-2 minuti   | apre il progetto, scrive il compito, controlla MCP e modello             |
| Lavoro in parallelo   | 10-60 minuti | guarda l'app di sfuggita dal secondo monitor; risponde ai permessi       |
| Intervento            | 1-5 minuti   | approva/rifiuta, legge un errore, interrompe un agente fuori strada      |
| Revisione a fine task | 5-15 minuti  | ripercorre la timeline, legge i diff, decide se fare commit o ripristino |
| Diagnosi              | variabile    | Console Errori, log dei container, porte occupate                        |

**Cosa NON vuole**

- Dashboard decorative, grafici che si muovono senza dire niente.
- Telemetria verso l'esterno o account aggiuntivi.
- Un altro editor: il codice si scrive nell'editor che ha già; l'app osserva, orchestra e mostra.
- Dover usare il mouse per tutto: si aspetta Ctrl+K e scorciatoie come in un IDE.

**Come misura il successo**

- Nessun permesso rimasto in attesa per più di qualche secondo mentre guarda altro.
- A fine task sa dire, senza leggere la chat, quali file sono cambiati e perché.
- Riesce a ripristinare uno stato precedente in meno di un minuto.

## Persona secondaria — "Di passaggio"

**Chi è.** La stessa persona, ma in un altro momento: è concentrata su altro (editor, browser, riunione) e **guarda l'app per 2 secondi**, dal secondo monitor o con Alt+Tab.

**Cosa le serve**

- **Barra di stato** leggibile da lontano: sessione attiva, agenti in corso, attese, errori.
- **`waiting-user` come unico richiamo**: se l'agente aspetta lei, deve saperlo anche senza guardare l'app (notifica di Windows + badge sull'icona della barra delle applicazioni).
- Nessun movimento che attiri lo sguardo senza motivo: se tutto va bene, l'app è calma.
- Un clic dalla notifica porta **direttamente** al dialog del permesso o all'errore.

**Cosa non le serve** in quel momento: mappa dettagliata, timeline, token. Ci arriva solo se decide di fermarsi.

## Anti-persona (fuori ambito v1)

- **Team e osservabilità enterprise:** dashboard condivise, più utenti, metriche aggregate, SSO. L'app è locale e personale; pubblicabile come open source, ma non pensata per il monitoraggio di un'organizzazione.
- **Chi non usa la CLI di Claude Code:** l'app non sostituisce il login né offre un proprio accesso ai modelli.
- **Utenti macOS/Linux:** fuori ambito fino alla v1 (solo Windows), anche se il design non deve impedirli.

## Scenari chiave

Ogni scenario corrisponde a un flusso in [`architettura.md`](architettura.md#flussi-principali).

1. **"Lancio e mi giro"** — apre il progetto, lancia un refactor su più file e torna all'editor. Dopo 4 minuti arriva una notifica: l'agente chiede di eseguire `npm test`. Approva dalla notifica. → flussi F1-F4.
2. **"Cosa ha cambiato?"** — a fine task apre la Vista Live: la mappa mostra 7 file toccati, 2 in scrittura recente. Passa sopra un nodo e vede il diff; apre il diff completo. → flusso F5.
3. **"Torna indietro"** — l'agente ha rotto la build. Dalla timeline sceglie il checkpoint prima della prima scrittura, vede l'anteprima del diff e ripristina. → flusso F6.
4. **"Perché è rosso?"** — un test fallisce dopo una modifica. Il nodo del file colpevole è rosso sulla mappa; dalla Console Errori va allo stack, poi al file. Chiede a Claude di sistemarlo. → flusso F7.
5. **"Fallo in locale"** — vuole un riassunto dei log di un container. Lo chiede a Ollama da Ctrl+K, senza passare da Claude; il risultato arriva come testo, e un'eventuale modifica come proposta di diff. → flusso S3.
6. **"Cosa è successo ieri?"** — riapre una sessione passata in sola lettura e scorre lo scrubber per capire quando l'agente ha iniziato a sbagliare. → flusso S4.
