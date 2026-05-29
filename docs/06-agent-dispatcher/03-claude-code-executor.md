# Claude Code Executor

**Node ID:** `06-agent-dispatcher/03-claude-code-executor`
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** APPROVED
**Created:** 2026-05-28
**Last Updated:** 2026-05-28 (SPEC_REVIEW → APPROVED — applied 3 blocking + 4 should-fix + 4 nits from independent review)

**Dependencies:** `06-agent-dispatcher/02-runner-tools` (the MCP tools the spawned subprocess will call; `Runner.handle`; `BindingRegistry`), `06-agent-dispatcher/04-prompt-templates` (loose-coupled at the function signature `renderPrompt(task, ctx): string` — sibling leaf running in parallel, no file overlap per parent's §Children carve-up)

---

## Requirements

Ship the **`ClaudeCodeExecutor`** that spawns a `claude` subprocess for every dispatched task, injects the per-task MCP config so the subprocess connects back to the runner's MCP server, pipes the rendered prompt over stdin, and translates the subprocess's exit state into the runner's task lifecycle. After this leaf, executing a task transitions `PENDING → RUNNING` and triggers a real `claude` invocation that streams MCP tool calls back into the runner's events table; the agent's `runner.complete_task` / `runner.fail_task` / `runner.await_human_review` calls land the terminal transition; the executor's exit-code mapping covers the failure modes the agent itself does not.

This is the **third sub-leaf** of `06-agent-dispatcher`. The parent's Children manifest names it: `ClaudeCodeExecutor registered for the eight real task types; subprocess spawn via execa with --print --bare --mcp-config <path> (D17) and prompt piped via stdin (D16); LEDGER_TASK_ID env; exit-code → task-status lifecycle table; new status reasons SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS (bare const) + subprocessFailed(tail) (builder) + CANCELLED_BY_OPERATOR (bare const) registered in runner/scheduler.ts reasons const; CI smoke test against the installed claude version to catch invocation-flag regressions on upgrades`. Every clause is in scope.

This leaf and `04-prompt-templates` are the **parallelizable pair** in the parent's `01 → 02 → {03, 04} → 05` build order. The carve-up is by directory: `03`'s code lives under `server/src/dispatcher/executor/`; `04`'s under `server/src/dispatcher/prompts/`. They couple only via the function signature `renderPrompt(task: Task, ctx: ProjectContext): string` that `04` exports and `03` consumes — a loose, single-call coupling. The shared resources both leaves touch are limited to `server/src/context.ts` (executor registration in `loadProjectContext`; the prompts module is imported by `03`, not wired into context separately). Per leaf-workflow Known Limitations, the operator dispatches both implementers but resolves any rebase conflict at stage 5 manually.

In scope for v1:

1. **`server/src/dispatcher/executor/` module** with three files:
   - `claudeCode.ts` — the `Executor` implementation (`{ run(task, handle): Promise<void> }`); orchestrates the four phases (prompt render → MCP config write → spawn → lifecycle reconciliation).
   - `spawn.ts` — `spawnClaudeCode(opts): ExecaSubprocess` thin wrapper around `execa` that pins the exact argv (`["claude", "--print", "--bare", "--mcp-config", mcpConfigPath]`), pipes the prompt to stdin, sets `LEDGER_TASK_ID` env, sets cwd to `projectCtx.projectRoot`. Returns the subprocess handle for the lifecycle reconciler.
   - `mcpConfig.ts` — `writeMcpConfig(taskId, port): Promise<{ path: string; cleanup(): void }>` writes a temp JSON file under `os.tmpdir()` with the per-task MCP config (`url: http://127.0.0.1:<port>/mcp`, `headers: { "X-Ledger-Task-Id": <id> }`); returns the path and a cleanup callback the executor invokes on subprocess exit (success or failure).
   - `lifecycle.ts` — `reconcileExit(task, exit, finalStatus, handle): void` — pure function implementing the lifecycle table (parent §ClaudeCodeExecutor exit-code mapping). No subprocess management; just `(exit, finalStatus) → transition` logic.
2. **`execa` added as a direct dependency** of `server/package.json`. Confirmed not currently present (verified at draft time, 2026-05-28). Pin to `^9.6` (latest at draft is `9.6.1`). ESM-only is fine — `server/` is already `"type": "module"`.
3. **Three new entries on `server/src/runner/scheduler.ts`'s `reasons` const** (parent §Type coordination table):
   - `SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS` — bare constant, value `"subprocess_exit_without_terminal_status"`. Emitted by `lifecycle.ts` row 2 (clean exit + RUNNING).
   - `subprocessFailed(tail: string)` — builder function, value `\`subprocess_failed:${tail.slice(0, 80)}\``. Mirrors the existing `approvedWithNote` / `rejected` truncation convention from `03-hitl-gate`. Emitted by `lifecycle.ts` rows 3 + 5 (non-zero exit / SIGKILL crash, both while task is RUNNING).
   - `CANCELLED_BY_OPERATOR` — bare constant, value `"cancelled_by_operator"`. Emitted by `POST /api/tasks/:id/cancel` from `05-dispatch-api`'s upcoming route — NOT by the executor (corrected per Spec Review S1; the executor's row 4 checks `final === "CANCELLED"`, which is a status not a reason). Landing the constant here keeps the subprocess-lifecycle reason vocabulary co-located rather than splitting it across `03` and `05`; the cancel route imports `reasons.CANCELLED_BY_OPERATOR` from this leaf's additions.
