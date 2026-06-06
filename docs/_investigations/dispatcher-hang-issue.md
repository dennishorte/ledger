# Dispatcher hang — agent subprocess freezes indefinitely with no watchdog (2026-06-06)

Living reference / issue writeup, not an implementation node. Captures a
reproducible dispatcher failure found while validating the `doc_decompose` fix
(`c75cedc`) end-to-end, so it can be fixed in a clean context without re-deriving.

Sibling doc: `docs/_investigations/e2e-dispatch-findings.md` — this is a **new, distinct**
failure from that doc's Finding #1 (see "Relationship" below).

## Symptom

A dispatched `claude --print --bare` agent subprocess **hangs forever**: it stays
alive, emits no telemetry, writes nothing, never exits — and so is never
reconciled. The task sits in `RUNNING` indefinitely, holding its write-claim and
its MCP session. In the UI's Tasks panel a hung `RUNNING` task is
indistinguishable from a finished one (it just stops changing), which reads as
"done" when it is actually stuck.

## Evidence (this run)

- Task `41fa41bb-3257-4c56-8fdf-7aaa7067b561` — `doc_decompose` on `01-ui/02-dag`,
  `operator_injected`. Resource claim was correct (`[{node 01-ui/02-dag, write}]`
  — the `c75cedc` fix), so target resolution is **not** implicated.
- Dispatched `2026-06-05T22:14:25Z`; I cancelled it `2026-06-06T00:41:20Z`.
- Subprocess PID 68766 at cancel time: **ELAPSED 2h23m, CPU TIME 19.8s** (gained
  ~5s of CPU across the final two hours — effectively frozen, blocked on I/O).
- **0 agent events** in `.ledger/runner.db` (only the runner's own `status_change`
  PENDING→RUNNING). **0 files written, 0 commits** (`git status` clean but for the
  source fix).
- `GET /api/_health` showed `dispatcher.activeSessions: 1` for the entire run —
  the agent **connected to MCP and the session never closed**. It also stayed `1`
  *after* the subprocess was killed (see "session leak" below).

## CONFIRMED ROOT CAUSE (2026-06-06) — single shared MCP transport

Proven by direct `/mcp` probing, independent of claude. Hypothesis #1 below is
**half right**: the `/mcp` surface is implicated, but nothing *stalls* — every
server response is `200`/`202` in 2–5 ms. The defect is architectural.

`server/src/dispatcher/mcp/server.ts` mounted a **single shared
`WebStandardStreamableHTTPServerTransport`** for all agents (`app.all("/", …)`).
That transport is single-session: once the first client sends `initialize` it
sets `_initialized = true`, and the SDK (`@modelcontextprotocol/sdk@1.29`,
`webStandardStreamableHttp.js:425`) hard-rejects every later `initialize`:

    HTTP 400  {"error":{"code":-32600,"message":"Invalid Request: Server already initialized"}}

Because the session is also never torn down on agent exit (defect #4), the
transport stays permanently initialized. Net effect:

- **At most one dispatched agent per server boot can connect to MCP.** The first
  agent initializes the transport; every subsequent dispatch gets HTTP 400, no
  `mcp__ledger-runner__*` tools, and `mcp_servers:[{status:"pending"}]` in its
  `init` event. It then runs blind — 0 telemetry, cannot call `complete_task` /
  `fail_task` — and with write tools granted + no watchdog, flounders until it
  blocks indefinitely (the observed hang).
- This **is** e2e-findings #1's "intermittent" tool loading, now explained: not
  random — *works once per boot, fails forever after.* Defect #4 (session leak)
  is the same bug's other face.

### Reproduction (minimal, no claude)

    # FRESH server boot, then:
    curl -sS -X POST :4180/mcp -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"A","version":"1"}}}'
    # → 200, assigns mcp-session-id, capabilities.tools.listChanged:true

    # second client, IDENTICAL initialize, same (shared) transport:
    # → 400  -32600 "Invalid Request: Server already initialized"

Baseline ruled claude itself out: `claude --print --bare --permission-mode
dontAsk` with **no** `--mcp-config` returns "pong" in ~900 ms.

### Fix (landed 2026-06-06)

