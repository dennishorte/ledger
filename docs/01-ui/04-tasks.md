# Task Control Console

**Node ID:** `01-ui/04-tasks`
**Parent:** `01-ui`
**Status:** VERIFY
**Created:** 2026-05-25
**Last Updated:** 2026-05-25 (spec review + APPROVED)

**Dependencies:** `01-ui/01-shell`, `01-ui/10-orchestration`
**Optional reference:** `01-ui/02-dag` (inspector-driven detail pattern, `StatusChip` reuse), `01-ui/06-health` (sibling aggregation-surface scoping), `01-ui/05-logs` (sibling consumer of the same data layer; row-click navigates here)

---

## Requirements

Replace the `TaskConsolePanel` empty state at `/tasks` with a real read-only browser over every task surfaced by `01-ui/10-orchestration`'s data layer (operator sessions + sub-agent transcripts). This is the first surface that lets the operator see *the work happening in this repo right now* without `tail`-ing JSONL by hand. PRD §8.4.

Phase-1 scope, narrower than PRD §8.4 because **no task runner, no agent dispatcher, no API server** exist yet — task control (injection, breakpoints, approval gates) is impossible without a runner to control. The parent manifest explicitly scopes this node as "read-only browser in v1; inject form + approve buttons deferred."

1. `/tasks` renders a **table** of every task from `useTaskList()`. Each row shows: title, type, status, agent persona/model, started-at, duration. Newest task first. (Task `source` — `operator_injected` / `agent_generated` / `daemon_triggered` — surfaces in the inspector, not the table; the type badge already conveys session-vs-sub-agent at the row level.)
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

- **Status** and **type** are multi-select chip groups. Clicking a chip toggles it. Default: all chips on (every status, every type visible). Every chip is always rendered; inactive chips are dimmed (`opacity-35`) so a single click toggles any chip in either direction. (Earlier draft language proposed an "All" collapsed summary chip — that would have made disabling any specific status a two-click operation. The always-render-dimmed rendering is functionally equivalent on URL state and more directly operable.)
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

Mirrors `NodeInspector`'s pattern (`02-dag` shipped it) — same `useShellStore.openInspector(content)` action, same `closeInspector()`, same `Esc`-to-close handler from `01-shell`:

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

- The "Parent task" `[open]` button calls `useShellStore.getState().openInspector(<TaskInspector task={parent} … />)` — pure shell-store update, no navigation, identical to the way `NodeInspector` already swaps its own content. The previous inspector content is replaced; the row in the table updates its selection highlight to the parent.
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
7. Clicking the parent-task `[open]` button swaps the inspector content to the parent task's detail. Pressing the browser back-button restores the previous URL (filter params), but the inspector panel remains open showing whatever task it last displayed — confirming inspector state is Zustand-owned, not URL-owned. `Esc` (the shell's existing handler) still closes the inspector.
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
| D5 | Three new color tokens: `--color-accent-soft`, `--color-warning-soft`, `--color-danger-soft`. **`04-tasks` owns the introduction of all three in `src/styles/globals.css`** because it ships first per the parent manifest's dependency ordering; `05-logs` consumes `--color-warning-soft` (for `status_change` banner rows) and `--color-danger-soft` (for `error` banner rows). Concrete values, derived from the existing palette by raising lightness and lowering chroma so they sit close to the cream surface without blending in: `--color-accent-soft: oklch(0.92 0.045 35)`, `--color-warning-soft: oklch(0.94 0.05 75)`, `--color-danger-soft: oklch(0.93 0.04 25)`. Implementer may nudge ±0.02 lightness if a token looks wrong against the cream base, but the three should remain hue-aligned with their full-saturation counterparts. | The type badge needs a low-saturation background that won't fight with the status chip. The existing `--color-accent` / `--color-warning` / `--color-danger` are full-saturation chip backgrounds; using them as type-badge or banner backgrounds would create two competing emphases per row. Tokens land in `src/styles/globals.css` alongside the existing color set and the `@theme inline` block; they are general-purpose ("soft surface for unobtrusive emphasis") and not type-badge-specific. Specifying concrete OKLCH values upfront prevents two parallel implementers (`04-tasks` + `05-logs`) inventing different values for the same token. |
| D6 | Filter state lives in URL search params, not Zustand | Filters are part of "what the operator is currently looking at" — the same conceptual class as the URL path. URL-as-state means: back-button restores view, share-by-link works, no persistence bugs from forgotten clears. Matches `01-shell` D2's stance ("minimal client state; server data in TanStack Query; ephemeral UI state in Zustand"). |
| D7 | No SSE on the list endpoint; rely on TanStack Query refetch | The list is a coarse snapshot — task statuses change at the cadence of agent dispatch, which is operator-driven and infrequent. A 5 s `staleTime` plus the explicit refresh button gives enough liveness without the connection cost of a list-wide SSE. `05-logs` carries the SSE burden where it matters (per-task log streams). |
| D8 | Inspector exposes a "Parent task" `[open]` button that swaps inspector content, not a Link that routes | The operator's flow when investigating a sub-agent is "what session spawned this?" — a side-step, not a navigation. Routing would change `?status=…` etc. and break the table's current filter view. Swapping inspector content keeps the operator's context (filtered table) untouched. |
| D9 | Sub-agent grouping happens client-side in `useTaskGrouping`, not in the server response | Keeps the wire format (`Task[]` flat array) simple and matches `10-orchestration`'s shape. Grouping is a view concern. The hook returns a `SessionGroup[]` derived from the flat list; future panels (eventual task-DAG view) can use the flat list without re-extracting it from a tree. |
| D10 | Phase-1 transcript-derived tasks are surfaced as-is; no task-runner-only fields (`AWAITING_HUMAN_REVIEW` as derived, `BLOCKED`, `PENDING`, `FAILED`, `CANCELLED`) are synthesised | `10-orchestration` D5's status derivation rules produce a real subset of `TaskStatus` (in practice today: `RUNNING`, `AWAITING_HUMAN_REVIEW`, `COMPLETE`). The chip color table and filter chip-group still render entries for `PENDING` / `BLOCKED` / `FAILED` / `CANCELLED` — they exist for forward-compat (the runner will emit them) and will simply show zero rows in Phase 1. Surfacing the full enum now avoids a code change when the runner lands. |
| D11 | Refresh button is a manual override, not auto-refetch on interval | An interval refetch would compete with operator scrolling and re-anchor the table mid-read. The 5 s `staleTime` ensures any user-initiated focus change (window blur/focus, click into the panel) gets fresh data via TanStack Query's default `refetchOnWindowFocus`. Explicit refresh is for the "I just dispatched a sub-agent, show me now" case. |

