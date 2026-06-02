# End-to-end dispatch test — findings (2026-06-01)

First live, end-to-end exercise of the dispatch loop: operator dispatch → runner
scheduler → `ClaudeCodeExecutor` → real `claude --print --bare` subprocess →
MCP `/mcp` round-trip → events table → terminal transition → doc lifecycle.
Run against the project's own repo on a throwaway branch (`test/e2e-dispatch`,
since deleted). This is living reference, not an implementation node — it
records what the first real run proved and broke.

## What was tested

| Tier | Scope | Result |
|------|-------|--------|
| 1 | Read-only dispatch (`project_status_review` on `root`) | ✅ PASS |
| 2 | Full implement lifecycle on a throwaway APPROVED leaf | ✅ PASS |
| 3 | Health-daemon detect → enqueue → dispatch (one bloated doc) | ⚠️ Path works; surfaced two HIGH defects |

**Positives proven.** When the MCP toolset binds, the whole loop works: subprocess
spawn, prompt render (correct `nodeId`→doc-path resolution), MCP `emit_event`
flow, terminal `complete_task`, and lifecycle transitions all function. Tier 2
produced the exact prescribed two-commit shape (entry status-only +
exit code+Implementation Notes), a byte-exact artifact, and `reasoning`/`artifact`
events in the store. The implementer agent also showed sound judgment — it caught
that the sandbox spec failed the `document-node` schema, verified the failure was
pre-existing, and correctly refused to over-scope.

## Findings

### 1. 🔴 CRITICAL — MCP tools load intermittently; failure silently corrupts task status
When the `runner.*` MCP toolset does **not** bind in a dispatched session, the
agent still does its work — and may **commit it** — but cannot `emit_event` or
issue a terminal call. The executor then reconciles the clean (exit 0) subprocess
to `FAILED` via `subprocess_exit_without_terminal_status`. **Task status no longer
reflects reality.**

