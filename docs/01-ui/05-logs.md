# Live Log Streaming Panel

**Node ID:** `01-ui/05-logs`
**Parent:** `01-ui`
**Status:** IN_PROGRESS
**Created:** 2026-05-25
**Last Updated:** 2026-05-25 (spec review + APPROVED)

**Dependencies:** `01-ui/01-shell`, `01-ui/10-orchestration`, `01-ui/08-markdown` (consumed for `reasoning` event bodies — see D6), `01-ui/04-tasks` (consumed for the `--color-warning-soft` / `--color-danger-soft` tokens it introduces in `globals.css`, and for the `TaskStatusChip` reused in `status_change` rows — see D2)
**Optional reference:** `01-ui/02-dag` (the panel that owns the "accessible from the DAG node side panel" affordance per PRD §8.2 — see R1a), `01-ui/03-docs` (resolver pattern — see D9)

---

## Requirements

Replace the `LogStreamPanel` empty state at `/logs/:taskId` with a real live-tail rendering of `01-ui/10-orchestration`'s `useLogStream(taskId)` events. This is PRD §8.2 — per-task agent log streaming with distinguishable rendering for reasoning, tool calls, and output artifacts.

Phase-1 reality: `10-orchestration` already serves typed `LogEvent`s over SSE. This node owns the rendering surface. No new data layer; no new transport; no new types in `src/lib/types.ts`.

1. `/logs/:taskId` renders a **per-task header** (task title + status + duration + agent + link back to `/tasks`) above a streaming list of `LogEvent`s.
1a. The URL contract `/logs/:taskId` is the single addressable surface for live log streams. Per PRD §8.2 "accessible from the DAG node side panel," `01-ui/02-dag`'s `NodeInspector` is the owner of the affordance that produces such links from a selected DAG node. This spec declares the URL contract and route shape; it does not modify `02-dag`. Wiring the DAG-inspector "View task logs" button is tracked as a follow-up on `02-dag` (see Open Issues).
2. Each `LogEvent.kind` renders with its own visual treatment so the operator can scan the stream without reading every line:
   - `reasoning` (`message`) — body as rendered markdown via `<MarkdownBody>` (D6).
   - `reasoning` (`thinking`) — italicised, collapsed by default, expandable on click (D5).
   - `tool_call` — header `▸ <toolName>` + truncated single-line argument preview; click expands to the full pretty-printed JSON.
   - `tool_result` — paired with its `tool_call` via `callId`; renders status (`ok` / `error`), duration if known, and a truncated body; click expands the full body.
   - `artifact` — file path (mono) with a kind icon (`+` for `doc_created`/`file_written`, `~` for `doc_updated`, `✓` for `version_committed`); the path is a `<Link>` to `/docs/:nodeId` when `docNodeId` is set.
   - `status_change` — a thin banner row showing `<from> → <to>` with the optional reason.
   - `error` — a red banner row with `message`; click expands the optional stack.
3. **Live-tail behavior:**
   - The list auto-scrolls to the bottom as new events arrive **only when** the user is already at the bottom (within 32 px). Scrolling up disables auto-follow until the user scrolls back to the bottom or clicks an explicit "Jump to latest" button.
   - The "Jump to latest" button appears whenever the user is scrolled away from the bottom; it re-enables auto-follow.
4. **Connection state** is surfaced in the header next to the task status:
   - `live` — green dot + "Streaming".
   - `ended` — muted dot + "Ended" (server signalled task COMPLETE; SSE closed cleanly).
   - `missing` — red dot + "No transcript" (initial fetch 404).
   - `stub` — only seen in tests; renders as "Stub" muted.
   On `reconnectAttempt > 0`, a muted "(reconnecting…)" suffix appears next to "Streaming".
