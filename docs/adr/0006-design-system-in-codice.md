# 0006 — Design system in codice, pannelli e command palette

- **Stato:** accettata
- **Data:** 2026-11-17

## Contesto

La Fase 3c porta in app il design system della 1c (`design/tokens.json`, `design/sistema/`): tema chiaro/scuro/sistema, densità, componenti base, layout a pannelli, command palette e scorciatoie con ambiti di focus. L'ADR 0001 copre già Tailwind v4, React 19, Radix, Lucide, Motion e Zustand; servono ADR per le librerie nuove.

## Decisione

- **Due dipendenze nuove**, ambedue senza accesso a rete, file system o processi (solo UI nel renderer), dichiarate come `devDependencies` di `apps/desktop` come il resto del renderer (finiscono nel bundle di Vite):
  - `react-resizable-panels` (v4): pannelli ridimensionabili con layout ricordato (`useDefaultLayout`, salvataggio in `localStorage`);
  - `cmdk` (v1): lista filtrabile accessibile della command palette (ruoli ARIA, frecce, `Enter`). Le scorciatoie restano nostre.
- **Tailwind v4 solo come ponte dei token:** `@tailwindcss/vite` e `tailwindcss` (già coperti dall'ADR 0001). Si importano soltanto `theme` e `utilities`, senza preflight: la base resta quella di `componenti.css`. `@theme inline` azzera la palette di Tailwind e mappa i token su colori, spaziature, raggi e corpi: le utility leggono le stesse variabili CSS dei componenti, quindi seguono tema e densità.
- **`design/sistema/componenti.css` si importa com'è** (nessuna copia). I componenti React (`ui/primitives.tsx`) emettono le sue classi; gli adattamenti alla finestra reale (niente cornice 1440×900, overlay a schermo intero) stanno in `styles/app.css`. Se il design cambia, cambia in un posto solo.
- **Icone:** lo sprite SVG della 1c (`ui/sprite.ts`, generato da `design/sistema/shell.js`) invece di Lucide: i glifi di stato e di agente sono disegni propri e non esistono in Lucide.
- **Temi:** preferenza `system | dark | light` e densità in `localStorage` (`cc.appearance`), letta con `parseSettings` (valori non validi → predefiniti). `system` segue `prefers-color-scheme` in tempo reale. Nessun canale IPC: la preferenza non esce dal renderer.
- **Scorciatoie:** motore puro in `keys/shortcuts.ts` (nessun tipo DOM, testato in node). Regole di `architettura.md`: vale l'ambito più interno col focus; il terminale (`data-focus-scope="terminal"`) cattura tutto tranne le scorciatoie marcate `fromTerminal` (`Ctrl+Shift+P`, `Ctrl+J`, `Ctrl+1…7`); i tasti singoli non scattano nei campi di testo; con un dialog aperto valgono solo quelle del dialog e quelle della palette.
- **Font:** Instrument Sans e Martian Mono non sono ancora inclusi nel pacchetto (la CSP vieta Google Fonts): l'app usa i font di ripiego dei token (Segoe UI, Cascadia Mono). Inclusione dei file dei font da decidere con una voce a parte.

## Alternative considerate

- **Radix Dialog/Command per la palette:** più grande, e la palette ha già i suoi stili; `cmdk` basta.
- **`allotment` o pannelli fatti a mano:** il ridimensionamento con tastiera e il layout ricordato sono lavoro in più da ottenere bene; `react-resizable-panels` li ha.
- **Riscrivere `componenti.css` in utility Tailwind:** 3000 righe già approvate da riscrivere, con rischio di deriva dal design.
- **Lucide per le icone:** non ha i glifi di stato e di agente del sistema.

## Conseguenze

- Il bundle del renderer cresce di circa 75 kB (CSS) e 100 kB (JS).
- Le scorciatoie nuove si aggiungono in `keys/registry.ts` e hanno un test automatico di unicità.
- I test visivi (`ui.spec.ts`) confrontano screenshot di Windows: le immagini di riferimento sono quelle di `windows-latest`; un cambio di font o di rendering richiede di rigenerarle (`--update-snapshots`).
