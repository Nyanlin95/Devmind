# CLI Maintainer Notes

This folder defines command registration for the main `devmind` CLI.

## Layout

- `register-all.ts`: single entry that registers every command group.
- `register-database.ts`: `init`, `generate`, `validate`, `watch`, `show`.
- `register-memory.ts`: `handoff`, `checkpoint`, `learn`, `history`.
- `register-analysis.ts`: `analyze`, `status`, `audit`, `extract`, `design-system`, `retrieve`, `autosave`.
- `register-codebase.ts`: `scan`, `context`.
- `handlers.ts`: shared heavy handlers (`generate`, `scan`) to avoid duplication.

## Conventions (Agent-First)

- Keep command registration declarative in `register-*.ts` files.
- Keep complex execution logic in `handlers.ts` or command modules under `src/commands`.
- Wrap command actions with `withCliErrorHandling(...)` for consistent failure semantics.
- Preserve option names/defaults and command order unless intentionally changed.

## Adding A New Command

1. Choose the correct `register-*.ts` group.
2. Register options and `.action(withCliErrorHandling(...))`.
3. If logic is large, put it in `src/commands/*` or `handlers.ts`.
4. Run `npm run build` and verify `dist/cli.js --help`.

## Related Tree

The database-only CLI mirrors this structure in `src/database/cli/`.
