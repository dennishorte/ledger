# Dispatcher — current-state reference

**Scope:** `server/src/dispatcher/`. Turns a runner task into a `claude`
subprocess, and exposes five MCP tools that subprocess uses to write events
and finish.
**Last verified:** `f531fad825137e51ba44f49353d6e749d24378fd` on `main`.
**Owning nodes:** [`06-agent-dispatcher`](../06-agent-dispatcher/00-agent-dispatcher.md)
children `01-mcp-server`, `02-runner-tools`, `03-claude-code-executor`,
`04-prompt-templates`, `05-dispatch-api`.
**Regenerate the module map:** `find server/src/dispatcher -name '*.ts' | sort | while read f; do printf '%5d  %s\n' "$(wc -l < "$f")" "$f"; done`

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `index.ts` | 30 | Re-exports MCP server, binding registry, tool registration |
| `mcp/server.ts` | 166 | `POST/GET/DELETE /mcp`. One transport per `initialize` |
| `mcp/tools.ts` | 224 | The five `runner.*` tools |
| `mcp/toolSchemas.ts` | 49 | Zod input shapes |
| `mcp/binding.ts` | 86 | Session id → task id. `requireBound` rejects a mismatched `task_id` |
| `mcp/requestContext.ts` | 7 | AsyncLocalStorage so session init can read the inbound `Request` |
| `mcp/types.ts` | 52 | `McpServerHandle` |
| `executor/claudeCode.ts` | 151 | Executor: render prompt, write MCP config, spawn, forward, reconcile |
| `executor/spawn.ts` | 96 | Pinned `claude` argv via `execa` |
| `executor/mcpConfig.ts` | 49 | Per-task MCP config file in tmp, pointed at this server's `/mcp` |
| `executor/streamForward.ts` | 221 | stream-json stdout → `LogEvent` rows; idle watchdog |
| `executor/lifecycle.ts` | 93 | `reconcileExit` — exit code and status → one terminal transition |
| `executor/cancellation.ts` | 110 | task id → subprocess. SIGTERM, then SIGKILL, then a `subprocess_killed` event |
| `prompts/index.ts` | 71 | `renderPrompt`, `isPersona`. Re-exports `defaultResourceClaims` |
| `prompts/shared.ts` | 140 | Persona preambles, sign-off reminder, `primaryNodeId` |
| `prompts/implement.ts` | 52 | Implement prompt |
| `prompts/specDraft.ts` | 60 | Spec-draft prompt |
| `prompts/specReview.ts` | 61 | Spec-review prompt |
| `prompts/verify.ts` | 59 | Verify prompt |
| `prompts/reverify.ts` | 57 | Re-verify prompt |
| `prompts/docRefactor.ts` | 50 | Doc-refactor prompt |
| `prompts/docDecompose.ts` | 238 | Decompose prompt. Forwards children start at PLANNED; parent status stays |
| `prompts/issueTriage.ts` | 50 | Issue-triage prompt |
| `prompts/projectStatusReview.ts` | 44 | Project-status prompt. Reads `00-project` |

## 2. Entry points

Registration happens in `loadProjectContext` (`server/src/context.ts`), not
inside this folder:

1. `createMcpServer` with a `registerTools` callback that calls
   `registerRunnerTools` on each new session.
2. `onSessionInitialized` reads `X-Ledger-Task-Id` and `binding.bind`.
3. `createClaudeCodeExecutor(ctx)` is registered for every name in
   `DISPATCHER_TASK_TYPES`.

`renderPrompt(task, ctx)` throws for `noop`, `human_review`,
`operator_session`, and `agent_task`.

**Spawn argv** (`spawn.ts`): `claude --print --bare --mcp-config <file>
--allowedTools <list> --permission-mode dontAsk --output-format stream-json
--verbose`. The prompt is stdin. There is no `--prompt-file`. `reject: false`
so a non-zero exit returns to `reconcileExit`. Env adds `LEDGER_TASK_ID`.
`cwd` is the project root.

`--allowedTools` always includes `mcp__ledger-runner__*`. Write personas also
get `Edit`, `Write`, `Bash`: `implement`, `spec_draft`, `doc_refactor`,
`doc_decompose` (`claudeCode.ts` `WRITE_PERSONAS`).

**Watchdogs** (`claudeCode.ts`): hard cap `LEDGER_DISPATCH_TIMEOUT_MS` default
20 minutes → `subprocess_timeout`. Idle cap `LEDGER_DISPATCH_IDLE_MS` default
5 minutes with no stream-json output → `subprocess_idle`. `0` disables
either cap (`LEDGER_DISPATCH_TIMEOUT_MS=0` skips execa's timeout;
`LEDGER_DISPATCH_IDLE_MS=0` skips the idle timer).

