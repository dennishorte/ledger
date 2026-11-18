# UI — current-state reference

**Scope:** `app/`. Vite + React + React Router v7. One cream theme. Talks to
the API server through the dev proxy, and to Claude Code transcripts through
Vite middleware.
**Last verified:** `350789833f56d18ec77f8d22b7062fafa91640b5` on `main`.
**Owning node:** [`01-ui`](../01-ui/00-ui.md) and its panel children.
**Regenerate route and hook lists:** `rg -n "path:|useQuery|fetch\\(" app/src/router.tsx app/src/lib app/src/components/dag/useDocGraph.ts`

Dev server: port `4179` (`LEDGER_APP_PORT`), `strictPort: true`
(`app/vite.config.ts`). API proxy target: `127.0.0.1:4180` (`LEDGER_API_PORT`).
The proxy is the `/api` prefix. Transcript middleware runs in-process and
handles `/api/transcripts` before that proxy matters.

## 1. Module map

| Directory | Role |
|---|---|
| `src/router.tsx` | Route table. `/` redirects to `/dag`. `DagPanel` is lazy (elkjs) |
| `src/routes/` | One panel per route |
| `src/components/layout/` | Shell, sidebar, topbar, inspector slot, alert banner |
| `src/components/dag/` | Graph canvas, layout, node inspector, workflow-progress section |
| `src/components/docs/` | Tree and markdown viewer |
| `src/components/tasks/` | Table, filters, inspector. Approve, reject, and cancel live in `TaskInspector` |
| `src/components/logs/` | Event list, filters, stream |
| `src/components/health/` | Dashboard widgets over scans and issues |
| `src/components/markdown/` | `MarkdownBody`, shared with docs and reasoning events |
| `src/lib/` | TanStack Query hooks and the runner-vs-transcript id check |
| `src/stores/shell.ts` | Sidebar collapsed, persisted under `localStorage` key `ledger.shell`. Other fields in this store stay in memory |
| `src/stores/dagView.ts` | Expansion overrides, persisted under `ledger.dagView`. Node selection is the shell inspector, not this store |
| `src/lib/parseDocs.ts` | Build-time `import.meta.glob` of `docs/**`. Placeholder when `/api/docs` is down |
| `server/middleware.ts` | Vite-only `GET /api/transcripts` |
| `server/transcriptScan.ts` | Finds Claude Code JSONL files under `~/.claude/projects/` |
| `server/transcriptParse.ts` | JSONL lines → `LogEvent` |
| `server/transcriptStatus.ts` | Status from file mtime and the last entry. Does not build the `Task` |
| `server/deriveTask.ts` | One transcript file → `Task`, with a `session:` or `agent:` id |
| `server/serverIdForPath.ts` | Path → node id. Copy of the parser's underscore-skip rule |

Domain types are re-exported from `@ledger/parser` through `src/lib/types.ts`.
UI-only types in that file include `DocSource` and `WorkflowStage`.
`isRunnerTaskId` is a function in the same file.

## 2. Entry points

Sidebar (`components/layout/Sidebar.tsx`): DAG `/dag`, Documents `/docs`,
Tasks `/tasks`, Health `/health`.

| Route | Panel | Data |
|---|---|---|
| `/dag` | `DagPanel` | `useDocGraph` → `GET /api/docs`. Inspector embeds workflow progress and dispatch |
| `/docs` | `DocsPanel` | `loadDocNodes()` once at module load (`DocsTree.tsx`). No API call |
| `/docs/:nodeId` | `DocViewerPanel` | `useDocGraph` plus `GET /api/docs/:id/source` |
| `/tasks` | `TaskConsolePanel` | `useTaskList` merges both sources |
| `/logs/:taskId` | `LogStreamPanel` | `useLogStream`. Runner id → `/api/tasks/:id/stream`. Colon id → `/api/transcripts/:id/stream` |
| `/health` | `HealthDashboardPanel` | `GET /api/health/scans`, `POST /api/health/scan`, `GET /api/health/issues` |
| `/replay/:subtree` | `ReplayPanel` | Empty state. [`00-project`](../00-project.md) §8.6 deferred |
| anything else | `NotFoundPanel` | |

`pnpm -C app dev` starts Vite. The API is a separate process
([`api-server.md`](api-server.md)).

