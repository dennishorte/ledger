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
 *   8. Unbind from cancellation registry + cleanup MCP config (finally)
 *
 * Pre-spawn failures (renderPrompt throws, writeMcpConfig fails, etc.) are
 * caught and transitioned with executorInternalError(msg) (D10).
 */

import type { Task } from "@ledger/parser";
import type { Executor } from "../../runner/executors.js";
import type { ProjectContext } from "../../context.js";
import { reasons } from "../../runner/scheduler.js";
import { spawnClaudeCode } from "./spawn.js";
import { writeMcpConfig } from "./mcpConfig.js";
import { reconcileExit } from "./lifecycle.js";

// ---------------------------------------------------------------------------
// renderPrompt — imported from 04-prompt-templates when that leaf lands.
// TEMPORARY STUB: 04-prompt-templates is shipping in parallel; this stub
// unblocks 03's gates. The import is replaced by the real renderPrompt once
// 04 merges to main and the stage-5 rebase runs. Documented in Implementation Notes.
// ---------------------------------------------------------------------------
function renderPrompt(_task: Task, _ctx: ProjectContext): string {
  return `STUB PROMPT — replaced when 04-prompt-templates lands.\n\nTask ID: ${_task.id}\nTask type: ${_task.type}`;
}

// ---------------------------------------------------------------------------
// Optional test-only override: allow tests to pass a claudeBin path so
// the fake-claude fixture can be used without mutating PATH (D5, Spec Review B3).
// Production callers never pass claudeBin.
// ---------------------------------------------------------------------------
export interface ClaudeCodeExecutorOpts {
  claudeBin?: string;
}

export function createClaudeCodeExecutor(
  ctx: ProjectContext,
  opts: ClaudeCodeExecutorOpts = {},
): Executor {
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
          claudeBin: opts.claudeBin,
        });
        ctx.dispatchCancellation.bind(task.id, subprocess);

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
        reconcileExit(task, { exitCode: result.exitCode, signal: result.signal, stderr: stderrStr }, final, handle);
      } catch (err) {
        // Pre-spawn failures: renderPrompt throw, writeMcpConfig fail,
        // claude binary not found (synchronous execa throw), etc.
        const msg = err instanceof Error ? err.message : String(err);
        handle.fail(task.id, reasons.executorInternalError(msg));
      } finally {
        ctx.dispatchCancellation.unbind(task.id);
        await mcpConfig?.cleanup();
      }
    },
  };
}
