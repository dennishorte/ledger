# Agent Dispatcher

**Node ID:** `06-agent-dispatcher`
**Parent:** project root (`docs/00-project.md`)
**Status:** DRAFT
**Created:** 2026-05-28
**Last Updated:** 2026-05-28

**Dependencies:** `05-task-runner`

---

## Requirements

Land the **agent dispatch layer** that fills `05-task-runner`'s unregistered executor slots with real work. Today every task type other than `noop` and `human_review` sits `BLOCKED` with reason `blocked_no_executor` (PRD §11 inheritance note in `05-task-runner/00-task-runner.md` D8). This node registers executors for `implement`, `spec_review`, `verify`, `spec_draft`, `reverify`, `doc_refactor`, `issue_triage`, and `project_status_review` against the runner, turning the runner from a synthetic dogfooding substrate into the control surface that drives Claude Code.

PRD §5 commits to an **MCP-based integration**: *"the dispatch interface should be defined as an MCP-compatible protocol so any agent runtime can be substituted."* Claude Code is the first integration target. The dispatcher exposes an **MCP server** as part of the existing Hono process; dispatched Claude Code subprocesses connect to it as MCP clients via streamable-HTTP transport, calling runner-provided tools to emit events, declare resource claims, request human review, and complete or fail their assigned task. The agent's tool calls become first-class `LogEvent` rows in the runner's events table — the same events the SSE log stream surfaces — so the descriptive observability of `01-ui/10-orchestration`'s transcript bootstrap is now fed by a prescriptive control flow.

This is the **first integration node**: it mounts onto `05-task-runner`'s `registerExecutor(type, fn)` API and onto `04-api-server`'s Hono app. Downstream `07-health-daemon` will enqueue `doc_refactor` / `reverify` / `issue_triage` tasks that this node's executors then actually execute. Without this node, the daemon's enqueued tasks would sit `BLOCKED` forever and the runner has no real control over Claude Code.

The end-state contract — what "this node done" looks like across all children:

1. **An MCP server mounted at `POST /mcp` on the existing Hono app** (`04-api-server`). Streamable-HTTP transport (`@modelcontextprotocol/sdk`). The server is `127.0.0.1`-bound — same firewall posture as the rest of the API (D5). Tool registry exposes the runner-tool surface (item 2); resource and prompt registries are empty in v1 (D6).
2. **Five MCP tools exposed to connected agents** (`runner.emit_event`, `runner.complete_task`, `runner.fail_task`, `runner.await_human_review`, `runner.get_task`). Each tool's first argument is `task_id`; the dispatcher rejects calls whose `task_id` does not match the connection's bound task (D7). Tool handlers are thin adapters over `RunnerHandle` from `05-task-runner/02-scheduler`; they do not invent new transitions.
3. **A `ClaudeCodeExecutor` registered for the eight real task types.** The executor spawns `claude` as a subprocess with a constructed prompt, an injected `--mcp-config` JSON pointing at the runner's MCP endpoint, a `LEDGER_TASK_ID` env var, and the project root as cwd. The subprocess streams its work; the agent's MCP tool calls flow back to the runner. On clean subprocess exit the executor verifies terminal task status (and fails the task with reason `subprocess_exit_without_terminal_status` if the agent forgot to call `complete_task` or `fail_task`); on non-zero exit the executor fails the task with the subprocess's stderr tail; on crash the runner's existing orphan-recovery handles it (D9).
4. **Per-task-type prompt templates.** A small library of templates under `server/src/dispatcher/prompts/`, one per task type. Each template composes: persona preamble (matches the persona-specific guidance from `docs/process/leaf-workflow.md`), task-doc context (the spec being implemented / reviewed / verified, plus its parent doc), required-reading manifest, success criteria, and the MCP-tool contract reminder. Templates are TypeScript functions taking `(task, projectCtx) => string`; no string-interp templating language (D10).
5. **Three new HTTP endpoints** on the existing Hono server. `POST /api/dispatch/:nodeId` — operator-facing "dispatch this doc node" action that synthesises a task from the node's lifecycle state (an `APPROVED` node → `implement` task; a `VERIFY` node → `verify` task; a `DRAFT` node → `spec_review` task). `POST /api/tasks/:id/cancel` — kills the in-flight subprocess for a `RUNNING` dispatcher task and transitions the task `RUNNING → CANCELLED` with reason `cancelled_by_operator`. `POST /mcp` — the MCP server endpoint itself (item 1).
6. **UI surfaces: dispatch action + cancel action.** `01-ui/02-dag`'s `NodeInspector` gains a "Dispatch" button on `APPROVED` / `VERIFY` / `DRAFT` doc nodes that POSTs to `/api/dispatch/:nodeId` and surfaces the created task ID in a toast. `01-ui/04-tasks`'s `TaskInspector` gains a "Cancel" button on `RUNNING` runner-emitted tasks (gated by the same `id.includes(":")` discriminant as the Approve/Reject buttons from `05-task-runner/05-ui-hook-migration`). No additive change to the log stream: events emitted by dispatcher executors arrive via the existing SSE channel from `04-api-endpoints`.
7. **Tests at every layer.** MCP server (handshake; tool invocation routes to the right handler; task-id bound enforcement; reject foreign task-id with a typed error). Tool handlers (each tool maps cleanly to `RunnerHandle` and the event log row matches). Executor (subprocess spawn args composed correctly; prompt contains all required context; clean exit + terminal status passes; clean exit + non-terminal status fails the task; non-zero exit fails the task with stderr tail; SIGKILL/crash leaves the task `RUNNING` for orphan recovery to catch). Endpoints (`POST /api/dispatch/:nodeId` synthesises tasks by lifecycle state; `POST /api/tasks/:id/cancel` kills subprocess + transitions task). UI hooks (dispatch button visibility gated on node status; cancel button visibility gated on runner-emitted ∧ RUNNING).

