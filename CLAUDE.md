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

**Task-runner store**: on first server boot since `05-task-runner/01-store-schema` (2026-05-27), `.ledger/runner.db` is created (with `runner.db-wal` + `runner.db-shm` sidecars — WAL journal mode is pinned). All three are gitignored. Migration `001-initial` is applied transactionally on first boot; subsequent boots log `runner: schema is current at user_version=1` and no-op. `better-sqlite3@^11` is a native dep — `pnpm install` resolves a prebuilt on `darwin-arm64`/`linux-x64` etc.; cold-cache machines without a prebuilt fall back to `node-gyp rebuild`, which needs Xcode CLT on darwin. The store API is `server/src/runner/store.ts`; the scheduler that drives it (`server/src/runner/scheduler.ts`, plus `conflict.ts` + `executors.ts`) is COMPLETE (v1, 2026-05-27, `02-scheduler`). `ProjectContext.runner: Runner` is wired during `loadProjectContext` and exposes `createTask`, `registerExecutor`, `tick`. v1 ships only the `noop` built-in executor; real executors land with `06-agent-dispatcher`. Orphan recovery (RUNNING → FAILED with reason `orphaned_on_restart`) runs at boot.

**Booting the server — three options:**

| Command | When to use | Build prereq |
|---|---|---|
| `pnpm -C server dev <path>` | Active dev (hot-reloads on src changes) | parser only |
| `pnpm exec ledger <path> [--port N] [--no-open]` | Canonical workspace invocation against compiled output | parser + `pnpm -C server build` |
| `node server/dist/bin/ledger.js <path> [--port N] [--no-open]` | Direct invocation (no pnpm) | parser + `pnpm -C server build` |

CLI args: `<project-path>` is required; `--port N` overrides the default 4180 (also reads `LEDGER_PORT` env var); `--no-open` skips the browser launch; `-h`/`--help` prints usage. Bare invocation exits 2 with usage on stderr.

**Build-order quirk**: `packages/parser/dist/` AND `server/dist/` are both gitignored. `app/` and `server/` resolve `@ledger/parser` via the package's `main` field (`dist/index.js`); `pnpm exec ledger` resolves `server/dist/bin/ledger.js` from the package's `bin` field. Run `pnpm -C packages/parser build` after a fresh clone or any parser-source change; run `pnpm -C server build` if you want `pnpm exec ledger` instead of `pnpm -C server dev`. (Logged for a future `pnpm -w build:packages` script that runs both automatically.)

Dev server is pinned to **port 4179** in `app/vite.config.ts` with `strictPort: true` (default 5173 collides with other local projects). API server defaults to **port 4180** (`LEDGER_PORT` env var or `--port` flag to override).

## Agent scripts

Small wrappers in `.claude/scripts/` (allowlisted in `.claude/settings.json`) cover recurring operations so they don't prompt per-invocation. **Prefer these over the raw forms** — the raw forms (`curl`, `sed`, `node -e`, `lsof | xargs kill`, etc.) will trigger a permission prompt every time.

