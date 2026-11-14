# Revisione delle tre direzioni (Fase 1b)

Metodo: audit e critica con la skill `impeccable`, in un solo contesto (senza subagent), usando `BRIEF.md` come metro di giudizio. Ho letto `live.html` e `README.md` di ogni direzione e guardato i 12 screenshot, più 6 extra (light+gray e light+comfortable+dense) generati su copie fuori dalla repo.
Il contrasto l'ho ricalcolato due volte: dagli hex dei token (tutte le coppie testo/fondo) e dagli stili calcolati in Chromium (ogni testo contro il fondo effettivo, opacità inclusa). Ho cercato colori letterali fuori dai blocchi tema, ho misurato nel DOM gli elementi tagliati, ho elencato le animazioni attive con e senza `prefers-reduced-motion` e ho lanciato il detector `impeccable detect`.
"Grave" vuol dire che viola un vincolo del BRIEF o rompe la schermata. Le righe citate sono di `<slug>/live.html` (numerazione prima delle correzioni).

## Decisioni dell'utente e correzioni (2026-11-14)

- **Grave di `sala-controllo` corretto:** `.tb-win { display: flex }`, i tre controlli finestra sono di nuovo visibili.
- **Regola `reading`:** un impulso per evento di lettura, mai in ciclo. I loop di `sala-controllo` (blip) e `carta-inchiostro` (sottolineatura) diventavano gravi: ora partono una volta sola.
- **Regola attesa:** pulsa solo il segmento nella barra di stato. Tolto l'impulso dal blocco aperto in timeline in `precisione` (cursore fisso) e `carta-inchiostro`.
- **Medi e minori:** non corretti nei mockup. Diventano regole per i token e il design system della 1c, applicate solo alla direzione scelta (minimo 11 px, corsie che si allargano per le chiamate parallele, `Approve` a contorno nel tema chiaro, scala di spaziatura e token dei cicli).
- README delle tre direzioni allineati alle regole di movimento.

## precisione

### Grave

Nessuno.

### Medio

- **L'accento in inverse video compete con l'attesa.** Nel tema chiaro `--st-waiting`, `--accent` e `--fg-1` hanno lo stesso valore, `#141414` (righe 81, 84, 90). Così la targa d'attesa, `Approve` (1532-1536), il chip `Live 2:14` (1034) e l'avatar `cc` (272) sono blocchi neri identici. Nel tema scuro `#EBEBEB` è più luminoso del giallo. In light+gray il blocco più forte dello schermo è `Approve`, non l'attesa. Correzione: `Approve`, `Live` e il toggle attivo diventano a contorno; il pieno resta solo all'attesa.
- **Dense: nella timeline gli eventi paralleli si sovrappongono.** Nella corsia `Claude`, `sh` copre metà della cella `ed`; nella corsia `Explore` due celle `rd` sono una sopra l'altra (dati 2680-2681 e 2718-2719, corsia fissa `--lane: 34px` alla riga 106; `screenshot/dense.png`). Il README dichiara "nessuna sovrapposizione". Correzione: con le sotto-righe la corsia si allarga invece di sovrapporre le celle.
- **Comfortable+dense: tagli che violano la priorità dichiarata nel README.** In mappa il nodo writing diventa `client.…`. `also waiting for you: npm test -- i` è tagliato netto, senza ellissi (`.req`, 1303-1304). Il titolo del dialog diventa `Claude wants to run a comm…`. Correzione: ellissi su `.req` e larghezza minima del nome per i nodi `writing`.
- **Testo troppo piccolo e condensato per leggere in 2 secondi.** `--fs-xs: 10.5px` con `font-stretch: 75%` (righe 107 e 22) copre barra di stato, timeline, scorciatoie e metadati delle card. Il detector trova 41 testi funzionali sotto 11 px. La gerarchia è piatta: quasi tutto è mono a 10.5-11 px. Correzione: minimo 11 px e mono condensato solo nelle celle della mappa.

### Minore

- La mappa `normal` occupa il terzo superiore del canvas e lascia vuota la metà sotto (`screenshot/dark.png`). Correzione: applicare `Fit` all'apertura.
- Lo stato running (`#7FD36A`) e l'identità locale (`#4FD6C8`) hanno tinte vicine (righe 59 e 68) e compaiono affiancati nella card e sulla rotaia di qwen. Correzione: spostare `--ag-local` lontano dal verde.
- L'errore in timeline è etichettato `× sh`, non con il file `schema.test.ts` (evento alla riga 2439). Correzione: etichetta `schema.test.ts` o `2 failing`.
- Nella timeline `normal` ci sono Read ×3 + Grep ×2, mentre il BRIEF chiede Read ×4 + Grep ×2 (righe 2432-2436). Correzione: aggiungere una lettura.
- Il kbd `Enter` nell'input disattivato ha `opacity: 0.7` (1591-1593) e scende a 3.06:1 (scuro) e 2.68:1 (chiaro). È esente perché disattivato, ma è l'unico testo sotto soglia. Correzione: togliere l'opacità.

