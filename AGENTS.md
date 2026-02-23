<!-- devmind:auto-context:start -->
## DevMind Auto Context
- At session start, read `.devmind/AGENTS.md` for project context.
- Then read `.devmind/index.json` to discover linked context files.
- If either file is missing or stale, run `devmind generate --all` or `devmind scan` first.
<!-- devmind:auto-context:end -->

## Context Retrieval Contract
Purpose:
This file defines HOW to retrieve context, not the context itself.

Routing rules:
- If query/error contains ECONNREFUSED/port/listen/upstream/proxy -> load `/context/contracts/http.md` first.
- If query/error contains middleware/helper/signature/next/ctx/req/res -> load `/context/contracts/middleware.md` first.
- If query/error contains auth/token/jwt/session/claims -> load `/context/contracts/auth.md` first.
- If query/error contains ui/ux/frontend/component/layout/hydration/ssr/csr/design-token/a11y -> load `/context/contracts/ui.md` first.
- If query/error contains animation/motion/framer/gsap/lottie/keyframes/reduced-motion -> load `/context/contracts/motion.md` first.
- If query/error contains go/golang/goroutine/gin/fiber/echo -> load `/context/contracts/go.md` first.
- If query/error contains python/fastapi/django/flask/pydantic -> load `/context/contracts/python.md` first.
- If query/error contains next/nextjs/next.js/app-router/server-component -> load `/context/contracts/next.md` first.
- If query/error contains php/composer/php-fpm -> load `/context/contracts/php.md` first.
- If query/error contains laravel/eloquent/artisan/sanctum/passport -> load `/context/contracts/laravel.md` first.
- Then load routed summaries:
  - auth -> /context/auth/summary.md
  - db -> /context/db/summary.md
  - ui -> /context/ui/summary.md

Escalation:
- Load level-2 only if modifying behavior or invariants.
- Load level-3 only for cross-module refactor, migrations, or incident/debug.
- For refactor/rewrite/migration, load `/context/refactor-ledger.md` and recent decisions/hypotheses.

## CLI Flow Playbook
Use these command flows to keep context fresh and avoid drift:

1. Session start / freshness check
- `devmind status --json`
- If stale: run returned `recommendedCommand`.
- Re-run `devmind status --json` and proceed only when fresh.

2. Build context
- Codebase only: `devmind scan -p . -o .devmind`
- Database only: `devmind generate --db -o .devmind`
- Unified context: `devmind generate --all -p . -o .devmind`

3. Retrieval (deterministic)
- General: `devmind retrieve -q "<intent>" --json`
- Force route: `devmind retrieve -q "<intent>" --route auth|db|ui --level 1|2|3 --json`
- Include long-horizon state: add `--state`

4. Analysis and audits
- Code↔DB mapping: `devmind analyze -p . -o .devmind`
- Learning coverage audit: `devmind audit -p . -o .devmind`
- Learning extraction: `devmind extract -p . -o .devmind [--apply]`

5. Refactor/rewrite loop (recommended)
- Record working state each loop:
  - `devmind autosave --source task-end --goal "<goal>" --non-negotiable "<invariant>" --open-question "<question>" --failure "<failure>" --resolution "<resolution>"`
- Record decisions/hypotheses:
  - `devmind autosave --source task-end --decision "<decision>" --hypothesis "<hypothesis>" --hypothesis-status open|ruled-out|confirmed`

6. Memory and handoff
- Add learning: `devmind learn "<learning>" --category <category>`
- Checkpoints: `devmind checkpoint --message "<msg>"` / `devmind checkpoint --restore`
- Handoffs: `devmind handoff --record --agentId <id>` / `devmind handoff --list`

7. Task end
- `devmind autosave --source task-end`
