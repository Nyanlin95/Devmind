# DevMind - Unified Integration Plan

## Executive Summary

Merge **cohere-scan** (codebase documentation generator) and **schemawise/cohere-db** (database memory layer) into **devmind** - a unified context generation tool for AI assistants.

**New Name:** `devmind`

**Vision:** One tool that gives AI assistants complete understanding of your project: codebase structure + database schema + persistent memory.

**Architecture:** Monorepo (Option A) ⭐ **APPROVED**

---

## Current State Analysis

### cohere-scan

**Purpose:** Scan codebases and generate hierarchical documentation  
**Tech:** JavaScript (ESM), filesystem scanning, doc generation  
**Output:** `cohere-scan/` directory with overview, architecture, modules  
**Strengths:** Codebase analysis, file tree generation  
**Version:** 0.1.0 (early stage)

### schemawise (cohere-db)

**Purpose:** Database schema analysis + AI memory layer  
**Tech:** TypeScript, multi-database support, pattern detection  
**Output:** `.ai/` directory with schema docs, learnings, checkpoints  
**Strengths:** Schema extraction, pattern detection, memory persistence  
**Version:** 2.0.0 (production-ready)

### Overlap & Synergy

- **Both** generate AI-optimized documentation
- **Both** analyze project structure
- **Both** output markdown files
- **Together** = Complete project context (code + data)

---

## Integration Strategy

## Integration Architecture - Monorepo (APPROVED)

```
devmind/
├── packages/
│   ├── core/              # Shared utilities
│   ├── codebase/          # cohere-scan logic
│   └── database/          # schemawise logic
├── cli/
│   └── devmind            # Unified CLI
└── package.json           # Monorepo root
```

**Why Monorepo:**

- ✅ Clean separation of concerns
- ✅ Shared code (tree utils, formatters)
- ✅ Single npm package: `devmind`
- ✅ Easier maintenance
- ✅ Scales for future growth

---

## Monorepo Structure (Detailed)

```
devmind/
├── packages/
│   ├── core/                      # @devmind/core
│   │   ├── src/
│   │   │   ├── types.ts           # Shared types
│   │   │   ├── formatters.ts     # Markdown formatters
│   │   │   ├── tree.ts            # Tree utilities
│   │   │   └── json-output.ts    # JSON response helpers
│   │   └── package.json
│   │
│   ├── codebase/                  # @devmind/codebase
│   │   ├── src/
│   │   │   ├── scanners/
│   │   │   │   ├── filesystem.ts
│   │   │   │   └── typescript.ts
│   │   │   ├── generators/
│   │   │   │   ├── overview.ts
│   │   │   │   ├── architecture.ts
│   │   │   │   └── modules.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── database/                  # @devmind/database
│       ├── src/
│       │   ├── extractors/        # From schemawise
│       │   ├── generators/
│       │   ├── patterns/
│       │   └── memory/
│       └── package.json
│
├── cli/                           # Main CLI package
│   ├── src/
│   │   ├── commands/
│   │   │   ├── scan.ts            # Codebase scanning
│   │   │   ├── schema.ts          # Database schema
│   │   │   ├── generate.ts        # Generate EVERYTHING
│   │   │   ├── checkpoint.ts
│   │   │   ├── learn.ts
│   │   │   └── history.ts
│   │   └── cli.ts
│   └── package.json
│
├── integrations/
│   ├── openclaw/
│   │   └── SKILL.md              # OpenClaw integration
│   └── tools/
│       └── devmind.tool.json     # Tool definition
│
├── templates/                     # Shared templates
├── docs/
├── package.json                   # Workspace root
└── pnpm-workspace.yaml
```

---

## Unified CLI Interface

### Command Structure

```bash
# New unified commands
devmind generate              # Generate ALL context (code + DB)
devmind scan                  # Just codebase (backward compat)
devmind schema                # Just database (backward compat)

# Memory commands
devmind checkpoint
devmind learn
devmind history

# Utility
devmind init                  # Initialize in project
devmind watch                 # Watch for changes
```

### `devmind generate` - The Power Command