## sala-controllo

### Grave

- **Controlli finestra mancanti: `Maximize` e `Close` non si vedono.** `.tb-win` non ha `display: flex` (CSS alla riga 364, markup 2572-2580). I tre pulsanti a blocco finiscono uno sotto l'altro, tutti a x 1434-1480 (misurato nel DOM), e solo `—` resta visibile in tutti gli screenshot. La title bar del BRIEF li richiede. Correzione: aggiungere `.tb-win { display: flex }`.

### Medio

- **Il blip di `reading` si ripete all'infinito.** Ogni nodo letto pulsa ogni 2.8 s (756-781; il detector lo segnala come `pulsing-dot`). La checklist dice che, con il movimento consentito, pulsa solo l'attesa (vedi Trasversali). Correzione: un solo blip per evento di lettura.
- **I numeri grandi battono l'attesa nella gerarchia.** `--fs-2xl: 30px` e `--fs-xl: 22px` (righe 132-133) rendono `182k`, `9.1`, `2m14`, `41k`, `0m41` e `38` i testi più grandi dello schermo. L'occhio va lì prima che sulla targa gialla nella card. Correzione: grandi solo le due letture di sessione; nelle card 15-16 px.
- **È la direzione con più testo minuto.** `--fs-2xs: 9.5px` è usato nelle etichette del righello della timeline (1457) e nel piè della mappa (1033). Il detector trova 95 testi funzionali sotto 11 px. Correzione: eliminare `--fs-2xs` e fissare il minimo a 11 px.
- **Dense: la scrittura copre l'attesa.** In corsia `Claude`, `.ev-write-hi` (1711-1718, `z-index: 1`) copre la metà superiore del blocco `npm test` (dati 4278-4286; `screenshot/dense.png`). Il README dichiara una sola sovrapposizione voluta. Correzione: due righe nella corsia, con l'attesa mai coperta.

### Minore

- Le scritture passate restano arancioni in timeline (`.ev-edit` con bordo `--st-write`, riga 1659). Contraddice "spento dove non c'è stato". Correzione: bordo `--ev-past`, colore solo sull'evento aperto.
- Il badge Git resta fisso a `2` (riga 2601) anche in `dense`, dove ci sono `7 changed`. Correzione: legarlo allo scenario.
- Il nome di corsia è `qwen-coder` (righe 4095 e 4348), mentre altrove l'agente si chiama `qwen2.5-coder:14b`. Correzione: nome completo con ellissi.
- Nel tema chiaro placeholder e `Ctrl+L` dell'input stanno a 4.12:1 su `--s0` (`--tx-3`, righe 2092 e 2101). È esente perché disattivato, ma `Ctrl+L` non è spiegato da nessuna parte. Correzione: togliere la scorciatoia o portarla a `--tx-2`.
- Tre strati decorativi si sommano: griglia doppia, staffe d'angolo e tratteggio obliquo nelle corsie non ancora nate (il detector segnala `codex-grid-background`). C'è il rischio di un "HUD" generico. Correzione: in mappa tenere solo la griglia maggiore.

## carta-inchiostro

### Grave

Nessuno.

### Medio

- **L'impulso di `reading` si ripete all'infinito.** Ciclo di 3.2 s (691-693). Il README ammette che è una simulazione, ma la checklist risulta spuntata lo stesso (vedi Trasversali). Correzione: un impulso per evento di lettura.
- **Dense: la timeline di `Claude #2` è illeggibile in un punto.** I blocchi paralleli sono alti 11 px con testo a 10 px (1216-1221). `pnpm typecheck` è tagliato in alto e tocca il blocco d'attesa (`screenshot/dense.png`). In comfortable anche `Draft tests for client.ts` esce a destra. Correzione: la corsia si allarga quando ci sono chiamate parallele (lo prevedono già i rischi del README).
- **Le note in corsivo e le etichette mono sono troppo sottili per uno sguardo di 2 secondi.** Riguarda "needs your approval", "drafting tests for client.ts", "2 failing" e le etichette degli eventi in Courier Prime a 10.5 px (`--fs-xs`, riga 127; `.tick-l`, 1008). Correzione: note a 12 px, mono della timeline a 11 px.

### Minore

