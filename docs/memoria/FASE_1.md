# Brief operativo — Fase 1: UX e design

> File di passaggio per la sessione che apre la Fase 1. Va letto insieme a `STATO.md` e alla sezione "Fase 1" di `PIANO.md`. Va aggiornato a ogni sotto-fase chiusa e archiviato (spostato in `STORIA.md` in sintesi) a fine fase.

## Obiettivo

Progettare l'esperienza completa **prima di scrivere codice di prodotto**, con il massimo investimento sulla **Vista Live**: mappa, timeline e agenti in tempo reale. L'app deve risultare intuitiva al primo sguardo e potente per un developer: vista "umana" ovunque, vista "raw" a un tasto, tutto raggiungibile da tastiera con Ctrl+K.

## Prerequisiti (controllare a inizio sessione)

| Cosa                                   | Come                                        | Serve per                                    |
| -------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| Skill `/frontend-design`               | già disponibile                             | 1b                                           |
| Skill `impeccable`                     | già disponibile                             | revisione di 1b, 1c e 1d; genera `DESIGN.md` |
| Playwright                             | `pnpm add -D -w @playwright/test` (con ADR) | 1d                                           |
| Almeno 1 sessione registrata (fixture) | vedi "Fixture per 1d" sotto                 | 1d (bloccante)                               |

## Sotto-fasi, modello e goal

Una sessione o un loop per sotto-fase. Ogni sotto-fase si chiude con la **revisione dell'utente** e con la skill `fine-sessione`. Si lavora su un branch `feat/design-1x`, si apre una PR e si unisce con la CI verde.

### 1a — Ricerca UX e architettura dell'informazione ✅

