# Claude/agent briefing — LLM Project Framework

This repo is the implementation of an LLM project framework: a document-driven, spec-verified workflow system for orchestrating LLM-driven software engineering. The framework is being built using its own discipline — every implementation node is governed by a doc in `docs/` that tracks status, decisions, and verification through its lifecycle.

## Start here

- **`docs/00-project.md`** — project root / PRD. Read first for vision, scope, and architectural decisions. Its §14 holds the top-level children manifest.
- **`docs/01-ui/00-ui.md`** — UI parent doc. Stack decisions, project layout, conventions, and the UI children manifest (current node + planned round-2 panels).
- **`docs/process/leaf-workflow.md`** — standardised operator playbook for taking a leaf node from PLANNED through COMPLETE. Read before driving a node through its lifecycle.
- The implementation lives at **`app/`** (Vite + React + TS).

## Documentation discipline

Every node in `docs/` follows the schema laid out in PRD §6.1:

- **Required sections:** Requirements, Design, Decisions, Open Issues, Implementation Notes, Status.
- **Lifecycle (§6.2):** DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE (or → ISSUE_OPEN → back).
- Parents hold a children manifest with declared dependencies.
- No agent may begin implementation until a node reaches APPROVED (§10).

**To find current focus:** walk the children manifests starting at `docs/00-project.md` §14 and descend through Status fields. The most-recently-advanced leaf node tells you where work currently lives.

## Running the app

The repo is a **pnpm workspace** with three packages: `app/` (Vite UI), `packages/parser/` (shared doc/schema validator + DocGraph builder), and `server/` (Hono API + `ledger` CLI). `04-api-server` COMPLETE 2026-05-26.

```bash
# One-time prereqs after a fresh clone (or whenever you touch parser source):
pnpm install                                              # at repo root — wires workspace symlinks
pnpm -C packages/parser build                             # @ledger/parser dist/ — gitignored

# Boot the two long-running processes (separate terminals):
pnpm -C server dev /Users/dennis/code/ledger              # terminal A — API server on :4180 (tsx watch, hot-reloads on src changes)
pnpm -C app dev                                           # terminal B — UI on http://localhost:4179

# Gates (run anytime):
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app build
pnpm test                                                 # fans out across all workspace packages
```

The UI's `/dag` panel consumes `GET /api/docs` live via TanStack Query (with a build-time placeholder fallback so the UI degrades gracefully if the server is down). The Vite dev proxy at `app/vite.config.ts` forwards `/api/*` → `http://127.0.0.1:4180/api/*` so every browser request is same-origin (no CORS).

**Booting the server — three options:**

| Command | When to use | Build prereq |
|---|---|---|
| `pnpm -C server dev <path>` | Active dev (hot-reloads on src changes) | parser only |
| `pnpm exec ledger <path> [--port N] [--no-open]` | Canonical workspace invocation against compiled output | parser + `pnpm -C server build` |
| `node server/dist/bin/ledger.js <path> [--port N] [--no-open]` | Direct invocation (no pnpm) | parser + `pnpm -C server build` |

CLI args: `<project-path>` is required; `--port N` overrides the default 4180 (also reads `LEDGER_PORT` env var); `--no-open` skips the browser launch; `-h`/`--help` prints usage. Bare invocation exits 2 with usage on stderr.

**Build-order quirk**: `packages/parser/dist/` AND `server/dist/` are both gitignored. `app/` and `server/` resolve `@ledger/parser` via the package's `main` field (`dist/index.js`); `pnpm exec ledger` resolves `server/dist/bin/ledger.js` from the package's `bin` field. Run `pnpm -C packages/parser build` after a fresh clone or any parser-source change; run `pnpm -C server build` if you want `pnpm exec ledger` instead of `pnpm -C server dev`. (Logged for a future `pnpm -w build:packages` script that runs both automatically.)

Dev server is pinned to **port 4179** in `app/vite.config.ts` with `strictPort: true` (default 5173 collides with other local projects). API server defaults to **port 4180** (`LEDGER_PORT` env var or `--port` flag to override).

## Hard constraints worth not forgetting

- **Single cream theme only** — no dark mode, no `data-theme` attribute, no alternate token block.
- **React Router v7** (not TanStack Router — that was reversed for community depth; see `docs/01-ui/00-ui.md` D3).
- **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`.
- **Domain types in `src/lib/types.ts` arrive panel-by-panel.** First contributor was `02-dag` (`NodeId`, `NodeStatus`, `DocNode`). Add only what your panel needs; later panels refine.
- **No mock data** at the shell level; each panel node defines its own data contract.

## Process notes

- Status transitions are tracked in the node's own doc. Update both the doc's `**Status:**` header AND the parent's children manifest when transitioning.
- Implementation Notes is where pinned versions, deviations from spec, and follow-up items belong — not the commit message.
- **`docs/process/`** holds operator playbooks and other process documentation (e.g., `leaf-workflow.md`). These docs do **not** have a `**Node ID:**`, `**Parent:**`, or lifecycle `**Status:**` — they are LIVING reference material, not implementation nodes. `parseDocs.ts` skips this subtree so process docs do not appear in the DAG. Future runbooks, glossaries, and decomposition playbooks go here too.
- Round-2 UI panels (`02-dag`, `03-docs`, `04-tasks`, `05-logs`, `06-health`, `08-markdown`, `09-workflow-progress`, and `10-orchestration` all COMPLETE; `07-replay` DEFERRED in PRD v0.5.1 — out of v1 scope). `03-docs` consumes `08-markdown` via the `<MarkdownBody>` contract; `09-workflow-progress` embeds in `02-dag`'s `NodeInspector`; `04-tasks` and `05-logs` consume `10-orchestration`'s data layer; `04-tasks` introduces three soft color tokens (`--color-accent-soft`, `--color-warning-soft`, `--color-danger-soft`) in `globals.css` and a `TaskStatusChip` component, both consumed by `05-logs`; `05-logs` also consumes `08-markdown` for `reasoning` event bodies and `src/lib/docLink.ts` (extracted from `03-docs`'s inline resolver). With `01-ui`'s round-2 manifest complete, focus shifts to the backend (PRD §14, decomposed in v0.5.2). Build order: `02-schema` COMPLETE (v1) + `03-project-metadata` COMPLETE (v1) → `04-api-server` COMPLETE (v1, 2026-05-26 — decomposed into 5 sub-leaves: `01-workspace-conversion` → `02-parser-extraction` → `03-server-package` → `04-cli-launcher` + `05-ui-hook-migration`, all COMPLETE; substrate now includes `@ledger/server` Hono API, `ledger` CLI binary, `useDocGraph` migrated to TanStack Query against `/api/docs`) → **`05-task-runner` (PLANNED — next; in-house TS+SQLite per PRD §5)** → `06-agent-dispatcher` → `07-health-daemon` (sequenced; daemon-enqueued tasks need the dispatcher to execute them). See PRD §14 for the manifest and §11 for open issues.

## When in doubt

The doc tree is the source of truth. If the code and a doc disagree, either the doc wins or the doc needs to be updated to reflect a deliberate change — never silently. Decisions made in conversation that aren't in the docs are not durable; persist them.