5. **Filter bar** above the list: filter by event kind (multi-select chips). Filter state is URL-synced (`?kind=reasoning,tool_call`). The filter affects *display only* — events still arrive and are kept in memory; toggling kinds back on shows them without re-fetching.
6. **Empty / missing state.** When `status === "missing"`:
   - If `useTask(taskId)` 404s (the task doesn't exist in the current scan), render an `<EmptyState>` with "Task not found." and a back link to `/tasks`.
   - If the dev middleware isn't running (production build), render the same "run `pnpm dev` to enable" copy `10-orchestration` D11 specified.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.

### Out of scope for this node

- **Aggregated multi-task view.** This panel is per-task by design (one URL = one task). Cross-task search and aggregation are deferred.
- **Persistent log archive / export.** Logs stream straight from the JSONL on disk; download/export is a v2 concern.
- **Re-running tools, editing, or annotating events.** Read-only display.
- **Code-mirror / virtualised list rendering.** Current largest transcript is ~3000 events; a plain scrolling `<div>` with element-level keys handles this size without measurable lag. Revisit virtualisation when median transcript size grows past ~10k events.
- **Syntax highlighting on tool-call argument JSON.** Pretty-print only (using `JSON.stringify(parsed, null, 2)`); shiki adds ~600 KB for a niche feature. `08-markdown` already shipped without shiki; same trade-off here.
- **Log search within a single task.** Browser `Ctrl-F` over the rendered DOM suffices at current sizes. Revisit if event counts grow past a few thousand.
- **Mutation affordances** (cancel task, retry tool, etc.) — these require the runner.
- **Replay-mode integration.** `07-replay` is the separate node; that depends on doc-versioning which is unbuilt.

---

## Design

### Data source

`useLogStream(taskId)` from `src/lib/useLogStream.ts` (shipped by `10-orchestration`). Returns:

```ts
{ events: LogEvent[]; status: ConnectionStatus; reconnectAttempt: number }
```

Internally combines an initial `useTask(taskId)` fetch (full historical `LogEvent[]`) with an SSE `EventSource` opened on `/api/transcripts/:taskId/stream`. Reconnect with `Last-Event-ID` is built into the browser; the server re-parses from line 0 and skips seen events (`10-orchestration` §Wire format). The hook deduplicates by `seq`.

No new globs, no new fetch, no new types. The panel is a pure presenter over the hook output. Task metadata (title, status, agent, timestamps) comes from `useTask(taskId)` called directly at the panel level for the header. `useLogStream` *also* calls `useTask` internally (it needs the initial event list); both call sites hit the same TanStack Query cache key (`["task", id]`) and coalesce into a single network request — see `src/lib/useTask.ts`.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                          │
│   ‹ Back to tasks                                               │
│   agent:a3562fa57108eef10              [RUNNING] ● Streaming    │
│   Implement 05-logs module                                      │
│   sonnet · persona: general-purpose · 12m 04s · 312 events      │
├─────────────────────────────────────────────────────────────────┤
│ Filter bar                                                      │
│   Kinds: [reasoning][tool_call][tool_result][artifact][status]… │
├─────────────────────────────────────────────────────────────────┤
│ Event list (scrolls; auto-follow when at bottom)                │
│   …                                                             │
│   14:02:11 ▸ Read app/server/middleware.ts                      │
│   14:02:11 ◂ ok · 8ms · 487 lines                               │
│   14:02:13   The middleware listens on /api/transcripts…        │
│   14:02:14 ▸ Edit app/server/middleware.ts                      │
│   14:02:14 ◂ ok · 22ms · 1 hunks                                │
│   14:02:14 + artifact app/server/middleware.ts (file_written)   │
│   14:02:15 ▸ Bash pnpm -C app typecheck                         │
│   14:02:18 ◂ ok · 3.2s                                          │
│   14:02:19   status: AWAITING_HUMAN_REVIEW                      │
│                                                                 │
│                              [ Jump to latest ↓ ]               │
└─────────────────────────────────────────────────────────────────┘
```

- Each event row has a fixed-width timestamp gutter (10 chars: `HH:MM:SS · `), a kind glyph (`▸ ◂ + ◆ · !`), and the body.
- Rows visually distinguish kind with subtle background colour for `error` (`--color-danger-soft`) and `status_change` (`--color-warning-soft`) only — other kinds rely on the glyph + content for differentiation, keeping the stream visually quiet.

### Event rendering rules

```
src/components/logs/LogEventRow.tsx
```

A discriminated-union switch on `event.kind` dispatches to per-kind sub-components colocated in the same file (small enough; ~20 LOC each). Per-kind decisions:

| Kind | Glyph | Treatment |
|---|---|---|
| `reasoning` / `message` | (none) | `<MarkdownBody raw={event.text}>` inside a quiet bordered container. Markdown is overwhelmingly the model's output format; rendering it plain-text loses code blocks, lists, headings. |
| `reasoning` / `thinking` | `~` | Italic, muted, single-line preview with a `▸` chevron; click expands. Default collapsed because thinking blocks are voluminous and rarely useful at scan time. Reuses the same `<MarkdownBody>` once expanded. |
| `tool_call` | `▸` | One-line `▸ <toolName> <first-arg-preview>`. Click expands the full args as pretty-printed JSON inside a `<pre>`. `callId` is rendered as a tiny mono badge on the right for visual pairing with the matching `tool_result`. |
| `tool_result` | `◂` | One-line `◂ <status> · <durationMs>ms · <bodyPreview>`. Status `error` colors the chip red. Click expands the full body in a `<pre>`. The matching `tool_call`'s `callId` is shown as a mono badge for pairing. |
| `artifact` | `+` (created/written), `~` (updated), `✓` (committed) | One-line `<glyph> artifact <path> (<artifactKind>)`. `path` is a `<Link>` to `/docs/${encodeURIComponent(docNodeId)}` when `docNodeId` is present, else plain mono. Optional `summary` rendered as a muted suffix. |
| `status_change` | `◆` | Banner row with `<from> → <to>` chips (reused `TaskStatusChip` from `04-tasks` if that lands first; otherwise inline). Optional `reason` rendered below in muted text. |
| `error` | `!` | Banner row in `--color-danger-soft`. Message bold; optional `stack` collapsed under a `▸` chevron. |

**Tool-call / tool-result pairing.** Because the stream is append-only and the parser emits the `tool_call` line before its result, pairing is **purely visual** (matching `callId` mono badges) — no DOM nesting. Reasoning lines often interleave between a call and its result; nesting would disrupt the chronological read.

**Argument preview heuristics for `tool_call`:**

- `Read` / `Write` / `Edit` / `MultiEdit` / `NotebookEdit`: show `file_path` value (truncated middle if long).
- `Bash`: show `command` value (truncated to ~120 chars).
- `Grep` / `Glob`: show `pattern` + `path` if present.
- `Agent` / `Task`: show `description`.
- Other tools: show the JSON-stringified args truncated to ~120 chars.

The heuristic table lives in `src/components/logs/toolPreview.ts` and is expected to evolve. A test enumerates each tool name against its expected preview shape.

**Result preview heuristics for `tool_result`:**

- If `body` parses as JSON and has a top-level `error` field, show that as the preview.
- Else: first non-blank line of `body`, truncated to ~120 chars.
- Line count appended when body is multi-line: `"… (487 lines)"`.

### Auto-follow logic

```
src/components/logs/useAutoFollow.ts
```

A small hook that:

1. Watches the scroll container's `scrollTop + clientHeight` vs `scrollHeight`. "At bottom" = within 32 px.
2. When events change and the user is at-bottom, calls `container.scrollTo({ top: scrollHeight })` in a `useLayoutEffect` (synchronous post-render to avoid a visible jump).
3. When the user scrolls up, sets `following = false`; "Jump to latest" button appears.
4. Clicking "Jump to latest" scrolls to the bottom and re-engages auto-follow.

No external library. The hook returns `{ ref, following, jumpToLatest }` and the panel wires them onto the scroll container.

### Filter bar interaction

- Chip group across the six `LogEvent.kind` values. Default: all on.
- The `reasoning` chip filters both `subkind: "thinking"` and `subkind: "message"` events together — sub-kind is collapsed into the parent kind for filter granularity.
- Selection is URL-synced via `useSearchParams()`: `?kind=tool_call,tool_result,artifact`. Empty / absent param = all kinds visible.
- Filtering is purely a render-time predicate over the in-memory `events` array. No re-fetch, no state in Zustand.

### Memory and growth

The hook keeps the entire stream in component state. For a 6-hour operator session with 5000 events at ~500 bytes average each, that's ~2.5 MB held in memory — acceptable for a local-dev panel on a laptop. Above that, switch to a windowed buffer (keep the last N + the matching `tool_call` for any visible `tool_result`). Tracked in Open Issues; not a v1 concern.

### Components and files

```
src/components/logs/
  LogStream.tsx              // outer composition: header + filter bar + list + jump button
  LogStreamHeader.tsx        // task summary, status chip, connection-state pill
  LogFilters.tsx             // kind chip-group (URL-synced)
  LogEventList.tsx           // scroll container + auto-follow + list renderer
  LogEventRow.tsx            // discriminated-union dispatcher; per-kind sub-renderers in same file
  toolPreview.ts             // tool-call argument preview heuristics + tests
  resultPreview.ts           // tool-result body preview heuristics
  useAutoFollow.ts           // scroll-to-bottom-when-at-bottom hook
  ConnectionPill.tsx         // live/ended/missing/stub indicator
src/routes/
  LogStreamPanel.tsx         // thin shell: useParams + useLogStream + render <LogStream />
src/lib/
  formatDuration.ts          // shared with 04-tasks (introduced there first if it ships first; see D7)
```

`LogStreamPanel.tsx` becomes a thin shell: read `taskId` from `useParams`, call `useLogStream(taskId)` + `useTask(taskId)` (for the header), pass to `<LogStream />`. Missing-task and missing-middleware empty-state branches go through `<EmptyState>`.

### Acceptance check (manual)

A reviewer running `pnpm dev`, dispatching a sub-agent or running a session, and visiting `/logs/<currentSessionId>` must see:

1. Header shows the task title (per `10-orchestration` D14 derivation), status chip, agent persona/model, total event count, duration.
2. The list renders every historical `LogEvent` for that task, in chronological order, with the per-kind glyph + treatment.
3. New events appear at the bottom within 1 s of a transcript JSONL append (verified by typing a new prompt into the live session or dispatching a sub-agent). `10-orchestration` Stage-8 Verification item 3 already confirmed this 1 s bound for the underlying SSE pipeline — this panel inherits it.
4. Auto-follow: when scrolled to the bottom, new events keep the view pinned at the bottom; scrolling up surfaces the "Jump to latest" button; clicking it re-anchors.
5. `tool_call` rows show a one-line preview matching the heuristic table; clicking expands the full pretty-printed args.
6. `tool_result` rows display status (`ok` / `error`), duration when present, and a one-line preview; expansion shows the full body.
7. `tool_call` and its matching `tool_result` share the same `callId` badge — the operator can visually trace any call to its result by matching badges.
8. `artifact` rows with `docNodeId` set are clickable and navigate to `/docs/:nodeId` without a full page reload.
9. `reasoning/message` rows render markdown (code fences, lists, tables) correctly via `<MarkdownBody>`. `reasoning/thinking` rows render collapsed by default; click expands.
10. `status_change` rows render as a thin banner; `error` rows render in the danger-soft palette with the message bold.
11. Filter bar chip-group hides events of the toggled-off kind; toggling back on restores them without a re-fetch.
12. Connection pill shows `Streaming` when SSE is open; `Ended` after the server-side close-when-quiet logic fires (`10-orchestration` §Wire format: 60 s unmodified + status COMPLETE).
13. Navigating to `/logs/non-existent-task` shows the "Task not found." empty state with a back link.
14. With Vite dev middleware off (production build), the panel renders the "run `pnpm dev` to enable" empty state.
15. Browser `Ctrl-F` searches the rendered DOM (no virtualisation hiding off-screen events at current sizes).
16. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Discriminated-union switch on `event.kind`, per-kind sub-renderers colocated in `LogEventRow.tsx` | The render rules differ enough per kind that a single component with conditional rendering becomes a mess; splitting into separate files for ~20 LOC each adds navigation overhead. Colocation in one file keeps the dispatch + handlers together, similar to a reducer pattern. Exhaustive-switch over the kind enum gives type-safe coverage of new kinds. |
| D2 | Tool-call / tool-result pairing is visual (`callId` badge), not DOM-nested | The stream is chronological and `reasoning` lines interleave between a call and its result. Nesting the result inside the call would disrupt the read order and require lookahead in the renderer. A small mono `callId` badge on both rows lets the operator's eye trace pairs without changing layout. |
| D3 | Auto-follow only engages when the user is already at the bottom (within 32 px) | The classic terminal behavior. Scrolling up to read something must not be clobbered by new events arriving. The 32 px threshold tolerates minor jitter without breaking the affordance. The "Jump to latest" button is the explicit re-engage. |
| D4 | Filter state in URL (`useSearchParams()`), not Zustand | Same reasoning as `04-tasks` D6 — filter is "what view am I looking at," which matches URL semantics. Back-button restores, share-by-link works, no persistence bugs. |
| D5 | `reasoning/thinking` events render collapsed by default | Thinking blocks are voluminous and rarely useful for scanning what an agent did. The full body is one click away. `reasoning/message` (the model's actual output) renders expanded — that's the load-bearing content. |
| D6 | Markdown rendering for `reasoning` event bodies via `<MarkdownBody>` from `08-markdown` | Agent reasoning routinely contains code fences, lists, and tables — the raw-text fallback would lose this structure. `<MarkdownBody>`'s `resolveDocLink` callback can be passed to make `` `docs/foo.md` `` references in agent text clickable, identical to `03-docs` (see D9). |
| D7 | Share `formatDuration.ts` with `04-tasks` | Both panels show "12m 04s"-style durations and would otherwise duplicate the formatter. The function is pure and dependency-free. If `05-logs` ships first, the formatter lives here and `04-tasks` re-imports; if `04-tasks` ships first, this panel re-imports. Either order works. |
| D8 | No virtualisation in v1 | Current largest transcript is ~3000 events. Plain scrolling with keyed list elements handles this without measurable lag. Virtualisation adds complexity (variable row heights, scroll-restoration on filter change) for a problem we don't have. Revisit when median event count grows past ~10k. |
| D9 | `resolveDocLink` is passed to `<MarkdownBody>` for `reasoning` events, using the same implementation as `03-docs` | Agent reasoning often references project doc paths. Making those clickable inside the log stream costs nothing extra and matches the doc-viewer's behavior, giving the operator a consistent affordance. As of `03-docs` COMPLETE, the resolver is inlined as a module-level function in `src/components/docs/DocViewer.tsx` (around `idForPath` from `@/lib/parseDocs`). This node is the **second consumer** and is the right time to extract: introduce `src/lib/docLink.ts` exporting `resolveDocLink(href: string): string | null`, replace the inline copy in `DocViewer.tsx` with the import, and import it here. The extracted module is pure (closes over nothing) and zero-runtime-cost. |
| D10 | `tool_call` argument preview uses a per-tool heuristic table, not a generic "first 120 chars" rule | Different tools have different "load-bearing" args: `Read` is `file_path`, `Bash` is `command`, `Grep` is `pattern`. The heuristic table maps tool → preview field and is open to evolution as new tools surface. Generic fallback for unknown tools (JSON-stringify + truncate) keeps the surface defensive. |
| D11 | No syntax highlighting on expanded tool-call args / tool-result bodies | Same reasoning as `08-markdown` skipping shiki — bundle cost (~600 KB) outweighs the marginal scan benefit for an operator-only local tool. Mono `<pre>` with `whitespace-pre-wrap` is sufficient. |
| D12 | Header is panel-owned (sticky), not shell-owned | Matches `03-docs` D10's sticky-header pattern. The header is task-specific (title, status, connection pill) and would be awkward to thread through the shell store. Sticky positioning keeps task identity visible while scrolling through long event streams. |
| D13 | No shell inspector use | `02-dag` uses the inspector for graph + side-detail. `05-logs` is a dedicated single-task surface — the event list is the primary content, and individual events expand inline. Opening an inspector for event detail would be a redundant layer over the same data the row already exposes. Matches `03-docs` D10's reasoning. |
| D14 | Event memory is unbounded in v1 | Worst case at current dispatch cadence is ~10 MB held for a long-running session; acceptable on a developer laptop. Windowed buffer + on-demand re-fetch is the v2 mitigation; tracked in Open Issues. |

---

## Open Issues

- **`<MarkdownBody>` cost per `reasoning` event.** Each event is its own `react-markdown` tree. At ~100 reasoning events per session that's 100 trees rendered. Performance hasn't been measured yet but is expected to be fine at current sizes. If it isn't, the mitigation is memoising `<MarkdownBody>` per event (the markdown content is immutable once emitted) — `react-markdown` doesn't memoise internally. *(Priority: LOW.)*
- **Unbounded event memory for very long sessions.** Per D14, ~10 MB worst case at current scale. Windowed buffer (keep last N events + any visible tool_call whose result is visible) is the v2 plan if the median session size grows. *(Priority: LOW.)*
- **`Bash` tool calls have no resource claim** (per `10-orchestration` D6 / Open Issues). The log row still renders the command, so the operator sees what ran. No artifact event is emitted from `Bash`. Consider whether to synthesise a "Bash" pseudo-artifact for visibility, or leave as-is. *(Priority: LOW.)*
- **`MultiEdit` artifact granularity.** Per `10-orchestration` Open Issues, one artifact event per call regardless of hunk count. Hunk-level rendering is impossible without re-parsing the tool args. Accept the limitation. *(Priority: LOW — owned by `10-orchestration`.)*
- **Reconnect-attempt flicker.** `useLogStream`'s `reconnectAttempt` increments on every `onerror`, but the EventSource transitions to OPEN within ms in normal conditions. Rendering "(reconnecting…)" on every error would flicker; threshold it (only show after, say, 500 ms unresolved). *(Priority: LOW — polish.)*
- **`status_change` event coverage in Phase 1.** `10-orchestration` reserves `FAILED` and `CANCELLED` for the eventual runner. The renderer must not assume any specific values appear; the discriminated union handles unknown future values via the existing `TaskStatus` enum. *(Priority: TRIVIAL — informational.)*
- **Cross-doc test coverage.** A golden test against `app/server/__fixtures__/sample-session.jsonl` (introduced by `10-orchestration`) should assert that every event kind in the fixture renders without throwing. Trivial to write; specced here as a verification requirement. *(Priority: LOW.)*
- **Brief `missing` pill flash on mount.** `useLogStream` initialises `connStatus = "missing"` before the initial `useTask` query resolves (`10-orchestration`'s implementation review N2 flagged this as a known minor surface). At Vite-dev cadence the query resolves in < 50 ms, so the flash is usually invisible — but on a slow first paint the red "No transcript" pill can briefly appear. Mitigation: the `ConnectionPill` renders a neutral "Loading" state when `queryStatus === "pending"` and only falls through to `"missing"` once the query has resolved. *(Priority: LOW — cosmetic.)*
- **`02-dag` follow-up: "View task logs" affordance.** PRD §8.2's "accessible from the DAG node side panel" requirement is decomposed as: this node owns the `/logs/:taskId` URL contract; `02-dag`'s `NodeInspector` owns the link affordance. Wiring the affordance requires (a) a reverse query "what tasks claim this DocNode?" against `useTaskList()`, and (b) a button in `NodeInspector` that surfaces the matching tasks (a list when >1, a direct link when exactly 1). Trackable as a small `02-dag` v1.2 patch after `05-logs` ships. The PRD requirement is *not* met by this node alone — surfacing here so the operator is aware. *(Priority: MEDIUM — PRD-coverage gap; small follow-up.)*

---

## Spec Review (2026-05-25)

Independent spec review was run against this DRAFT in clean context. Verdict: NEEDS_MINOR_REVISIONS — one blocking finding around an uncovered PRD §8.2 requirement, three should-fix items on dependency declaration and hook conformance, three nits. All applied:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | PRD §8.2 requires the log stream to be "accessible from the DAG node side panel." Neither the spec nor `02-dag` referenced any mechanism — leaving a silent PRD-coverage gap. | Added Requirement R1a: this node declares the URL contract `/logs/:taskId`; `02-dag`'s `NodeInspector` is the owner of the affordance that produces such links from a selected DAG node. Tracked as a MEDIUM-priority follow-up in Open Issues ("`02-dag` follow-up: 'View task logs' affordance"). `02-dag` promoted to Optional reference noting this contract. The PRD requirement is met by the contract + the follow-up; this node's v1 scope does not include modifying `02-dag`. |
| S1 | `08-markdown` listed as "Optional reference" in the front-matter, but D6 makes `<MarkdownBody>` a hard runtime dependency for `reasoning` events — the panel cannot ship without it. | Promoted `08-markdown` to the hard Dependencies line. `04-tasks` also promoted there (already a hard dep via the soft color tokens + `TaskStatusChip`); `02-dag` and `03-docs` stay as Optional references. |
| S2 | Data Source paragraph conflated `useLogStream`'s internal `useTask` call with the panel-level `useTask` call for the header — an implementer might think they need to choose one. | Data Source rewritten: both call sites are explicit; they hit the same TanStack Query cache key (`["task", id]`) and coalesce into a single network request. |
| S3 | Acceptance check 3 / Verification 2 cited "within 1 s" of a transcript JSONL append without grounding the latency claim in the underlying middleware contract. | Cited `10-orchestration` Stage-8 Verification item 3 which already confirmed the 1 s bound live against the SSE pipeline. The panel inherits the bound. |
| N1 | Brief red "No transcript" pill flash on mount because `useLogStream` initialises `connStatus = "missing"` before the query resolves. Silent in the spec. | Added Open Issue (LOW — cosmetic) with the mitigation: render a neutral "Loading" state when `queryStatus === "pending"`. |
| N2 | Filter section said "Chip group across the six `LogEvent.kind` values" but `reasoning` has two sub-kinds — unstated whether the filter conflates them. | Added an explicit clarification line: the `reasoning` chip filters both `subkind: "thinking"` and `subkind: "message"` together. |
| N3 | D9 said the resolver "lives in `src/lib/docLink.ts` (extracted from `03-docs`'s module-level helper if not already shared at consumption time)." Hedge was stale — verified `src/lib/docLink.ts` does not exist; the resolver is inlined in `DocViewer.tsx` around `idForPath` from `@/lib/parseDocs`. | D9 rewritten: this node is the **second consumer** and is the right time to extract. Concrete extraction plan: introduce `src/lib/docLink.ts` exporting `resolveDocLink(href)`, replace the inline copy in `DocViewer.tsx` with the import, import here. Zero-runtime-cost. |

Nothing punted. All findings applied. Audit table stays in the doc as durable provenance.

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–16) passes.
2. `useLogStream(taskId)` is called exactly once per route mount; the panel renders without intermediate flicker between initial fetch and SSE open.
3. The per-kind sub-renderers in `LogEventRow.tsx` form an exhaustive switch over `LogEvent.kind`; adding a new kind to the union produces a TypeScript error until the renderer handles it.
4. Auto-follow: a programmatic event append (e.g., touching the source JSONL) keeps the view at the bottom; a scroll-up gesture disables auto-follow until the user scrolls back or clicks "Jump to latest."
5. URL search params correctly round-trip filter state: page-reload with `?kind=tool_call,tool_result` produces the same filtered view as toggling chips interactively.
6. Connection pill correctly reflects `useLogStream().status` for every value (`live`, `ended`, `missing`, `stub`).
7. `artifact` rows with `docNodeId` set navigate to `/docs/:nodeId` without a full page reload; rows without `docNodeId` render the path as plain mono text.
8. `tool_call` / `tool_result` pairing: every result with a `callId` matches at least one prior call's `callId` in the rendered DOM (visual-pairing test against the `sample-session.jsonl` fixture).
9. Golden test (new in `app/server/logEventRow.test.tsx` or similar): every `LogEvent.kind` present in the fixture renders without throwing. Snapshot-style coverage check, not snapshot of output (output drift is expected as styling evolves).
10. With Vite dev middleware off (`pnpm build && pnpm preview`), the panel renders the empty-state copy.
11. No regressions: `/dag`, `/docs`, `/health`, `/tasks` continue to render correctly; `10-orchestration`'s API endpoints unchanged.
12. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta reported in Implementation Notes.

---

## Children

None.
