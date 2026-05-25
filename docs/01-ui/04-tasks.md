# Task Control Console

**Node ID:** `01-ui/04-tasks`
**Parent:** `01-ui`
**Status:** DRAFT
**Created:** 2026-05-25
**Last Updated:** 2026-05-25

**Dependencies:** `01-ui/01-shell`, `01-ui/10-orchestration`
**Optional reference:** `01-ui/02-dag` (inspector-driven detail pattern, `StatusChip` reuse), `01-ui/06-health` (sibling aggregation-surface scoping), `01-ui/05-logs` (sibling consumer of the same data layer; row-click navigates here)

---

## Requirements

Replace the `TaskConsolePanel` empty state at `/tasks` with a real read-only browser over every task surfaced by `01-ui/10-orchestration`'s data layer (operator sessions + sub-agent transcripts). This is the first surface that lets the operator see *the work happening in this repo right now* without `tail`-ing JSONL by hand. PRD §8.4.

Phase-1 scope, narrower than PRD §8.4 because **no task runner, no agent dispatcher, no API server** exist yet — task control (injection, breakpoints, approval gates) is impossible without a runner to control. The parent manifest explicitly scopes this node as "read-only browser in v1; inject form + approve buttons deferred."

1. `/tasks` renders a **table** of every task from `useTaskList()`. Each row shows: title, type, status, source, agent persona/model, started-at, duration. Newest task first.
2. **Filter bar** above the table: filter by status (multi-select chips), by type (multi-select chips), and a text search over title. Filter state is URL-synced via search params so a row click → back-button returns to the same filtered view.
3. **Row click → open the shell's right-hand inspector** with full task details: id, type, status, source, parent task (with link if known), depends-on task IDs, agent meta, full resource-claim list, and timestamps. The inspector also exposes a primary "Open log stream" button that navigates to `/logs/${encodeURIComponent(taskId)}` (consumed by `01-ui/05-logs`).
4. **Status chip parity:** task status chips reuse the same color tokens as `StatusChip` for the matching states, with task-specific additions (`PENDING`, `RUNNING`, `BLOCKED`, `AWAITING_HUMAN_REVIEW`, `COMPLETE`, `FAILED`, `CANCELLED`) so the operator's color memory carries between this panel and the DAG.
5. **Connection-state empty state:** when `useTaskList()` returns `[]` (production build with no middleware, or no transcripts exist for this repo), the panel renders the same "run `pnpm dev` to enable" message `10-orchestration` D11 specified for `04-tasks` and `05-logs`.
6. **Parent → child task hierarchy is shown spatially.** Sub-agent tasks indent under their `parentTaskId` operator-session task. The hierarchy is collapsible per session; default collapsed when the table holds > 50 tasks.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.

### Out of scope for this node

