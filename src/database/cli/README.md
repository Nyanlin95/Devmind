# Database CLI Maintainer Notes

This folder defines command registration for the internal `devmind-db` compatibility CLI (`src/database/cli.ts`).

Note: the published npm package exposes `devmind` as the public bin. For user-facing docs, prefer `devmind` commands.

## Layout

- `register-all.ts`: single entry that registers every command group.
- `register-database.ts`: `init`, `generate`, `validate`, `watch`, `show`.
- `register-memory.ts`: `handoff`, `checkpoint`, `learn`, `history`.
- `register-interactive.ts`: interactive shortcut command (`interactive` / `i`).

## Conventions

- Keep registration declarative and grouped by concern.
- Wrap actions with `withCliErrorHandling(...)`.
- Keep execution logic in command modules (`src/database/commands/*`).

## Adding A New Command

1. Add registration in the right `register-*.ts` file.
2. Keep flags/output backwards compatible unless intentionally changed.
3. Run `npm run build` and verify `dist/database/cli.js --help`.
