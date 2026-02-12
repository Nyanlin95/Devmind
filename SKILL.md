---
name: devmind-core
description: Unified developer assistant for codebase analysis, database mapping, and persistent memory.
---

# DevMind Core Skill

Use this skill to analyze the project structure, understand database relationships, and persist technical learnings.

## Capabilities

### 1. Codebase Scanning

**Tool:** `devmind scan`
**Purpose:** Generates a comprehensive overview of the project structure and architecture.
**When to use:**

- At the start of a session to understand the codebase.
- After creating new modules to update the context.

### 2. Context Slicing (New)

**Tool:** `devmind context`
**Purpose:** Fetches focused summary of a specific folder or module.
**Usage:**

```bash
devmind context --focus packages/database
```

**When to use:**

- Instead of reading the full `codebase-overview.md`.
- To find exports/definitions in a specific module.
- To reduce token usage (Token Efficiency).

### 2.5 Auto Context Injection (New)

**Behavior:** Running `devmind generate`, `devmind generate --all`, or `devmind scan` updates the workspace `AGENTS.md` bootstrap block.
**Purpose:** Ensures every new agent session in this directory is instructed to load the generated DevMind context first.
**Loaded files at session start:**

- `.devmind/AGENTS.md` (or configured output directory equivalent)
- `.devmind/index.json` when available

### 3. Cross-Context Analysis

**Tool:** `devmind analyze`
**Purpose:** Maps code references to database tables and identifies unused schema resources.
**When to use:**

- Before modifying database schema (check for usage).
- When deprecating tables (check for orphans).

### 4. Persistent Memory

**Tool:** `devmind learn`
**Purpose:** Saves architectural decisions and patterns to `LEARN.md`.
**Usage:**

```bash
devmind learn "Always use UUIDs for primary keys" --category database
```

**When to use:**

- When you make a significant design decision.
- When you identify a pattern that should be followed.

### 5. History Tracking

**Tool:** `devmind history`
**Purpose:** Shows the evolution of the project (schema changes + codebase growth).

## Best Practices

- Always run `devmind scan` after pulling latest changes.
- Check `AGENTS.md` (generated file) for the latest project context.
- Keep the workspace `AGENTS.md` bootstrap block committed so sessions auto-load DevMind context.
- Use `devmind learn` freely to build a knowledge base for future agents.