- `.claude/scripts/api-curl [opts] /api/<path> [opts]` — thin curl passthrough restricted to localhost (host hardcoded, absolute URLs rejected). Default routes to the Hono API on 4180; pass `--via-ui` for the Vite dev server on 4179 (needed for Vite-middleware-only endpoints like `/api/transcripts/*`). Pass `-j` / `--json` for `-sS` + jq-pretty (the common GET-and-pretty case). Every other curl flag passes through (`-X`, `-H`, `-d`, `-N`, `--max-time`, `-o`, `-w`, etc.).
- `.claude/scripts/lines <file> <start> [end]` — numbered line range (replaces `sed -n 'X,Yp'`)
- `.claude/scripts/wait-ready [timeout]` — block until UI :4179 + API :4180 both 200
- `.claude/scripts/kill-port <port>` — kill LISTEN-only processes (won't kill a browser client on the port)
- `.claude/scripts/doc-status [prefix]` — table of node → lifecycle status across `docs/`
- `.claude/scripts/node-info {id <path> \| path <id> \| ls}` — parser-backed doc id ↔ source path
- `.claude/scripts/clean` — remove `dist/` + `tsbuildinfo` artifacts under `packages/parser` and `server`

See `.claude/scripts/README.md` for the inventory. If you find yourself running the same prompt-triggering shell incantation twice, add a wrapper.

## Hard constraints worth not forgetting

- **Single cream theme only** — no dark mode, no `data-theme` attribute, no alternate token block.
- **React Router v7** (not TanStack Router — that was reversed for community depth; see `docs/01-ui/00-ui.md` D3).
- **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`.
- **Domain types live where they're authoritative.** Doc-tree primitives (`NodeId`, `NodeStatus`, `DocNode`) are canonical in `@ledger/parser/src/coreTypes.ts` (per `04-api-server/02-parser-extraction` D5). Task-runner primitives (`Task`, `LogEvent`, `ResourceClaim`, `TaskInput`, `TaskType`, `TaskStatus`, `TaskSource`) are canonical in `@ledger/parser/src/runner/types.ts` (per `05-task-runner/01-store-schema`, 2026-05-27). `app/src/lib/types.ts` re-exports both so existing `@/lib/types` import sites keep compiling. New backend types added by future sub-leaves go in `@ledger/parser/src/<domain>/types.ts`; new UI-only types stay in `app/src/lib/types.ts`. Re-exports preserved either way.
- **No mock data** at the shell level; each panel node defines its own data contract.

## Process notes

- Status transitions are tracked in the node's own doc. Update both the doc's `**Status:**` header AND the parent's children manifest when transitioning.
- Implementation Notes is where pinned versions, deviations from spec, and follow-up items belong — not the commit message.
- **`docs/process/`** holds operator playbooks and other process documentation (e.g., `leaf-workflow.md`). These docs do **not** have a `**Node ID:**`, `**Parent:**`, or lifecycle `**Status:**` — they are LIVING reference material, not implementation nodes. `parseDocs.ts` skips this subtree so process docs do not appear in the DAG. Future runbooks, glossaries, and decomposition playbooks go here too.
- Round-2 UI panels (`02-dag` (v1.3 — dagre → ELK layout-engine migration, 2026-05-27), `03-docs`, `04-tasks`, `05-logs`, `06-health`, `08-markdown`, `09-workflow-progress`, and `10-orchestration` all COMPLETE; `07-replay` DEFERRED in PRD v0.5.1 — out of v1 scope; `99-maintenance/01-round-1` COMPLETE v1 2026-05-26 — first batched maintenance pass closed 5 Open Issues across `02-dag`, `03-docs`, `04-tasks`, `05-logs`, `06-health`). `03-docs` consumes `08-markdown` via the `<MarkdownBody>` contract; `09-workflow-progress` embeds in `02-dag`'s `NodeInspector`; `04-tasks` and `05-logs` consume `10-orchestration`'s data layer; `04-tasks` introduces three soft color tokens (`--color-accent-soft`, `--color-warning-soft`, `--color-danger-soft`) in `globals.css` and a `TaskStatusChip` component, both consumed by `05-logs`; `05-logs` also consumes `08-markdown` for `reasoning` event bodies and `src/lib/docLink.ts` (extracted from `03-docs`'s inline resolver). With `01-ui`'s round-2 manifest complete, focus shifts to the backend (PRD §14, decomposed in v0.5.2). Build order: `02-schema` COMPLETE (v1) + `03-project-metadata` COMPLETE (v1) → `04-api-server` COMPLETE (v1, 2026-05-26 — decomposed into 5 sub-leaves: `01-workspace-conversion` → `02-parser-extraction` → `03-server-package` → `04-cli-launcher` + `05-ui-hook-migration`, all COMPLETE; substrate now includes `@ledger/server` Hono API, `ledger` CLI binary, `useDocGraph` migrated to TanStack Query against `/api/docs`) → **`05-task-runner` COMPLETE (v1, 2026-05-28 — all 5 sub-leaves COMPLETE: `01-store-schema` (v1, 2026-05-27 — `better-sqlite3` store + 3-table schema + transactional migrations runner + typed Store API + `Task`/`LogEvent` migration to `@ledger/parser/runner/` + 3 JSON Schemas in `docs/_schemas/`); `02-scheduler` (v1, 2026-05-27 — `Runner` class with re-entrant tick trampoline + set-intersection conflict primitive + executor registry + `noop` built-in + boot-time orphan recovery; `ProjectContext.runner` wired); `04-api-endpoints` (v1, 2026-05-27 — GET /api/tasks + GET /:id + GET /:id/stream SSE with `Last-Event-ID` resume + POST /api/tasks operator-injection; `runner/events.ts` EventBus + `withPublishing` Store decorator); `03-hitl-gate` (v1, 2026-05-28 — `human_review` executor + `awaitHumanReview` on RunnerHandle + POST /api/tasks/:id/approve + /reject with OCC + optional followUp; rejection rationale dual-write (truncated reason on status_change + full text on kind=error detail event); `humanReviewExecutor` in default registry; restart durability via `recoverOrphans` leaving AWAITING_HUMAN_REVIEW untouched); `05-ui-hook-migration` (v1, 2026-05-28 — additive dual-source `useTaskList`/`useTask`/`useLogStream` with `id.includes(":")` runner-vs-transcript discriminant + `useApproveTask`/`useRejectTask` mutation hooks with response-based `setQueryData` for atomic button unmount (D12 amended in stage-8b loop-back after operator caught a 500–1000 ms flicker) + TaskInspector Approve/Reject buttons gated on runner-emitted ∧ AWAITING_HUMAN_REVIEW with OCC via `dbRowVersion` + Status-reason row surfacing latest `status_change.reason`); in-house TS+SQLite per PRD §5)** → **`06-agent-dispatcher` APPROVED (parent v1 spec, 2026-05-28 — MCP-first integration via `@modelcontextprotocol/sdk` streamable-HTTP transport mounted at `POST /mcp` on the existing Hono app; `ClaudeCodeExecutor` spawns `claude` subprocesses with injected `--mcp-config` + `--prompt-file` + `LEDGER_TASK_ID` env; 5 MCP tools — `runner.emit_event` / `complete_task` / `fail_task` / `await_human_review` / `get_task` — flow agent activity into the runner's events table; transcript ingestion stays additive per D15; decomposed into 5 sub-leaves: `01-mcp-server` → `02-runner-tools` → {`03-claude-code-executor`, `04-prompt-templates`} → `05-dispatch-api`; `01-mcp-server` COMPLETE (v1, 2026-05-28 — `@modelcontextprotocol/sdk@^1.29` (`McpServer` + `WebStandardStreamableHTTPServerTransport`) mounted at `/mcp` via `app.all` since the transport handles GET/POST/DELETE; AsyncLocalStorage carries inbound `Request` into `onsessioninitialized` so `02-runner-tools` can read `X-Ledger-Task-Id` off it; `ProjectContext.mcp: McpServerHandle` wired in `loadProjectContext`; `/api/_health` extended with `dispatcher: { status, activeSessions }`); `02-runner-tools` COMPLETE (v1, 2026-05-28); `03-claude-code-executor` COMPLETE (v1, 2026-05-29 — `execa@^9.6` subprocess wrapper with `claudeBin?` test-only override for fake-claude swap; pure `reconcileExit` lifecycle function — `final === "CANCELLED"` checked first, then exit-code/signal catch-all; cancellation registry on `ProjectContext.dispatchCancellation` for `05-dispatch-api`'s cancel route; 3 prescribed reasons + `executorInternalError` defensive builder; env-gated smoke test; `renderPrompt` was stubbed locally during parallel implementation while 04 worked in a sibling worktree — replaced by the real import at 04's merge); `04-prompt-templates` APPROVED 2026-05-28 (eight TS templates + `shared.ts` composition helpers with explicit per-kind LogEvent field schema in the MCP-tool contract reminder; typed `Record<Persona, ...>` registry for compile-time exhaustiveness with `Persona = Exclude<TaskType, "noop" | "human_review" | "operator_session" | "agent_task">`; `defaultResourceClaims(task)` per parent D11; `pathForNodeId` added to `@ledger/parser` as additive cross-package export — the index did not previously exist; deterministic snapshot fixtures); `05-dispatch-api` PLANNED)** → `07-health-daemon` (sequenced after dispatcher; daemon-enqueued tasks need the dispatcher to execute them). See PRD §14 for the manifest and §11 for open issues.

## When in doubt

The doc tree is the source of truth. If the code and a doc disagree, either the doc wins or the doc needs to be updated to reflect a deliberate change — never silently. Decisions made in conversation that aren't in the docs are not durable; persist them.
