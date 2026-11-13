# Glossario

| Termine            | Significato                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AgentEvent**     | Evento normalizzato (zod, `packages/event-schema`) che descrive qualsiasi cosa accada: messaggi, tool, file letti/scritti, agenti, MCP, permessi, uso, errori. Tutta la UI si alimenta da qui. |
| **Normalizzatore** | Adattatore che converte una sorgente (stream-json di Claude, hooks, Ollama, log) in `AgentEvent`.                                                                                              |
| **Fixture**        | Sessione reale registrata e ripulita, usata per design, sviluppo e test senza far girare agenti.                                                                                               |
| **Hooks bridge**   | Script invocato dagli hooks di Claude Code che inoltra gli eventi all'app via named pipe autenticata.                                                                                          |
| **MCP bridge**     | Server MCP dell'app (`delegate_to_local_agent`, `list_local_models`) che permette a Claude di delegare a Ollama.                                                                               |
| **Workspace**      | Cartella di progetto aperta nell'app; confine di tutte le operazioni su file.                                                                                                                  |
| **Vista Live**     | Mappa del progetto + timeline + pannello agenti, sincronizzati sugli eventi.                                                                                                                   |
| **Checkpoint**     | Snapshot del workspace salvato in un ref nascosto prima che un agente scriva; ripristinabile dalla timeline.                                                                                   |
| **Stato derivato** | Stato della UI ricalcolato dagli eventi: permette il replay in qualunque istante.                                                                                                              |
| **Console Errori** | Pannello che raccoglie gli errori dell'app e del progetto con lo stack trace leggibile.                                                                                                        |
| **Goal**           | Condizione verificabile impostata con `/goal` che guida il loop di lavoro di una (sotto)fase.                                                                                                  |
