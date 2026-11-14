# Revisione impeccable — prototipo 1d

_2026-11-14 · `impeccable audit` sul dev server (1440×900), stati `reading` (sessione-03), `error` chiaro (sessione-02), `waiting` (sessione-04)._

**Esito: nessun problema grave.** Punteggio 16/20 (buono).

| Dimensione    | Voto | Nota                                                                                                                                                                          |
| ------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibilità | 3    | contrasto AA in tutti i colori di testo usati, nei due temi (minimo `--fg-3` chiaro 4,64:1); timeline come `slider` con tastiera; stato mai solo a colore (glifo + etichetta) |
| Prestazioni   | 3    | `viewAt` ricalcola tutto a ogni frame di riproduzione: va bene sulle fixture (≤ 10 op), da indicizzare nella Fase 5 per 500 nodi                                              |
| Temi          | 4    | solo token di `design/sistema`; l'attribuzione di React Flow ristilizzata con i token                                                                                         |
| Responsive    | 2    | desktop-only per scelta (app Electron); sotto ~1100 px la timeline stringe le etichette, nessun layout stretto                                                                |
| Integrità     | 4    | riusa le classi della 1c (`.node`, `.achip`, `.ev-*`, `.card`), nessuno stile nuovo fuori token                                                                               |

**Rilevatore** (5-6 segnalazioni per stato): tutte scelte già accettate nella revisione 1c e scritte in `docs/memoria/DESIGN.md`:

- testo a 11 px: densità `compact`;
- Instrument Sans: scelta in 1b;
- bordo di stato delle card (`side-tab`) e righe di `reading`/`running`: stati semantici;
- em-dash in sessione-04: sono i `--flag` del comando `npx tsc`, falso positivo.

**Minori aperti (non bloccanti, per la Fase 5):**

- P2: la colonna `Agents` non annuncia i cambi di stato (manca una regione `aria-live` per `waiting-user` ed `error`).
- P2: la mappa a `Fit` con zoom massimo 100% lascia molto vuoto sulle sessioni piccole; valutare uno zoom massimo più alto quando il grafo ha pochi nodi.
- P3: le capsule di lettura molto ravvicinate (4 `Read` in 600 ms) restano senza etichetta; il nome si legge solo dal tooltip.
