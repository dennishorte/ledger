# Orchestration Data Layer

**Node ID:** `01-ui/10-orchestration`
**Parent:** `01-ui`
**Status:** IN_PROGRESS
**Created:** 2026-05-24
**Last Updated:** 2026-05-24 (ISSUE_OPEN → IN_PROGRESS — patch pass for worktree-root bug)

**Dependencies:** `01-ui/01-shell`
**Optional reference:** `01-ui/03-docs` (consumes `idForPath` from `parseDocs.ts` for artifact → docNodeId mapping)

---

## Requirements

Introduce the shared data layer for tasks and per-task log streams. Three consumers will sit on top:

- `01-ui/04-tasks` — task control console (read-only browser in v1)
- `01-ui/05-logs` — live log streaming panel
- `01-ui/07-replay` — replay-mode panel (deferred; depends on doc-versioning, which is unbuilt)

Phase-1 reality: no API server, no task runner, no agent dispatcher. **But Claude Code is already emitting all of the relevant data** — every session and every sub-agent dispatch produces JSONL transcripts under `~/.claude/projects/<encoded-cwd>/`. The structure maps almost 1:1 onto the PRD's task / log-event model. v1 reads those transcripts directly and exposes them to the UI via a Vite dev middleware.

This is not fixture-backed — it is a real (if narrow and dev-only) observability surface for the work happening in this repo right now. When the standalone API server lands (per PRD §7), the middleware migrates to that process and the client hooks point at it instead. The client-side contract stays stable across the migration.

### Out of scope for this node

