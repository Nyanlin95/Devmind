---
name: devmind-integration
description: Integration guide for OpenClaw agents to use DevMind as their memory and context layer.
---

# DevMind Integration for OpenClaw

DevMind provides your agent with persistent memory, context slicing, and deep codebase understanding.

## Canonical Flow

Always operate in this order:

1. Design system
2. Overall context
3. Database checks

## Setup

Ensure `devmind` is available in your environment.

```bash
npm install -g devmind
devmind openclaw-plugin --force
devmind design-system --init
devmind generate --all
```

## Capabilities

### 1. Design System First

Initialize and enforce UI consistency before code/database work.

```bash
devmind design-system --init
devmind audit
devmind retrieve -q "design tokens and wrappers" --type design-system --json
```

### 2. Overall Context (Codebase Navigation)

Instead of reading all files, use `devmind context` to get a map.

```bash
# Get high-level map
devmind context

# Focus on a specific module
devmind context --focus src/database

# Search generated context
devmind context --query runbook

# Retrieve focused section context
devmind retrieve -q "auth middleware flow" --type architecture --json
```

### 3. Persistent Memory (Learning)

When you make a decision or learn a pattern, save it.

```bash
devmind learn "Always use repository pattern for DB access" --category "architecture"
```

_Note: This saves to `LEARN.md` so future agents (including you) can access it._

### 4. Database Awareness

Before writing SQL or modifying schema, analyze usage.

```bash
devmind analyze
```

### 5. History Tracking

See what changed recently to understand current state.

```bash
devmind history
```

## Workflow Example

1. **Design system first**:
   - Ensure `.devmind/design-system.json` exists (`devmind design-system --init`).
2. **Preflight**:
   - Run `devmind status --json`.
   - If stale/missing, run the returned `recommendedCommand`.
   - Re-run `devmind status --json`.
3. **Start task**:
   - Use `devmind retrieve` or `devmind context` for focused context.
4. **Execute**:
   - If modifying DB: `devmind analyze` (and `devmind validate` if needed).
5. **Finish**:
   - `devmind learn` any new patterns.
   - `devmind autosave --source task-end` for crash-safe persistence.
   - `devmind scan` when structure changed.
