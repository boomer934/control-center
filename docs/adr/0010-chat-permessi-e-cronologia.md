# 0010 — Chat, permessi e cronologia di Claude

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La 4.1 normalizza gli eventi di Claude Code e li invia al renderer. La chat deve mostrare testo e codice, rispondere alle richieste di permesso e riaprire i turni salvati.

## Decisione

- Adottiamo `react-markdown` 10.1.0 nel renderer. Produce componenti React dal Markdown CommonMark, compreso il codice inline e a blocchi. Scartiamo l'HTML grezzo e rendiamo inerte il testo dei link. Le immagini sono escluse. La libreria è compilata nel bundle del renderer.
- Il main usa il protocollo stream-json di Claude Code per i delta di testo e per `can_use_tool`. Il renderer riceve un ID opaco e gli argomenti ripuliti. La risposta IPC seleziona una decisione sull'ID pendente. Il main rispedisce gli argomenti originali in caso di approvazione.
- «Always in this session» ricorda in RAM l'impronta dello strumento e dei suoi argomenti esatti. La regola sopravvive ai turni della stessa chat e scade con la chiusura della sessione.
- Il main salva prompt ed eventi ripuliti in file JSONL versione 1 per workspace e conversazione, dentro `userData/claude-history`. Salva l'ID nativo di Claude per riprendere la conversazione con `--resume`. I delta transitori e le richieste di permesso grezze restano fuori dal file.

## Alternative considerate

- Parser Markdown interno. Avrebbe richiesto di mantenere regole per blocchi, inline e sequenze di escape del CommonMark.
- HTML sanitizzato iniettato nel DOM. Un renderer React diretto mantiene la superficie del markup più piccola.
- Regole di Claude persistenti. Una scelta limitata alla sessione resta nello stato del processo main.

## Conseguenze

- I link nei messaggi restano leggibili come testo. Il renderer non apre risorse e mantiene la CSP esistente.
- L'elenco mostra le ultime 25 sessioni del workspace. La scrittura si ferma a 12 MiB per file con una segnalazione nei Problems. Le sessioni salvate restano leggibili e riprendibili nei limiti previsti dalla CLI.
- La compatibilità con il protocollo dei permessi va ricontrollata quando cambia la versione di Claude Code.
