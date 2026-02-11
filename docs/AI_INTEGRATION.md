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

1. **Initialize:** Read `.devmind/AGENTS.md`.
2. **Plan:** Use `.devmind/codebase/architecture.md` to locate relevant modules.
3. **Deep Dive:** Read specific module files in `.devmind/codebase/modules/`.
4. **Action:** Perform coding task.
5. **Verify:** Use `devmind analyze` to ensure new code matches database schema.

## Helper Tools

DevMind provides a `devmind-tools.json` (MCP-compatible) definition file that agents can use to call DevMind CLI commands directly if equipped with tool-use capabilities.