4. **`ClaudeCodeExecutor` registered for the eight real task types** in `loadProjectContext`. The eight types — `implement`, `spec_review`, `verify`, `spec_draft`, `reverify`, `doc_refactor`, `issue_triage`, `project_status_review` — are enumerated in `@ledger/parser/runner/types.ts`. The same executor instance handles all eight; the dispatch is type-blind (prompt rendering is `04-prompt-templates`' job; the executor receives the rendered string and treats every type identically from spawn-and-wait perspective). Registration happens in `loadProjectContext` after the existing `noop` and `human_review` defaults (which the runner's `createDefaultRegistry` already populates per `05-task-runner/02-scheduler`).
5. **The exit-code → task-status lifecycle table** (parent §ClaudeCodeExecutor pseudocode, refined here). Implemented as the pure `lifecycle.ts` function so it's unit-testable without subprocess spawning. Five rows:

   | Row | Predicate | Final task status (re-read post-exit) | Executor action | Reason |
   |---|---|---|---|---|
   | 0 | `final === undefined` | task row gone (test cleanup) | no transition | n/a |
   | 4 | `final === "CANCELLED"` | cancel route eagerly wrote CANCELLED | no transition | n/a |
   | 1 | `result.exitCode === 0` AND `final ∈ {COMPLETE, FAILED, AWAITING_HUMAN_REVIEW}` | terminal or suspended — agent reported correctly | no transition | n/a |
   | 2 | `result.exitCode === 0` AND `final === RUNNING` | agent forgot a terminal MCP tool call | `handle.fail(id, reasons.SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS)` | bare const |
   | 3+5 | catch-all (any non-zero/undefined exit, signal-killed, etc., with `final === RUNNING`) | subprocess crashed or signal-killed without cancel route | `handle.fail(id, reasons.subprocessFailed(result.stderr ?? ""))` | builder; truncates to 80 chars at reason layer |

   Row 4 is now evaluated FIRST (Spec Review B2 fix) — once the task is CANCELLED, the executor honours it regardless of how the subprocess exited (clean, signal, code). The catch-all merges old rows 3 and 5: any exit with `final === "RUNNING"` that wasn't a clean termination or an agent-driven complete-call ends as `subprocessFailed`. Old row 5's "SIGKILL + RUNNING" case lands here naturally; old row 3's "code != 0 + RUNNING" also lands here.