**MCP tools** (`tools.ts`), all prefixed `runner.`:

| Tool | Effect |
|---|---|
| `emit_event` | Append a non-`status_change` event on the bound task. Ajv via `validateLogEvent` |
| `complete_task` | `RUNNING` → `COMPLETE`. Refuses any other status |
| `fail_task` | `RUNNING` → `FAILED` with the agent's reason |
| `await_human_review` | Writes `reviewPayload`, then `RUNNING` → `AWAITING_HUMAN_REVIEW` |
| `get_task` | Read any task. No binding check |

`emit_event`, `complete_task`, `fail_task`, and `await_human_review` require
the session's bound task id to equal `task_id`.

## 3. Data contracts

**Personas** — `Record` in `prompts/index.ts`, same nine strings as
`DISPATCHER_TASK_TYPES` in `context.ts`:

`implement`, `spec_review`, `verify`, `spec_draft`, `reverify`,
`doc_refactor`, `doc_decompose`, `issue_triage`, `project_status_review`.

`Persona` in `shared.ts` is `TaskType` minus `noop`, `human_review`,
`operator_session`, `agent_task`. A new dispatcher type fails the build until
both records gain an entry. The file headers still say "eight"; the records
hold nine (`doc_decompose` is the ninth).

**Which node the prompt reads.** `primaryNodeId` (`shared.ts`) is the first
`kind: "node"` claim. Dispatch passes the doc id as `defaultResourceClaims`'s
`id` (`routes/dispatch.ts`), and the types that copy `id` therefore claim
the doc node rather than the task UUID. `project_status_review` ignores that
id and claims `00-project`. Templates do not use `task.id` as a path.
Resolution goes through `ctx.resolveDocPath`, which reads the boot-time graph
([`api-server.md`](api-server.md) §4).

**MCP session.** `mcp-session-id` header. Each `initialize` builds a new
`McpServer` and transport (`mcp/server.ts`). A second `initialize` on an
already-initialized transport is the failure mode the per-session design
replaced; see `docs/_investigations/dispatcher-hang-issue.md`.

**Exit reconciliation** (`lifecycle.ts`): a task already `CANCELLED` stays
cancelled. Otherwise a non-zero exit, a signal, or a timeout becomes `FAILED`
with one of the `reasons` strings. A zero exit whose status is still
`RUNNING` (the agent never called `complete_task` or `fail_task`) becomes
`FAILED` with `subprocess_exit_without_terminal_status`.

**Pre-spawn failures** (prompt render, MCP config write, missing `claude`
binary) use `executor_internal_error:` and do not register a subprocess.

## 4. Runtime state surfaces

| Surface | Where | Lifetime |
|---|---|---|
| Session → task binding | `binding.ts` map | Session. Cleared on close |
| MCP transports | `mcp/server.ts` map | Session |
| task id → subprocess | `cancellation.ts` | From spawn until reconcile `finally` |
| MCP config file | tmpdir from `mcpConfig.ts` | Same span. Deleted in `finally` |
| Prompt text | Rendered per run, piped to stdin | Not stored |

Auth for the subprocess is `ANTHROPIC_API_KEY` in the environment. `--bare`
does not read the keychain. The dev script loads `../.env`; the compiled CLI
does not. Boot already refused a missing key (`context.ts`).

## 5. Invariants

- The agent cannot emit `status_change`. Terminal status goes through
  `complete_task`, `fail_task`, or `await_human_review`.
- Those three tools read `store.getStatus` first and reject when the row is
  not `RUNNING`, so a second call does not append another transition.
- Cancel of a `RUNNING` task looks up the subprocess, writes `CANCELLED`,
  then signals it (`routes/tasks.ts`). The comment above that write still
  says the signal comes first. `PENDING` and `BLOCKED` cancel with no
  subprocess.
- Write tools are granted only to the four personas in `WRITE_PERSONAS`.
  Review and verify personas get the MCP wildcard; Read is allowed by
  `--print`.
- `doc_decompose` claims a write on the target node only. New children are
  files under that node. The prompt leaves the parent's status unchanged and
  sets forward children to `PLANNED` (`prompts/docDecompose.ts`).
- Prompts tell `spec_review`, `verify`, and `reverify` to produce the
  sign-off matrix in `.ledger/process/verification-signoff.md` and not to
  change lifecycle status (`shared.ts`).

## 6. Active migration

Runner events written by these tools are the task log.
[`09-transcript-decouple`](../09-transcript-decouple.md) is still DRAFT and
has no code in this package.

`15-review-decisions` is PLANNED. It does not yet change these prompts.
Review behavior they already encode is the matrix in
`verification-signoff.md` ([`14-review-process`](../14-review-process.md)).