```bash
devmind generate --all
# Output:
# .devmind/
# ├── codebase/
# │   ├── overview.md
# │   ├── architecture.md
# │   └── modules/
# ├── database/
# │   ├── schema.md
# │   ├── patterns.md
# │   └── CLAUDE.md
# ├── memory/
# │   ├── checkpoints/
# │   └── learnings.md
# └── index.json             # Unified machine-readable index
```

**Flags:**

- `--codebase-only` - Just scan code
- `--database-only` - Just extract schema
- `--url <db-url>` - Database connection
- `--output <dir>` - Output directory (default: `.devmind`)
- `--json` - JSON output for AI tools

---

## Unified Output Structure

### Current Outputs

**cohere-scan:**

```
project/cohere-scan/
├── 00-index.json
├── 01-overview.md
├── 02-architecture.md
└── 03-modules/
```

**schemawise:**

```
project/.ai/
├── CLAUDE.md
├── context/
│   ├── BUSINESS_LOGIC.md
│   └── SESSION_CONTEXT.json
└── memory/
```

### Unified Output (devmind)

```
project/.devmind/
├── index.json                     # Master index (code + DB + memory)
│
├── codebase/
│   ├── overview.md               # From cohere-scan
│   ├── architecture.md
│   ├── modules/
│   │   └── src/
│   │       └── README.md
│   └── index.json
│
├── database/
│   ├── schema.md                 # From schemawise
│   ├── patterns.md               # Business patterns
│   ├── relationships.md          # Table relationships
│   └── index.json
│
├── memory/
│   ├── checkpoints/
│   ├── learnings.md
│   ├── history.md
│   └── session.json
│
├── agents/
│   ├── CLAUDE.md                 # Unified context for Claude
│   ├── CURSOR.md                 # Context for Cursor
│   └── WINDSURF.md               # Context for Windsurf
│
└── README.md                      # Human-readable overview
```

---

## Migration Strategy (Monorepo)

### Phase 1: Foundation (Week 1)

1. **Create monorepo structure**
   - Setup pnpm workspace
   - Create `@devmind/core` package
   - Extract shared utilities

2. **Port cohere-scan**
   - Move to `@devmind/codebase`
   - Convert JS → TypeScript
   - Use shared core

3. **Port schemawise**
   - Move to `@devmind/database`
   - Keep existing functionality
   - Use shared core

### Phase 2: Unified CLI (Week 2)

1. **Create CLI package**
   - Unified command structure
   - Import from `@devmind/codebase` and `@devmind/database`
   - Add `generate` command

2. **Shared output format**
   - Merge output structures into `.devmind/`
   - Create unified index.json
   - Generate cross-referenced docs

### Phase 3: Enhanced Features (Week 3)

1. **Cross-context analysis**
   - Map codebase files to DB queries
   - Detect API-DB relationships
   - Find unused tables/columns

2. **Unified memory**
   - Session context includes code + DB state
   - Checkpoints save both
   - Learnings reference code + schema

### Phase 4: Distribution (Week 4)

1. **OpenClaw integration**
   - Single SKILL.md for devmind
   - Combined capabilities

2. **Publishing**
   - npm: `devmind` (main package)
   - GitHub: Monorepo
   - Documentation site

---

## Feature Matrix

| Feature            | cohere-scan | schemawise   | Unified Tool   |
| ------------------ | ----------- | ------------ | -------------- |
| Codebase scanning  | ✅          | ❌           | ✅             |
| Database schema    | ❌          | ✅           | ✅             |
| Pattern detection  | ❌          | ✅ (DB only) | ✅ (code + DB) |
| Memory/checkpoints | ❌          | ✅           | ✅             |
| Learning system    | ❌          | ✅           | ✅             |
| JSON output        | ❌          | ✅           | ✅             |
| Multi-DB support   | ❌          | ✅           | ✅             |
| TypeScript parsing | ⚠️ (basic)  | ❌           | ✅ (enhanced)  |
| Architecture docs  | ✅          | ❌           | ✅             |
| OpenClaw plugin    | ❌          | ✅           | ✅             |

---

## New Capabilities (Unified Only)

### 1. Code-to-Database Mapping

Analyze which code files interact with which tables:

```json
{
  "mappings": [
    {
      "file": "src/users/service.ts",
      "tables": ["users", "sessions"],
      "operations": ["SELECT", "INSERT", "UPDATE"]
    }
  ]
}
```

