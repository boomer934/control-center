# Stato attuale

_Ultimo aggiornamento: 2026-11-13_

## Fase

**Fase 0 — Fondamenta della repo**: ✅ completata il 2026-11-13.

**Prossima: Fase 1 — UX e design, da iniziare con la 1a (ricerca UX).** Il brief operativo completo (prerequisiti, sotto-fasi, modello ed effort, goal, fixture, vincoli) è in [`FASE_1.md`](FASE_1.md): **leggerlo per primo**. In parallelo si possono registrare le prime sessioni (anticipo della Fase 2).

## Branch

`main`, su GitHub (repo privata `control-center`, remote `origin`). Nessuna PR aperta.

## Cosa funziona

- Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI (job "Verify (Windows)").
- Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- CI GitHub Actions (checkout v7, setup-node v7, pnpm/action-setup v6): verifica su Windows, gitleaks (CLI, cronologia completa), commitlint e controllo memoria sulle PR, audit. **Verificato con la PR #7 che un errore di tipo blocca la CI.**
- release-please v5; Dependabot con gli aggiornamenti delle Actions raggruppati in un'unica PR.
- Sull'account GitHub ci sono anche i controlli di CodeRabbit (revisione) e GitGuardian (segreti), che compaiono su ogni PR.
- Documenti open source: LICENSE (MIT), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- `CLAUDE.md`, memoria completa con `PIANO.md`, ADR 0001-0002, skill `inizio-sessione`/`fine-sessione`, hook `SessionStart`.

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per repo private con il piano gratuito di GitHub. Da qui in avanti si lavora solo su branch + PR.
- Il server MCP Figma va autorizzato con `/mcp` prima della Fase 1c.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