- UI panels (those are `04-tasks`, `05-logs`, `07-replay`).
- Task execution, scheduling, dispatch, or any *control* of the orchestration substrate.
- Cross-repo aggregation — transcripts from other repos under the same operator are filtered out.
- Standalone API server (deferred to a Phase-1 backend node when ready).
- LangGraph checkpoint state restoration (`07-replay`'s territory; deferred).
- Persisting derived data — every request rescans the filesystem; no database.
- Authentication / multi-user — single-operator (PRD §13).
- Production-mode parity — `pnpm build` ships an SPA without the middleware; the panels render an honest empty state.

---

## Design

### Data sources

Claude Code writes per-session JSONL transcripts to:

```
~/.claude/projects/<encoded-cwd>/
  <sessionId>.jsonl                  # main session log
  <sessionId>/
    subagents/
      agent-<id>.jsonl               # sub-agent transcript
      agent-<id>.meta.json           # sub-agent metadata
```

`<encoded-cwd>` is the absolute cwd with `/` replaced by `-`. For this repo: `-Users-dennis-code-ledger`. The server computes this at startup from `process.cwd()`.

Sub-agent `.meta.json` fields observed against Claude Code `2.1.148`:

- `agentType` — Claude Code's internal classifier (`general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`).
- `worktreePath` (optional) — present when the sub-agent ran in an isolated worktree.
- `description` — operator-provided summary, e.g., `"Implement 08-markdown node"`.
- `toolUseId` — links back to the spawning `Agent` tool_use in the parent JSONL.

### JSONL line types

Each line is a JSON object with a top-level `type` field. Observed top-level types across this repo's 13 transcripts (Claude Code `2.1.148`):

| Type | Maps to |
|---|---|
| `assistant` | `reasoning` and/or `tool_call` events (one per `content[]` block) |
| `user` | `tool_result` event when content is a `tool_result` block; otherwise skipped (operator input is not a log event) |
| `ai-title` | consumed by Task title derivation (see D14); not emitted as a `LogEvent` |
| `last-prompt` | skipped — Claude Code internal |
| `file-history-snapshot` | skipped — superseded by tool_result-derived artifacts |
| `attachment` | skipped (inner `attachment.type` values observed: `task_reminder`, `skill_listing`, `deferred_tools_delta`, `date_change` — all internal Claude Code metadata) |
| `system` | see subtype table below |
| `queue-operation` | skipped — Claude Code internal queue state |
| `permission-mode` | skipped — Claude Code permission-system state |

`system.subtype` values observed:

| Subtype | Maps to |
|---|---|
| `local_command` | `status_change` event |
| `api_error` | `error` event |
| `turn_duration` | skipped — internal timing |
| `away_summary` | skipped — internal |

The parser **must accept unknown top-level `type` values** and skip them with a once-per-kind warning. JSONL schema is internal to Claude Code and not a stable contract — see D10.

### Parser-side field mappings

The JSONL field names don't always match the `LogEvent` type field names. Bridges the parser applies:

- `tool_result` content blocks use `is_error: boolean` (no `status` field). The parser sets `status = is_error ? "error" : "ok"`.
- `tool_result.content` is a string or an array of content blocks. The parser stringifies it to `body`.
- `durationMs` is derived: timestamp of the `tool_result` line minus timestamp of the matching `tool_call`'s assistant line. Undefined when timestamps are missing.
- Each top-level line has its own `uuid` (used as `LogEventId`) and `timestamp` (used as `at`).

### Types (`src/lib/types.ts`)

All exported from the existing type-only module. The file is DOM-free and imported by both `app/src/` (client) and `app/server/` (Node).

```ts
export type TaskId = string;

export type TaskType =
  | "spec_draft" | "spec_review" | "implement" | "verify"
  | "doc_refactor" | "issue_triage" | "human_review"
  | "reverify" | "project_status_review"
  | "operator_session"   // main human-driven Claude Code session (D2)
  | "agent_task";        // sub-agent whose description doesn't match a specific lifecycle type (D2)

export type TaskStatus =
  | "PENDING" | "RUNNING" | "BLOCKED"
  | "AWAITING_HUMAN_REVIEW" | "COMPLETE" | "FAILED" | "CANCELLED";

export type TaskSource = "agent_generated" | "operator_injected" | "daemon_triggered";

/**
 * Resource claim — phase-1 these are descriptive (derived from observed tool calls),
 * not prescriptive (declared upfront and enforced by the runner). See D8.
 */
export type ResourceClaim =
  | { kind: "node"; nodeId: NodeId; mode: "read" | "write" }
  | { kind: "path"; path: string; mode: "read" | "write" };

export interface Task {
  id: TaskId;
  type: TaskType;
  status: TaskStatus;
  title: string;
  source: TaskSource;
  parentTaskId?: TaskId;
  dependsOn: TaskId[];
  resourceClaims: ResourceClaim[];
  agent?: { model: string; persona?: string };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  reviewPayload?: { summary: string; diffRef?: string };
  /** Absolute path to the source JSONL on disk. Server-internal; never rendered in the UI. */
  transcriptPath: string;
}

export type LogEventId = string;
export type ConnectionStatus = "stub" | "live" | "ended" | "missing";

export interface BaseLogEvent {
  id: LogEventId;
  taskId: TaskId;
  at: string;        // ISO 8601
  seq: number;       // monotonic per task
}

export type LogEvent = BaseLogEvent & (
  | { kind: "reasoning"; text: string; subkind: "thinking" | "message" }
  | { kind: "tool_call"; callId: string; toolName: string; arguments: string /* serialized JSON */ }
  | { kind: "tool_result"; callId: string; status: "ok" | "error"; body: string; durationMs?: number }
  | { kind: "artifact"; artifactKind: "doc_created" | "doc_updated" | "file_written" | "version_committed";
      path: string; docNodeId?: NodeId; summary?: string }
  | { kind: "status_change"; from: TaskStatus; to: TaskStatus; reason?: string }
  | { kind: "error"; message: string; stack?: string }
);
```

### Task derivation

For each scanned transcript:

**Main session (`<sessionId>.jsonl`):**

| Field | Source |
|---|---|
| `id` | `session:<sessionId>` |
| `type` | `operator_session` |
| `title` | derived per D14: most recent `ai-title` line's `aiTitle` field if any; else first user prompt that has `isMeta !== true`, content is a string (not a list/tool_result), and does not start with `<command-name>`, truncated to 80 chars; else `"Operator session <short-id>"` |
| `source` | `operator_injected` |
| `agent` | `{ model: <observed model from first assistant line>, persona: "operator" }` |
| `parentTaskId` | undefined |
| `dependsOn` | `[]` |
| `resourceClaims` | derived (see below) |
| `createdAt` | timestamp of first line |
| `startedAt` | same as `createdAt` |
| `completedAt` | timestamp of last line when status is `COMPLETE`; else undefined |

**Sub-agent (`<sessionId>/subagents/agent-<id>.jsonl`):**

| Field | Source |
|---|---|
| `id` | `agent:<id>` |
| `type` | inferred from `meta.description` via the keyword table below |
| `title` | `meta.description` |
| `source` | `agent_generated` |
| `parentTaskId` | `session:<sessionId>` |
| `dependsOn` | `[]` (no inter-agent deps inferred in Phase-1) |
| `resourceClaims` | derived from observed tool calls + a `path/write` claim on `meta.worktreePath` if present |
| `agent` | `{ model: <observed model>, persona: meta.agentType }` |

**Sub-agent task-type inference (D2 keyword table):**

| Match (case-insensitive, leading 40 chars of `description`) | Inferred type |
|---|---|
| `Implement`, `Implementation of` | `implement` |
| `Spec review`, `Review spec`, `Review draft`, `SPEC_REVIEW` | `spec_review` |
| `Implementation review`, `Review implementation`, `Verify`, `Verification of` | `verify` |
| `Draft`, `Author spec`, `Author DRAFT`, `Spec draft` | `spec_draft` |
| `Refactor`, `Doc refactor` | `doc_refactor` |
| `Triage`, `Investigate`, `Diagnose` | `issue_triage` |
| `Re-verify`, `Reverify` | `reverify` |
| (anything else) | `agent_task` |

The table is hardcoded in `app/server/transcriptParse.ts` and is expected to evolve.

### Resource-claim derivation

Phase-1: **descriptive, not prescriptive** — derived from observed tool calls (D8).

- `Read` tool_result → `node`-claim with `mode: "read"` if path resolves to a `DocNode` via `idForPath`; else `path`-claim.
- `Write` / `Edit` / `MultiEdit` / `NotebookEdit` tool_result with `status: "ok"` → claim with `mode: "write"`, same resolution.
- Sub-agent `meta.worktreePath` → `{ kind: "path", path, mode: "write" }`.
- `Bash` tool calls are not inspected for claims — D6 rationale.

Claims are deduplicated per `(kind, target, mode)` pair before being attached to the `Task`.

### Status derivation (D5)

| Condition (evaluated in order) | Status |
|---|---|
| File mtime within last 5 s | `RUNNING` |
| File quiet ≥ 5 s AND last entry is an `assistant` line WITH pending `tool_use` (no matching `tool_result` seen) | `RUNNING` — the model is waiting for tool execution, not the operator |
| File quiet ≥ 5 s AND last entry is an `assistant` line with no pending tool_use | `AWAITING_HUMAN_REVIEW` |
| File quiet ≥ 30 min | `COMPLETE` |
| (Else; quiet 5 s – 30 min, last entry is `user` tool_result) | `RUNNING` — model preparing next turn |

`FAILED` and `CANCELLED` are reserved for the eventual task runner and are not derived from transcripts in v1.

Both thresholds are tunable via env vars (`LEDGER_RUNNING_WINDOW_S=5`, `LEDGER_COMPLETE_WINDOW_S=1800`) with defaults compiled in. Restart of the dev server reloads them.

### Artifact derivation (D6)

For each successful `Write` / `Edit` / `MultiEdit` / `NotebookEdit` tool_result:

- `path` = `arguments.file_path`.
- `docNodeId` = `idForPath(path)` or undefined.
- `artifactKind`:
  - `MultiEdit` or `Edit` on existing file → `doc_updated` if `docNodeId` set, else `file_written`.
  - `Write` to non-existing file → `doc_created` if `docNodeId` set, else `file_written`.
  - `Write` to existing file → `doc_updated` / `file_written` per the same rule.
- `summary` = first 80 chars of the tool args' description-bearing field if present.

`MultiEdit` produces **one** `artifact` event per call (one path) — see Open Issues.

`version_committed` is reserved for the doc-versioning node and is not emitted by v1.

### File layout

```
app/
  server/                                 # NEW — dev-middleware code
    transcriptScan.ts                     # list sessions + sub-agents under repo-root-encoded dir
    transcriptParse.ts                    # JSONL line → LogEvent[]
    transcriptStatus.ts                   # mtime + last-entry → TaskStatus
    deriveTask.ts                         # full transcript → Task with claims/agent/timing
    middleware.ts                         # Vite configureServer plugin
    __fixtures__/
      sample-session.jsonl                # NEW — pinned Claude Code 2.1.148 sample for golden tests
  src/
    lib/
      types.ts                            # extend with Task, LogEvent, ResourceClaim, etc.
      useTaskList.ts                      # TanStack Query: GET /api/transcripts
      useTask.ts                          # TanStack Query: GET /api/transcripts/:id
      useLogStream.ts                     # TanStack Query + EventSource
  tsconfig.json                           # composite root (unchanged)
  tsconfig.app.json                       # client config (unchanged)
  tsconfig.node.json                      # extend `include` to add `./server/**/*.ts`; add `"types": ["node"]`
  vite.config.ts                          # imports middleware from ./server/middleware
```

Server code joins the existing `tsconfig.node.json` (which already targets node and currently includes only `vite.config.ts`). No new tsconfig file. Adds one dev dep: `@types/node`.

### Wire format

All endpoints under `/api/`. JSON bodies; SSE for streams.

**`GET /api/transcripts`** — list all tasks for this repo.

```ts
type ListResponse = { tasks: Task[] };
```

**`GET /api/transcripts/:taskId`** — one task + its full historical log events.

```ts
type GetResponse = { task: Task; events: LogEvent[] };
```

Returns `404` when the task id isn't found in the current scan.

**`GET /api/transcripts/:taskId/stream`** — SSE that emits new `LogEvent`s as the underlying JSONL grows.

```
id: <seq>
data: {"id":"...","taskId":"...","at":"...","seq":N,"kind":"...", ...}

```

- A heartbeat comment line (`: ping\n\n`) is emitted every 15 s to keep proxies from closing the connection.
- Connection auto-closes when the source file has been unmodified for 60 s **and** task status is `COMPLETE`.
- The `id:` field carries the event's `seq`. On reconnect with `Last-Event-ID: <N>`, the server **re-parses the JSONL from line 0 and skips events with `seq ≤ N`**, then begins streaming. Simpler than maintaining an in-memory ring buffer; performant for current file sizes (largest observed transcript is ~2 MB, ~3000 lines, sub-100 ms re-parse).

### Client hooks

```ts
function useTaskList(): UseQueryResult<Task[]>;

function useTask(id: TaskId): UseQueryResult<{ task: Task; events: LogEvent[] }>;

interface UseLogStreamResult {
  events: LogEvent[];             // initial batch + streamed deltas
  status: ConnectionStatus;       // "live" | "ended" | "missing" | "stub"
  reconnectAttempt: number;
}
function useLogStream(taskId: TaskId): UseLogStreamResult;
```

`useLogStream` combines an initial `useTask` fetch with an `EventSource` opened on the same task's `/stream`. The hook returns:

- `status: "missing"` when the initial fetch 404s.
- `status: "live"` while the EventSource is OPEN.
- `status: "ended"` when the SSE closes cleanly (server signaled task `COMPLETE`).
- `status: "stub"` is reserved for unit-test / Storybook contexts that hand-feed events.

`reconnectAttempt` increments each time the EventSource reconnects; useful for UI hints ("reconnecting…").

### Production behavior (D11)

`pnpm build` produces a static SPA. No middleware runs. The hooks gracefully degrade:

- `useTaskList()` returns `[]` when `/api/transcripts` 404s.
- `useTask()` returns `status: "missing"`.
- `useLogStream()` returns `status: "missing"`.

The 04-tasks and 05-logs panels render an explicit empty state:

> This panel observes local Claude Code transcripts via the dev server. Run `pnpm dev` to enable.

Routes stay registered. Operator confirmed (this conversation, 2026-05-24) that production builds are out of scope today; the empty state is the honest behavior.

### Manual acceptance check

Operator runs `pnpm -C app dev`. Once `04-tasks` and `05-logs` ship, all of these are verifiable; until then, the infra node's acceptance is verified via `curl` against `/api/*` and via the unit tests below.

1. `curl http://localhost:4179/api/transcripts` returns a JSON array of every session + sub-agent task in this repo. Each entry has all required `Task` fields.
2. `curl http://localhost:4179/api/transcripts/session:<currentSessionId>` returns the current conversation's `Task` + full `LogEvent[]`.
3. `curl -N http://localhost:4179/api/transcripts/session:<currentSessionId>/stream` blocks; typing a new prompt into Claude Code emits new `data:` lines on the SSE within 1 s.
4. Killing the curl and reconnecting with `-H "Last-Event-ID: <last-seq>"` resumes at the next event (no duplicates).
5. `curl http://localhost:4179/api/transcripts/agent:<knownAgentId>` returns a sub-agent task with `parentTaskId` set and `resourceClaims` containing the worktree path.
6. Transcripts from other repos do not appear (verifiable by listing `~/.claude/projects/` and confirming exclusion).
7. The 5 s status window: a `touch`ed JSONL flips its task to `RUNNING` for 5 s, then settles back to `AWAITING_HUMAN_REVIEW` or `COMPLETE` per the rules.
8. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Vite dev middleware lives in `app/server/`, not a separate package | The middleware is dev-only; PRD §7's real API server is a separate (much larger) effort that will introduce the monorepo split. `01-ui/00-ui.md` D8: defer monorepo split until the backend package exists. Dev-time tooling is not a backend package. |
| D2 | `TaskType` enum extends PRD's set with `operator_session` and `agent_task` (fallback); sub-agent type inference uses a hardcoded keyword table on `meta.description` | PRD §6.3 enumerates task types for the eventual orchestration substrate. The current manual workflow produces sessions (no clean PRD match) and sub-agents whose descriptions only sometimes match the PRD lifecycle types. `operator_session` is honest for the human-driven main convo; `agent_task` is the honest fallback for unrecognized descriptions. The keyword table is coarse but predictable and easy to tune. |
| D3 | Real transcript ingestion in v1, not fixture-backed | Earlier design rounds considered a canned fixture for parity with `06-health`'s Phase-1 strategy. With Claude Code already emitting structured JSONL containing every PRD-relevant data point, the fixture would be theater. Real ingestion is bigger v1 scope but real value — the operator dogfoods the panel against the current session immediately. |
| D4 | Filter transcripts by `cwd` to this repo only | The operator runs Claude Code across many projects. The first `cwd`-bearing line of each JSONL identifies the source repo; cross-repo transcripts are filtered out. Eliminates clutter and a small privacy surface. |
| D5 | Status derivation uses mtime windows + last-entry-kind | No real status signal exists in transcripts. The 5 s mtime window catches "currently active" reliably (Claude Code writes within sub-second of any model emission). The "last entry has unmatched `tool_use`" distinction separates "waiting for tool" from "waiting for human" — the latter is the leaf-workflow stage-8 equivalent. The 30-min `COMPLETE` threshold is heuristic and explicitly soft (sessions can resume). |
| D6 | Artifact derivation from successful `Write` / `Edit` / `MultiEdit` / `NotebookEdit` tool_results only; `MultiEdit` emits one event per call | Phase-1 honest derivation. `Bash` is excluded because shell commands can produce arbitrary side effects we can't reliably attribute to specific paths. The lossy `MultiEdit` aggregation is the only meaningful imprecision; documented in Open Issues. |
| D7 | SSE for live tail, not WebSocket | `01-ui/00-ui.md` Open Issue tentatively prefers SSE-only for streams. Log streams are append-only — SSE's unidirectional semantics fit. `EventSource` has built-in reconnect with `Last-Event-ID` support. No upstream messages needed on this channel. |
| D8 | Resource claims are descriptive (derived after the fact from observed tool calls), not prescriptive (declared and enforced upfront) | The PRD's resource-claim model (§6.3) requires tasks to *declare* claims before execution; the runner enforces them. We have no runner. Descriptive claims are still useful for forensic queries (UC14: "what did this task touch?"). When the runner lands, declared claims replace derived ones; the consumer-facing type stays the same. |
| D9 | Server code joins the existing `tsconfig.node.json`; no new tsconfig file | The repo's `tsconfig.json` is a composite root with `references` to `tsconfig.app.json` (client) and `tsconfig.node.json` (node, currently `vite.config.ts` only). Server modules target node — they belong with `tsconfig.node.json`. Adds `./server/**/*.ts` to its `include` and `@types/node` as a dev dep. Pure type files (`src/lib/types.ts`) are DOM-free and imported by both configs via project references. |
| D10 | Pin JSONL schema observation to Claude Code `2.1.148`; defensive parser accepts unknown line and content types | JSONL is an internal Claude Code format with no stability guarantee. The parser logs unknown types/blocks once per unique kind and skips them rather than failing. The pinned version is recorded in Verification as the contract for v1. |
| D11 | Production builds render an honest empty state; routes stay registered | The middleware is dev-only. Operator confirmed (2026-05-24) that production builds are out of scope today. Pulling the routes from production would create dev/prod divergence; the honest empty state is preferable. |
| D12 | Privacy disclosure: transcripts may contain secrets, file contents, pasted credentials. Single-operator local-only context (PRD §13) makes this acceptable. Middleware never serves to anything outside localhost | Worth being explicit. If the panel ever becomes networked (real API server with auth), the threat model changes. |
| D13 | `ResourceClaim` is a discriminated union of `node` (doc-node) and `path` (free-form) | Sub-agent worktree paths and non-doc tool targets don't map to `NodeId`. A discriminated union keeps the type single-field and type-safe at every boundary. Alternative considered: a parallel `pathClaims: string[]` on `Task` — rejected as more surface for the same information. |
| D14 | Task title is derived from the most recent `ai-title` JSONL line's `aiTitle` field when present; else the first qualifying user prompt | `ai-title` is Claude Code's own session-titling heuristic (verified: top-level type `{ type: "ai-title", aiTitle, sessionId }`, 190 occurrences across 13 sessions). Always available for non-trivial sessions and pithier than a raw first prompt. The fallback handles edge cases (very fresh sessions before the first `ai-title` is emitted). The qualifying-prompt filter (string content, no `<command-name>` prefix, `isMeta !== true`) prevents slash-command invocations from leaking into titles. |
| D15 | Repo root derived from `git rev-parse --show-toplevel` at dev-server boot, cached for the process lifetime | `process.cwd()` depends on where `pnpm dev` was invoked; running from a subdirectory misses the encoded-cwd lookup. `git rev-parse` is always correct, zero-dep (already required for the repo), fail-fast outside a git repo. |

---

## Open Issues

- **JSONL schema drift.** Claude Code's transcript format is internal and may change with version. v1 parser is observed against `2.1.148`. Mitigation: parser logs unknown types/blocks once-per-kind and skips them; a golden test runs against a committed sample JSONL. Long-term fix: when the real API server lands, transcripts are replaced by typed event streams from the runner. *(Priority: MEDIUM.)*
- **`AWAITING_HUMAN_REVIEW` false positives.** Operator types slowly → status flips. The 5 s default is short. Mitigation: env var override (`LEDGER_RUNNING_WINDOW_S`). Tune after dogfooding. *(Priority: LOW.)*
- **Sub-agent task-type inference miss rate.** D2's keyword table covers conventional descriptions but anything outside that vocabulary defaults to `agent_task`. The 04-tasks panel will surface the raw description so the operator can see the underlying intent. *(Priority: LOW.)*
- **`MultiEdit` artifact granularity.** Each `MultiEdit` against N hunks of one file emits one artifact event. Hunk-level detail is lost. Acceptable for Phase-1; revisit when the API server defines the artifact contract. *(Priority: LOW.)*
- **Resource-claim derivation gaps.** Tools like `Bash` and `WebFetch` can read/write arbitrary paths the parser can't reliably attribute. Those tool calls become opaque events with no claim derived. *(Priority: LOW.)*
- **"Soft COMPLETE."** The 30-min quiet threshold can flip a session COMPLETE that the operator later resumes. UI consumers should treat COMPLETE as informational, not terminal. `useTaskList` re-derives on each refetch. *(Priority: LOW.)*
- **Stage-8 finding: linked-worktree dev server sees no transcripts.** D15 specifies `git rev-parse --show-toplevel` for repo-root resolution. Inside a linked worktree (the standard leaf-workflow implementer environment), that command returns the *worktree's* path, not the main repo's, so the encoded-cwd lookup misses entirely (`/api/transcripts` returns an empty list). Discovered during stage-8 manual verification on this very worktree. Fix: use `git worktree list --porcelain` and read the first `worktree <path>` line — that's always the main worktree regardless of the caller's location. *(Priority: HIGH — blocks the panel's primary use case any time it's invoked from a worktree, which is most of the time during framework development.)*

---

## Spec Review (2026-05-24)

Independent spec review was run against this DRAFT in clean context. Verdict: NEEDS_MINOR_REVISIONS — two should-fix items grounded in JSONL ground-truth discrepancies, eight nits including two open issues the DRAFT had left unresolved. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | JSONL line-types table inaccurate. Reviewer correctly identified that `task_reminder`, `skill_listing`, `deferred_tools_delta`, `date_change` live inside `attachment.type`, not as top-level types. (Reviewer was partly wrong: `ai-title` and `last-prompt` ARE top-level types — verified independently via JSON-parsed tally across all 13 sessions in this repo: 1458 `assistant`, 1041 `user`, 190 `ai-title`, 182 `last-prompt`, 147 `file-history-snapshot`, 131 `attachment`, 87 `system`, 40 `queue-operation`, 19 `permission-mode`. The original DRAFT also missed `queue-operation` and `permission-mode` entirely.) Replaced the line-types table with the verified observation; added the inner-`attachment.type` enumeration in the same row. |
| S2 | `tool_result` content blocks use `is_error: boolean`, not `status: "ok" \| "error"`. `durationMs` has no direct counterpart in JSONL — it's derived from timestamps. Added §"Parser-side field mappings" subsection documenting both bridges. |
| N1 | `system` subtypes coverage was too narrow. Observed across all sessions: `local_command`, `turn_duration`, `away_summary`, `api_error`. Added a subtype table; `api_error` maps to `error` LogEvent kind. |
| N2 | "First non-meta user prompt" filter was insufficient — slash-command invocations like `<command-name>/clear</command-name>` would slip through `isMeta: false`. Filter refined and absorbed into D14 below (string content, no `<command-name>` prefix, plus the `isMeta` check). |
| N3 | Open Issue "Title derivation truncation" was left "to resolve in spec review" without a decision. New D14: prefer the most recent `ai-title` line's `aiTitle` field; fall back to the qualifying first user prompt. Verified shape: `{ type: "ai-title", aiTitle: "...", sessionId: "..." }`. Open Issue removed. |
| N4 | Open Issue "process.cwd() vs encoded directory" left unresolved. New D15: derive repo root from `git rev-parse --show-toplevel`, cached at boot. Open Issue removed. |
| N5 | tsconfig design was wrong — the repo's `tsconfig.json` is a composite root with `references` (to `tsconfig.app.json` + `tsconfig.node.json`), not a config with `compilerOptions`. D9 rewritten: server code joins the existing `tsconfig.node.json`; no new tsconfig file. Adds `@types/node` as a dev dep. File Layout diagram updated. |
| N6 | `ConnectionStatus = "stub"` is reserved for future Storybook integration. Kept; the in-type comment already documents the reservation. No code change. |
| N7 | Reviewer claimed `MultiEdit` uses `path` instead of `file_path`. **Not applied** — the SDK's `MultiEdit` schema uses `file_path` (consistent with `Edit` and `Write`). Implementer cross-checks at golden-test time; if reviewer is right, the parser switch is trivial. Audit kept for traceability. |
| N8 | Golden-test fixture `app/server/__fixtures__/sample-session.jsonl` was referenced in Verification but absent from File Layout. Added. |
| OI-3 | "SSE reconnect state recovery" needed an implementation strategy before APPROVED. Resolved: server **re-parses JSONL from line 0 and skips events with `seq ≤ Last-Event-ID`**. Simpler than an in-memory ring buffer; performant for current file sizes. Documented in §Wire format. Open Issue removed (was MEDIUM). |

Two findings (S1 partial overreach on `ai-title`/`last-prompt`, and N7 on `MultiEdit` field name) are noted in the audit but not blindly applied — both contradict ground-truth verification done after the review. The reviewer's coverage of S1's core finding (`attachment` wrapping the named pseudo-types) was correct and is applied.

---

## Implementation Notes

**Dependencies added:**

- `vitest@^4.1.7` — dev dep, used for the golden test (`app/server/transcriptParse.test.ts`). Added a `test: "vitest run"` script in `app/package.json`. No prior test framework existed; this is the first. `@types/node` was already present in the baseline `package.json` and is not a new dependency.

**Decisions beyond spec:**

- **`app/server/serverIdForPath.ts` is a separate node-side copy of `idForPath`, not a re-import.** `parseDocs.ts` is a client module (uses Vite's `import.meta.glob`) and cannot be imported into the server tsconfig. The duplication is ~40 lines and the contract is the same; documented at the top of the file. Replace with a shared utility module when the API server lands.
- **Vitest config inferred from defaults.** No `vitest.config.ts` added; the golden test runs against the default `app/` root via the `test` script. If we later add browser/JSDOM tests this becomes structural.
- **`KEYWORD_TABLE` ordering bug surfaced during test.** The original ordering put `^implement` before `^implementation review`; "Implementation review for 03-docs" resolved to `implement` instead of `verify`. Reordered to evaluate more-specific patterns first; added a comment in `transcriptParse.ts` documenting the precedence rule. Spec's D2 keyword table is unchanged — same patterns, just an evaluation-order constraint not previously called out.
- **Three lint deviations applied while resolving `@typescript-eslint/no-unnecessary-condition` and `no-unnecessary-type-assertion`** in `transcriptParse.test.ts`: replaced `.filter(...)`+inline-narrowing patterns with `.flatMap((e) => (e.kind === "X" ? [e] : []))` which preserves discriminated-union narrowing in the result type. No behavioural change.

**Bundle delta vs baseline commit `eebc3c3`** (main `dist/` from 2026-05-23 23:54):

| Asset | Baseline | This build | Delta |
|---|---|---|---|
| `index-*.js` (uncompressed) | 986,086 B | 1,021,760 B | +35,674 B (+3.6 %) |
| `index-*.js` (gzip) | — | 328.17 kB | — |
| `index-*.css` (uncompressed) | 40,920 B | 40,944 B | +24 B (+0.1 %) |
| `index-*.css` (gzip) | — | 8.06 kB | — |

JS growth is `@tanstack/react-query` pulled into the active tree (it was already a dep but had no consumer until this node). The chunk-size warning (>500 kB) was already present in the baseline and unchanged by this node.

**Acceptance check items NOT verifiable in headless environment (manual):**

- **#1** `curl /api/transcripts` returns every session + sub-agent — needs `pnpm dev` and a transcript directory.
- **#2** `curl /api/transcripts/session:<currentSessionId>` for current convo — same.
- **#3** SSE emits new `data:` line within 1 s of a JSONL append — requires the live dev server.
- **#4** SSE reconnect via `Last-Event-ID` — same.
- **#5** Sub-agent task with `parentTaskId` and worktree-path claim — same.
- **#6** Cross-repo transcripts excluded — same.
- **#7** Status-window transitions (RUNNING → AWAITING_HUMAN_REVIEW → COMPLETE) — same.

**Items verified headlessly in this environment:**

- **#8** `pnpm -C app typecheck` exits 0.
- **#8** `pnpm -C app lint` exits 0 with `--max-warnings=0`.
- **#8** `pnpm -C app build` exits 0; produces dist with the bundle sizes above.
- Golden test (`pnpm -C app test`): **34/34 passed**, including the D2 keyword-table coverage (every row) and the six-LogEvent-kinds emission check against the committed Claude Code 2.1.148 fixture.

**Deviations from spec:** Only the keyword-table ordering noted above (constraint added to the implementation, not a doc-level deviation). All other behavior matches the spec.

### Implementation Review (2026-05-24)

Independent implementation review was run against this worktree (no rebase needed — base equalled main HEAD). Verdict: NEEDS_MINOR_REVISIONS (1 blocking, 1 should-fix, 2 nits). All applied:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | First SSE event (seq=0) dropped on every fresh connection because `lastSeq` defaulted to `0` and the predicate is `seq > lastSeq`. | `middleware.ts` initializes `lastSeq = -1` when no `Last-Event-ID` header is present and only updates from the header when `parseInt` returns a finite number. seq=0 now ships on first connection; reconnects with `Last-Event-ID: <N>` correctly skip `seq ≤ N`. |
| S1 | `artifact` LogEvents were never emitted despite §"Artifact derivation (D6)" calling for them and the kind being present in the `LogEvent` union. | Added `artifactFromToolCall` to `transcriptParse.ts`; expanded `pendingToolCalls` to retain tool name + args alongside the call timestamp; on successful `tool_result` for Write/Edit/MultiEdit/NotebookEdit, an `artifact` event is appended after the `tool_result`. `Write` → `doc_created`/`file_written`; Edit/MultiEdit/NotebookEdit → `doc_updated`/`file_written`. Doc-node resolution via `serverIdForPath`. Added a golden-test assertion that the fixture's Write produces ≥1 artifact event (35/35 tests pass). |
| N1 | Bundle-delta numbers in Implementation Notes were inaccurate (+32,017 B claimed vs +35,674 B measured) and `@types/node` was incorrectly listed as newly added. | Bundle-delta table refreshed from a clean rebuild post-fixes. `@types/node` claim removed; only `vitest` is genuinely new. |
| N2 | `useLogStream` initial `connStatus: "missing"` collides with the spec's definition (404 only, not "query pending"). | Not applied. The spec is silent on the pending-query state and no consumer exists yet. Documenting here as a known minor surface — `04-tasks`/`05-logs` will refine this when they wire the hook. |

**Final headlessly-verified results after fixes:**

- `pnpm -C app typecheck`: exit 0
- `pnpm -C app lint`: exit 0
- `pnpm -C app build`: exit 0; bundle sizes match the refreshed table above
- `pnpm -C app test`: 35/35 passed (was 34/34; +1 for the artifact assertion)

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–8) passes.
2. `transcriptScan` lists every JSONL under `~/.claude/projects/<encoded-cwd>/` whose first `cwd`-bearing entry resolves under `/Users/dennis/code/ledger`. Other repos' transcripts are excluded.
3. `transcriptParse` produces a valid `LogEvent[]` for every JSONL in the sample set without throwing, including transcripts containing unknown line types (`ai-title`, `last-prompt`, `task_reminder`, `skill_listing`, `deferred_tools_delta`, `date_change`).
4. `deriveTask` returns a `Task` with non-empty `id`, `type`, `title`, `status`, `createdAt`, `transcriptPath` for every scanned transcript.
5. Sub-agent task-type inference produces the expected type for each row in the D2 keyword table (table-driven test).
6. Status derivation: a freshly-`touch`ed file returns `RUNNING`; an idle file with last entry as a tool_use-bearing assistant message returns `RUNNING`; an idle file with last entry as a plain assistant message returns `AWAITING_HUMAN_REVIEW`; a file last modified > 30 min ago returns `COMPLETE`.
7. SSE: connecting to `/api/transcripts/:id/stream` and appending a JSONL line to the source file emits a `data:` line on the SSE within 1 s.
8. SSE reconnect: closing the EventSource and reopening with `Last-Event-ID: <seq>` resumes at `seq + 1` without re-emitting earlier events.
9. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` all exit zero. Bundle delta vs main reported in Implementation Notes.
10. No regressions: `/dag`, `/docs`, `/health` continue to render correctly. `idForPath` (re-used from `parseDocs.ts`) still resolves correctly.
11. Pinned schema: parsing a committed sample JSONL from Claude Code `2.1.148` produces the expected `LogEvent` sequence (golden test). The sample lives at `app/server/__fixtures__/sample-session.jsonl`.

---

## Children

None.
