# Stato attuale

_Ultimo aggiornamento: 2026-11-13_

## Fase

**Fase 0 — Fondamenta della repo**: praticamente completa (manca solo la PR di prova).

## Branch

`main`, pubblicato su GitHub (repo privata `control-center`, remote `origin`).

## Cosa funziona

- Monorepo pnpm con `packages/event-schema` (busta minima `AgentEvent` + 3 test).
- `pnpm verify` (format, typecheck, lint, test) verde in locale e in CI (job "Verify (Windows)").
- Hook git: lint-staged + gitleaks (se installato) in pre-commit, commitlint in commit-msg.
- CI GitHub Actions: verifica su Windows, gitleaks (CLI, cronologia completa), commitlint e controllo memoria sulle PR, audit; release-please (primo run ok); Dependabot attivo.
- Documenti open source: LICENSE (MIT), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT.
- `CLAUDE.md`, memoria completa con `PIANO.md`, ADR 0001-0002, skill `inizio-sessione`/`fine-sessione`, hook `SessionStart`.

## Cosa manca per chiudere la Fase 0

- PR di prova con un errore di tipo, per vedere la CI bloccarla (poi chiusa senza merge).

## Blocchi e avvertenze

- **Niente protezione di `main`:** non è disponibile per repo private con il piano gratuito di GitHub. Da qui in avanti si lavora solo su branch + PR.
- Il server MCP Figma va autorizzato con `/mcp` prima della Fase 1c.
- pnpm non è installato globalmente (Node 26 non ha corepack): si usa `npx pnpm@10.34.9`.
