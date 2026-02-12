# DevMind

> Deterministic context and memory layer for AI coding agents.
  Let Agent remember your design system, general context, and database.

## Install

```bash
npm install -g devmind
```

## Integrations

### OpenClaw

```bash
devmind openclaw-plugin --force
```

Optional:

```bash
devmind openclaw-plugin --project --force
```

Default install target:

- `~/.openclaw/skills/devmind/SKILL.md`

### Claude Code

```bash
devmind claude-plugin --force
```

This creates:

- `.claude-plugin/marketplace.json`
- `.claude-plugin/skills/devmind/SKILL.md`

Then install that local folder in Claude Code using your plugin installer flow.

### Codex (CLI + App)

```bash
devmind codex-plugin --force
```

Optional:

```bash
# Also install project-local skill
devmind codex-plugin --project --force

# Skip legacy mirror paths
devmind codex-plugin --no-legacy --force
```

Default install targets:

- `~/.agents/skills/devmind/SKILL.md`
- `CODEX_HOME/skills/devmind/SKILL.md`
- `~/.codex/skills/devmind/SKILL.md`

## Quick Start

```bash
# 1) Design system policy first
devmind design-system --init

# 2) Build overall context
devmind generate --all

# 3) Validate freshness/recommendation
devmind status --json
```

You are ready when `.devmind/AGENTS.md` and `.devmind/index.json` exist.

## Canonical Flow

1. Design system
2. Overall context
3. Database checks

## Quick Command Guide

### Context lifecycle

```bash
devmind generate --all
devmind scan
devmind status --json
```

### Focused context

```bash
devmind context --focus src/features
devmind context --query runbook
devmind retrieve -q "auth middleware flow" --type architecture --json
```

### Learning loop

```bash
devmind audit
devmind extract
devmind extract --apply
devmind autosave --source task-end
```

### Database validation

```bash
devmind analyze
devmind validate --strict
```

## Agent-First Runbook

```bash
# 1) Preflight
devmind status --json

# 2) If stale, run recommendedCommand

# 3) Execute with focused retrieval
devmind retrieve -q "<task query>" --json

# 4) Persist memory
devmind autosave --source task-end
```

## Key Outputs

```text
.devmind/
+-- AGENTS.md
+-- index.json
+-- design-system.json
+-- devmind-tools.json
+-- analysis/
|   +-- AUDIT_REPORT.md
|   +-- DESIGN_SYSTEM_AUDIT.md
|   +-- CODE_DB_MAPPING.md
+-- memory/
|   +-- LEARN.md
|   +-- checkpoints/
|   +-- SESSION_JOURNAL.md
+-- codebase/
+-- database/
```

## License

Apache 2.0 (c) Nyan Lin Maung
