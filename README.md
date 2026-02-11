# DevMind

> AI Memory Layer for development - Complete project context (codebase + database + memory)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Overview

**DevMind** provides AI assistants with complete understanding of your project by combining:

- 🗂️ **Codebase Structure** - Hierarchical documentation of your code
- 🗄️ **Database Schema** - Complete schema analysis with patterns
- 🧠 **Persistent Memory** - Checkpoints, learnings, and evolution tracking
- 🔍 **Context Slicing** - Focused context for optimized token usage

A single workflow generates everything your AI needs to understand your project deeply.

## Features

- **Unified Context Generation** - Single command for complete project understanding
- **Context Slicing** - "Zoom in" on specific modules (`devmind context`)
- **Multi-Database Support** - PostgreSQL, MySQL, SQLite, MongoDB, Firebase
- **Memory System** - Checkpoints, `LEARN.md`, session history
- **Evolution Tracking** - Track both schema and codebase changes over time
- **AI-Optimized Output** - Tailored for Claude, Cursor, Windsurf, and OpenClaw

## Quick Start

```bash
# Install
npm install -g devmind

# Zero-Friction (auto-detect DB config and generate DB context)
devmind generate

# Full context (database + codebase)
devmind generate --all

# Or detailed setup
devmind init
```

## Installation

```bash
npm install -g devmind
# or
pnpm add -g devmind
```

## Usage

### ⚡ Zero-Friction Generation

DevMind automatically detects your database configuration from `.env`, `prisma/schema.prisma`, `drizzle.config.ts`, or saved config.

```bash
# Auto-detects DB and generates database context
devmind generate

# Generate full context (database + codebase)
devmind generate --all
```

If detection fails (or for first run):

```bash
devmind init --url "postgres://..."
```

### Context Slicing (Token Efficient)

```bash
# Get high-level map
devmind context

# Focus on specific module
devmind context --focus src/database
```

### Memory Commands

```bash
# Save architectural decision
devmind learn "Services use dependency injection" --category architecture

# Save checkpoint
devmind checkpoint -m "Before refactoring auth"

# View history
devmind history --unified
```

### Analyze Code-to-Database Usage

```bash
devmind analyze -p ./my-project
```

## Integration

### OpenClaw

DevMind is optimized for OpenClaw agents.
See [OpenClaw Integration Skill](integrations/openclaw/SKILL.md) for agent instructions.

### Cursor / Windsurf / Custom Agents

1. Run `devmind generate --all`
2. Point your AI to `.devmind/AGENTS.md`
3. See [AI Agent Integration Guide](docs/AI_INTEGRATION.md) for detailed patterns.

## Output Structure

```
.devmind/
├── codebase/
│   ├── codebase-overview.md
│   ├── architecture.md
│   └── modules/
├── database/
│   ├── schema-overview.md
│   ├── schema.json
│   └── ...
├── memory/
│   ├── checkpoints/
│   ├── LEARN.md               # Persistent accumulated knowledge
│   ├── schema-evolution.md
│   ├── codebase-evolution.md
│   └── session-history.md
├── analysis/
│   ├── CODE_DB_MAPPING.md
│   └── UNUSED_TABLES.md
├── AGENTS.md                  # Unified context for AI
├── devmind-tools.json         # Tool definitions for agents
└── index.json
```

## License

Apache 2.0 © Nyan Lin Maung
