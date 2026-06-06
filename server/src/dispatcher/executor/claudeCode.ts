/**
 * ClaudeCodeExecutor — Executor implementation that spawns a `claude`
 * subprocess for every dispatched task.
 *
 * Orchestration (per spec §Executor implementation):
 *   1. Render prompt via renderPrompt(task, ctx)
 *   2. Write per-task MCP config JSON to tmpdir
 *   3. Spawn subprocess with pinned argv + LEDGER_TASK_ID env
 *   4. Register subprocess in cancellation registry
 *   5. Await subprocess exit
 *   6. Read final task status from store
 *   7. Reconcile exit state → lifecycle transition
 *   8. Unbind cancellation registry, close any leaked MCP session, cleanup config (finally)
 *
 * Pre-spawn failures (renderPrompt throws, writeMcpConfig fails, etc.) are
 * caught and transitioned with executorInternalError(msg) (D10).
 *
 * Watchdog (dispatcher-hang-issue.md, defect #1): the subprocess is spawned with
 * a wall-clock `timeoutMs`. A hung agent (no telemetry, no exit) is killed and
 * reconciled to FAILED:subprocess_timeout instead of sitting RUNNING forever.
 */

import type { Task } from "@ledger/parser";
import type { Executor } from "../../runner/executors.js";
import type { ProjectContext } from "../../context.js";
import { reasons } from "../../runner/scheduler.js";
import { spawnClaudeCode } from "./spawn.js";
import { writeMcpConfig } from "./mcpConfig.js";
import { reconcileExit } from "./lifecycle.js";
import { forwardClaudeStream } from "./streamForward.js";
import { renderPrompt } from "../prompts/index.js"; // replaces the stage-4 stub; 04 landed at the same merge bubble

// Write-capable personas need Edit/Write/Bash beyond the base MCP wildcard.
// Read-only personas only need the MCP tools; Read is auto-allowed in --print mode.
const WRITE_TOOLS = ["Edit", "Write", "Bash"];
const WRITE_PERSONAS: ReadonlySet<Task["type"]> = new Set([
  "implement",
  "spec_draft",
  "doc_refactor",
  "doc_decompose",
]);

function extraAllowedTools(taskType: Task["type"]): string[] {
  return WRITE_PERSONAS.has(taskType) ? WRITE_TOOLS : [];
}

// Watchdog defaults (dispatcher-hang-issue.md). The hard wall-clock cap bounds a
// run that keeps emitting but never finishes; the idle cap (lower) catches a
// frozen run that has gone silent. Both override via env; 0 disables either.
const DEFAULT_DISPATCH_TIMEOUT_MS = 20 * 60 * 1000; // hard cap → subprocess_timeout
const DEFAULT_DISPATCH_IDLE_MS = 5 * 60 * 1000; // no stream output → subprocess_idle

function resolveMs(override: number | undefined, envVar: string, fallback: number): number {
  if (override !== undefined) return override;
  const env = process.env[envVar];
  if (env !== undefined && env !== "") {
    const parsed = Number(env);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Optional test-only override: allow tests to pass a claudeBin path so
// the fake-claude fixture can be used without mutating PATH (D5, Spec Review B3).
// Production callers never pass claudeBin.
// ---------------------------------------------------------------------------
export interface ClaudeCodeExecutorOpts {
  claudeBin?: string;
  /** Hard wall-clock timeout (ms). Defaults to LEDGER_DISPATCH_TIMEOUT_MS or 20 min. */
  timeoutMs?: number;
  /** Idle (no-output) timeout (ms). Defaults to LEDGER_DISPATCH_IDLE_MS or 5 min; 0 disables. */
  idleMs?: number;
}

export function createClaudeCodeExecutor(
  ctx: ProjectContext,
  opts: ClaudeCodeExecutorOpts = {},
): Executor {
  const timeoutMs = resolveMs(opts.timeoutMs, "LEDGER_DISPATCH_TIMEOUT_MS", DEFAULT_DISPATCH_TIMEOUT_MS);
  const idleMs = resolveMs(opts.idleMs, "LEDGER_DISPATCH_IDLE_MS", DEFAULT_DISPATCH_IDLE_MS);
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
          extraAllowedTools: extraAllowedTools(task.type),
          claudeBin: opts.claudeBin,
          timeoutMs,
        });
        ctx.dispatchCancellation.bind(task.id, subprocess);

        // Forward stream-json telemetry into the events table and drive the idle
        // watchdog. This is the stdout consumer, so it must complete before we
        // await the result (which only resolves on subprocess exit). It returns
        // when the stream ends — normal exit, idle kill, or hard-timeout kill.
        const forward = await forwardClaudeStream({
          taskId: task.id,
          handle,
          subprocess,
          idleMs,
        });

        // execa@9: ResultPromise IS the awaitable; resolves to Result on exit.
        // reject: false means non-zero exit codes resolve (not throw).
        const result = await subprocess;

        // Store API returns TaskStatus | undefined (non-throwing for missing id) —
        // the undefined guard in reconcileExit is correct defence (Spec Review S2).
        const final = ctx.runner.store.getStatus(task.id);
        // Normalise execa's Result to the ExitResult structural type. At runtime
        // stderr is always a string (reject:false, no object-mode transforms), but
        // the execa generic resolves the union broadly under the default Options
        // instantiation — coerce to string to satisfy the structural type (S3).
        const stderrStr = typeof result.stderr === "string" ? result.stderr : undefined;
        const stdoutStr = typeof result.stdout === "string" ? result.stdout : undefined;
        reconcileExit(
          task,
          {
            exitCode: result.exitCode,
            signal: result.signal,
            stderr: stderrStr,
            stdout: stdoutStr,
            timedOut: result.timedOut,
            idle: forward.idleKilled,
          },
          final,
          handle,
        );
      } catch (err) {
        // Pre-spawn failures: renderPrompt throw, writeMcpConfig fail,
        // claude binary not found (synchronous execa throw), etc.
        const msg = err instanceof Error ? err.message : String(err);
        handle.fail(task.id, reasons.executorInternalError(msg));
      } finally {
        ctx.dispatchCancellation.unbind(task.id);
        // Force-close any MCP session the agent left open (claude does not
        // reliably send DELETE /mcp on exit) so activeSessions returns to 0 —
        // defect #4. No-op when the agent never connected or already closed.
        ctx.mcp.closeTaskSessions(task.id);
        await mcpConfig?.cleanup();
      }
    },
  };
}