### 2. Unused Resource Detection

Find unused:

- Database tables (no code references)
- Columns (never queried)
- Code modules (no imports)

### 3. Consistency Analysis

Detect mismatches:

- TypeScript types vs DB schema
- API endpoints vs DB queries
- Documentation vs implementation

### 4. Unified Context Generation

Single command = complete project understanding:

```bash
cohere generate --all
# AI now knows: structure + data + patterns + history
```

---

## Technical Decisions

### Language: TypeScript

- Migrate cohere-scan from JS to TS
- Enables better type safety
- Shared types across packages

### Build Tool: tsup

- Fast builds
- ESM + CJS output
- Tree-shaking

### Package Manager: pnpm

- Fast installs
- Workspace support
- Smaller node_modules

### Testing: Vitest

- Fast, modern
- TypeScript native
- Better DX than Jest

### Monorepo: pnpm workspaces

- Simpler than Nx/Turborepo
- Good enough for 3-4 packages

---

## Breaking Changes

### For cohere-scan users

```diff
- cohere-scan ./project
+ devmind scan ./project
```

### For schemawise users

```diff
- schemawise generate
+ devmind schema
# OR
+ devmind generate --database-only
```

**Migration path:** Aliases for backward compatibility

---

## OpenClaw Integration (Updated)

### Single Unified Skill

```markdown
---
name: devmind
description: Complete project context - codebase + database + memory
bins:
  - devmind
---

# DevMind Skill

Generate comprehensive project context including codebase structure,
database schema, business patterns, and persistent memory.

## Commands

- `devmind generate --all --json` - Everything
- `devmind scan --json` - Just codebase
- `devmind schema --json` - Just database
- `devmind checkpoint --json` - Save state
```

---

## Success Metrics

### Technical

- [ ] Single npm package
- [ ] <100ms startup time
- [ ] <50MB bundle size
- [ ] 90%+ test coverage

### User Experience

- [ ] One command generates all context
- [ ] Works with all AI platforms
- [ ] Backward compatible
- [ ] Clear migration guide

### Adoption

- [ ] 1K+ weekly downloads
- [ ] 50+ GitHub stars
- [ ] 10+ community skills

---

## Risks & Mitigations

| Risk                         | Impact | Mitigation                    |
| ---------------------------- | ------ | ----------------------------- |
| cohere-scan users upset      | Medium | Keep `devmind scan` command   |
| schemawise users upset       | Medium | Keep `devmind schema` command |
| Name conflict with Cohere AI | Low    | Using `devmind` instead       |
| Too complex monorepo         | Medium | Well-documented structure     |
| Slow builds                  | Medium | Use tsup, modular design      |

---

## Timeline

### Week 1: Foundation

- Create monorepo structure
- Setup `@devmind/core`, `@devmind/codebase`, `@devmind/database`
- Port cohere-scan to TypeScript

### Week 2: Integration

- Create unified CLI
- Implement `devmind generate --all`
- Merge output to `.devmind/`

### Week 3: Enhancement

- Cross-context analysis (code-to-DB mapping)
- Enhanced pattern detection
- Testing & optimization

### Week 4: Launch

- Documentation & guides
- OpenClaw SKILL.md
- npm publish as `devmind`

---

## Decision: APPROVED ✅

**Architecture:** Monorepo (Option A)  
**Name:** `devmind`  
**Status:** Ready to proceed

**Reasons:**

1. Clean architecture for future growth
2. Enables powerful cross-analysis features
3. Strong brand: "DevMind - The memory layer for AI development"
4. Better PMF than separate tools
5. No naming conflicts

**First Step:** Create monorepo structure with pnpm workspace

---

## Next Actions

1. ✅ **Plan approved**
2. ✅ **Name chosen: `devmind`**
3. **Create devmind monorepo**
   - Initialize pnpm workspace
   - Setup package structure
4. **Port cohere-scan → `@devmind/codebase`**
   - Convert to TypeScript
   - Extract shared utils to `@devmind/core`
5. **Port schemawise → `@devmind/database`**
   - Move database logic
   - Share formatters with core
6. **Build CLI**
   - Implement `devmind generate --all`
   - Test with real project
7. **Document & publish**

This integration creates a category-defining product: **The AI memory layer for development.**
