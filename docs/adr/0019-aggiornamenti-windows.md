# 0019 — Aggiornamenti Windows da GitHub Releases

- **Stato:** accettata
- **Data:** 2026-11-27

## Contesto

Per distribuire gli aggiornamenti della 5h.7 servono un installer Windows e un feed con i checksum. Il pacchetto Electron finora veniva generato solo come directory di verifica.

## Decisione

- `pnpm dist` produce un installer NSIS x64, il blockmap e `latest.yml` con la versione del `package.json` radice, governata da release-please.
- Release Please crea una bozza. GitHub Actions costruisce dal commit della release con accesso in sola lettura. Un job con permessi di scrittura allega i tre file e pubblica la bozza completa.
- `electron-updater` controlla GitHub Releases all'avvio e ogni sei ore. È configurato per release stabili, con downgrade e installer web disabilitati. Scarica in background, installa alla normale chiusura e riapre l'app solo con il comando esplicito di riavvio.
- La preferenza si applica nel main e si conserva nel profilo locale. Il renderer legge uno stato validato e può cambiare solo la preferenza o chiedere l'installazione già pronta. L'evento `app:update-status` usa il gate IPC esistente.

## Alternative considerate

- Distribuzione manuale. Richiederebbe di controllare e installare a mano ogni nuova versione.
- Pubblicare la release prima degli allegati. Il controllo periodico potrebbe trovare una release senza manifesto durante la build.

## Conseguenze

Le installazioni dipendono dalla disponibilità del repository GitHub pubblico. Il digest SHA-512 verifica che l'installer corrisponda al manifesto ottenuto via HTTPS. Le build senza firma dipendono dalla fiducia nel repository e nel workflow, senza verifica indipendente dell'editore. La firma e il canale beta restano in Fase 10. I dettagli sono nella [memoria di sicurezza](../memoria/SICUREZZA.md).
