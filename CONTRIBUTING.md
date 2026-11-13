# Contributing

Thanks for your interest! The project is in early development, so expect things to move fast.

## Setup

```bash
pnpm install        # also installs the git hooks (lint-staged, commitlint, gitleaks)
pnpm verify         # format check, typecheck, lint, unit tests
```

Optional but recommended: install [gitleaks](https://github.com/gitleaks/gitleaks) (`winget install gitleaks`) so secrets are caught before you commit.

## Workflow

- Branch from `main` with a short-lived branch: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org): `feat(live): highlight written files`. Versions and the changelog are generated from them by release-please.
- Open a PR. CI must be green: format, typecheck, lint, tests, secret scan, audit.
- UI changes include updated visual/E2E tests and a design review.
- Changes to IPC, child processes, the file system or secret handling get a manual security review. See [SECURITY.md](SECURITY.md) and `docs/memoria/SICUREZZA.md`.
- Architectural decisions and new dependencies are recorded as ADRs in `docs/adr/`.

## Project memory

`docs/memoria/` holds the living project state (in Italian): current status, next steps, session history, decisions, design and security notes. Update `STATO.md` and `STORIA.md` with every meaningful PR.

## Fixtures and privacy

Recorded agent sessions are useful test data, but they can contain secrets and personal paths. Only commit **sanitized** recordings (`packages/fixtures/sanitized/`). Raw recordings stay in the git-ignored `packages/fixtures/raw/`.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
