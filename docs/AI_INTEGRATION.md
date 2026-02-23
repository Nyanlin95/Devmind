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

### 2. Canonical Agent Flow

Use this order by default:

1. **Design system**
2. **Overall context**
3. **Database verification**

Suggested startup sequence:

1. `devmind design-system --init` (if missing)
2. `devmind generate --all`
3. `devmind status --json`
4. If stale/missing, run returned `recommendedCommand`
5. Re-run `devmind status --json`
6. Continue task execution

### 3. The OpenClaw / Autonomous Pattern

For autonomous agents:

1. **Initialize:** Read `.devmind/AGENTS.md`, then `.devmind/index.json`.
2. **Design-system first:** Ensure `.devmind/design-system.json` exists (`devmind design-system --init` if needed).
3. **Preflight (automatic):** Run `devmind status --json`.
4. **Refresh (automatic, recommendation-based drift control):** If context is stale/missing, run the returned `recommendedCommand`.
5. **Re-check (automatic):** Run `devmind status --json` again, then continue.
6. **Action:** Perform coding task.
7. **Post-task memory loop (automatic):** Run `devmind autosave --source task-end` (journal + session context + learning apply).
8. **Optional report:** Run `devmind extract --json` if you need extraction report details.
9. **Verify risky DB changes:** Use `devmind analyze` or `devmind validate`.

## Helper Tools

DevMind provides a `devmind-tools.json` (MCP-compatible) definition file that agents can use to call DevMind CLI commands directly if equipped with tool-use capabilities.

For Claude Code plugin workflows, you can package a local plugin directory with:

- `devmind claude-plugin --force`

For Codex CLI + Codex app skill install, use:

- `devmind codex-plugin --force`

For OpenClaw skill install, use:

- `devmind openclaw-plugin --force`

## Command Reference (Agent-Facing)

- `devmind design-system --init`
  : Create `.devmind/design-system.json` for UI component/token policy enforcement.
- `devmind design-system`
  : Inspect current design-system profile used by retrieval and audit context.
- `devmind status --json`
  : Preflight context health and read `recommendedCommand` when stale.
- `devmind generate --all`
  : Refresh unified context; skips DB generation when no DB config is detected.
- `devmind scan`
  : Refresh codebase context only.
- `devmind retrieve -q "<query>"`
  : Deterministic retrieval using contract docs, routed summaries, escalation levels, and optional state logs.
  : Supports `--route auth|db|ui`, `--level 1|2|3`, and `--state`.
- `devmind context --query "<text>"`
  : Search generated `.devmind` artifacts for focused context snippets.
- `devmind analyze`
  : Map code usage to database tables.
- `devmind audit`
  : Check coverage of `LEARN.md` patterns and (if configured) design-system alignment.
- `devmind extract --json`
  : Produce extracted learning candidates report.
- `devmind extract --apply`
  : Append extracted learning candidates into `memory/LEARN.md`.
- `devmind autosave --source task-end`
  : Persist session journal/context and auto-apply extracted learnings.
- `devmind claude-plugin --force`
  : Generate `.claude-plugin/marketplace.json` + bundled skill for local Claude Code plugin installation.
- `devmind codex-plugin --force`
  : Install DevMind skill into Codex shared user skills path (`~/.agents/skills`) with legacy compatibility mirrors.
- `devmind openclaw-plugin --force`
  : Install DevMind OpenClaw skill into `~/.openclaw/skills` (optional `--project` for repo-local install).

## Database-Only Workflows

Use the main `devmind` CLI:

- `devmind generate --db --prisma`
- `devmind validate --strict`
