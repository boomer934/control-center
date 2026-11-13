# Design

> Da completare nella **Fase 1** (ricerca UX → direzioni estetiche → Figma → prototipo). Qui sono fissati i vincoli già decisi nel piano.

## Domande a cui l'app risponde in meno di 2 secondi

1. Cosa sta facendo l'agente adesso?
2. Quali file ha toccato e cosa ha cambiato?
3. Aspetta me? Ha sbagliato?
4. Cosa gira sulla mia macchina?
5. Quanto ho consumato, e quanto è stato fatto in locale?

## Architettura dell'informazione

- **Barra sinistra:** workspace + sezioni (Live, Infra, Agenti locali, MCP & Skills, Git, Telemetria, Impostazioni).
- **Area centrale:** sezione attiva (default: Live).
- **Pannello destro agganciabile:** sessione Claude.
- **Pannello inferiore agganciabile:** terminale, log, Console Errori.
- **Barra di stato:** sessione, agenti attivi, VRAM, token, errori.
- **Command palette:** Ctrl+K.

## Stati semantici (uguali ovunque)

| Stato        | Significato             | Trattamento                                        |
| ------------ | ----------------------- | -------------------------------------------------- |
| idle         | nessuna attività        | neutro                                             |
| reading      | l'agente legge          | colore info, impulso leggero                       |
| writing      | l'agente modifica       | accento caldo, bordo pieno + badge diff            |
| running      | comando o tool in corso | progresso indeterminato                            |
| waiting-user | serve una tua decisione | colore attenzione: l'unico che richiama lo sguardo |
| error        | fallito                 | colore errore + icona (mai solo colore)            |
| done         | completato              | ritorno al neutro con una scia che sfuma           |

## Identità degli agenti

Colore e glifo stabili per agente (Claude, subagent Claude, agente Ollama). Gli agenti locali e quelli cloud devono distinguersi a colpo d'occhio, anche in scala di grigi.

## Movimento

Il movimento comunica stato, non decora. Durate 150-300 ms con curve dai token, `prefers-reduced-motion` rispettato, eventi accorpati per frame, nessuna animazione continua sui nodi inattivi.

## Da definire (Fase 1)

- Direzione estetica (scelta tra 3 proposte).
- Token (colori, tipografia, spaziatura, raggi, ombre, movimento) → `design/tokens.json`.
- Link al file Figma.