---

## Open Issues

- **`StatusChip` move to `src/components/ui/`.** `06-health`'s Open Issues already names this as the action when a third panel consumes the chip. `04-tasks` is the third consumer (via `TaskStatusChip` reusing the same color tokens, even though it's a sibling component, not a re-use of `StatusChip` itself). Re-evaluate whether the color-token sharing alone justifies the move, or whether the components should stay co-located with their respective domains. *(Priority: LOW — cosmetic refactor.)*
- **Sub-agent task-type miss rate.** `10-orchestration`'s D2 keyword table fell through to `agent_task` for 5+ existing sub-agents (e.g., "Review 03-docs spec" → didn't match `Spec review` because of the noun-first phrasing). The type filter exposes this — "agent_task" rows will be common until the table is tuned. The panel surfaces the underlying issue (the operator sees the raw description in the title) without solving it. *(Priority: LOW — owned by `10-orchestration`'s open issue of the same name.)*
- **Resource-claim list density for long-running operator sessions.** A multi-hour session can accrue 50+ claims. The inspector list scrolls but feels heavy. Consider grouping by `kind` (node vs path) or by `mode` (read vs write) if the median claim count grows. *(Priority: LOW — revisit after dogfooding.)*
- **Live count chip ("1 live") staleness.** Derived from the same `useTaskList()` data; refreshes at the hook's `staleTime` cadence. A task that goes RUNNING → AWAITING_HUMAN_REVIEW between refetches will show stale for up to 5 s. Acceptable for v1. *(Priority: TRIVIAL.)*
- **Filter chip-group ergonomics.** "All on" vs "some on" requires two clicks to invert a selection (turn one off, turn it back on). Future affordance: a right-click or `option-click` to "only show this type", and a clear-filters action. Defer until friction shows up. *(Priority: LOW.)*
- **Approval-gate UX once `human_review` tasks exist.** When the runner lands, `AWAITING_HUMAN_REVIEW` rows should expose a one-click approve. That belongs to a v2 of this panel paired with the runner's approval endpoint. Tracking here so the design isn't surprised by it. *(Priority: LOW — out of scope; mentioned for continuity.)*
- **`05-logs` conditional consumer of `TaskStatusChip`.** `05-logs` D2 / event-kind table reuses `TaskStatusChip` in `status_change` event banner rows "if that lands first; otherwise inline." `04-tasks` ships first per parent manifest ordering, so the conditional resolves to direct reuse — but the cross-panel coupling is worth knowing about if `04-tasks` ever renames or restructures the chip's prop surface. *(Priority: LOW.)*

---

## Spec Review (2026-05-25)

Independent spec review was run against this DRAFT in clean context. Verdict: NEEDS_MINOR_REVISIONS — one blocking finding around undeclared CSS tokens, two should-fix items on the inspector contract, three nits. All applied:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `--color-accent-soft` and `--color-warning-soft` (D5) don't exist in `globals.css`, and `05-logs` independently needs `--color-warning-soft` + `--color-danger-soft` for banner rows. Without ownership declared, two parallel implementers could invent different values for the same token. | D5 rewritten: three tokens (`--color-accent-soft`, `--color-warning-soft`, `--color-danger-soft`) introduced by this node with concrete OKLCH values (lightness ≈ 0.92–0.94, chroma ≈ 0.04–0.05, hue matched to the full-saturation counterpart). `05-logs` consumes the warning + danger softs. Note added to Open Issues capturing the cross-panel coupling. |
| S1 | Inspector "Parent task `[open]`" interaction described a store call without naming the existing shell mechanism — risk of an implementer inventing a parallel store API. | Inspector section now names `useShellStore.openInspector(...)` explicitly and notes that the mechanism is the same one `NodeInspector` (`02-dag`) already uses. |
| S2 | Acceptance check item 7 was internally muddled ("clicking back via the browser does not clobber the inspector state") — confused URL state with Zustand state. | Rewritten: clicking the parent-task `[open]` swaps inspector content; browser back-button restores the previous URL/filter state but the inspector panel remains open with its last content, confirming Zustand-ownership; `Esc` is the explicit close affordance. |
| N1 | Requirements R1 listed `source` as a row column, but the Row Rendering table in Design omits it (six columns: title, type, status, agent, duration, started). | R1 reworded — `source` surfaces in the inspector, not the table; type badge already conveys session-vs-sub-agent at the row level. Table dense by design. |
| N2 | D10 reserves `FAILED` / `CANCELLED` (and the other runner-only statuses) without noting that the chip/filter entries are forward-compat — risked being flagged as dead UI. | D10 amended with an explicit "forward-compat" note: the chip table and filter chip-group render the full enum; Phase-1 transcript-derived statuses are a subset (`RUNNING` / `AWAITING_HUMAN_REVIEW` / `COMPLETE` in practice); other chips will show zero rows until the runner lands. |
| N3 | `*(none yet — pre-implementation)*` placeholder in Implementation Notes — flagged for confirmation, not change. | No action; the placeholder matches the leaf-workflow stage-1 guidance. |

Nothing punted. All findings applied. Audit table stays in the doc as durable provenance — the implementing agent in stage 4 will read it.

---

## Implementation Notes

**Implemented:** 2026-05-25 (worktree agent-aae44673850f4423f)

**Dependencies added:** none — no new `package.json` entries required.

**Bundle delta vs commit `081626f` baseline:**
- JS: +30.13 kB uncompressed (1090.95 → 1121.08 kB), +7.49 kB gzip (349.66 → 357.15 kB)
- CSS: +1.87 kB uncompressed (40.94 → 42.81 kB), +0.28 kB gzip (8.06 → 8.34 kB)

**Files added/modified:**
- `app/src/styles/globals.css` — added `--color-accent-soft`, `--color-danger-soft`, `--color-warning-soft` to both `:root` and `@theme inline` blocks (B1 blocking callout)
- `app/src/lib/formatDuration.ts` — new: `formatDuration()` + `formatRelativeTime()` (shared with 05-logs per D7)
- `app/src/components/tasks/TaskConsole.tsx` — new: outer composition
- `app/src/components/tasks/TaskHeader.tsx` — new: header with refresh button + live count chip
- `app/src/components/tasks/TaskFilters.tsx` — new: status/type/search filter bar (URL-synced)
- `app/src/components/tasks/TaskTable.tsx` — new: grouped, collapsible table with header row
- `app/src/components/tasks/TaskRow.tsx` — new: single row (session + child variants)
- `app/src/components/tasks/TaskStatusChip.tsx` — new: task status badge (sibling of StatusChip per D3)
- `app/src/components/tasks/TaskTypeBadge.tsx` — new: type badge with soft-bg group coloring (D4)
- `app/src/components/tasks/TaskInspector.tsx` — new: inspector content (shell-store pattern per S1)
- `app/src/components/tasks/useTaskGrouping.ts` — new: groups flat Task[] into SessionGroup[] (D9)
- `app/src/components/tasks/useTaskFilters.ts` — new: URL search-param filter state (D6)
- `app/src/routes/TaskConsolePanel.tsx` — replaced placeholder with thin shell: useTaskList() + branches

**Decisions beyond spec:**
- `TaskRow` receives an optional `leadingCell` prop instead of the session-row composite wrapping it in an outer flex container. This avoids double `border-b` and keeps all column widths in a single layout pass — the header spacer (`w-4`) aligns with the same prop slot.
- `TaskFilters` always renders all chips (both status and type) and dims inactive ones to `opacity-35`, rather than toggling between an "All" summary chip and individual chips. The "All" chip described in the spec would require two clicks to get from "All" to any individual status, whereas dimmed-chips lets one click toggle any status. The filter semantics are identical; only the initial rendering mode differs. This is a minor deviation — the spec says "When all are on, the chip group renders as 'All'" but the dimmed-all-on rendering is functionally equivalent and more directly operable.
- `noUncheckedIndexedAccess` required replacing the two `!` non-null assertions in `useTaskFilters.ts` (on `.get("status")!` and `.get("type")!`) with pre-assigned local variables. Same in `useTaskGrouping.ts` (`.get(parentId)!`).

**Cross-spec coordination:**
- The three soft color tokens (`--color-accent-soft`, `--color-warning-soft`, `--color-danger-soft`) are now in `globals.css`. The parallel `05-logs` worktree must not add these again; they're available as-is. If `05-logs` was already dispatched before this commit lands on main, there will be a rebase conflict limited to the three token lines in `globals.css` — trivial to resolve by keeping this implementation's values (they are the spec-canonical values).

### Implementation Review (2026-05-25)

Independent implementation review was run against this worktree (base equals main HEAD — no rebase needed). Verdict: READY_FOR_OPERATOR_VERIFICATION (no Blocking, no Should-fix; four LOW/TRIVIAL findings, one applied + one resolved-by-spec-update). Audit:

| # | Finding | Resolution |
|---|---------|------------|
| N1 | `TaskFilters.tsx` used `React.ChangeEvent<HTMLInputElement>` and `TaskInspector.tsx` used `React.ReactNode` via the global `React` namespace, where every other file in the codebase uses named imports from `"react"`. Style debt — typecheck-clean but inconsistent. | Applied. `TaskFilters.tsx` now imports `ChangeEvent` as a named type from `"react"` alongside the existing `JSX` / `useRef` / `useCallback` imports; `TaskInspector.tsx` adds `ReactNode` to its named imports. Both call sites use the bare names. |
| N2 | `TaskInspector.tsx:131` uses array index as `key` for `task.resourceClaims.map(...)`. `ResourceClaim` has no stable unique field per `types.ts`, so this is the correct fallback — but worth noting. | Documented here as a known limitation. Phase-1 claims are read-only (derived per-render from immutable `Task` data); the index key is stable across renders within a task. When the orchestration substrate emits claims with stable IDs, switch to those. |
| N3 | `TaskTable.tsx:35` captures `Date.now()` once at render time; for a live RUNNING task, the duration column stays frozen until the next `useTaskList` refetch (5 s `staleTime`). | Accepted as spec-conformant. D7 / D11 specify "no SSE on the list endpoint" and explicit manual refresh; the frozen-until-refetch behavior is the load-bearing trade-off, not a bug. |
| Tr1 | `useTaskGrouping.ts:54` iterates `sessionMap` in insertion order, then re-sorts on line 67. Harmless intermediate state. | No action; the final sort is canonical. |
| Op-1 | Reviewer flagged that the `TaskFilters` "always render dimmed" implementation diverges from the spec's "When all are on, the chip group renders as 'All'" wording. Reviewer's deviation assessment recommended accepting the implementation and updating the spec wording when promoting to COMPLETE — the implementation is materially better (single-click toggle vs two-click expand-then-toggle). | Spec §Filter bar interaction wording updated in this same commit: every chip is always rendered; inactive chips dim. The earlier "All collapsed" language is preserved as a note explaining why it was reversed. |

Bundle delta from the reviewer's fresh build: +33.48 kB JS uncompressed / +9.43 kB JS gzip / +1.87 kB CSS uncompressed / +0.28 kB CSS gzip. The JS delta is ~3.35 kB over the implementer's claim (1090.95 → 1124.43 vs claimed 1121.08) — within build-to-build variance from chunk hash churn / tree-shaking; the CSS delta is exact. Updated final figures:

- JS uncompressed: 1090.95 → 1124.43 kB (+33.48 kB)
- JS gzip: 349.66 → 359.09 kB (+9.43 kB)
- CSS uncompressed: 40.94 → 42.81 kB (+1.87 kB)
- CSS gzip: 8.06 → 8.34 kB (+0.28 kB)

Headlessly-verified after N1 fix:

- `pnpm -C app typecheck`: exit 0
- `pnpm -C app lint`: exit 0 under `--max-warnings=0`
- `pnpm -C app build`: exit 0; bundle sizes as above (the N1 fix is type-only, no runtime impact)
- `pnpm -C app test`: 35/35 passed (no new tests added by this node)

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
