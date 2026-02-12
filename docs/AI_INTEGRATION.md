# AI Agent Integration Guide

This guide explains how AI agents (Claude, GPTs, Custom Agents like OpenClaw) can utilize DevMind's output effectively.

## The `.devmind` Context Root

DevMind generates a structured `.devmind/` directory. Agents should be instructed to read this directory first.

### Key Files for Agents

1. **AGENTS.md** (`.devmind/AGENTS.md`)
   - **Purpose:** The "Master Context" file constructed specifically for LLMs.
   - **Content:** Concentrated summary of database schema, codebase architecture, and critical memory.
   - **Usage:** Load this file into the agent's context window immediately.

2. **Index** (`.devmind/index.json`)
   - **Purpose:** a machine-readable map of all generated artifacts.
   - **Usage:** Use this to programmatically find specific documentation files.

3. **Learnings** (`.devmind/memory/LEARN.md`)
   - **Purpose:** Accumulates project-specific knowledge, decisions, and patterns.
   - **Usage:** Review before proposing architectural changes to ensure consistency with past decisions.

## Integration Patterns

### 1. The Context Injection Pattern

For tools like Cursor or Windsurf:

- Run `devmind generate --all`
- Add `@.devmind/AGENTS.md` to your prompt.
- Result: The model knows your full schema and architecture immediately.

### 2. The OpenClaw / Autonomous Pattern

For autonomous agents:

1. **Initialize:** Read `.devmind/AGENTS.md`, then `.devmind/index.json`.
2. **Preflight (automatic):** Run `devmind status --json`.
3. **Refresh (automatic, recommendation-based drift control):** If context is stale/missing, run the returned `recommendedCommand`.
4. **Re-check (automatic):** Run `devmind status --json` again, then continue.
5. **Action:** Perform coding task.
6. **Post-task memory loop (automatic):** Run `devmind autosave --source task-end` (journal + session context + learning apply).
7. **Optional report:** Run `devmind extract --json` if you need the extraction report details.
8. **Verify risky DB changes:** Use `devmind analyze` or `devmind validate`.

## Helper Tools

DevMind provides a `devmind-tools.json` (MCP-compatible) definition file that agents can use to call DevMind CLI commands directly if equipped with tool-use capabilities.

## Command Reference (Agent-Facing)

- `devmind status --json`
: Preflight context health and read `recommendedCommand` when stale.
- `devmind generate --all`
: Refresh database + codebase context in one step.
- `devmind scan`
: Refresh codebase context only.
- `devmind analyze`
: Map code usage to database tables.
- `devmind audit`
: Check coverage of `LEARN.md` patterns across source files.
- `devmind extract --json`
: Produce extracted learning candidates report.
- `devmind extract --apply`
: Append extracted learning candidates into `memory/LEARN.md`.
- `devmind autosave --source task-end`
: Persist session journal/context and auto-apply extracted learnings.
