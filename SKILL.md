---
name: devmind-core
description: Unified developer assistant for codebase analysis, database mapping, and persistent memory.
---

# DevMind Core Skill

Use this skill to analyze the project structure, understand database relationships, and persist technical learnings.

## Canonical Flow

Always work in this order:

1. Design system
2. Overall context
3. Database checks

## Capabilities

### 1. Design System Consistency

**Tools:** `devmind design-system`, `devmind audit`, `devmind retrieve`
**Purpose:** Keep UI/component/token rules consistent before broader changes.
**When to use:**

- First step in a fresh repo/session.
- Before UI-heavy implementation tasks.

**Usage:**

```bash
devmind design-system --init
devmind audit
devmind retrieve -q "design tokens and wrappers" --type design-system --json
```

### 2. Overall Context Generation

**Tools:** `devmind generate --all`, `devmind scan`, `devmind status`
**Purpose:** Generate and verify project-wide context freshness.
**When to use:**

- At session start.
- After significant structural code changes.

**Usage:**

```bash
devmind generate --all
devmind status --json
```

### 3. Context Slicing and Retrieval

**Tools:** `devmind context`, `devmind retrieve`
**Purpose:** Pull focused context without loading everything.
**Usage:**

```bash
devmind context --focus src/database
devmind context --query runbook
devmind retrieve -q "auth middleware flow" --type architecture --limit 4
```

**When to use:**

- Instead of reading full context files.
- To find exports, policies, and section-scoped snippets quickly.
- To reduce token usage.

### 3.5 Auto Context Injection

**Behavior:** Running `devmind generate`, `devmind generate --all`, or `devmind scan` updates the workspace `AGENTS.md` bootstrap block.
**Purpose:** Ensures every new agent session in this directory is instructed to load the generated DevMind context first.
**Loaded files at session start:**

- `.devmind/AGENTS.md` (or configured output directory equivalent)
- `.devmind/index.json` when available

### 3.6 Agent Runtime Install

**Tools:** `devmind claude-plugin`, `devmind codex-plugin`, `devmind openclaw-plugin`
**Purpose:** Install/package DevMind skill so agents can load runbook context automatically in Claude Code and Codex.
**Usage:**

```bash
devmind claude-plugin --force
devmind codex-plugin --force
devmind openclaw-plugin --force
```

### 4. Database-Aware Analysis

**Tool:** `devmind analyze`
**Purpose:** Maps code references to database tables and identifies unused schema resources.
**When to use:**

- Before modifying database schema (check for usage).
- When deprecating tables (check for orphans).

### 4.5 Context Health Check

**Tool:** `devmind status`
**Purpose:** Reports context freshness and returns a recommended command for refresh.
**Usage:**

```bash
devmind status --json
```

**When to use:**

- At session start (always).
- Before major code/database modifications.

### 5. Persistent Memory

**Tool:** `devmind learn`
**Purpose:** Saves architectural decisions and patterns to `LEARN.md`.
**Usage:**

```bash
devmind learn "Always use UUIDs for primary keys" --category database
```

**When to use:**

- When you make a significant design decision.
- When you identify a pattern that should be followed.

### 5.5 Learning Audit and Extraction

**Tools:** `devmind audit`, `devmind extract`
**Purpose:** Measures learning coverage in code and extracts new learning candidates.
**Usage:**

```bash
devmind audit
devmind extract --json
devmind extract --apply
```

### 5.6 Autosave

**Tool:** `devmind autosave`
**Purpose:** Persists crash-safe session journal/context and auto-applies extracted learnings.
**Usage:**

```bash
devmind autosave --source task-end
```

### 6. History Tracking

**Tool:** `devmind history`
**Purpose:** Shows the evolution of the project (schema changes + codebase growth).

## Best Practices

- Start with `devmind design-system --init` (if missing), then `devmind generate --all`.
- Run `devmind status --json` and follow `recommendedCommand` when stale.
- Use `devmind retrieve` / `devmind context --query` to keep prompts focused and deterministic.
- Run `devmind scan` after pulling latest changes when code structure changed.
- Check `AGENTS.md` (generated file) for the latest project context.
- Keep the workspace `AGENTS.md` bootstrap block committed so sessions auto-load DevMind context.
- Use `devmind autosave --source task-end` at task end to minimize context loss.
- Use `devmind learn` and `devmind extract --apply` to build a durable knowledge base.
