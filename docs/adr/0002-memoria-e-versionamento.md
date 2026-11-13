# 0002 — Memoria di progetto e versionamento

- **Stato:** accettata
- **Data:** 2026-11-13

## Contesto

Il progetto si sviluppa in molte sessioni con Claude, spesso in loop guidati da `/goal`. Senza una memoria esplicita il contesto si perde tra una sessione e l'altra. Serve anche un versionamento affidabile, per la repo e per i dati che l'app salva.

## Decisione

- **Memoria:**
  - `docs/memoria/` con un file per scopo (stato, prossimi passi, storia, piano, decisioni, design, sicurezza, glossario, problemi noti);
  - `CLAUDE.md` contiene l'indice con la regola su quando leggere e aggiornare ogni file;
  - skill `inizio-sessione` e `fine-sessione`;
  - hook `SessionStart` come promemoria;
  - avviso in CI se una PR di feature non aggiorna `STORIA.md`.
- **Versionamento della repo:** Conventional Commits (commitlint) → release-please (SemVer, `CHANGELOG.md`, tag, GitHub Release). Branch brevi e `main` protetto.
- **Versionamento dei dati:** ogni evento e file salvato ha `schemaVersion`; ogni cambio incompatibile richiede una migrazione testata.
- **Versionamento del lavoro degli agenti** (Fase 4b): checkpoint in ref nascosti `refs/control-center/checkpoints/<sessione>`.

## Alternative considerate

- **Un unico file di note:** cresce senza struttura e si legge tutto ogni volta.
- **Versioni manuali e changesets:** release-please è più semplice con una sola app versionata.

## Conseguenze

- A fine sessione serve disciplina, resa automatica dalla skill `fine-sessione`.
- I messaggi di commit diventano parte del prodotto, perché generano il changelog.