- **Manual task injection** (no runner — the queue cannot accept new tasks).
- **Breakpoint insertion** (no runner).
- **Priority override** (no runner).
- **Approval gates / approve buttons** for `human_review` tasks (no runner; approval is currently the operator's `enter` keypress in the terminal).
- **Any mutation of task state.** Read-only.
- **Live updates** on the task list itself (no SSE for the list endpoint; TanStack Query refetch interval is the only liveness — see D7).
- **Cross-repo aggregation** (filtered out at the data layer per `10-orchestration` D4).
- **Task-DAG visualization.** The eventual pivot of `02-dag` from doc-DAG to task-DAG is a separate effort; this panel is a table because (a) Phase-1 task-graphs are flat — operator sessions with sub-agent children, no inter-agent deps inferred (`10-orchestration` §Task derivation, sub-agent `dependsOn: []`), and (b) the list view is the natural read surface for "what ran, when, how long."
- **Persistence of filter state** beyond the URL (no `localStorage`; URL is the canonical state).
- **Pagination.** Current transcript count is ~25; the table scrolls vertically. Revisit if counts pass ~500.

---

## Design

### Data source

`useTaskList()` from `src/lib/useTaskList.ts` (shipped by `10-orchestration`). Returns `Task[]`. The hook is a thin TanStack Query over `GET /api/transcripts`; on production builds (no middleware) it returns `[]`.

No new fetch, no new hook, no new types in `src/lib/types.ts`. Every `Task` field this panel renders is already declared by `10-orchestration` (`id`, `type`, `status`, `title`, `source`, `parentTaskId`, `dependsOn`, `resourceClaims`, `agent`, `createdAt`, `startedAt`, `completedAt`).

### Layout

Three stacked regions inside the main content area:

```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                          │
│   Tasks                          [refresh] [25 tasks · 1 live]  │
├─────────────────────────────────────────────────────────────────┤
│ Filter bar                                                      │
│   Status: [RUNNING][AWAITING_HUMAN_REVIEW][COMPLETE]…           │
│   Type:   [operator_session][implement][spec_review]…           │
│   Search: [_______________________________________]             │
├─────────────────────────────────────────────────────────────────┤
│ Table (scrolls)                                                 │
│   ┌───────────────────────────────────────────────────────────┐ │
│   │ Title              Type           Status   Agent   Dur.   │ │
│   ├───────────────────────────────────────────────────────────┤ │
│   │ ▾ Implement 05-…   operator_…    RUNNING   opus    12m    │ │
│   │   └ Implement 05-…   implement   RUNNING   sonnet  09m    │ │
│   │   └ Review 05-…      spec_review COMPLETE  sonnet  03m    │ │
│   │ ▸ 03-docs spec      operator_… COMPLETE   opus    47m     │ │
│   │ …                                                         │ │
│   └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- The header right-side chip ("25 tasks · 1 live") is derived from the current `useTaskList()` data; `1 live` counts tasks with `status === "RUNNING"`.
- The `[refresh]` button calls `queryClient.invalidateQueries({ queryKey: ["tasks"] })`. Manual override for the 5 s `staleTime` on the hook (`10-orchestration` `useTaskList.ts`).
- The disclosure `▾` / `▸` toggles per-session children. Default open when the session has ≥1 RUNNING child, otherwise collapsed for sessions older than 1 hour.

### Filter bar interaction

- **Status** and **type** are multi-select chip groups. Clicking a chip toggles it. Default: all chips on (every status, every type visible). When all are on, the chip group renders as "All". When a subset is selected, the chip group renders as the selection.
- **Search** is a debounced (200 ms) substring match on `task.title` (case-insensitive). Empty search matches all.
- Filter state is encoded in the URL as `?status=RUNNING,AWAITING_HUMAN_REVIEW&type=implement,spec_review&q=05-logs`. The URL is the single source of truth; navigating back from the inspector or from `/logs/:taskId` returns to the same filter set.
- Filter state lives in `useSearchParams()` (React Router v7). No Zustand store — URL is canonical, matching `01-shell` D2's "minimal client state" stance.

### Row rendering

Each row is a `<div role="row">` with the following columns:

| Column | Width | Source field | Render |
|---|---|---|---|
| Title | flex-1 | `task.title` | Truncate to 1 line; full title on hover via native `title=` |
| Type | 130px | `task.type` | `<TaskTypeBadge type={…} />` (text + subtle color, see D4) |
| Status | 160px | `task.status` | `<TaskStatusChip status={…} />` (D3) |
| Agent | 110px | `task.agent?.persona ?? task.agent?.model ?? "—"` | mono text |
| Duration | 70px | derived from `startedAt`/`completedAt`/`now` | "12m" / "3s" / "—" |
| Started | 110px | `task.startedAt ?? task.createdAt` | relative ("12m ago") via `Intl.RelativeTimeFormat` |

- A child row (sub-agent under a session) renders the title cell with a `└─` leader and indents by 24 px.
- Hover shows the row in `var(--color-surface-sunken)`. Click sets the selected task and opens the inspector.
- The selected row stays visually highlighted (`var(--color-accent-soft)` background) until the inspector is closed or another row is selected.

### Inspector content (`TaskInspector.tsx`)

Mirrors `NodeInspector`'s pattern (`02-dag` shipped it):

```
┌────────────────────────────────────────┐
│  TASK                                  │
│   agent:a3562fa57108eef10              │
│   Implement 05-logs module             │
│                          [RUNNING]     │
├────────────────────────────────────────┤
│  TYPE                                  │
│   implement                            │
│                                        │
│  SOURCE                                │
│   agent_generated                      │
│                                        │
│  AGENT                                 │
│   sonnet · persona: general-purpose    │
│                                        │
│  PARENT TASK                           │
│   session:374a94db-… [open]            │
│                                        │
│  DEPENDS ON (0)                        │
│   —                                    │
│                                        │
│  RESOURCE CLAIMS (8)                   │
│   • node 01-ui/05-logs (write)         │
│   • path /…/worktrees/agent-x (write)  │
│   • node 01-ui/10-orchestration (read) │
│   …                                    │
│                                        │
│  TIMING                                │
│   Created   2026-05-25 14:02:11        │
│   Started   2026-05-25 14:02:11        │
│   Completed —                          │
│   Duration  12m 04s                    │
│                                        │
│   [ Open log stream ▸ ]                │
└────────────────────────────────────────┘
```

- The "Parent task" `[open]` button calls `openInspector(<TaskInspector task={parent} … />)` — pure shell-store update, no navigation. The previous inspector content is replaced; the row in the table updates its selection highlight to the parent.
- The "Open log stream" button is a `<Link to={\`/logs/\${encodeURIComponent(task.id)}\`}>` styled as a primary button. Navigation closes the inspector (the shell's default route-change behavior preserves it; the operator hits `Esc` if they want it closed).
- Resource claims render as a deduplicated list per `10-orchestration` §Resource-claim derivation. `node` claims show the `NodeId` (mono); `path` claims show the path verbatim (mono, truncated middle on overflow with full path on hover).
- No edit affordances. Buttons that *would* mutate task state (Cancel, Retry, Approve, Re-queue) are explicitly not rendered — see Out of scope.

### Status chip (`TaskStatusChip.tsx`)

`TaskStatus` is a disjoint union from `NodeStatus`. The chip is a sibling of `StatusChip` (does **not** generalise it — see D3). Color mapping:

| Task status | Color token | Rationale |
|---|---|---|
| `PENDING` | `--color-muted` | Same as `DRAFT`/`PLANNED` — not started |
| `RUNNING` | `--color-accent` | Same as `IN_PROGRESS` |
| `BLOCKED` | `--color-warning` | Distinct from `RUNNING` — waiting on a dep |
| `AWAITING_HUMAN_REVIEW` | `--color-warning` | Same as `VERIFY` — operator action gating |
| `COMPLETE` | `--color-success` | Same as `COMPLETE` |
| `FAILED` | `--color-danger` | Same as `ISSUE_OPEN` |
| `CANCELLED` | `--color-muted` | Neutral terminal state |

`AWAITING_HUMAN_REVIEW` is rendered as `AWAITING REVIEW` (the chip label drops the `HUMAN_` qualifier; full status string still in hover/inspector).

### Type badge (`TaskTypeBadge.tsx`)

Lightweight text + soft background. Distinguishes the three groups visually:

| Group | Members | Background token |
|---|---|---|
| Session | `operator_session` | `--color-surface-sunken` |
| Lifecycle | `spec_draft`, `spec_review`, `implement`, `verify`, `reverify`, `doc_refactor`, `issue_triage` | `--color-accent-soft` (new token — see D5) |
| Gating | `human_review`, `project_status_review` | `--color-warning-soft` (new token — see D5) |
| Other | `agent_task` | `--color-surface-sunken` |

Badge text is the raw type string in mono, lowercase. No emoji, no icon — keeping the table dense and scannable.

### Components and files

```
src/components/tasks/
  TaskConsole.tsx          // outer composition: header + filter bar + table
  TaskHeader.tsx           // title + refresh + summary count
  TaskFilters.tsx          // status/type/search filter bar (URL-synced)
  TaskTable.tsx            // header row + rows; handles session grouping
  TaskRow.tsx              // single row (used for both session and child rows)
  TaskStatusChip.tsx       // task-status badge
  TaskTypeBadge.tsx        // task-type badge
  TaskInspector.tsx        // inspector content for the selected task
  useTaskGrouping.ts       // groups Task[] into session-rooted trees
  useTaskFilters.ts        // URL search-param ↔ filter state
src/routes/
  TaskConsolePanel.tsx     // thin shell: instantiate hooks + render <TaskConsole />
src/lib/
  formatDuration.ts        // shared formatter; reused by 05-logs
```

`TaskConsolePanel.tsx` becomes a thin shell: call `useTaskList()`, pass `tasks` to `<TaskConsole />`. Loading + error + empty branches go through `<EmptyState>`.

### Acceptance check (manual)

A reviewer running `pnpm dev` and visiting `/tasks` must see:

1. A table populated with every task surfaced by `/api/transcripts` (current count ~25). At least one row per type currently present in the repo (operator_session, implement, spec_review, spec_draft, verify, agent_task).
2. Status chips render with the colors per the table in §Status chip. Toggling a chip in the status filter chip-group hides every row with that status; toggling it back restores them.
3. The text search narrows the table to rows whose title contains the substring (case-insensitive). Clearing the search restores all rows.
4. Search params reflect filter state: setting `?status=RUNNING&q=05-logs` in the URL produces the same filtered view as toggling those filters interactively.
5. Sub-agent rows indent under their parent operator_session row. Collapsing a parent hides its children.
6. Clicking a row opens the inspector with the full task detail (id, type, status, source, agent, parent task, depends-on, resource claims, timestamps).
7. Clicking the parent-task `[open]` link in the inspector swaps the inspector to the parent's detail; clicking back via the browser does **not** clobber the inspector state (the inspector lives in the shell store, not URL).
8. Clicking "Open log stream" navigates to `/logs/:taskId`. Until `05-logs` ships, the stream panel still shows the empty-state placeholder — no error.
9. With Vite dev middleware **off** (production build), the panel renders the "run `pnpm dev` to enable" empty state instead of an empty table.
10. The refresh button forces a fresh `useTaskList()` fetch (visible in network panel).
11. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.
12. No regressions: `/dag`, `/docs`, `/health` continue to render. `10-orchestration`'s endpoints unchanged.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Table view, not a graph view, in v1 | Phase-1 task graphs are essentially flat (operator session + immediate sub-agents; no inferred inter-agent deps per `10-orchestration` §Task derivation). A list view is the honest read surface for the data we have. When the task runner lands and real DAG edges exist, the panel evolves into a graph or, more likely, the eventual task-DAG pivot of `02-dag` takes over and this panel narrows to a tabular filter / search surface. |
| D2 | Row click → shell inspector, not navigation | Matches `02-dag`'s pattern. Task detail is dense (resource claims, agent meta, timing) and benefits from a side panel that keeps the table in view. The inspector's "Open log stream" button bridges to `05-logs`'s route. Alternative considered: master/detail in-panel (left list, right detail). Rejected — duplicates the inspector surface and creates a second interaction model the operator has to learn. |
| D3 | `TaskStatusChip` is a sibling component of `StatusChip`, not a generalisation | `TaskStatus` and `NodeStatus` are disjoint enums (`PENDING`/`RUNNING`/`BLOCKED`/`AWAITING_HUMAN_REVIEW`/`FAILED`/`CANCELLED` vs `DRAFT`/`SPEC_REVIEW`/…). A shared generic-over-string chip would force `as` casts at every call site and lose exhaustive-switch type safety. Two ~40-line components sharing color tokens is cheaper than one generic component plus a registry. |
| D4 | Type rendered as a text badge, not an icon | The table is dense and the type vocabulary (`operator_session`, `spec_review`, `implement`, …) is already self-describing in text. Icons would require a per-type asset and would still need hover-text for clarity. Color-by-group (D5) does the visual differentiation; text carries the meaning. |
| D5 | Two new color tokens: `--color-accent-soft` and `--color-warning-soft` | The type badge needs a low-saturation background that won't fight with the status chip. The existing `--color-accent` / `--color-warning` are full-saturation chip backgrounds; using them for the type badge would create two competing emphases per row. Tokens land in `src/styles/globals.css` alongside the existing color set; they are general-purpose ("soft accent surface for unobtrusive emphasis") and not type-badge-specific. |
| D6 | Filter state lives in URL search params, not Zustand | Filters are part of "what the operator is currently looking at" — the same conceptual class as the URL path. URL-as-state means: back-button restores view, share-by-link works, no persistence bugs from forgotten clears. Matches `01-shell` D2's stance ("minimal client state; server data in TanStack Query; ephemeral UI state in Zustand"). |
| D7 | No SSE on the list endpoint; rely on TanStack Query refetch | The list is a coarse snapshot — task statuses change at the cadence of agent dispatch, which is operator-driven and infrequent. A 5 s `staleTime` plus the explicit refresh button gives enough liveness without the connection cost of a list-wide SSE. `05-logs` carries the SSE burden where it matters (per-task log streams). |
| D8 | Inspector exposes a "Parent task" `[open]` button that swaps inspector content, not a Link that routes | The operator's flow when investigating a sub-agent is "what session spawned this?" — a side-step, not a navigation. Routing would change `?status=…` etc. and break the table's current filter view. Swapping inspector content keeps the operator's context (filtered table) untouched. |
| D9 | Sub-agent grouping happens client-side in `useTaskGrouping`, not in the server response | Keeps the wire format (`Task[]` flat array) simple and matches `10-orchestration`'s shape. Grouping is a view concern. The hook returns a `SessionGroup[]` derived from the flat list; future panels (eventual task-DAG view) can use the flat list without re-extracting it from a tree. |
| D10 | Phase-1 transcript-derived tasks are surfaced as-is; no task-runner-only fields (`AWAITING_HUMAN_REVIEW` as derived, `BLOCKED`, `PENDING`, `FAILED`, `CANCELLED`) are synthesised | `10-orchestration` D5's status derivation rules produce a real subset of `TaskStatus`. The chip and filter handle the full enum so the panel doesn't need a code change when the runner starts emitting the rest. |
| D11 | Refresh button is a manual override, not auto-refetch on interval | An interval refetch would compete with operator scrolling and re-anchor the table mid-read. The 5 s `staleTime` ensures any user-initiated focus change (window blur/focus, click into the panel) gets fresh data via TanStack Query's default `refetchOnWindowFocus`. Explicit refresh is for the "I just dispatched a sub-agent, show me now" case. |

---

## Open Issues

- **`StatusChip` move to `src/components/ui/`.** `06-health`'s Open Issues already names this as the action when a third panel consumes the chip. `04-tasks` is the third consumer (via `TaskStatusChip` reusing the same color tokens, even though it's a sibling component, not a re-use of `StatusChip` itself). Re-evaluate whether the color-token sharing alone justifies the move, or whether the components should stay co-located with their respective domains. *(Priority: LOW — cosmetic refactor.)*
- **Sub-agent task-type miss rate.** `10-orchestration`'s D2 keyword table fell through to `agent_task` for 5+ existing sub-agents (e.g., "Review 03-docs spec" → didn't match `Spec review` because of the noun-first phrasing). The type filter exposes this — "agent_task" rows will be common until the table is tuned. The panel surfaces the underlying issue (the operator sees the raw description in the title) without solving it. *(Priority: LOW — owned by `10-orchestration`'s open issue of the same name.)*
- **Resource-claim list density for long-running operator sessions.** A multi-hour session can accrue 50+ claims. The inspector list scrolls but feels heavy. Consider grouping by `kind` (node vs path) or by `mode` (read vs write) if the median claim count grows. *(Priority: LOW — revisit after dogfooding.)*
- **Live count chip ("1 live") staleness.** Derived from the same `useTaskList()` data; refreshes at the hook's `staleTime` cadence. A task that goes RUNNING → AWAITING_HUMAN_REVIEW between refetches will show stale for up to 5 s. Acceptable for v1. *(Priority: TRIVIAL.)*
- **Filter chip-group ergonomics.** "All on" vs "some on" requires two clicks to invert a selection (turn one off, turn it back on). Future affordance: a right-click or `option-click` to "only show this type", and a clear-filters action. Defer until friction shows up. *(Priority: LOW.)*
- **Approval-gate UX once `human_review` tasks exist.** When the runner lands, `AWAITING_HUMAN_REVIEW` rows should expose a one-click approve. That belongs to a v2 of this panel paired with the runner's approval endpoint. Tracking here so the design isn't surprised by it. *(Priority: LOW — out of scope; mentioned for continuity.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–12) passes.
2. `useTaskList()` is called exactly once per route mount; the table renders without intermediate flicker.
3. `useTaskGrouping` produces a stable tree across re-renders (memoised on the `Task[]` reference); collapsing a session preserves which children are visible after a refetch.
4. URL search params correctly round-trip every filter combination: page-reload with `?status=RUNNING,COMPLETE&type=implement&q=foo` produces the same chip and search state as setting them interactively.
5. With the dev middleware running, the table shows every transcript task; with the middleware off (`pnpm build && pnpm preview`), the panel shows the empty-state copy.
6. The inspector's "Open log stream" button navigates to `/logs/:taskId` without a full page reload (Vite client connection stays open).
7. `TaskStatusChip` color parity: chips for `COMPLETE` and `RUNNING` match `StatusChip`'s `COMPLETE` and `IN_PROGRESS` colors (same token).
8. No regressions: `/dag`, `/docs`, `/health` continue to render correctly; `10-orchestration`'s API endpoints unchanged; `parseDocs.ts` / `useDocSource.ts` unmodified.
9. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta reported in Implementation Notes.

---

## Children

None.