Decomposed into five sub-leaves per §Children. Each sub-leaf inherits this parent's Decisions and Open Issues, owns its own Spec Review + Implementation Review audit tables, and gates on its own Verification list. The five-leaf decomposition mirrors `05-task-runner`'s carve-up because the surface area is comparable: MCP transport, tool surface, executor, prompt library, and UI — five distinct concerns that a single-leaf implementer would risk under-specifying.

**Out of scope for v1:**

- **Retiring `01-ui/10-orchestration`'s transcript ingestion.** Operator preference (`/clear`-session decision, 2026-05-28): keep the transcript bootstrap live alongside dispatcher-emitted events. Rationale: transcript ingestion observes Claude Code runs *not* driven by the dispatcher (operator's ad-hoc CLI use, sub-agent dispatches from other terminals, the very conversation drafting this spec). Removing it would leave those runs unobserved. The additive merger from `05-task-runner/05-ui-hook-migration` continues unchanged. Full retirement is deferred to a future node when dispatcher-emitted events fully cover the operator's observability needs.
- **MCP server scope beyond the runner-tool surface.** No MCP resources (the agent reads doc files via its own `Read` tool, not via `runner.read_doc`). No MCP prompts (prompt templates are server-side; the agent receives the rendered prompt as its initial message, not as a discoverable MCP prompt). No MCP completions, sampling, or roots. The MCP server is a single-purpose RPC channel for runner control, not a general-purpose tool exposure.
- **Authentication on the MCP endpoint.** Same posture as the rest of the API surface (`04-api-server` D4, `05-task-runner` D13): `127.0.0.1`-bind, OS firewall is the perimeter, no tokens. The dispatcher injects no auth header into the MCP config it hands to subprocesses. Task-ID binding (D7) is an *integrity* guard, not an *authentication* guard — it prevents a subprocess from accidentally mutating its sibling's task; it does not prevent a malicious local process from calling tools against the same `task_id`.
- **Multiple concurrent agent runtimes.** v1 ships only `ClaudeCodeExecutor`. The MCP server is protocol-pure so a future `MetaGPTExecutor` or `OpenAIAgentExecutor` could mount the same tools — but those executors are not in scope. The PRD §5 "any agent runtime can be substituted" claim is *enabled* by this node, not *exercised* by it.
- **Streaming partial agent output to the runner.** The agent's reasoning and tool-call events are emitted by the agent calling `runner.emit_event` explicitly. v1 does not parse Claude Code's stdout/stderr or its transcript JSONL to auto-extract reasoning events. Agents that don't emit events appear as a single "started" event followed by a `complete_task` (or a failure) — the prompt template tells the agent to emit at every meaningful step.
- **Subprocess sandboxing / permission management.** The dispatched `claude` subprocess inherits the runner's filesystem permissions. It can read and write anywhere the API server can. v1 relies on Claude Code's own permission system (`.claude/settings.json` allowlists, the user's permission-mode setting) for blast-radius control. No additional jailing, no per-task chroot, no Docker.
- **Concurrent dispatches against the same node.** The runner's resource-claim conflict primitive (`05-task-runner/02-scheduler` D2) already prevents this at the task-runner level: two dispatcher tasks with overlapping write claims block each other via `blocked_by_claim_conflict`. The dispatcher's prompt templates declare claims (D11), so two `implement` tasks on the same node serialise correctly. No additional dispatcher-level dedup.
- **Pause / resume of a running dispatch.** `POST /api/tasks/:id/cancel` is terminal — it kills the subprocess and transitions to `CANCELLED`. Pause-and-resume would require Claude Code itself to support snapshot/restore, which it does not in `2.1.148`. Mid-flight `AWAITING_HUMAN_REVIEW` is the closest v1 analog (the agent calls `runner.await_human_review` and the subprocess exits cleanly; the operator reviews; on approve, a *follow-up* dispatch task is created — not a resume of the original).
- **Cost / token-budget enforcement.** PRD §13 explicit non-goal. The dispatcher passes no `--max-tokens` flag and tracks no cumulative cost. If Claude Code adds a per-invocation budget flag in a future release, plumbing it through the prompt-template config is ~10 LOC; not v1.
- **Operator-facing dispatch CLI** (`ledger dispatch <node-id>`). The UI's Dispatch button covers the v1 use case. A CLI subcommand is a polish item; defer.
- **`POST /api/dispatch` for arbitrary task types** (`POST /api/dispatch/:nodeId` covers the doc-node-driven cases). Operator-injected ad-hoc dispatch — "run an `issue_triage` task with these claims" — is already covered by `POST /api/tasks` from `05-task-runner/04-api-endpoints`: inject the task with the right type, and the dispatcher's executor picks it up on the next tick. No second endpoint.
- **Streaming SSE on the cancel response.** `POST /api/tasks/:id/cancel` returns the updated `Task` synchronously after the subprocess `SIGTERM` is delivered. It does not wait for the subprocess to actually exit (which can take seconds if the agent is mid-tool-call). The subsequent `status_change` event will appear on the existing `/api/tasks/:id/stream` SSE channel as the runner's `RUNNING → CANCELLED` transition lands.
- **Distributed dispatch / remote workers.** All executors run in the API server's Node process; the spawned subprocesses run on the same host. PRD §5 inheritance: "Same stack as the UI; no language boundary."
- **Live re-prompting / multi-turn operator conversation with a running dispatch.** The dispatched Claude Code subprocess gets one prompt at start. The operator cannot inject mid-flight prompts. (`AWAITING_HUMAN_REVIEW` + follow-up dispatch is the v1 substitute.)

---

## Design

### Repository layout after this node

```
ledger/
├── .ledger/
│   ├── project.json
│   └── runner.db
├── docs/
│   ├── 06-agent-dispatcher/
│   │   ├── 00-agent-dispatcher.md       # this spec (parent)
│   │   ├── 01-mcp-server.md             # child — MCP transport + server scaffolding
│   │   ├── 02-runner-tools.md           # child — 5 MCP tools + handlers + task-id binding
│   │   ├── 03-claude-code-executor.md   # child — subprocess spawning + lifecycle
│   │   ├── 04-prompt-templates.md       # child — per-task-type prompts + context composition
│   │   └── 05-dispatch-api.md           # child — POST /api/dispatch/:nodeId + cancel + UI hooks
├── server/
│   ├── package.json                     # adds @modelcontextprotocol/sdk + (already present) execa
│   ├── src/
│   │   ├── dispatcher/                  # NEW — dispatcher module (D3)
│   │   │   ├── index.ts                 # public surface: register(runner, ctx) → mounts everything
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts            # MCP server factory + Hono route mount
│   │   │   │   ├── tools.ts             # the five runner-tool definitions
│   │   │   │   ├── binding.ts           # task-id binding registry + check
│   │   │   │   └── types.ts             # internal types (MCP request/response shapes)
│   │   │   ├── executor/
│   │   │   │   ├── claudeCode.ts        # ClaudeCodeExecutor implementation
│   │   │   │   ├── spawn.ts             # subprocess spawn + arg/env construction
│   │   │   │   ├── mcpConfig.ts         # MCP config JSON generator
│   │   │   │   └── lifecycle.ts         # exit-code → task-status mapping
│   │   │   ├── prompts/
│   │   │   │   ├── index.ts             # template registry: TaskType → renderer
│   │   │   │   ├── shared.ts            # persona preamble, MCP contract reminder, context helpers
│   │   │   │   ├── implement.ts         # implement template
│   │   │   │   ├── specReview.ts        # spec_review template
│   │   │   │   ├── verify.ts            # verify template
│   │   │   │   ├── specDraft.ts         # spec_draft template
│   │   │   │   ├── reverify.ts          # reverify template
│   │   │   │   ├── docRefactor.ts       # doc_refactor template
│   │   │   │   ├── issueTriage.ts       # issue_triage template
│   │   │   │   └── projectStatusReview.ts
│   │   └── routes/
│   │       └── dispatch.ts              # NEW — POST /api/dispatch/:nodeId + cancel
│   └── test/
│       └── dispatcher/                  # NEW — mirrors src/dispatcher layout
│           ├── mcp/{server,tools,binding}.test.ts
│           ├── executor/{spawn,lifecycle,claudeCode}.test.ts
│           ├── prompts/{shared,implement,specReview,...}.test.ts
│           └── dispatch.test.ts
├── app/
│   └── src/
│       ├── components/
│       │   ├── dag/
│       │   │   └── NodeInspector.tsx    # modified — Dispatch button
│       │   └── tasks/
│       │       └── TaskInspector.tsx    # modified — Cancel button
│       └── lib/
│           ├── useDispatch.ts           # NEW — useMutation against POST /api/dispatch/:nodeId
│           └── useCancelTask.ts         # NEW — useMutation against POST /api/tasks/:id/cancel
└── packages/parser/
    └── src/
        └── runner/
            └── types.ts                 # NEW status reason: cancelled_by_operator,
                                         #                    subprocess_exit_without_terminal_status,
                                         #                    subprocess_failed:<short>
```

The dispatcher module is namespaced under `server/src/dispatcher/`, not promoted to a `packages/dispatcher/` workspace package — same rationale as `05-task-runner` D3. Two consumers: the API server (mounts MCP route + dispatch endpoints) and the runner (registers executors). Both are in-process.

### MCP server (item 1 of Requirements)

**Transport.** Streamable-HTTP per the MCP `2025-06-18` revision (the most stable currently supported by Claude Code as of late 2025; D1). Mounted at `POST /mcp` on the existing Hono app. Each connection is a stateful HTTP session (the SDK handles session-id headers); session lifetime is tied to one dispatched task — when the executor's subprocess exits, the executor closes the session.

**Server-side state.** The MCP server is a singleton per project (one Hono app, one MCP server). Tool handlers are stateless — they take `task_id` as their first argument and route to the runner via the `RunnerHandle` captured at server-construction time.

**Binding map.** A `Map<MCPSessionId, TaskId>` tracks which session is permitted to mutate which task. When the executor opens a session for task T, it registers `(sessionId, T)` in the binding map. Every tool call checks `binding.get(sessionId) === request.task_id` and rejects mismatches with an MCP error (D7). When the executor closes the session, the binding entry is removed.

**Discovery handshake.** The MCP `initialize` exchange returns the server's `serverInfo` (`{ name: "ledger-runner", version: <PRD version> }`) and the tool list. No resources, no prompts (D6).

### MCP tool surface (item 2 of Requirements)

Five tools. All take `task_id` as their first parameter; all return either an acknowledgement or the requested task state.

| Tool | Arguments | Returns | Maps to `RunnerHandle` |
|---|---|---|---|
| `runner.emit_event` | `task_id: string, event: LogEvent` (kind-specific payload validated against `log-event.schema.json` from `05-task-runner/01-store-schema`) | `{ event_id, seq }` | `handle.emit(taskId, event)` |
| `runner.complete_task` | `task_id: string` | `{ status: "COMPLETE" }` | `handle.complete(taskId)` |
| `runner.fail_task` | `task_id: string, reason: string` | `{ status: "FAILED" }` | `handle.fail(taskId, reason)` |
| `runner.await_human_review` | `task_id: string, review_payload: { summary: string, diffRef?: string }` | `{ status: "AWAITING_HUMAN_REVIEW" }` | `handle.awaitHumanReview(taskId)` (and writes `review_payload` via the store before transitioning) |
| `runner.get_task` | `task_id: string` | `{ task: Task, events: LogEvent[] }` | `store.loadTask(taskId)` + `store.getEvents(taskId)` |

The tools are deliberately narrow. The agent already has its own `Read`/`Edit`/`Write`/`Bash` tools — it does not need `runner.read_doc` or `runner.write_doc` from the MCP server. The dispatcher's MCP server is *only* for runner control; doc-tree manipulation goes through the agent's native filesystem tools.

JSON Schema for tool arguments lives in `docs/_schemas/dispatcher-tools.schema.json` (D2 of `02-runner-tools`'s spec, deferred). Validation is on inbound at the server-side handler — same ajv runtime used by `04-api-endpoints` for `POST /api/tasks` input validation.

### ClaudeCodeExecutor (item 3 of Requirements)

```ts
// server/src/dispatcher/executor/claudeCode.ts
export const claudeCodeExecutor: Executor = {
  async run(task, handle) {
    const prompt = renderPrompt(task, projectCtx);                  // §Prompts
    const mcpConfigPath = await writeMcpConfig(task, projectCtx);    // §MCP config JSON
    const subprocess = spawnClaudeCode({
      cwd: projectCtx.projectRoot,
      env: { LEDGER_TASK_ID: task.id },
      mcpConfigPath,
      promptFile: await writePromptFile(prompt),                     // pass via --prompt-file
    });
    mcp.bindSession(subprocess.mcpSessionId, task.id);               // §Binding map
    const exit = await subprocess.exited;
    mcp.unbindSession(subprocess.mcpSessionId);
    const final = store.loadTask(task.id);
    if (exit.code === 0 && isTerminalStatus(final.status)) return;   // success path
    if (exit.code === 0 && !isTerminalStatus(final.status)) {
      handle.fail(task.id, "subprocess_exit_without_terminal_status");
      return;
    }
    if (exit.signal === "SIGTERM" || exit.signal === "SIGKILL") {
      // POST /api/tasks/:id/cancel already wrote CANCELLED — don't double-fail.
      if (final.status === "CANCELLED") return;
    }
    handle.fail(task.id, `subprocess_failed: ${tail(exit.stderr, 200)}`);
  },
};
```

Subprocess management uses `execa` (already a transitive dep via Vite tooling; pin direct to `server/package.json` for clarity). The MCP-session-ID is read from the subprocess's first stderr line — Claude Code emits a `mcp: connected session=<uuid>` line on stderr when its MCP client initialises (verified against `claude --version 2.1.148`; D9). The dispatcher waits for that line before considering the subprocess "live."

**Exit-code mapping** (`lifecycle.ts`):

| Subprocess exit | Final task status check | Action |
|---|---|---|
| `code === 0` AND `final.status ∈ {COMPLETE, FAILED, AWAITING_HUMAN_REVIEW}` | Success path; executor returns | (no transition — already terminal or suspended) |
| `code === 0` AND `final.status === RUNNING` | Agent forgot to terminate | `handle.fail(task.id, "subprocess_exit_without_terminal_status")` |
| `code !== 0` AND `final.status === RUNNING` | Subprocess failed mid-flight | `handle.fail(task.id, "subprocess_failed:<stderr tail>")` |
| `code !== 0` AND `final.status === CANCELLED` | Operator cancelled; `SIGTERM` propagated; cancel route already wrote CANCELLED | (no transition — return cleanly) |
| `signal === SIGKILL` AND `final.status === RUNNING` | Crash before cancel route ran | Same as `code !== 0` row above |
| Subprocess process leaks (executor never sees exit) | Runner restart catches it | Orphan recovery transitions RUNNING → FAILED with `orphaned_on_restart` (existing 05-task-runner behaviour) |

The dispatcher does *not* implement a watchdog timeout (D12). A dispatched task can run for hours if Claude Code is genuinely working on something hard. The operator cancels via `POST /api/tasks/:id/cancel` if a task is wedged.

### Prompt templates (item 4 of Requirements)

Per-task-type prompt renderers, each a pure TS function `(task: Task, projectCtx: ProjectContext) => string`. The output is the full text passed to `claude --prompt-file`. Composition:

1. **Persona preamble** (`shared.ts`) — three to six sentences setting the role. The `implement` persona is a code-writer; the `spec_review` persona is a critical reviewer; the `verify` persona is a tester; etc. Distinct personas mirror MetaGPT's role specialisation (PRD §4.1).
2. **Task-doc context** — the spec being acted on. For `implement` on node N: the full text of N's doc. For `spec_review` on node N: the DRAFT text plus the parent doc plus relevant siblings. For `verify` on node N: the spec plus the implementation diff.
3. **Required-reading manifest** — explicit file pointers (paths, not contents) for the agent to load. `CLAUDE.md`, the parent doc, the dependency docs, the relevant source files. Keeps the prompt token-bounded; the agent does the actual reading via its own tools.
4. **Success criteria** — what "this task done" looks like, in this task's terms. Pulled from the spec's `## Verification` section verbatim for nodes that have one.
5. **MCP-tool contract reminder** (`shared.ts`) — three paragraphs explaining: (a) you are working on task `<task_id>` (passed in via env), (b) you must call `runner.emit_event` at each meaningful step (reasoning summary, tool_call summary, artifact written), (c) you must end with exactly one of `runner.complete_task`, `runner.fail_task`, or `runner.await_human_review`.

Templates are TS functions, not a `.mustache`-style template format (D10). Templating languages encourage logic in the template; TS functions keep logic where it belongs (the function body) and avoid a second mini-language.

### MCP config JSON (per-dispatch)

The dispatcher writes a temporary MCP config JSON for each dispatched subprocess and passes its path via `--mcp-config <path>`:

```jsonc
// /tmp/ledger-dispatch-<task-id>.mcp.json
{
  "mcpServers": {
    "ledger-runner": {
      "type": "http",
      "url": "http://127.0.0.1:4180/mcp"
    }
  }
}
```

The file is deleted when the subprocess exits (on either path). Temp dir is `os.tmpdir()`.

### Dispatch endpoint semantics

```
POST /api/dispatch/:nodeId
  Body: { type?: TaskType, priority?: number, claims?: ResourceClaim[] }

  - If type is omitted, the endpoint infers from the node's lifecycle status:
      APPROVED  → implement
      VERIFY    → verify
      DRAFT     → spec_review
      IN_PROGRESS / COMPLETE / ISSUE_OPEN / DEFERRED → 409 (no inferred action)
  - If claims are omitted, the endpoint declares a single write claim on the
    target node: { kind: "node", nodeId: ":nodeId", mode: "write" }.
  - The endpoint synthesises a TaskInput and POSTs it through the existing
    runner.createTask path (no new code path; same validation, same events).
  - Returns: 201 { task: Task } — the task is PENDING; the scheduler picks it
    up on the next tick.

POST /api/tasks/:id/cancel
  Body: { reason?: string }

  - 404 if id does not resolve.
  - 409 if task.status !== "RUNNING".
  - 409 if no subprocess is registered for the task (i.e., task is RUNNING
    under a different executor — e.g., noop, which is synchronous and never
    cancellable). Reason: cancellation requires a subprocess to SIGTERM.
  - Sends SIGTERM to the subprocess; transitions RUNNING → CANCELLED with
    reason "cancelled_by_operator" (or the body's reason if provided);
    returns 200 { task: Task }.
  - Subsequent subprocess exit is no-op (executor lifecycle table row 4).
```

Cancel is *eager* in the DB (the transition lands before the subprocess actually exits). This is intentional: the operator gets immediate feedback, and downstream waiting tasks become eligible immediately. The subprocess's `SIGTERM`-driven exit may take seconds; during that window the subprocess continues to hold its open MCP session, but the session is unbound from the task and any tool calls it tries to make are rejected with `task_not_bound`. The subprocess discovers this on its next tool call and exits.

### UI surfaces

**Dispatch button** (`NodeInspector.tsx`):

```
┌─ Node: 06-agent-dispatcher ──────────────────┐
│ Status: APPROVED                              │
│ ...                                           │
│  [ Dispatch (creates implement task)  ]       │
└───────────────────────────────────────────────┘
```

Visibility rule: shown when `node.status ∈ {APPROVED, VERIFY, DRAFT}`. Disabled (with tooltip) when the status is not one of those. Click → `POST /api/dispatch/:nodeId` with empty body → success toast `"Dispatched as task <id>"` with a link to `01-ui/04-tasks` filtered on the new ID.

**Cancel button** (`TaskInspector.tsx`):

```
┌─ Task: <uuid> (implement) ────────────────────┐
│ Status: RUNNING                                │
│  [ Cancel  ]                                   │
└────────────────────────────────────────────────┘
```

Visibility rule: shown when `task.status === "RUNNING"` AND `!task.id.includes(":")` (the same runner-vs-transcript discriminant from `05-task-runner/05-ui-hook-migration` D7). Click → `POST /api/tasks/:id/cancel` with body `{}` → optimistic-set query data with `{ status: "CANCELLED" }` (matches the Approve/Reject pattern from `05-task-runner/05-ui-hook-migration` D12 amended).

### Type coordination across packages

Three new status-reason strings, added to the `reasons` const in `server/src/runner/scheduler.ts` (the canonical reason registry from `05-task-runner/02-scheduler`):

| Reason | Emitted by |
|---|---|
| `subprocess_exit_without_terminal_status` | `ClaudeCodeExecutor`'s lifecycle table row 2 |
| `subprocess_failed:<short>` | `ClaudeCodeExecutor`'s lifecycle table rows 3 + 5 |
| `cancelled_by_operator` | `POST /api/tasks/:id/cancel` |

No new top-level `Task` or `LogEvent` fields. The MCP server transports existing `LogEvent` shapes verbatim. No new `TaskType` values either — the eight types the dispatcher executes are already enumerated in `@ledger/parser/runner/types.ts`.

### Acceptance check (end-to-end, manual)

Distributed across sub-leaf verification gates; the parent's roll-up:

1. `pnpm install` succeeds with the added `@modelcontextprotocol/sdk` + `execa` deps.
2. `pnpm -C server dev /Users/dennis/code/ledger` boots; `GET http://127.0.0.1:4180/_health` includes a `dispatcher: "ready"` line; `POST http://127.0.0.1:4180/mcp` accepts an MCP `initialize` handshake.
3. `curl -X POST .../api/dispatch/06-agent-dispatcher -d '{}'` returns 201 with an `implement`-type task; within a few seconds the task transitions `PENDING → RUNNING`, a `claude` subprocess is alive, the MCP session is bound. The agent's first `runner.emit_event` call appears on `GET /api/tasks/:id/stream` as a typed `LogEvent`.
4. Mid-dispatch: `curl -X POST .../api/tasks/:id/cancel -d '{}'` returns 200; the task is `CANCELLED`; the subprocess is gone within ~5s.
5. `POST /api/dispatch/<APPROVED-node>` followed by waiting for completion: the task transitions through `RUNNING → COMPLETE` after the agent's `runner.complete_task` call; the events stream shows the agent's reasoning + tool-call sequence; the node's spec file on disk is updated as the agent wrote it.
6. `POST /api/dispatch/<DRAFT-node>` synthesises a `spec_review` task (not `implement`); the agent reviews and produces a Verdict in its `runner.emit_event` reasoning trail before `runner.complete_task`.
7. Foreign task-id rejection: from one dispatched session, calling `runner.emit_event` with a `task_id` other than the session's bound one returns an MCP error `task_not_bound`.
8. Subprocess crash: `kill -9 <subprocess-pid>` while a task is RUNNING; the task stays RUNNING until next boot; on restart, orphan recovery transitions it FAILED with `orphaned_on_restart`.
9. Additive coexistence: the same UI shows both dispatcher-driven runner tasks and transcript-derived `operator_session` tasks for the conversation that triggered the dispatch.
10. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero across all workspace packages.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | MCP transport: streamable-HTTP per the MCP `2025-06-18` revision | Claude Code's most stable supported transport as of `2.1.148`. Stdio MCP requires the *server* to run as a subprocess of the client — wrong shape here (our server is long-lived and shared across many subprocess clients). HTTP gives us one Hono route, session-id headers handled by the SDK, and a clean mount point alongside the rest of `/api/*`. SSE-only transport is deprecated by the MCP spec in favour of streamable-HTTP. |
| D2 | MCP server is a singleton mounted on the existing Hono app (not a separate process) | Same Node process as the runner and the rest of the API surface. Single-port operator story (`:4180` is the whole surface). Avoids cross-process IPC for what is fundamentally an in-memory bridge. Future remote-agent support would require a separate process anyway — by then the cost-benefit of process separation makes sense; today it's overhead for no benefit. PRD §5 inheritance: "Same stack as the UI; no language boundary." |
| D3 | Dispatcher is a module inside `server/`, not its own `packages/dispatcher/` workspace package | Same rationale as `05-task-runner` D3. Two consumers (API server route mount; runner executor registration) and both are in-process. Workspace boundary overhead (separate `package.json`, separate `tsconfig`, dependency declaration across the boundary) buys nothing without a third consumer. If a Phase-2 standalone agent-runtime story emerges, revisit. |
| D4 | Claude Code is the only agent runtime in v1; the MCP server is protocol-pure so others can mount later | PRD §5 commits to MCP precisely so the dispatch layer is agent-agnostic at the protocol boundary. v1 ships only the `ClaudeCodeExecutor` because (a) Claude Code is the agent the operator already runs, (b) the MCP-config-injection shape is well-understood, (c) shipping a `MetaGPTExecutor` or `OpenAIAgentExecutor` would require their own prompt templates, exit-code semantics, and subprocess plumbing — out of scope for the first dispatch node. |
| D5 | No authentication on `POST /mcp`; same `127.0.0.1`-bind posture as the rest of the API | Inherits `04-api-server` D4 and `05-task-runner` D13. Threat model is single-user local-only; MCP is no more sensitive than the existing `/api/tasks` POST endpoints. A local-process MITM scenario is identical to the existing one. When a future remote-access story lands, MCP auth (probably a per-session token in an `Authorization` header) lands alongside the rest of the API's auth — both pieces together, not separately. |
| D6 | No MCP resources, no MCP prompts in v1 | MCP resources are exposed read-only data; the agent already reads the project tree via its native `Read` tool, so a `runner.read_doc` resource is duplicative. MCP prompts are agent-discoverable templated prompts; v1 *renders* prompts server-side and passes the rendered text via `--prompt-file`, which is simpler than a roundtrip through MCP prompt-discovery and gives the dispatcher full control over what the agent sees. If a future scenario emerges where the agent needs to discover available prompts at runtime (e.g., a long-running session that switches task types), MCP prompts get added then. |
| D7 | Task-ID binding registry rejects cross-task tool calls | Without binding, a subprocess could call `runner.complete_task` on a *sibling's* task ID (e.g., if the agent hallucinated an ID, or pasted one from an unrelated context). The binding map enforces "the only task this session can mutate is its own." Implementation: `Map<MCPSessionId, TaskId>` populated at session start and torn down at session close; every tool handler checks it. This is integrity, not authentication (D5 covers the latter): any local process can open its own MCP session with its own bound task, so the binding does not prevent malicious cross-task mutation by a determined local attacker — it prevents *accidental* cross-task mutation, which is the realistic failure mode for v1. |
| D8 | `runner.get_task` is a *read* tool; it does not mutate the binding or grant cross-task visibility | The agent can read its own task and any other task in the project's DB via `runner.get_task`. This is for "let me look at my parent task's reasoning before I implement" patterns; it's not a security hole because the agent could equivalently read the DB file directly (it has filesystem access to `.ledger/runner.db`). Mutations remain bound to the session's task; reads are open. |
| D9 | Dispatcher reads Claude Code's MCP session-id from the subprocess's stderr first line | Claude Code emits `mcp: connected session=<uuid>` on stderr when its MCP client initialises against an HTTP server. This is the only reliable way to correlate the subprocess to its MCP session at session-creation time (the alternative — fishing through the MCP server's internal session-creation log — is order-dependent and racy when multiple subprocesses start nearly-simultaneously). Pinned to Claude Code `≥2.1.148`. If a future Claude Code version changes the stderr line format, the dispatcher's `spawn.ts` detects the absence (no matching line within 5 s) and fails the task with reason `mcp_session_id_not_observed`. |
| D10 | Prompt templates are TS functions, not a template-language format | Mustache/Handlebars-style templates encourage logic-in-template (conditionals, loops). TS functions keep logic in the function body, where it can be unit-tested directly without a template-rendering harness. The cost is "less hot-reload-friendly" — but prompt iteration is an offline activity (write, restart server, dispatch a test task), not a hot-path. Sub-leaf `04-prompt-templates` ships eight TS files (one per task type) plus a `shared.ts` helper module. |
| D11 | Prompt templates declare the task's resource claims (the operator can override via `POST /api/dispatch/:nodeId`'s body) | The default claim for a doc-node dispatch is `{ kind: "node", nodeId, mode: "write" }`. Tasks that read multiple docs (`verify` reads spec + parent + dependency docs) declare additional `read` claims. The conflict primitive from `05-task-runner/02-scheduler` then serialises overlapping writes correctly — two `implement` dispatches on the same node block each other; a `verify` on node N can run concurrently with an `implement` on a *different* node M because their write claims don't overlap. |
| D12 | No watchdog timeout on dispatched subprocesses | A dispatched task can run for hours when Claude Code is doing real work. Watchdog timeouts force a value choice (5min? 30min? 4hr?) that is wrong for every other case. The operator can cancel via `POST /api/tasks/:id/cancel` when a task is observably wedged. Adding a watchdog later is purely additive (a per-task `timeout_seconds` column on `tasks` with default NULL); deferring it avoids picking the wrong default. |
| D13 | The MCP config JSON is written to `os.tmpdir()`, not to `.ledger/` | The config contains no project-relevant state — it's the URL `http://127.0.0.1:4180/mcp` and that's it. Writing to `.ledger/` would pollute the project's working tree with N transient files per dispatch. `os.tmpdir()` is the natural place for ephemeral subprocess inputs; it's gitignored by virtue of being outside the repo entirely. Cleanup is best-effort: the dispatcher deletes its config on subprocess exit, and `os.tmpdir()` is cleared by the OS periodically anyway. |
| D14 | Cancel is eager in the DB; the subprocess exits asynchronously | The alternative is "wait for subprocess to actually exit before transitioning CANCELLED," which makes the operator's click feel laggy (cancel-on-a-wedged-subprocess could take 30+s). Eager transition gives immediate feedback and unblocks downstream tasks immediately. The subprocess's continued attempts to call tools fail with `task_not_bound` and the subprocess exits cleanly soon after. Worst case: a misbehaving subprocess never exits and becomes a zombie — the next runner restart's orphan recovery does not catch this (the task is already CANCELLED, not RUNNING), so the operator must `ps` + `kill` manually. Logged as an Open Issue. |
| D15 | Transcript ingestion (`01-ui/10-orchestration`) stays live alongside dispatcher-emitted events | Operator preference (this conversation, 2026-05-28). The transcript bootstrap observes Claude Code runs not driven by the dispatcher — ad-hoc CLI use, sub-agent dispatches from other terminals, the conversation that drafted this spec. Removing transcripts would leave those runs unobserved. The additive merger from `05-task-runner/05-ui-hook-migration` continues to deduplicate by id; runner tasks (bare UUIDv4) and transcript tasks (`session:<uuid>` / `agent:<id>`) cannot collide. Full retirement is a future-node concern. |

---

## Open Issues

- **Zombie subprocesses after eager cancel.** D14 acknowledges: a subprocess that does not respond to `SIGTERM` (e.g., stuck in a `Bash` syscall that traps signals) keeps running indefinitely after the task is CANCELLED. The runner's orphan recovery does not catch it because the task is already terminal. Operator must `ps` + `kill -9` manually. Mitigations to consider in v2: the cancel route sends `SIGTERM` then `SIGKILL` after a short grace; or the executor tracks pid → task and the runner's startup logic kills any orphaned dispatcher pids. *(Priority: MEDIUM — surfaces in practice when cancellation is heavily used.)*
- **Claude Code version pinning.** D9 hard-pins `≥2.1.148` for the stderr session-id line. A Claude Code minor bump that changes the line format silently breaks the dispatcher (the executor fails every task with `mcp_session_id_not_observed`). Mitigations: a smoke test in CI that dispatches a `noop`-equivalent against the installed Claude Code version on every test run; or a more robust correlation mechanism (the server-side MCP session-creation hook records the `User-Agent` or a custom header sent by the subprocess). *(Priority: MEDIUM — surfaces on every Claude Code upgrade.)*
- **Prompt-template iteration ergonomics.** D10 trades hot-reload for unit-testability. Iterating on a prompt today requires server restart + new dispatch — slow feedback loop when tuning a template. A `--reload-prompts` flag that hot-reloads the prompt module on file change would help; not v1. *(Priority: LOW — surfaces when prompt-tuning becomes a focused activity.)*
- **No retry semantics on FAILED dispatcher tasks.** The runner has no automatic retry (inherits `05-task-runner` D11 — `FAILED` dependencies block dependents forever). An operator who wants to retry a failed dispatch must `POST /api/dispatch/:nodeId` again, which creates a *new* task with a new ID. The original `FAILED` task stays in the DB as provenance. This is correct behaviour but produces ID churn in the inspector. A `POST /api/tasks/:id/retry` that resets a FAILED task to PENDING is a v2 polish item. *(Priority: LOW.)*
- **MCP tool-call rate limiting.** A misbehaving agent could call `runner.emit_event` thousands of times per second, flooding the events table. v1 has no caps. Mitigations: per-session rate limit at the MCP server, or per-task event count cap that fails the task with `runaway_emit`. *(Priority: LOW — single-user local-only; agent misbehavior is the operator's problem to debug.)*
- **No structured stderr capture from the subprocess.** The executor captures stderr for the failure-reason tail (lifecycle table row 3), but the full stderr is discarded on success. If the agent printed warnings or non-fatal errors, they are lost. A `subprocess_stderr` event kind or a `.ledger/dispatch-logs/<task-id>.stderr` file would preserve them. *(Priority: LOW — surfaces during deep debugging.)*
- **Cross-machine dispatch.** All v1 dispatches are local. A future "dispatch this task to the build farm" story requires either a remote MCP server (the runner mounts MCP via WebSocket or remote-streamable-HTTP, dispatched subprocesses connect from elsewhere) or a separate remote-executor protocol. Out of scope but worth flagging — the MCP-first decision (D1) makes the remote story tractable. *(Priority: LOW — deferred to Phase-2.)*
- **OpenAPI / typed client.** Inherited from `04-api-server` and `05-task-runner`. The MCP tool definitions are *already* typed via the SDK's tool-registration API; the HTTP endpoints (`/api/dispatch/:nodeId`, `/api/tasks/:id/cancel`) are not. Still defer until a non-TS consumer exists. *(Priority: LOW — inherited.)*

---

## Spec Review (YYYY-MM-DD)

*(none yet — pre-review)*

---

## Implementation Notes

*(none yet — pre-implementation; decomposition into children below)*

---

## Verification

When this parent moves to `VERIFY` (all children COMPLETE), the verifier confirms:

1. Every child sub-leaf's own Verification gate passed and is recorded in its own doc.
2. The end-to-end Acceptance check above (items 1–10) passes against the merged main branch.
3. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero across all workspace packages.
4. No regressions on `04-api-server`'s endpoints (`/api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId`) — same response shapes, same status codes.
5. No regressions on `05-task-runner`'s endpoints (`/api/tasks*`, including approve/reject/SSE) — same response shapes, same status codes; specifically: `noop` and `human_review` flows continue to work end-to-end alongside the new dispatcher executors.
6. No regressions on `01-ui/10-orchestration`'s endpoints (`/api/transcripts*`) — the transcript bootstrap remains live (D15).
7. The dispatcher's `POST /mcp` endpoint accepts an MCP `initialize` handshake from a standalone MCP client (verified independently of the Claude Code subprocess path — e.g., via the SDK's test client).
8. CLAUDE.md "Running the app" section updated to note the dispatcher (`@modelcontextprotocol/sdk` dep; MCP endpoint at `:4180/mcp`); §14 of `docs/00-project.md` shows `06-agent-dispatcher` as COMPLETE.

---

## Children

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-mcp-server` | MCP server scaffolding mounted at `POST /mcp`: streamable-HTTP transport via `@modelcontextprotocol/sdk`, server factory + Hono route mount, `serverInfo` discovery, internal session lifecycle (open/close hooks for the binding registry from `02-runner-tools`) | `05-task-runner` | PLANNED |
| `02-runner-tools` | The five MCP tools (`runner.emit_event`, `runner.complete_task`, `runner.fail_task`, `runner.await_human_review`, `runner.get_task`), thin adapters over `RunnerHandle`; tool-argument JSON Schema in `docs/_schemas/dispatcher-tools.schema.json`; task-id binding registry + cross-task rejection (`task_not_bound` MCP error); ajv validation on tool inbound | `01-mcp-server` | PLANNED |
| `03-claude-code-executor` | `ClaudeCodeExecutor` registered for the eight real task types; subprocess spawn via `execa` with `--mcp-config` + `--prompt-file` + `LEDGER_TASK_ID` env; stderr session-id correlation (D9); exit-code → task-status lifecycle table; new status reasons `subprocess_exit_without_terminal_status` / `subprocess_failed:*` registered in `runner/scheduler.ts` reasons const | `02-runner-tools` | PLANNED |
| `04-prompt-templates` | Eight per-task-type TS prompt templates (`implement`, `spec_review`, `verify`, `spec_draft`, `reverify`, `doc_refactor`, `issue_triage`, `project_status_review`) plus a `shared.ts` helper (persona preamble, MCP-tool contract reminder, required-reading composition); template registry in `prompts/index.ts`; default resource-claim declarations per type (D11) | `02-runner-tools` | PLANNED |
| `05-dispatch-api` | **Dispatch + cancel endpoints + UI integration.** `POST /api/dispatch/:nodeId` with lifecycle-driven task-type inference (APPROVED → implement, VERIFY → verify, DRAFT → spec_review); `POST /api/tasks/:id/cancel` with eager-CANCELLED transition + SIGTERM (D14) + `cancelled_by_operator` reason; `useDispatch` / `useCancelTask` mutation hooks; `NodeInspector` Dispatch button (visibility on APPROVED/VERIFY/DRAFT); `TaskInspector` Cancel button (visibility on RUNNING ∧ runner-emitted) | `03-claude-code-executor`, `04-prompt-templates` | PLANNED |

Build order is determined by the dependency edges above. Sequential: `01` → `02` → `{03, 04}` (parallelizable after `02` — `03` ships the executor + spawn plumbing; `04` ships the prompt-template library; no file overlap) → `05` (consumes both — the dispatch endpoint synthesises tasks whose executors are registered by `03` and whose prompts are rendered by `04`). The manual workflow today serialises the parallel pair; the runner's resource-claim model would catch a hypothetical conflict if both sub-leaves wrote to the same file, but the planned carve-up keeps `03`'s code in `server/src/dispatcher/executor/` and `04`'s code in `server/src/dispatcher/prompts/`.

Out-of-scope items from this parent's Requirements (transcript retirement, MCP resources/prompts beyond tools, MCP auth, multiple agent runtimes, subprocess sandboxing, pause/resume, cost budgets, dispatch CLI, watchdog timeout, distributed dispatch) apply to every child — none reintroduce a deferred concern. Each child spec cites this parent's Decisions table for architectural inheritance rather than restating.
