# Stato attuale

_Ultimo aggiornamento: 2026-11-13_

## Fase

**Fase 0 — Fondamenta della repo**: quasi completa.

## Branch

`main` (repo locale, nessun remote GitHub ancora).

## Cosa funziona

- Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- `pnpm verify` (format, typecheck, lint, test) verde in locale.
- Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- CI GitHub Actions (Windows) con gitleaks, commitlint, controllo memoria, audit; release-please; Dependabot.
- Documenti open source: LICENSE (MIT), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- `CLAUDE.md`, questa memoria, ADR 0001, skill `inizio-sessione`/`fine-sessione`, hook `SessionStart`.

## Cosa manca per chiudere la Fase 0

- Spostare `PIANO.md` (copiato nella radice dall'app) in `docs/memoria/PIANO.md`.
- Creare la repo GitHub (privata) e fare push: serve il consenso dell'utente.
- Proteggere `main` su GitHub (PR obbligatoria, CI verde) e verificare la CI con una PR di prova.

## Blocchi

- Il server MCP Figma va autorizzato con `/mcp` prima della Fase 1.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