- Observed twice: Tier-1 "run 1" (110 s, zero events, exit-without-terminal) and
  the Tier-3 `doc_refactor`, which **committed `17c3b0e`** ("drop daemon-trip
  filler, reconcile stale note") yet whose task shows `FAILED`. The agent's own
  stdout: *"I could not issue the terminal `runner.complete_task` call — the
  `runner.*` MCP toolset was not available in this session."*
- Suspected triggers: concurrency (two agents hitting `/mcp` at once — the
  Tier-3 refactor ran alongside a `project_status_review`) and/or large prompts
  (the bloated 125 KB doc). The session-binding path carries `X-Ledger-Task-Id`
  through `AsyncLocalStorage` into `onsessioninitialized`; concurrent inits are a
  prime suspect for a crossed/lost binding.
- Impact: undermines the runner's core premise that task status reflects outcome.
  A FAILED task may have shipped committed work; a "failure" may be a false alarm.
- Direction: make MCP binding failure **hard-fail fast** (agent should refuse to
  proceed without its tools, not do the work blind), and/or have the executor
  detect "committed but no terminal call" rather than blanket-FAILED. Investigate
  the concurrent-init binding race directly.

> **Direction (2026-06-02):** findings #2 and #3 are addressed not by hardening the
> write path but by a **report-only redesign** of the daemon — it stops dispatching
> write-agents and instead produces a durable, deduplicated report; remediation
> becomes an explicit operator action. See `docs/07-health-daemon.md` §"Proposed
> redesign (v2)". Findings #1 and #4–#6 are independent of that and still stand.

### 2. 🔴 HIGH — Daemon auto-dispatches unreviewed write-agents that commit and race the git index
Booting the server with a valid `ANTHROPIC_API_KEY` is sufficient for the health
daemon to enqueue `doc_refactor` (write-persona) tasks against every spec over the
size threshold — agents then edit **and `git commit`** specs on the working branch
with no HITL gate. They run concurrently in one working tree; git's index lock is
repo-global, so commits race. In this run ~24 agents fired; 6 won the commit race,
~18 lost it (file edits survived in the working tree, commits dropped), one stuck
half-`git add`ed. The §6.3 resource-claim model protects logical node writes but
**not** the shared git index. *(Also filed as an Open Issue in `00-project.md` §11;
proposed fix: isolated worktree/branch per write-agent + land via PR / `human_review`;
gate daemon-originated tasks behind `human_review`; claim the git index as a resource.)*

### 3. 🔴 HIGH — Daemon-enqueued tasks starve (never dispatched without an external tick)
The daemon enqueues via the raw `store.createTask` (`server/src/daemon/index.ts`),
**not** `runner.createTask`. The scheduler has no self-timer — it ticks only when
`runner.createTask`/`runner.tick` is called. So a daemon-enqueued task sits
`PENDING` indefinitely until *unrelated* operator activity happens to tick the
scheduler. Proven: a controlled `doc_refactor` (`ba0a29a3`) sat `PENDING` across
240+ daemon ticks and went `RUNNING` the instant an operator dispatch ticked the
scheduler. Combined with #2 this is perverse: the daemon floods when the system is
busy (incidental ticks sweep its backlog) yet is inert when idle. Fix: the daemon
must drive the runner (`runner.createTask` or an explicit `runner.tick()` after
enqueue), or the scheduler needs a periodic tick.

### 4. 🟡 MEDIUM — `tsx watch` hot-reload drops `ANTHROPIC_API_KEY`
The `pnpm -C server dev` boot loads `.env` via `tsx --env-file-if-exists`, but the
injection is **not** re-applied on watch-reload. The original boot authenticates;
the first source edit triggers a reload, and every subsequent dispatch fails with
`Not logged in · Please run /login` (exit 1). A compiled `node --env-file=.env
server/dist/bin/ledger.js` boot is immune. Any source edit during a dev session
silently breaks dispatch auth — a real dev-ergonomics trap.

### 5. 🟡 MEDIUM — Dispatch route reads a boot-cached doc graph
`POST /api/dispatch/:nodeId` resolves against `project.docs`, built once at
`loadProjectContext`, while `GET /api/docs` reads the tree live. A node created or
edited after boot is visible in the UI/`/api/docs` but returns `node_not_found`
from dispatch until the server restarts. (Hit twice: a newly created sandbox node
and a post-boot manifest-id fix.)

### 6. 🟢 LOW
- **Daemon silently skips schema-invalid docs.** `validateDocNode` failures are
  `continue`d (non-blocking by design) — but a doc too malformed to validate is
  exactly the one you'd want health monitoring to flag; it's instead invisible.
- **Read-only personas can run `Bash`.** `project_status_review` (not a
  write-persona) executed a Bash call, though the executor's allowlist comment
  implies only Read is auto-granted in `--print` mode.
- **Cancel guard works.** `POST /api/tasks/:id/cancel` correctly rejects a
  non-RUNNING task with `wrong_status`; the happy-path SIGTERM cancel was not
  exercised.

## How to re-run safely
- Boot **compiled** with the env pinned: `node --env-file=.env
  server/dist/bin/ledger.js <path> --port 4180 --no-open` (immune to #4).
- **Disable the daemon** for controlled dispatch tests: set
  `LEDGER_DAEMON_SIZE_THRESHOLD_TOKENS`, `LEDGER_DAEMON_STALENESS_GRACE_DAYS`,
  `LEDGER_DAEMON_ORPHAN_THRESHOLD_DAYS` huge and `LEDGER_DAEMON_INTERVAL_MS` long
  (#2/#3 fire otherwise).
- Before rebooting after a daemon run, cancel leftover `daemon_triggered` PENDING
  tasks in `.ledger/runner.db` — the scheduler picks them up on boot regardless of
  daemon state.
- Restart the server after creating/editing a node you intend to dispatch (#5).