> ✅ Completata e revisionata il 2026-11-13 (PR #10). File: [`persona.md`](../../design/ricerca/persona.md), [`domande-chiave.md`](../../design/ricerca/domande-chiave.md), [`architettura.md`](../../design/ricerca/architettura.md), [`schermate.md`](../../design/ricerca/schermate.md); riassunto in `DESIGN.md`.

- **Modello:** Opus 5.5 · **effort:** high · **ultracode:** no
- **Produce:**
  - `design/ricerca/persona.md`: persona principale (dev che usa Claude Code ogni giorno, 2-5 progetti, Docker, modelli locali) e secondaria ("di passaggio").
  - `design/ricerca/domande-chiave.md`: le 5 domande a cui rispondere in meno di 2 secondi (già in `DESIGN.md`), ognuna con il punto dello schermo che risponde.
  - `design/ricerca/architettura.md`: navigazione, pannelli agganciabili, barra di stato, command palette, scorciatoie da tastiera, flussi principali (apro progetto → lancio task → guardo l'agente sulla mappa → approvo un permesso → vedo il diff → ripristino un checkpoint → leggo un errore).
  - `design/ricerca/schermate.md`: elenco schermate × stati (vuoto, caricamento, normale, denso, errore, offline, onboarding in 3 passi).
  - `DESIGN.md` aggiornato con i riassunti e i link.
- **Goal:**
  > Esistono in `design/` la ricerca UX (persona, domande chiave, architettura dell'informazione) e la mappa delle schermate con tutti i loro stati, scritte in `docs/memoria/DESIGN.md`; memoria aggiornata.

### 1b — Tre direzioni estetiche ✅

> ✅ Scelta il 2026-11-14, PR #12 unita lo stesso giorno: **`precisione fluida`** ([README](../../design/direzioni/precisione-fluida/README.md)), cioè `precisione` più fluida e con meno spigoli, con gli innesti delle altre due; densità `compact`; nome candidato Vernier. Prodotte prima: tre direzioni in `design/direzioni/` (`precisione`, `sala-controllo`, `carta-inchiostro`) con `live.html`, `README.md` e 4 screenshot ciascuna; [`REVISIONE.md`](../../design/direzioni/REVISIONE.md) (un solo grave, corretto) e [`CONFRONTO.md`](../../design/direzioni/CONFRONTO.md) con raccomandazione e domande. Decise con l'utente le regole di movimento: `reading` un impulso per evento, pulsa solo il segmento d'attesa nella barra di stato. I medi e i minori vanno nei token della 1c.

- **Modello:** Opus 5.5 · **effort:** high · **ultracode: sì, effort high**: le tre direzioni si esplorano in parallelo, una per agente.
- **Produce:** `design/direzioni/<nome>/` per ciascuna direzione:
  - palette (scura e chiara), tipografia (sans per l'interfaccia + mono con cifre tabulari);
  - linguaggio dei 7 stati semantici e identità degli agenti (Claude, subagent, Ollama), distinguibili anche in scala di grigi;
  - una schermata HTML statica della Vista Live con dati finti realistici;
  - `README.md` con l'idea, i punti di forza e i rischi.
- Le direzioni devono essere **davvero diverse**. Nessuna deve sembrare un template.
- Revisione con impeccable, poi **scelta dell'utente**. La scelta e il motivo vanno in `STORIA.md`; il nome del prodotto si decide qui o in 1c.
- **Goal:**
  > Tre direzioni estetiche distinte prodotte con /frontend-design, ciascuna con palette, tipografia e una schermata della Vista Live, salvate in `design/direzioni/`; memoria aggiornata con la richiesta di scelta all'utente.

### 1c — Design system e schermate in HTML

> **In corso** (branch `feat/design-1c`, sessione del 2026-11-14).
>
> - **Fatti:** `design/tokens.json` + generatore `tokens.css`, `componenti.css`, `shell.js`, `componenti.html` e le **9 schermate P0** con tutti gli stati (0 errori di console, nessun testo sotto 11 px). La verifica dei flussi F1-F7 è in `design/sistema/README.md`.
> - **Restano:**
>   - le 9 P1;
>   - gli screenshot nella repo (scuro, chiaro, denso);
>   - la revisione impeccable, con i gravi da mostrare all'utente prima di correggerli;
>   - push e PR.
> - **Nome:** Vernier verificato, con l'esito in `STORIA.md`; la decisione spetta all'utente.

> Figma tolto dal piano il 2026-11-14 (vedi `STORIA.md`): costava molti token per un passaggio intermedio HTML → Figma → codice. Il design system nasce direttamente come token e pagine HTML statiche, come i mockup della 1b.

- **Modello:** Opus 5.5 · **effort:** high · **ultracode:** no
- **Bloccante:** scelta della direzione (1b).
- **Produce:**
  - `design/tokens.json`: colori (temi scuro e chiaro), tipografia, spaziatura, raggi, ombre, durate e curve della direzione scelta, con le regole di `REVISIONE.md` (minimo 11 px, corsie della timeline, pulsante primario nel tema chiaro…);
  - `design/sistema/tokens.css`: gli stessi token come variabili CSS, l'unica fonte di stile delle pagine HTML (in Fase 3 diventano il tema Tailwind);
  - `design/sistema/componenti.html`: tutti i componenti con tutti gli stati, solo con i token (anticipa la pagina componenti della Fase 3);
  - `design/sistema/schermate/`: schermate P0 e P1 di `schermate.md` in alta fedeltà, statiche, con dati finti e i loro stati;
  - screenshot (scuro, chiaro, denso) e revisione impeccable.
- I flussi F1-F7 si verificano sulla sequenza delle schermate; il prototipo interattivo è quello in codice della 1d.
- **Goal:**
  > Esistono `design/tokens.json` e `design/sistema/` con token CSS, pagina componenti con tutti gli stati e le schermate P0 e P1 in alta fedeltà nella direzione scelta, solo con i token; screenshot senza errori di console; revisione impeccable senza problemi gravi aperti; memoria aggiornata.

### 1d — Prototipo in codice della Vista Live

- **Modello:** Opus 5.5 · **effort:** high (xhigh se il movimento o le prestazioni danno problemi) · **ultracode:** no
- **Bloccante:** almeno una fixture registrata.
- **Produce:** in `design/prototipo-live/` una pagina React + React Flow alimentata da una fixture, che riproduce la sessione con:
  - stati dei nodi;
  - agenti agganciati ai file;
  - timeline con scrubber;
  - rispetto di `prefers-reduced-motion`.

  Più test Playwright di screenshot degli stati. È un prototipo usa e getta, ma i token sono quelli veri.

- **Goal:**
  > Il prototipo in codice della Vista Live gira su almeno una fixture reale; i test Playwright di screenshot degli stati passano; la revisione impeccable non ha problemi gravi; memoria aggiornata.

## Fixture per 1d (anticipo della Fase 2)

Si possono registrare già durante 1a o 1b, in un terminale separato, su un progetto di prova:

```bash
claude -p "<compito realistico>" --output-format stream-json --verbose > packages/fixtures/raw/sessione-01.jsonl
```

- Servono compiti vari: leggere e modificare più file, lanciare test, usare un subagent, chiedere un permesso, provocare un errore.
- Per gli hooks: una configurazione temporanea (`PreToolUse`, `PostToolUse`, `SubagentStop`, `Notification`, `Stop`) che aggiunge il JSON ricevuto su stdin a `packages/fixtures/raw/sessione-01.hooks.jsonl`.
- `packages/fixtures/raw/` è ignorata da git. **Nulla va committato prima della pulizia** (script della Fase 2).

## Vincoli da rispettare (riassunto)

- **Stati semantici, identità degli agenti e regole di movimento:** come in `DESIGN.md`. Non si cambiano senza aggiornarlo.
- **Accessibilità:** contrasto AA in entrambi i temi; mai solo il colore per indicare uno stato.
- **Prestazioni:** la Vista Live deve reggere 500 nodi a 60 fps (verificato nella Fase 5, ma il design non deve renderlo impossibile).
- **Lingue:** i documenti di design in `design/` sono in italiano; i testi dell'interfaccia sono in inglese (app open source), con l'eventuale localizzazione italiana più avanti.

## Decisioni aperte da chiudere in questa fase

1. ~~Direzione estetica (1b).~~ ✅ `precisione fluida` (2026-11-14).
2. Nome del prodotto (1c): candidato Vernier, **verificato il 2026-11-14**, decisione all'utente.
   - **Marchi:** Vernier Software & Technology ha molti marchi `VERNIER…` negli USA, soprattutto in classe 9 (software).
   - **Pacchetto npm:** `vernier` esiste già (creato a giugno 2026); è un tool locale di feedback UI per agenti AI, cioè un ambito vicino al nostro.
   - **Domini:** `vernier.com` e `vernier.dev` sono in uso.
3. ~~Densità predefinita dell'interfaccia.~~ ✅ `compact`, con `Comfortable` nelle impostazioni (2026-11-14).
