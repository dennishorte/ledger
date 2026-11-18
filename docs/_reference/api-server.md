# API server — current-state reference

**Scope:** `server/src/` HTTP surface, CLI, and `ProjectContext`. Package
`@ledger/server`. One process per project directory.
**Last verified:** `f531fad825137e51ba44f49353d6e749d24378fd` on `main`.
**Owning nodes:** [`04-api-server`](../04-api-server/00-api-server.md),
[`05-task-runner/04-api-endpoints`](../05-task-runner/04-api-endpoints.md),
[`06-agent-dispatcher/05-dispatch-api`](../06-agent-dispatcher/05-dispatch-api.md).
**Regenerate route rows:** `rg -n "\\.(get|post|delete|all)\\(" server/src/routes server/src/server.ts server/src/dispatcher/mcp/server.ts`

The runner, dispatcher, and scanner are wired here and documented in their
own files.

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `src/bin/ledger.ts` | 123 | CLI: path, `--port`, `--help`. Does not open a browser |
| `src/index.ts` | 4 | Re-exports `createServer`, `loadProjectContext`, `assertContained` |
| `src/server.ts` | 30 | Hono app. Mounts every route and `/mcp` |
| `src/context.ts` | 174 | `loadProjectContext` — the boot sequence |
| `src/readDocs.ts` | 38 | Walk `docs/` into `{ relativePath: markdown }` |
| `src/pathSafety.ts` | 21 | `assertContained` — docs root must stay inside the project |
| `src/routes/health.ts` | 15 | `GET /api/_health` |
| `src/routes/project.ts` | 32 | `GET /api/project` |
| `src/routes/docs.ts` | 32 | Doc graph, one node, raw source |
| `src/routes/tasks.ts` | 241 | List, get, SSE, create, delete, cancel |
| `src/routes/hitl.ts` | 185 | Approve and reject, mounted on `/api/tasks` |
| `src/routes/dispatch.ts` | 83 | `POST /api/dispatch/:nodeId` |
| `src/routes/scans.ts` | 41 | Scan, scan history, issue rollup. Mounted at `/api/health` |

## 2. Entry points

| Command | What it does |
|---|---|
| `pnpm -C server dev <path>` | `tsx watch` with `--env-file-if-exists=../.env`. Hot reload |
| `pnpm exec ledger <path>` | Compiled `server/dist/bin/ledger.js`. Does not load `.env` |
| `node server/dist/bin/ledger.js <path>` | Same binary, no pnpm |

CLI (`bin/ledger.ts`): `<project-path>` is required. `--port` overrides
`LEDGER_PORT`, which defaults to `4180`. `-h` prints usage and exits 0.
The process does not open a browser. A bad argv exits 2. A context error (missing
key, bad metadata, docs path escaping the root) exits 1. Bind address is
`127.0.0.1`.

`loadProjectContext` (`context.ts`) refuses to boot when `ANTHROPIC_API_KEY`
is unset, then: read `.ledger/project.json` → `validateProjectMetadata` →
contain the docs path → `readDocsTree` + `buildDocGraph` once → open
`.ledger/runner.db` → MCP server → cancellation registry → health scanner →
register `ClaudeCodeExecutor` for every dispatcher task type.

## 3. Data contracts

Routes mounted in `server.ts`. Status codes are the ones the handlers return
for the common cases.