- Le etichette di scala `2:00` e `2:14` si toccano (righe 3042-3044; `screenshot/light.png`). Correzione: nascondere il tick più vicino a `now`.
- Alcune dimensioni sono fuori dalla scala del README: 10 px (righe 486, 1219, 1276) e 11 px (riga 617). Correzione: usare `--fs-xs` / `--fs-s`.
- `Interrupt` usa il rosso dell'errore (`.lnk.danger`, riga 1437, usata alla 3543), ma il rosso è uno stato. Correzione: inchiostro con sottolineatura.
- Nel tema scuro il bordo di `Always this session` (`--rule-strong` su `--surface-raised`) sta a 2.91:1 (righe 93, 98, 1731-1732). Il testo identifica comunque il pulsante. Correzione: bordo `--ink-3` nel dialog.
- L'etichetta `Live` dello scrubber sta nel margine di 28 px e tocca il bordo della colonna Agents (1272-1279). Correzione: ancorarla a sinistra della linea.
- La mappa "a stemma" consuma molto spazio: 10 nodi riempiono il canvas e con 34 file è già piena. Correzione: ridurre il passo verticale delle righe e ancorare i sigilli sui rami.

## Trasversali

- **Il BRIEF si contraddice sull'impulso di `reading`.** La tabella degli stati chiede un "impulso leggero", ma la checklist dice che con il movimento consentito pulsa solo l'attesa. `precisione` fa un impulso singolo; `sala-controllo` e `carta-inchiostro` lo ripetono all'infinito e spuntano comunque la voce. Va deciso in `DESIGN.md`: un impulso per evento. Se si conferma la checklist, i loop di sala e carta diventano gravi.
- **In due direzioni l'attesa pulsa in due punti.** `precisione` (`.blink` nella barra di stato e nella cella aperta della timeline, 1676-1678) e `carta-inchiostro` (righe 1186 e 1850) animano sia la barra di stato sia la timeline. `sala-controllo` anima solo la barra di stato. Da decidere se il blocco in timeline conta come "segmento di attesa".
- **Tema chiaro: il pulsante primario ruba la scena all'attesa.** In tutte e tre `Approve` è un blocco d'inchiostro pieno, e in light+gray è il pieno più forte dello schermo. Nella sala il giallo sta a 1.38:1 sulla carta, in carta a 1.26:1: regge solo grazie a bordo e strisce. Correzione: nel chiaro `Approve` a contorno spesso.
- **Testo sotto 11 px ovunque.** Il detector trova 41 / 95 / 10 testi funzionali sotto 11 px (precisione / sala / carta). Va fissato un minimo di 11 px nei token della 1c: l'app sta su un secondo monitor.
- **Gli eventi paralleli sulla stessa corsia si sovrappongono in tutte e tre** nello scenario `dense`. Serve una regola comune: la corsia si allarga per ogni chiamata parallela.
- **In `normal` la mappa lascia vuota la metà inferiore** in tutte e tre, perché `Fit` non è applicato. Con 10 nodi il confronto sottostima i problemi di densità.
- **Token incompleti.** I colori sono tutti token: nessun letterale fuori dai blocchi tema in nessuna delle tre. Padding e gap però sono px letterali, e le durate dei cicli sono letterali: 1200 ms; 2.8 s / 1.3 s / 1.6 s; 3.2 s / 0.9 s / 1.6 s. Prima di `design/tokens.json` servono una scala di spaziatura e token per i cicli.
- **Verifiche superate da tutte e tre:**
  - con `prefers-reduced-motion: reduce` restano 0 animazioni attive (emulazione Chromium);
  - con `gray=1` i 7 stati e i 3 tipi di agente si distinguono per forma in entrambi i temi;
  - nei casi controllati le tabelle di contrasto dei README coincidono con i miei calcoli;
  - font tutti OFL, nessuna richiesta di rete oltre Google Fonts, contenuti obbligatori dello scenario `normal` presenti.

## Punti di forza

### precisione

- Gli stati si leggono prima dalla forma (gutter + tratto) e poi dal colore. La storia in timeline è grigia: il colore resta solo sugli eventi aperti. È la direzione più calma.
- Il movimento è il più disciplinato: impulsi e scie partono una sola volta e tutto sta dentro `no-preference`.
- Linguaggio da IDE con scorciatoie sempre visibili accanto alle azioni: è la più efficiente per chi usa la tastiera.

### sala-controllo

- Le sigle dei canali (`CL`, `EX`, `QW`) con antenna e massa rendono cloud e locale riconoscibili a colpo d'occhio, anche in grigio.
- Risponde meglio delle altre alla domanda 5: token, quota locale, VRAM e la lista `Changed files` sono leggibili da lontano.
- In `dense` ha la mappa più ordinata: 41 nodi in tre colonne, senza sovrapposizioni.

### carta-inchiostro

- È quella con il punto di vista più forte e meno "template": segni di correzione, sigilli rotondi/quadrati e legenda `Key` in mappa.
- L'evidenziatore è davvero l'unico richiamo, soprattutto nel tema scuro. Il dialog ha un titolo display chiaro.
- Chat e frasi in serif si leggono bene: adatta allo sguardo di sfuggita della persona.
