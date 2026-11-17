# Indice delle decisioni (ADR)

Le ADR complete sono in `docs/adr/`. Una riga per decisione; per una nuova ADR copia `docs/adr/0000-template.md`.

| #                                              | Titolo                              | Stato     | Sintesi                                                                                                   |
| ---------------------------------------------- | ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| [0001](../adr/0001-stack.md)                   | Stack tecnologico                   | Accettata | Electron + React + TS (6) in monorepo pnpm, tutto Node, zod ai confini, Vitest/Playwright                 |
| [0002](../adr/0002-memoria-e-versionamento.md) | Memoria di progetto e versionamento | Accettata | `docs/memoria/` + skill di sessione; Conventional Commits + release-please; `schemaVersion` sugli eventi  |
| [0003](../adr/0003-agent-event-schema.md)      | Schema AgentEvent e fixture         | Accettata | Eventi piatti stretti, percorsi relativi, merge stream+hooks; fixture ripulite con allowlist e `--check`  |
| [0004](../adr/0004-shell-sicura-e-ipc.md)      | Shell sicura, IPC e app://          | Accettata | Contratto IPC zod con envelope e controllo del mittente; renderer da `app://`; CSP stretta; Fuses testati |
