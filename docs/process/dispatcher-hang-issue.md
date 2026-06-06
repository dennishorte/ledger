# Dispatcher hang — agent subprocess freezes indefinitely with no watchdog (2026-06-06)

Living reference / issue writeup, not an implementation node. Captures a
reproducible dispatcher failure found while validating the `doc_decompose` fix
(`c75cedc`) end-to-end, so it can be fixed in a clean context without re-deriving.

Sibling doc: `docs/process/e2e-dispatch-findings.md` — this is a **new, distinct**
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

## Pointers

- `server/src/dispatcher/executor/spawn.ts` — the execa invocation (add `timeout`).
- `server/src/dispatcher/executor/lifecycle.ts` — `reconcileExit` (exit-only today).
- `server/src/dispatcher/executor/cancellation.ts` — cancel/kill registry.
- `server/src/dispatcher/mcp/server.ts` — `/mcp` streamable-HTTP transport + session
  lifecycle (sessions, `activeSessions`).
- `server/src/routes/tasks.ts` — `POST /api/tasks/:id/cancel`.