| Method | Path | Result |
|---|---|---|
| GET | `/api/_health` | `{ ok, startedAt, dispatcher: { status: "ready", activeSessions } }` |
| GET | `/api/project` | Re-reads `.ledger/project.json` and returns `{ project, server: { projectRoot, docsRoot, port, startedAt } }`. `project` is the validated metadata, so `workflow` is still absent |
| GET | `/api/docs` | `{ nodes, validation }` rebuilt from disk on each request |
| GET | `/api/docs/:nodeId` | `{ node: DocumentNode }` or 404 / 422. `nodeId` may contain slashes |
| GET | `/api/docs/:nodeId/source` | `{ id, raw }` markdown |
| GET | `/api/tasks` | `{ tasks }`, `createdAt` descending. Repeated `status` and `type` query params, plus `parent` |
| GET | `/api/tasks/:id` | `{ task, events }` or 404 |
| GET | `/api/tasks/:id/stream` | SSE of `LogEvent`. Honors `Last-Event-ID`. Heartbeat 15s, auto-close 60s after a terminal status |
| POST | `/api/tasks` | Body is `TaskInput`. 201 `{ task }` after the scheduler tick. 422 schema, 400 bad JSON or unknown `dependsOn` |
| DELETE | `/api/tasks/:id` | 204 |
| POST | `/api/tasks/:id/cancel` | `PENDING`, `BLOCKED`, or `RUNNING` → `CANCELLED`. 409 otherwise. A `RUNNING` row with no subprocess returns 409 `no_subprocess` |
| POST | `/api/tasks/:id/approve` | `AWAITING_HUMAN_REVIEW` → `COMPLETE`. Body `{ dbRowVersion, note? }`. 409 on wrong status or stale `dbRowVersion` |
| POST | `/api/tasks/:id/reject` | → `FAILED`. Full rationale is an `error` event. The status reason is `rejected: ` plus the first 80 characters of the rationale. A body that fails `validateHitlReject` returns 400 and the task stays `AWAITING_HUMAN_REVIEW`. After a committed rejection, a `followUp` that fails `validateTaskInput` returns 200 `{ task, followUpErrors }` and does not undo the rejection |
| POST | `/api/dispatch/:nodeId` | 201 `{ task }`, the row `createTask` captured before the tick, so the body can still say `PENDING` after the stored row has moved. `POST /api/tasks` reloads after the tick; this route does not. Type inferred from status unless the body sets `type` |
| POST | `/api/health/scan` | 201, the scan object itself |
| GET | `/api/health/scans` | Bare array from `listScans()`, newest first. Each object uses `scannedAt` (the SQL column is `scanned_at`) |
| GET | `/api/health/issues` | `{ issues }` from a fresh graph read. Skips nodes with `authored === false`. Sort is HIGH, MEDIUM, LOW, TRIVIAL, then UNKNOWN |
| ALL | `/mcp` | Streamable HTTP MCP. Session header selects the transport |

**Dispatch type inference** (`routes/dispatch.ts`): `APPROVED` → `implement`,
`VERIFY` → `verify`, `DRAFT` → `spec_review`. Any other status is 409
`no_inferred_type` unless the body supplies `type`. Claims default to
`defaultResourceClaims({ id: nodeId, … })`. Types that copy `id` claim the
doc node, not the new task UUID. `project_status_review` always claims
`00-project`. `noop`, `human_review`, `operator_session`, and `agent_task`
get no claims. Source is `operator_injected`. Agent model string is
`claude-code`. There is no `/api/transcripts` route.

## 4. Runtime state surfaces

`ProjectContext` (`context.ts`) is one object for the process:

| Field | Holds |
|---|---|
| `projectRoot`, `docsRoot`, `port`, `startedAt` | Launch identity |
| `project` | Validated `ProjectMetadata` (no `workflow` key — see [`parser.md`](parser.md)) |
| `docs`, `resolveDocPath` | Graph snapshot taken at boot. Prompt rendering and dispatch lookup use this snapshot |
| `store`, `runner` | Same store. `runner` is the scheduler |
| `mcp`, `binding` | Per-session MCP transports and session → task binding |
| `dispatchCancellation` | task id → subprocess, for cancel |
| `healthScanner` | `runScan()` |

`GET /api/docs`, `GET /api/docs/:id`, `GET /api/project`, `GET /api/health/issues`,
and the scanner call `readDocsTree` or re-read `project.json`. Dispatch and
prompts do not. A doc saved after boot is visible on the next docs read and
invisible to the next dispatch until the process restarts. The scanner's
`sizeThresholdTokens` is the value captured at boot, even though
`GET /api/project` will show a later edit.

## 5. Invariants

- One server, one project path. A second project is a second process on
  another port. [`00-project`](../00-project.md) §7.1.
- Docs root must resolve inside the project root (`pathSafety.ts`).
- Boot requires `ANTHROPIC_API_KEY` even when no task will be dispatched
  (`context.ts`).
- `POST /api/tasks` and the HITL routes validate with the parser's Ajv
  wrappers. Dispatch trusts a small hand-parsed body (`type`, `priority`,
  `resourceClaims`).
- Approve and reject take `dbRowVersion`. A mismatch is 409
  `version_conflict` (`OptimisticLockError` in `runner/store.ts`).

## 6. Active migration

None. `09-transcript-decouple` is still DRAFT and has no code in this package.