6. **`stderr` tail capture.** `spawn.ts` configures `execa` with `all: false` (default — stderr captured separately) and a buffered stderr (no streaming). On exit, the buffered stderr (or `""` if `result.stderr === undefined` per TS strict typing) is passed directly to `reasons.subprocessFailed(stderr)`, which truncates to 80 chars at the reason layer — consistent with the existing `reasons.rejected` / `approvedWithNote` convention. Single-stage truncation (revised per Spec Review N1; the original two-stage 200-line buffer was dead code given the 80-char floor on the reason string). A future `runner.emit_event`-style executor-driven `kind=error` event could carry the full untruncated stderr in its body for debugging — logged as Open Issue.
7. **MCP config JSON** at `os.tmpdir()/ledger-dispatch-<task-id>.mcp.json`. Shape per parent §MCP config JSON (per-dispatch):
   ```jsonc
   {
     "mcpServers": {
       "ledger-runner": {
         "type": "http",
         "url": "http://127.0.0.1:<port>/mcp",
         "headers": { "X-Ledger-Task-Id": "<task-id>" }
       }
     }
   }
   ```
   The `port` is read off `ProjectContext.port` (set by `04-api-server/04-cli-launcher`'s CLI argument; defaults to 4180 if not overridden). `writeMcpConfig` returns a `cleanup()` callback that `fs.unlink`s the file on subprocess exit (best-effort; OS tmpdir cleanup is the fallback if the executor crashes before cleanup runs).
8. **Subprocess cancellation registry** at `server/src/dispatcher/executor/cancellation.ts`. A `Map<TaskId, Subprocess>` (where `Subprocess` is the execa@9 supertype of `ResultPromise` — the kill side without the awaitable side) that the `claudeCode.ts` executor populates on spawn and clears on exit; `05-dispatch-api`'s `POST /api/tasks/:id/cancel` route looks up the subprocess via `cancellation.lookup(taskId)?.kill("SIGTERM")` to deliver the cancel signal. The registry is exposed read-only via `ProjectContext.dispatchCancellation: CancellationRegistry` for the dispatch endpoint to consume. The registry handles the per-task lookup; the cancel route owns the eager-DB-write side of D14 of the parent. This leaf ships the registry; the cancel route in `05-dispatch-api` wires it. Two-leaf coupling is intentional: the cancel API surface is `05`'s concern; the subprocess handle is `03`'s; cancellation needs both.
9. **`Executor`-level error handling** for unexpected exceptions in the executor's own code (vs the subprocess's). If `renderPrompt` throws (template bug), `writeMcpConfig` fails (tmpdir not writable), or `spawnClaudeCode` synchronously errors (claude binary not found), the executor catches and calls `handle.fail(task.id, "executor_internal_error:<message>")` with the error message capped at 80 chars. The new reason constant `EXECUTOR_INTERNAL_ERROR` builder is added in the same `reasons` block as the three primary additions — minor surface widening for defensive robustness; logged in §Decisions as D-?? rather than the parent's three primary additions. Test coverage exercises each pre-spawn failure path.
10. **Tests** at `server/test/dispatcher/executor/`:
    - **`lifecycle.test.ts`** — pure function; covers all five rows of the lifecycle table with synthetic `(exit, finalStatus)` inputs and asserts the right `handle.fail` / `handle.complete` calls (via a recording mock handle). No subprocess.
    - **`mcpConfig.test.ts`** — `writeMcpConfig` writes a valid JSON file at the expected tmpdir path with the right shape; `cleanup()` removes it; double-cleanup is safe.
    - **`spawn.test.ts`** — `spawnClaudeCode` constructs the exact argv (`["claude", "--print", "--bare", "--mcp-config", "..."]`), pipes the prompt via stdin, sets `LEDGER_TASK_ID` env; the subprocess is started but immediately killed via `subprocess.kill("SIGTERM")` to avoid a real claude invocation in the test environment. Verifies the spawned-process configuration without exercising claude itself.
    - **`claudeCode.test.ts`** — integration test using a **fake-claude subprocess** (a tiny `node` script under `server/test/fixtures/fake-claude.mjs` that reads stdin, opens an MCP session against the runner's MCP endpoint, calls `runner.emit_event` + `runner.complete_task`, exits 0). The test constructs the executor wiring with `claudeBin: \`${process.execPath} \${path.join(__dirname, "../../fixtures/fake-claude.mjs")}\`` — `spawn.ts`'s `claudeBin?` parameter (D5+B3) does the substitution without mutating PATH or mocking the spawn module. The executor spawns the fake and asserts the task transitions PENDING → RUNNING → COMPLETE, the events table includes the reasoning event, and the cancellation registry clears on exit. This is the highest-leverage test in the leaf.
    - **`cancellation.test.ts`** — `bind/lookup/unbind` round-trip; concurrent task ids; `kill` delegation. No subprocess.
    - **CI smoke test** — `server/test/dispatcher/executor/smoke.test.ts` env-gated via `process.env.LEDGER_SMOKE_TESTS`: `(LEDGER_SMOKE_TESTS ? describe : describe.skip)(...)`. Runnable via `LEDGER_SMOKE_TESTS=1 pnpm -C server test smoke.test.ts` without file edits (Spec Review N2 fix; the original "edit `describe.skip` to `describe`" approach defeats the file's discoverability). The smoke test spawns the **real `claude` binary**, asserting the argv it accepts and that an `initialize`/`tools/list` round-trip succeeds. Skipped by default because the test depends on the operator's `claude` install and on `ANTHROPIC_API_KEY` / `apiKeyHelper` being configured — not portable to a vanilla CI runner. The parent §Open Issues note "CI smoke test ... validates `--print` + `--bare` + `--mcp-config` + stdin still work end-to-end on each upgrade" lands here.
11. **Build / typecheck / lint / test green** across the workspace. App bundle delta zero. Server `dist/` delta reported in Implementation Notes against the post-`02-runner-tools` baseline (360K).

**Out of scope for this child:**

- **Prompt rendering content.** `04-prompt-templates`. This leaf imports `renderPrompt` from `@/dispatcher/prompts` and calls it; it does not author any template content.
- **Resource-claim declarations.** `04-prompt-templates` D11 ships per-task-type claim defaults via the separate `defaultResourceClaims(task)` export. This leaf does NOT consume claims at all — the executor receives the rendered prompt string only via `renderPrompt(task, ctx)`; `05-dispatch-api`'s `POST /api/dispatch/:nodeId` is the consumer of `defaultResourceClaims` when synthesising the dispatched task's `resourceClaims` field (Spec Review N4).
- **`POST /api/dispatch/:nodeId` endpoint.** `05-dispatch-api`. This leaf executes whatever the runner tasks dispatch into — operator-injected via `POST /api/tasks`, daemon-enqueued (a future leaf), or dispatched via the upcoming endpoint.
- **`POST /api/tasks/:id/cancel` endpoint.** `05-dispatch-api`. This leaf ships the cancellation registry's subprocess-handle Map; the cancel route owns the HTTP surface + eager-DB-write side.
- **Watchdog timeout** (parent D12). The dispatched task runs for as long as `claude` needs. No `--max-tokens`, no per-task timeout. Operator cancels via `05`'s cancel route when wedged.
- **SIGKILL escalation timer on hung cancel** (parent §Open Issues "Zombie subprocesses after eager cancel"). v2 polish; the cancellation registry is the right home for it when it lands, but v1 leaves the cancel as SIGTERM-only.
- **Streaming partial agent output.** The agent's reasoning + tool-call events ride through `runner.emit_event` from `02-runner-tools`. The executor does NOT parse `claude --print`'s stdout for event extraction. If the agent emits no events, the task's log shows only the dispatcher's own boot/start event and the terminal transition.
- **Multi-process / parallel subprocess pool.** Each dispatched task gets its own subprocess; no pooling. The scheduler's resource-claim primitive serializes overlapping writes; this leaf does not add another layer.
- **Subprocess sandboxing.** Parent §Out-of-scope item. The spawned `claude` inherits the runner's filesystem permissions. Claude Code's own `.claude/settings.json` allowlists are the only blast-radius control.
- **Per-dispatch model override.** Parent §Type coordination's `Task.agent = { model: "claude-code", persona: task.type }` decision: the model string is opaque ("claude-code"); the actual underlying model is whatever the operator's `claude` CLI is configured for. No `--model` flag passed at the executor level.
- **Authentication for `claude`.** `--bare` documents that auth uses `ANTHROPIC_API_KEY` or `apiKeyHelper` strictly. Operator configures at the env level; the executor passes nothing.
- **Cost / token tracking.** PRD §13 non-goal. No `--max-budget-usd` flag, no token-count capture.
- **Cleanup of orphaned tmp MCP config files** beyond the per-exit best-effort `fs.unlink`. The OS tmpdir is periodically cleared; we do not implement a startup sweep.

---

## Design

### Repository layout after this node

```
ledger/
├── server/
│   ├── package.json                                # +execa^9.6 in deps
│   ├── src/
│   │   ├── context.ts                              # modified — register ClaudeCodeExecutor for 8 task types;
│   │   │                                           #   expose dispatchCancellation on ProjectContext
│   │   ├── runner/
│   │   │   └── scheduler.ts                        # modified — 3 new reasons entries
│   │   │                                           #   (SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS,
│   │   │                                           #    subprocessFailed builder, CANCELLED_BY_OPERATOR)
│   │   │                                           #   + 1 defensive (executorInternalError builder)
│   │   └── dispatcher/
│   │       ├── index.ts                            # modified — re-export createCancellationRegistry,
│   │       │                                       #   CancellationRegistry, claudeCodeExecutor (or factory)
│   │       └── executor/                           # NEW
│   │           ├── claudeCode.ts                   # NEW — the Executor implementation
│   │           ├── spawn.ts                        # NEW — spawnClaudeCode thin wrapper
│   │           ├── mcpConfig.ts                    # NEW — writeMcpConfig + cleanup
│   │           ├── lifecycle.ts                    # NEW — pure reconcileExit function
│   │           └── cancellation.ts                 # NEW — Map<TaskId, ExecaSubprocess> registry
│   └── test/
│       ├── fixtures/
│       │   └── fake-claude.mjs                     # NEW — minimal MCP client + emit + complete
│       └── dispatcher/
│           └── executor/                           # NEW (mirrors src/dispatcher/executor)
│               ├── lifecycle.test.ts
│               ├── mcpConfig.test.ts
│               ├── spawn.test.ts
│               ├── claudeCode.test.ts              # integration via fake-claude
│               ├── cancellation.test.ts
│               └── smoke.test.ts                   # describe.skip; real claude invocation
└── docs/
    └── 06-agent-dispatcher/
        ├── 00-agent-dispatcher.md                  # modified — manifest row PLANNED → DRAFT → …
        └── 03-claude-code-executor.md              # this spec
```

### `Executor` implementation

```ts
// server/src/dispatcher/executor/claudeCode.ts
import type { Executor, RunnerHandle } from "../../runner/executors.js";
import type { ProjectContext } from "../../context.js";
import { reasons } from "../../runner/scheduler.js";
import { spawnClaudeCode } from "./spawn.js";
import { writeMcpConfig } from "./mcpConfig.js";
import { reconcileExit } from "./lifecycle.js";
import { renderPrompt } from "../prompts/index.js";   // 04-prompt-templates' export

export function createClaudeCodeExecutor(ctx: ProjectContext): Executor {
  return {
    async run(task, handle) {
      let mcpConfig: { path: string; cleanup(): Promise<void> } | undefined;
      try {
        const prompt = renderPrompt(task, ctx);
        mcpConfig = await writeMcpConfig(task.id, ctx.port);
        const subprocess = spawnClaudeCode({
          cwd: ctx.projectRoot,
          env: { LEDGER_TASK_ID: task.id },
          mcpConfigPath: mcpConfig.path,
          stdin: prompt,
        });
        ctx.dispatchCancellation.bind(task.id, subprocess);
        const result = await subprocess;                   // execa@9: ResultPromise IS the awaitable; resolves to Result
        const final = ctx.runner.store.getStatus(task.id); // Store API returns TaskStatus | undefined (non-throwing for missing id)
        reconcileExit(task, result, final, handle);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        handle.fail(task.id, reasons.executorInternalError(msg));
      } finally {
        ctx.dispatchCancellation.unbind(task.id);
        await mcpConfig?.cleanup();
      }
    },
  };
}
```

The executor is a factory function `(ctx) => Executor` rather than a singleton const because it closes over `ctx` (project root, port, cancellation registry). `loadProjectContext` calls the factory once and registers the returned `Executor` for all eight task types via `runner.registerExecutor(type, executor)` in a loop.

### `spawn.ts`

```ts
// server/src/dispatcher/executor/spawn.ts
import { execa, type ResultPromise } from "execa";

export interface SpawnOpts {
  cwd: string;
  env: Record<string, string>;
  mcpConfigPath: string;
  stdin: string;
  /**
   * Test-only override for the binary name (default "claude"). Production code
   * never passes this; tests pass `${process.execPath} test/fixtures/fake-claude.mjs`
   * to substitute a node-driven fake without mutating PATH (D5; Spec Review B3).
   */
  claudeBin?: string;
}

export function spawnClaudeCode(opts: SpawnOpts): ResultPromise {
  const bin = opts.claudeBin ?? "claude";
  // If bin is a multi-token string (`node test/fixtures/fake-claude.mjs`), split into [cmd, ...prefixArgs].
  const parts = bin.split(" ");
  const cmd = parts[0]!;
  const prefixArgs = parts.slice(1);
  return execa(
    cmd,
    [...prefixArgs, "--print", "--bare", "--mcp-config", opts.mcpConfigPath],
    {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      input: opts.stdin,           // execa@9 pipes string → stdin automatically
      all: false,                  // stderr captured separately
      reject: false,               // don't throw on non-zero exit; we read result.exitCode
    },
  );
}
```

`execa@9`'s `input` option accepts a string and pipes it to the child's stdin without manual stream management. `reject: false` makes non-zero exit codes return-not-throw, which is what the lifecycle reconciler needs. The returned `ResultPromise` is both a `Subprocess` (has `.kill(signal)` for the cancellation registry) AND a `Promise<Result>` (awaitable). `Result` carries `exitCode?: number`, `signal?: string`, `stderr: string` (default-captured). The `pid` is on the Subprocess side if a future watchdog needs it.

The hardcoded `"claude"` resolves through `PATH`. The operator's `claude` install is what runs — this is a deliberate choice (per parent D17, `--bare` does not auto-discover CLAUDE.md or read keychain; the operator's `~/.claude` is the auth source). Documented in §Decisions.

### `mcpConfig.ts`

```ts
// server/src/dispatcher/executor/mcpConfig.ts
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface McpConfigHandle {
  path: string;
  cleanup(): Promise<void>;
}

export async function writeMcpConfig(taskId: string, port: number): Promise<McpConfigHandle> {
  const path = join(tmpdir(), `ledger-dispatch-${taskId}.mcp.json`);
  const config = {
    mcpServers: {
      "ledger-runner": {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { "X-Ledger-Task-Id": taskId },
      },
    },
  };
  await writeFile(path, JSON.stringify(config), "utf8");
  let cleaned = false;
  return {
    path,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      try { await unlink(path); } catch { /* OS tmpdir clean is the fallback */ }
    },
  };
}
```

Double-cleanup is safe (the `cleaned` flag short-circuits). The `try/catch` around `unlink` swallows ENOENT and any other filesystem error — the file is ephemeral; failing to remove it is not a runtime concern, just hygiene.

### `lifecycle.ts`

```ts
// server/src/dispatcher/executor/lifecycle.ts
import type { Task, TaskStatus } from "@ledger/parser";
import type { RunnerHandle } from "../../runner/executors.js";
import type { Result } from "execa";   // execa@9: `Result`, NOT `ExecaResult` (does not exist)
import { reasons } from "../../runner/scheduler.js";

const TERMINAL: ReadonlySet<TaskStatus> = new Set(["COMPLETE", "FAILED", "AWAITING_HUMAN_REVIEW"]);

export function reconcileExit(
  task: Task,
  result: Result,
  final: TaskStatus | undefined,
  handle: RunnerHandle,
): void {
  if (final === undefined) return;                            // task gone (test cleanup); no transition
  if (final === "CANCELLED") return;                          // row 4: cancel route eagerly wrote CANCELLED; honour it regardless of signal/exitCode (Spec Review B2)
  if (result.exitCode === 0 && TERMINAL.has(final)) return;   // row 1: success path
  if (result.exitCode === 0 && final === "RUNNING") {         // row 2: agent forgot terminal call
    handle.fail(task.id, reasons.SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS);
    return;
  }
  // rows 3 + 5: non-zero exit code OR signal-killed, final is RUNNING (cancel route never wrote CANCELLED)
  handle.fail(task.id, reasons.subprocessFailed(result.stderr ?? ""));
}
```

Pure function: takes the exit `result` and `final` status as inputs, returns nothing, calls into `handle` for transitions. No subprocess management, no filesystem, no clock. Trivially unit-testable: pass a synthetic `ExecaResult`-shaped object and assert on a recording mock handle's calls. The `final === undefined` early-return guards the rare case where the task row was deleted during execution (test cleanup, or a future GC); silent no-op is correct since there is nothing to transition.

### `cancellation.ts`

```ts
// server/src/dispatcher/executor/cancellation.ts
import type { Subprocess } from "execa";   // execa@9: `Subprocess` is the kill-side type; `ResultPromise` extends it
import type { TaskId } from "@ledger/parser";

export interface CancellationRegistry {
  bind(taskId: TaskId, subprocess: Subprocess): void;
  unbind(taskId: TaskId): void;
  lookup(taskId: TaskId): Subprocess | undefined;
  size(): number;
}

export function createCancellationRegistry(): CancellationRegistry {
  const map = new Map<TaskId, Subprocess>();
  return {
    bind(taskId, subprocess) { map.set(taskId, subprocess); },
    unbind(taskId) { map.delete(taskId); },
    lookup(taskId) { return map.get(taskId); },
    size() { return map.size; },
  };
}
```

Trivial registry; same shape as `02-runner-tools`'s `BindingRegistry` but specialized to `Subprocess` values. The `Subprocess` type is `execa`'s union of the various subprocess flavours (`ResultPromise`, etc.); for v1 we keep it loose-typed at the registry boundary because the only consumer (`05-dispatch-api`'s cancel route) needs only `.kill(signal)`. Future tightening if needed.

### `reasons` const additions

```ts
// server/src/runner/scheduler.ts (additive, inside the existing `reasons` block)
export const reasons = {
  // ... existing entries ...
  SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS: "subprocess_exit_without_terminal_status",
  subprocessFailed: (tail: string) => `subprocess_failed:${tail.slice(0, 80)}`,
  CANCELLED_BY_OPERATOR: "cancelled_by_operator",
  executorInternalError: (msg: string) => `executor_internal_error:${msg.slice(0, 80)}`,
} as const;
```

Three additions are parent's prescription (D-numbered there); the fourth (`executorInternalError`) is this leaf's defensive addition for pre-spawn failures (renderPrompt throw, writeMcpConfig failure, claude-binary-not-found). All four follow the existing convention: bare constants for fixed strings (uppercase property names); builder functions for parameterized ones (camelCase property names, 80-char truncation matching `approvedWithNote` and `rejected`).

### `ProjectContext` wiring

```ts
// server/src/context.ts (relevant additions)
import { createCancellationRegistry } from "./dispatcher/executor/cancellation.js";
import { createClaudeCodeExecutor } from "./dispatcher/executor/claudeCode.js";
import type { CancellationRegistry } from "./dispatcher/executor/cancellation.js";

const DISPATCHER_TASK_TYPES = [
  "implement", "spec_review", "verify", "spec_draft",
  "reverify", "doc_refactor", "issue_triage", "project_status_review",
] as const satisfies readonly TaskType[];

export interface ProjectContext {
  // ... existing fields ...
  dispatchCancellation: CancellationRegistry;
}

export async function loadProjectContext(opts: { projectPath: string; port: number }): Promise<ProjectContext> {
  // ... existing setup through runner + mcp + binding + tool registration ...
  const dispatchCancellation = createCancellationRegistry();
  const ctxPartial = { /* existing fields */, dispatchCancellation };
  const claudeCodeExecutor = createClaudeCodeExecutor(ctxPartial as ProjectContext);
  for (const type of DISPATCHER_TASK_TYPES) {
    runner.registerExecutor(type, claudeCodeExecutor);
  }
  return ctxPartial;
}
```

The order matters: `dispatchCancellation` must be on `ctxPartial` before `createClaudeCodeExecutor` reads it (the executor factory captures the registry reference). The two-step `ctxPartial as ProjectContext` cast is the existing pattern from `01-mcp-server`'s wiring — preferred over a deeper type juggling because the field set is complete at runtime; the cast asserts that the partial we're passing IS the full context (which it is by the time the factory runs).

### `Task.agent` synthesis

Per parent §Type coordination Spec Review S1: dispatched tasks have `agent: { model: "claude-code", persona: task.type }`. This is set by `05-dispatch-api`'s `POST /api/dispatch/:nodeId` endpoint when synthesising the `TaskInput`. The executor does NOT set or modify `task.agent` — it only reads (no read path in v1; the agent metadata is for UI display, not behaviour). Logged here for cross-leaf awareness; no action in this leaf.

### Acceptance check (manual, end-to-end)

1. `pnpm install` succeeds with the new `execa@^9.6` dep on `darwin-arm64`.
2. `pnpm -C packages/parser build` and `pnpm -C server build` complete clean.
3. `pnpm -C server dev /Users/dennis/code/ledger` boots; existing endpoints respond; `tools/list` on `/mcp` still returns the five `02-runner-tools` tools.
4. `POST /api/tasks` with `{ "type": "implement", "title": "test", "resourceClaims": [] }` returns 201 with the task PENDING. Within ~1s the task transitions PENDING → RUNNING and a `claude` subprocess is alive on the system (verifiable via `ps`). If the operator's `claude` install is configured with `ANTHROPIC_API_KEY` / `apiKeyHelper`, the agent runs. If not, the subprocess exits non-zero with an auth error, the executor's lifecycle row 3 fires, and the task transitions RUNNING → FAILED with reason `subprocess_failed:<auth stderr tail>`.
5. **Fake-claude integration** (the highest-leverage automated path): the test suite spawns `fake-claude.mjs` instead of `claude` via a configured executor variant, observes the round-trip PENDING → RUNNING → COMPLETE with intermediate `reasoning` events, and asserts the events table content.
6. Subprocess receiving SIGTERM: `kill -TERM <pid>` while a task is RUNNING; the task stays RUNNING (no auto-CANCELLED — the cancel route owns that side, not the signal handler). When the signal-receiving subprocess exits, the executor's lifecycle row 4 fires only if final is CANCELLED — which it isn't in this scenario, so row 5 fires and the task transitions to FAILED with `subprocess_failed:`. (The "right" cancel flow lives in `05-dispatch-api`'s cancel route, which writes CANCELLED before delivering SIGTERM. Verified end-to-end when `05` ships.)
7. Subprocess crash (kill -9): `kill -KILL <pid>` while a task is RUNNING. Executor's row 5 fires; task transitions RUNNING → FAILED with `subprocess_failed:` (stderr tail empty or truncated).
8. Server restart with a task RUNNING: orphan recovery (`05-task-runner/02-scheduler`) transitions the task to FAILED with `orphaned_on_restart`. The executor is not invoked again for the same task (the orphaned recovery is terminal).
9. `pnpm typecheck`, `pnpm lint`, `pnpm test` exit zero across the workspace. The smoke test is `describe.skip`'d by default.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `execa@^9.6` as the subprocess library, not Node's bare `child_process` | execa handles input piping via the `input` option (no manual stream management), captures stderr to a buffered string with a single config flag, returns a typed result on exit, and exposes `.kill(signal)` on the subprocess handle. The equivalent `child_process.spawn` call requires ~30 LOC of stream plumbing per spawn site. execa is a single direct dep + zero transitive bloat (its own deps are small). |
| D2 | Hardcoded `"claude"` argv[0]; no path override | The operator's `claude` install (resolved via PATH) is the auth source: `--bare` reads `ANTHROPIC_API_KEY` / `apiKeyHelper` from the operator's env, not from any per-dispatch config. Providing a per-dispatch path override would only matter if we wanted to dispatch against a non-default `claude` install; v1 has no such use case. If a future scenario emerges (testing a beta `claude`), add a `LEDGER_CLAUDE_BIN` env override; out of scope here. |
| D3 | Same `ClaudeCodeExecutor` instance registered for all eight task types | The type dispatch is `04-prompt-templates`' concern (`renderPrompt` switches on `task.type` to pick the template); the spawn-and-wait logic is type-blind. Registering the same instance avoids accidental per-type customization in the executor that would couple to template details. The eight-type list is a `const satisfies readonly TaskType[]` in `context.ts` — TypeScript's exhaustiveness check catches if a new `TaskType` lands in the parser without being added here. |
| D4 | `lifecycle.ts` is a pure function, not a method on the executor object | Pure functions are unit-testable without spawning subprocesses or stubbing `Executor`'s closure-captured deps. The lifecycle table is the leaf's highest-leverage logic; isolating it from subprocess management lets us cover every row with synthetic inputs in milliseconds. |
| D5 | Fake-claude fixture (`test/fixtures/fake-claude.mjs`) is the primary integration test, NOT the real `claude` binary; substitution rides on `spawnClaudeCode`'s optional `claudeBin?` parameter (per Spec Review B3) | Real `claude` requires (a) the binary present on PATH, (b) `ANTHROPIC_API_KEY` configured, (c) network access. None of these are guaranteed in a vanilla CI. The fake-claude fixture is a ~50-line Node script that: reads stdin (the prompt), opens an MCP HTTP client to `http://127.0.0.1:<port>/mcp` using `LEDGER_TASK_ID` as the binding header, emits one `runner.emit_event` of kind `reasoning`, calls `runner.complete_task`, exits 0. It exercises the same code path real claude would. The test-only `claudeBin?` parameter on `SpawnOpts` (defaults to `"claude"`) accepts a space-separated `${node} ${script}` form; the production executor never passes it. NOT the same as the deferred `LEDGER_CLAUDE_BIN` env override (D2) — that would be an operator-facing surface; `claudeBin?` is purely a function-argument injection point. The real-claude path is the env-gated smoke test. |
| D6 | `--bare` is mandatory (parent D17 inheritance, restated for in-leaf clarity) | Without `--bare`, claude auto-loads CLAUDE.md, runs hooks, syncs plugins, and reads the keychain — none of which are appropriate for a dispatched subprocess (the runner provides the context explicitly via prompt). `--bare`'s documented behaviour also pins auth to `ANTHROPIC_API_KEY` / `apiKeyHelper`, avoiding OAuth dialogue requirements. |
| D7 | `--print` is mandatory | Without `--print`, claude drops into the interactive TUI and never exits. The executor's `subprocess.exited` promise would never resolve. |
| D8 | Prompt piped via stdin (`execa input: prompt`), not via positional argument | The positional `[prompt]` argv slot is capped by `ARG_MAX` (~256KB on Linux, smaller on macOS), and `execa` would need to escape shell metacharacters. Stdin is uncapped and string-clean. Parent D16 verified `--prompt-file` does not exist; stdin is the only option. |
| D9 | Cancellation registry is a Map, not a per-task signal handler chain | A signal handler chain (subscribe-on-spawn, fire-on-cancel-event) would couple the cancellation event surface to a Node EventEmitter, adding a layer between the cancel route and the kill call. The Map's `.lookup(taskId)?.kill(signal)` is one statement; the surface is honest about what it does. |
| D10 | `reasons.executorInternalError` builder added alongside the parent's three prescribed entries | Pre-spawn failures (renderPrompt throw, writeMcpConfig fail, claude-binary-not-found) need a distinct reason — they're not subprocess failures in the lifecycle-table sense. Reusing `subprocessFailed` would mislabel the failure as "the subprocess ran and failed" when actually no subprocess was created. A new builder maintains the existing convention without scope creep. |
| D11 | `tail(stderr, 200 lines)` before `reasons.subprocessFailed`'s 80-char truncation — two-stage cap | The 200-line tail bounds the in-memory string the executor handles; the 80-char truncation matches the existing `reasons.rejected` / `approvedWithNote` convention. A future `runner.emit_event`-style executor-emitted error event could carry the full 200-line tail in its body for richer debugging; v1 just lands the truncated reason on `status_change` and drops the rest. |
| D12 | MCP config JSON written to `os.tmpdir()`, not `.ledger/` (parent D13 inheritance) | The config contains no project state — just a URL + a task-id header. Writing to `.ledger/` would pollute the working tree with N transient files per dispatch. Tmpdir is the natural ephemeral location; OS cleanup is the fallback if the executor crashes before `cleanup()` runs. |
| D13 | `port` read off `ProjectContext.port`, not hardcoded `4180` | The CLI accepts `--port` overrides (`04-api-server/04-cli-launcher`); hardcoding `4180` would make a port-overridden server's dispatched subprocesses connect to the wrong endpoint. `ProjectContext.port` is the canonical source. |
| D14 | CI smoke test is `describe.skip` by default, runnable explicitly via vitest's name filter or `it.only` retrofit | The real-claude test depends on operator-specific state that vanilla CI cannot provide. Skipping makes it discoverable (visible in test reports as "skipped") without requiring CI gating against an undeployable test. Future CI matrix that pre-installs `claude` + secrets can flip the skip. |

---

## Open Issues

- **No watchdog timeout on dispatched subprocess.** Parent D12 prescribed this. A dispatched task can run for hours when claude is doing real work. Wrong defaults break good runs; cancel is the operator's safety valve. *(Priority: LOW — inherited from parent.)*
- **No SIGKILL escalation after SIGTERM.** Parent §Open Issues "Zombie subprocesses after eager cancel" — a subprocess that traps or ignores SIGTERM keeps running. Mitigation (deferred): a per-task timer started in `cancellation.ts` when `kill("SIGTERM")` is called; on firing (5–10s), send SIGKILL and emit a `subprocess_killed` log event. The timer would live in this leaf's cancellation registry (which owns the subprocess handle), not in the cancel route. *(Priority: MEDIUM — surfaces when cancellation is heavily used; safer to address after `05-dispatch-api` lands the cancel route.)*
- **`smoke.test.ts` skipped by default.** D14 acknowledges: vanilla CI cannot run the real-claude smoke. Operator runs locally before tagging a release as a hand-discipline practice. A future CI matrix with `claude` pre-installed + secrets bound would let us flip the skip; gated by infra availability. *(Priority: LOW.)*
- **MCP config JSON cleanup is best-effort.** If the executor process is killed (SIGKILL on the API server itself, OOM, etc.) between subprocess spawn and `cleanup()`, the tmp config file leaks. OS tmpdir is cleared periodically (Linux: tmpfs reboot; macOS: ~3 days), so accumulation is bounded. A startup sweep (`fs.readdir(tmpdir).filter(f => f.startsWith("ledger-dispatch-")).map(unlink)`) is the obvious mitigation; not v1. *(Priority: TRIVIAL.)*
- **`Subprocess` type loose-typed at the cancellation registry boundary.** D9 acknowledges: the registry holds `Subprocess` values (execa's union) without narrowing. Tightening to a `KillableProcess` interface that exposes only `kill(signal): boolean` would constrain `05-dispatch-api`'s consumption to the cancel-only surface. Defer; current surface is fine for v1. *(Priority: TRIVIAL.)*
- **`renderPrompt(task, ctx)` signature is the only coupling to `04-prompt-templates`.** If `04` ships with a different signature (e.g., returns `{ prompt: string; claims: ResourceClaim[] }` rather than a bare string), this leaf's `claudeCode.ts` adapts. The signature is documented in `04`'s spec; cross-leaf coordination at stage 5 (rebase) is the resolution. *(Priority: TRIVIAL — already accounted for in the parallel-leaf protocol.)*
- **No structured stderr capture beyond the reason tail.** The executor reads stderr for the failure reason but does not preserve the full content. Debugging a subprocess crash requires re-running with `claude --debug` or scraping the system log. A future `runner.emit_event`-style executor-driven kind=error event with full stderr in the body would help; v1 lands the truncated reason on `status_change` and stops. *(Priority: LOW.)*

---

## Spec Review (2026-05-28)

Independent spec review was run against this DRAFT in a clean Sonnet context. Verdict: **NEEDS_MAJOR_REVISIONS** — 3 Blocking (B1, B2, B3), 4 Should-fix (S1–S4), 4 Nits (N1–N4), 5 Confidence notes. PRD coverage matrix returned Addressed across §5/§6.1/§6.2/§7/§11. All findings applied. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `execa@9` API was wrong in three places: `Subprocess.exited` does not exist, `ExecaResult` does not exist as an exported type, `ExecaSubprocess` (Requirements §8) does not exist. Real compile errors. | `spawn.ts` return type changed to `ResultPromise` (the awaitable + killable union); `claudeCode.ts` calls `await subprocess` (not `subprocess.exited`); `lifecycle.ts` imports `Result` (not `ExecaResult`); §8 prose uses `Subprocess` consistently. Inline comments cite `execa@9` specifics. |
| B2 | Lifecycle row 4 had a real logic bug: signal check (`SIGTERM \|\| SIGKILL`) was redundant with `final === "CANCELLED"`, but also caused a race-condition gap where a clean exit with `final` already CANCELLED would fall through to rows 3+5 and double-fail. Plus row order was top-down so the post-cancel race path was reachable. | `reconcileExit` now checks `final === "CANCELLED"` FIRST (immediately after the `final === undefined` early-return); the signal check is dropped entirely; the catch-all (former rows 3+5) merges into one. Requirements §5 table reorganised with row numbers and explanatory note. The behaviour: once the cancel route has written CANCELLED, the executor honours it regardless of exitCode/signal. |
| B3 | Fake-claude fixture (D5) was the primary test path but no mechanism was specified for swapping `claude` argv[0] with the fake. PATH manipulation is fragile; mocking `spawnClaudeCode` defeats the integration shape. | Added `claudeBin?: string` parameter to `SpawnOpts` (test-only override; default `"claude"`). The space-separated form (`"${node} ${script}"`) lets the test pass a node-driven script without process module mocking. Updated D5 to call out the substitution mechanism explicitly; updated §10 (tests) to show the exact `claudeBin` argument shape. Distinct from the deferred `LEDGER_CLAUDE_BIN` env override (D2) — `claudeBin?` is purely a function argument, not an operator surface. |
| S1 | `CANCELLED_BY_OPERATOR`'s justification "the executor's lifecycle table row 4 checks for it" was backward — row 4 checks `final === "CANCELLED"` (a status), not the reason string. The reason is what `05-dispatch-api` writes. | Justification rewritten to: the cancel route in `05-dispatch-api` emits the constant; the leaf adds it now to keep the subprocess-lifecycle reason vocabulary co-located. |
| S2 | `store.getStatus` return contract was unstated — the `final === undefined` guard in `reconcileExit` is only correct if the store returns `undefined` (not throws) for missing IDs. | `claudeCode.ts` pseudocode now has an inline comment confirming the contract: "Store API returns TaskStatus | undefined (non-throwing for missing id)". The contract matches the existing `05-task-runner/01-store-schema` Store API; the guard is real defense, not dead code. |
| S3 | `result.stderr` could be typed as `string \| undefined` under TS strict; the `tail(result.stderr, 200)` call would emit a TS error. | The two-stage truncation collapsed (per N1) and the remaining call is `reasons.subprocessFailed(result.stderr ?? "")`. The `?? ""` makes the undefined case explicit. |
| S4 | Requirements §8 said `Map<TaskId, ExecaSubprocess>` but `ExecaSubprocess` is not exported by `execa@9`. | Renamed to `Map<TaskId, Subprocess>` (the real export) with an inline note that `Subprocess` is the kill-side supertype of `ResultPromise`. |
| N1 | Two-stage stderr truncation (200 lines → 80 chars) was dead code: the 200-line `tail()` was always followed by `reasons.subprocessFailed`'s 80-char `.slice(0, 80)`, so the 200-line stage was wasted work. | Collapsed to single-stage: `reasons.subprocessFailed(result.stderr ?? "")`. The `tail()` helper deleted from `lifecycle.ts` pseudocode. The "future runner.emit_event for full stderr" path is logged as Open Issue (was already there; reworded). |
| N2 | `describe.skip` doesn't allow env-gated activation without file edits; D14's "vitest's name filter" claim is wrong (filter doesn't override skip). | Smoke test now uses `(process.env.LEDGER_SMOKE_TESTS ? describe : describe.skip)(...)` — env-gated run via `LEDGER_SMOKE_TESTS=1 pnpm -C server test smoke.test.ts`. Updated Requirements §10 and §Decisions D14. |
| N3 | Reviewer flagged `task.parent_task_id` snake_case usage as a potential issue; investigation showed the spec does NOT use that field (no direct field access). | Resolved on inspection; no change required. Recorded so future readers don't repeat the search. |
| N4 | Out-of-scope bullet for resource-claim declarations was muddled — said this leaf "reads claims via `renderPrompt`'s return type", but `renderPrompt` returns a bare string; claims are on the separate `defaultResourceClaims` export and consumed by `05-dispatch-api`, not by the executor. | Bullet rewritten: "this leaf does NOT consume claims at all — the executor receives the rendered prompt string only; `05-dispatch-api` is the consumer of `defaultResourceClaims`." |

Reviewer's **Confidence notes** (recorded for the stage-4 implementer to spot-check):

1. **`execa@9` API verified.** Reviewer confirmed against the installed tarball's d.ts: `.exited` doesn't exist; `ExecaResult` doesn't exist; `Result` IS exported; `Subprocess` IS exported; `input: string`, `cwd`, `env`, `reject: false` all valid options; `result.exitCode?: number` (optional); `result.signal?: keyof SignalConstants`; `result.stderr: string` (default-captured, but TS may widen to `string | undefined` under generic inference — `?? ""` guard is the safety net). The B1 fix lands the right shapes.
2. **`--mcp-config` JSON `"type": "http"` value UNVERIFIED.** Inherited from parent's confidence notes — needs `claude --mcp-config <test.json>` round-trip at implementation time to confirm. Possible alternatives: `"streamable-http"`, `"sse"`. The implementer runs a one-line smoke at install time and adjusts.
3. **`store.getStatus` returns `undefined` (not throws) for missing IDs.** Reviewer cross-checked against `scheduler.ts` line 183's dep-check usage which compares to `"COMPLETE"` without a null guard. The contract is established; the guard in `reconcileExit` is correct defense.
4. **`BindingRegistry` wiring in `context.ts` is established pattern.** Reviewer confirmed the two-step `ctxPartial as ProjectContext` cast in `02-runner-tools`'s wiring; this leaf follows the same pattern for `dispatchCancellation`.
5. **`registerExecutor` overwrite warning won't fire.** Reviewer confirmed the eight dispatcher task types are disjoint from the default registry's `noop`/`human_review`.

Reviewer's structural assessment: scope matches parent's Children manifest row; tone matches `01-mcp-server.md` and `02-runner-tools.md`. D1 (execa over child_process) and D4 (pure `lifecycle.ts`) are sound; B2's lifecycle simplification makes the table cleaner. Ready for APPROVED.

Nothing punted; all 3 blocking + 4 should-fix + 4 nits + 5 confidence notes landed.

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this leaf moves from `VERIFY` to `COMPLETE`, the verifier confirms:

1. **Build / typecheck / lint / test.** `pnpm install`, `pnpm -C packages/parser build`, `pnpm -C server build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit zero. The smoke test is `describe.skip`'d. Bundle delta on `app/` is exactly zero (no UI changes). Server `dist/` delta is reported in Implementation Notes against the post-`02-runner-tools` baseline (360K).
2. **Eight task types registered.** `runner.registerExecutor` is called for each of the eight dispatcher task types in `loadProjectContext`. Verifiable by running a `POST /api/tasks` with each type and checking the task transitions PENDING → RUNNING (the noop and human_review types continue to use their own executors).
3. **Lifecycle table coverage.** All five rows of `reconcileExit` are exercised by `lifecycle.test.ts` with synthetic inputs; assertions match the table's prescribed actions.
4. **Fake-claude integration green.** `claudeCode.test.ts` spawns `fake-claude.mjs`, observes PENDING → RUNNING → COMPLETE round-trip with a reasoning event in the events table, and asserts the cancellation registry cleared post-exit.
5. **Cancellation registry round-trip.** `cancellation.test.ts` covers `bind/lookup/unbind` and concurrent task ids.
6. **MCP config JSON shape.** `mcpConfig.test.ts` asserts the exact JSON structure (URL with the configured port; `X-Ledger-Task-Id` header; `type: "http"`) and that `cleanup()` removes the file.
7. **`reasons` const additions present.** `SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS`, `subprocessFailed`, `CANCELLED_BY_OPERATOR`, and `executorInternalError` all exist with the right shapes; existing reasons untouched.
8. **No regressions.** `04-api-server`, `05-task-runner`, `01-mcp-server`, `02-runner-tools` all continue to pass their tests; `noop` and `human_review` flows continue to work end-to-end.
9. **Parent manifest row** updated to `COMPLETE (v1)`; PRD §14 row reflects 3/5 children COMPLETE (assuming `04-prompt-templates` has not landed; if it has, 4/5 — depends on merge order); CLAUDE.md round-2 dispatcher line synced.

---

## Children

None. This leaf has no further decomposition.