## 3. Data contracts

**Document graph.** `useDocGraph` (`components/dag/useDocGraph.ts`) fetches
`GET /api/docs`. `placeholderData` is `loadDocNodes()` from the build-time
glob, so the first paint and a dead server still show a tree. The live query
replaces it.

**Two task sources** (`lib/useTaskList.ts`):

| Source | URL | Id shape | Served by |
|---|---|---|---|
| Runner | `GET /api/tasks` | Bare UUID. `isRunnerTaskId` is `!id.includes(":")` | Hono, via the proxy |
| Transcript | `GET /api/transcripts` | `session:…` or `agent:…` | `app/server/middleware.ts` only |

`mergeTasks` inserts transcript rows first, then runner rows, so a shared id
would keep the runner row. Sort is `createdAt` descending. A 404 from either
URL becomes `[]`. Any other HTTP error fails the query. `staleTime` is 5
seconds. `useTask` and `useLogStream` pick the URL with `isRunnerTaskId`.

Direct requests to port 4180 have no `/api/transcripts`. The tasks panel
needs the Vite server for transcript rows.

**Mutations.** Approve, reject, and cancel write the response task into the
query cache (`setQueryData`) so the button unmounts with the new status.
Dispatch invalidates the task list and does not write the new task into the
cache (`useDispatch.ts`). Dispatch is offered from the node inspector
(`NodeInspector.tsx`, `useDispatch.ts`) for an authored node in `APPROVED`,
`VERIFY`, or `DRAFT`. Cancel is offered when `transcriptPath === undefined`
and the live status is `RUNNING`, `BLOCKED`, or `PENDING` (`TaskInspector.tsx`).

**Alerts.** `useAlertStream` → `GET /api/alerts/stream`. `AlertBanner` is
mounted in the shell, so it shows on every route.

**Theme.** One token set in `src/styles/globals.css`. No `data-theme`, no
dark mode. `TaskStatusChip` uses the solid tokens `--color-accent`,
`--color-warning`, `--color-danger`, `--color-success`, and
`--color-surface-sunken`. The soft tokens (`--color-accent-soft`,
`--color-warning-soft`, `--color-danger-soft`) are used by row selection,
type badges, banners, and log rows.

## 4. Runtime state surfaces

| Surface | Holds | Persistence |
|---|---|---|
| TanStack Query cache | Docs, task list, task-detail payload, health scans | Memory. Lost on reload |
| Alert stream | `useAlertStream` component state plus an `EventSource` | Memory |
| Live log lines | Lines after the initial fetch, in `useLogStream` state | Memory |
| `shell` store | Sidebar collapsed | `localStorage` key `ledger.shell`. Other fields in the store stay in memory |
| `dagView` store | Expansion overrides | `localStorage` key `ledger.dagView` |
| Build-time doc glob | Snapshot of `docs/**` at Vite transform time | Replaced when `/api/docs` succeeds |

The server is the store of record for tasks, scans, and the live doc graph.
This app does not write SQLite.

## 5. Invariants

- React Router v7 (`react-router`), not TanStack Router.
  [`01-ui`](../01-ui/00-ui.md) D3.
- `isRunnerTaskId` chooses the read and stream URL in `useTask` and
  `useLogStream`. Approve, reject, and cancel are shown when
  `transcriptPath === undefined` and the status allows the button. Dispatch
  is a node action, gated on `authored` plus `APPROVED`, `VERIFY`, or `DRAFT`.
- `/api/transcripts` 404 degrades to an empty list. The tasks panel still
  renders runner rows when the middleware is absent.
- The DAG's placeholder tree can disagree with `GET /api/docs` until the
  query resolves (build-time glob vs disk). After resolution the query wins.
- Replay has a route and an empty state. It does not read the events table.

## 6. Active migration

[`09-transcript-decouple`](../09-transcript-decouple.md) is DRAFT. Until it
lands, `useTaskList` keeps the dual fetch: both URLs in `Promise.allSettled`.
`useTask` and `useLogStream` each request the one URL `isRunnerTaskId`
selects. The recommended path in that node is an adapter boundary.

`07-replay` stays deferred. `/replay/:subtree` is the placeholder, not a
partial player.