Per-session transports — `Map<sessionId, transport>`, a fresh transport +
`McpServer` per `initialize`, routed by the `mcp-session-id` header, torn down on
close (the SDK's documented stateful pattern). Resolves the #1 *cause* and #4.
The execa watchdog (defect #1 *operational*) lands alongside as the safety net
that bounds any future hang regardless of cause.

## Ruled out

- **Auth / API key.** The key is valid and funded — a direct
  `POST https://api.anthropic.com/v1/messages` with the `.env` key returned
  `HTTP 200` ("Pong!"). The subprocess inherits the server's env
  (`spawn.ts`: `env: { ...process.env, ...opts.env }`), so it has the key. A
  missing key fails fast with an auth error, not a 2.5h hang.
- **The `doc_decompose` fix.** Claim scoping and target resolution were verified
  correct in this very run; the prompt-contract fix is unit-tested
  (`docDecompose.test.ts` round-trip). The hang is upstream of anything the fix
  touched.
- **Prompt-over-stdin / EOF stall.** The argv carries no prompt (no `--prompt-file`,
  no positional). `spawn.ts` delivers it via execa's `input:` option, which writes
  the string and **closes stdin**. So the agent is not parked waiting on stdin.

## Confirmed defects

> Status (2026-06-06): #1, #2, #3, #4 all **fixed**. #1 (hard watchdog) + #2
> (stream-json telemetry forwarding + idle watchdog) + #3 (forced exit →
> reconcile) + #4 (per-session transports + session teardown). See Resolution.

1. **No executor timeout / watchdog.** `spawnClaudeCode` (`server/src/dispatcher/
   executor/spawn.ts`) calls `execa(...)` with **no `timeout` option**. A
   subprocess that never exits is never killed. This is the root operational bug:
   nothing bounds a hung agent.
2. **No telemetry-based liveness signal.** `--print --bare` buffers all output
   until exit, and the agent emitted no `runner.emit_event`. A live run is a black
   box; you cannot distinguish a slow-but-working run from a frozen one.
3. **No hung-process reconciliation.** The lifecycle reconciler runs only on
   subprocess **exit** (`reconcileExit`). A frozen-but-alive process is invisible to
   it, so the task is stuck `RUNNING` and its resource claim is never released.
4. **MCP session leak on kill.** After `POST /api/tasks/:id/cancel` killed the
   subprocess, `dispatcher.activeSessions` stayed at `1` — the streamable-HTTP MCP
   session for the dead agent was not torn down. Session teardown isn't tied to
   subprocess death.

## Root-cause hypotheses (the actual freeze)

Ranked; not yet proven. The agent did ~20s of CPU work (boot, read required files,
possibly one model turn) then froze with the MCP session open.

1. **Stalled MCP round-trip (strongest).** The agent issued a `runner.*` MCP call
   over `/mcp` whose streamable-HTTP response never completed/flushed, so the
   agent's MCP client blocks awaiting the tool result and the whole turn freezes.
   Fits: `activeSessions` pinned at 1 (session open, mid-request), 0 events (the
   tool handler never wrote), near-zero CPU (blocked on the socket). This is the
   same `/mcp` surface implicated in e2e-findings #1 (binding/concurrency).
2. **Stalled model stream.** A streaming completion connection that hangs. Less
   likely — the non-streaming key test returned instantly — but `--print` may use a
   streaming path with different failure behavior.
3. **`--bare` quirk.** `--bare` strips config/keychain; a missing default (model
   resolution, an unexpected interactive prompt that `--permission-mode dontAsk`
   doesn't cover) could park it. Lower likelihood given it got ~20s in.

## Reproduce in a clean context

1. Boot the server (compiled is steadier — avoids e2e-findings #4):
   `node --env-file=.env server/dist/bin/ledger.js /Users/dennis/code/ledger --port 4180 --no-open`
2. Dispatch: `POST /api/dispatch/01-ui/02-dag` with body `{"type":"doc_decompose"}`
   (or any large doc). Note the returned task id.
3. Watch — it will likely hang: `ps -o etime,time,command -p <claude-pid>` shows
   wall-clock climbing while CPU TIME stalls; `sqlite3 .ledger/runner.db "SELECT
   count(*) FROM events WHERE task_id='<id>' AND kind!='status_change'"` stays 0;
   `/api/_health` `activeSessions` stays 1.
4. Bisect the freeze:
   - Run the **exact argv** manually with the rendered prompt piped to stdin and a
     hard `timeout 60`. If a minimal/trivial prompt also hangs → invocation/flags;
     if it returns → context/prompt-specific.
   - Add `--output-format stream-json --verbose` to see the **last action before
     the freeze** (tool call? model wait?). This single change is the fastest path
     to the real cause.
   - Drop `--mcp-config` and re-run: if it no longer hangs → confirms the MCP-stall
     hypothesis (#1).

## Proposed fixes

- **Watchdog (minimum viable).** Pass `timeout` to execa in `spawn.ts` (configurable,
  default ~15–20 min); on timeout, kill and have the reconciler transition the task
  to `FAILED` with reason `subprocess_timeout`. Frees the claim, surfaces the failure.
- **Idle/heartbeat watchdog (better).** Track last-event/last-stdout time; kill +
  `FAILED:subprocess_idle` after N minutes of no activity. Distinguishes a legit
  long run from a frozen one without a hard wall-clock cap.
- **Observability.** Spawn with `--output-format stream-json` and forward chunks
  into the events table (or a per-task log) so live runs are inspectable and the
  heartbeat has a signal. Addresses defect #2 and is the highest-leverage change.
- **MCP session cleanup.** Tear down the `/mcp` session when its bound subprocess
  dies or its task terminates (defect #4).
- **Investigate the MCP stall** per the bisection above; if a tool handler can hang,
  bound it server-side.

## Acceptance

- A dispatched agent that produces no telemetry and does not exit is killed and
  marked `FAILED` (with a distinguishing reason) within the timeout, releasing its
  resource claim.
- `dispatcher.activeSessions` returns to 0 after a task terminates (complete / fail
  / cancel).
- The operator can tell a working run from a hung one from the Tasks/Logs UI alone.

## Relationship to e2e-dispatch-findings #1

Finding #1 there is "MCP tools load intermittently; failure silently corrupts task
status" — but in that case the subprocess **exits cleanly (exit 0)** and the
reconciler mis-marks it `FAILED` (`subprocess_exit_without_terminal_status`). This
issue is the **non-exiting** sibling: the subprocess never returns, so there is no
exit to reconcile and the task is stuck `RUNNING` forever. Both point at the `/mcp`
round-trip as the suspect surface; a fix for the MCP stall may resolve both, but the
**watchdog (defect #1) is independent and should land regardless** — nothing should
be able to hang the runner indefinitely.

## Status of the thing being tested

The `doc_decompose` code fix (`c75cedc`) is unit-verified (claim scoping, target
resolution, and a prompt→child→`validateDocNode` round-trip). It **cannot be
validated end-to-end** until this dispatcher hang is fixed — the runtime can't run
an agent to completion or show why. Two prior `doc_decompose` runs (FAILED, then
this hung one) both produced zero model output.

**Update (2026-06-06):** the dispatcher blocker is removed (Resolution above) —
dispatched agents now reliably connect to MCP and can run to a terminal status. A
full end-to-end `doc_decompose` validation has **not** yet been run: it is a write
persona that edits docs and commits, so it is left as the operator's next step
rather than triggered unattended (cf. the 07-health-daemon disable rationale).

## Resolution (2026-06-06)

Landed in the `server` package (all gates green — 364 tests pass + 2 skipped,
typecheck + lint clean across the package; a pre-existing unrelated
`no-unnecessary-condition` error in `scanner/monitors.ts` was fixed in passing —
the `"Open Issues"` section is schema-required so the `?? ""` fallback was dead):

- **Per-session MCP transports** (`dispatcher/mcp/server.ts`). `createMcpServer`
  now keeps a `Map<sessionId, {transport, server}>`, creates a fresh transport +
  `McpServer` (tools registered via a new `registerTools` callback) on each
  `initialize`, routes by the `mcp-session-id` header, and tears the session down
  on close. The single-instance `.server` / `.transport` / `_connect` surface is
  gone (`McpServerHandleInternal` removed); `context.ts` passes `registerTools`.
  → fixes the root cause; defect #4 by design.
- **Session teardown on subprocess exit** — `closeTaskSessions(taskId)` on the
  handle, called in the executor's `finally`. claude does not DELETE /mcp on
  exit, so the executor force-closes the agent's bound session. → defect #4.
- **Watchdog** — `spawn.ts` gains `timeoutMs` → execa `timeout`; `claudeCode.ts`
  defaults to 20 min (`LEDGER_DISPATCH_TIMEOUT_MS` override, `0` disables). On
  elapse execa SIGTERMs then SIGKILLs (`forceKillAfterDelay`); `reconcileExit`
  maps `result.timedOut` → `FAILED:subprocess_timeout` (new reason), freeing the
  claim. → defects #1 and #3 (a frozen process is now forced to exit + reconcile).
- **Stream-json telemetry forwarding + idle watchdog** (defect #2;
  `dispatcher/executor/streamForward.ts`). The argv gains `--output-format
  stream-json --verbose`; `forwardClaudeStream` iterates the subprocess stdout
  line stream, maps each NDJSON event (`mapStreamEvent`, pure) to a runner
  LogEvent (`reasoning` / `tool_call` / `tool_result` / `error`), and `handle.emit`s
  it — landing in the events table AND streaming live to the Logs UI via
  `withPublishing`. A black-box run is now a live transcript. The same line
  stream re-arms an inactivity timer; silence for `idleMs` (default 5 min,
  `LEDGER_DISPATCH_IDLE_MS`, 0 disables) kills the subprocess → idle fires before
  the hard cap, reconciled to `FAILED:subprocess_idle`. → defect #2 + faster
  hang recovery. (stdout stays buffered — execa tees the buffer and the line
  iterator — so `result.stdout` and the reconcile failure-tail are unaffected.)

Verified:

- Live, real HTTP stack: two sequential `initialize`s both `200` with distinct
  session ids (was `400` "already initialized" on the second).
- Live, real claude agent: connects and successfully calls
  `mcp__ledger-runner__runner_get_task`, returning real task data.
- Tests: per-session regression + `closeTaskSessions`; watchdog `timedOut →
  subprocess_timeout` + idle `subprocess_idle` reconcile rows; the spawn
  timeout-kill; `mapStreamEvent` over every stream-json shape; a live
  `forwardClaudeStream` integration (real subprocess → events + idle-kill); the
  executor integration test asserts `activeSessions` returns to `0` after a run.
- **Live end-to-end dispatch** (`verify` on `01-ui/02-dag`, read-only persona):
  the agent connected to MCP and the run produced **77 events** — 28 `tool_call`
  + 28 `tool_result` + 18 `reasoning` + 3 `status_change` — a fully inspectable
  transcript (vs the original hang's 0 events). It hit a deliberately-short 240 s
  test cap (`LEDGER_DISPATCH_TIMEOUT_MS`) → `FAILED:subprocess_timeout` with the
  claim freed; `activeSessions` returned to `0`. (Production default is 20 min, so
  a normal verify would not time out — the short cap was the test bound.)

### Residual (claude-side, low severity, NOT addressed)

claude's `--print` `init` event still shows `mcp_servers:[{status:"pending"}]` —
it constructs turn 0 before the MCP client finishes connecting (~hundreds of ms),
so a single-shot prompt that quits after one turn can miss the tools. Real
multi-turn dispatch agents connect within the first turn or two (the probe
reached the tool by ~turn 3). This is a claude startup race, independent of the
transport bug. Mitigate at the prompt level if it ever bites.

### Follow-ups still open

- **`mcp__ledger-runner__*` transcript noise.** Forwarding is intentionally
  stateless, so the agent's own runner tool calls (emit_event / complete_task)
  appear as `tool_call`/`tool_result` events alongside the events they produce.
  Mildly redundant; filter by correlating tool_use ids → names if it bothers an
  operator.
- **Idle threshold tuning.** Default 5 min idle / 20 min hard cap are guesses; a
  thorough single model turn with no streamed output for >5 min would trip the
  idle watchdog. Revisit once real dispatch durations are observed (raise
  `LEDGER_DISPATCH_IDLE_MS` or set it to 0 to disable while tuning).

## Pointers

- `server/src/dispatcher/executor/spawn.ts` — the execa invocation (add `timeout`).
- `server/src/dispatcher/executor/lifecycle.ts` — `reconcileExit` (exit-only today).
- `server/src/dispatcher/executor/cancellation.ts` — cancel/kill registry.
- `server/src/dispatcher/mcp/server.ts` — `/mcp` streamable-HTTP transport + session
  lifecycle (sessions, `activeSessions`).
- `server/src/routes/tasks.ts` — `POST /api/tasks/:id/cancel`.
