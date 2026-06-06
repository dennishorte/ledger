/**
 * Thin execa wrapper that pins the exact claude argv:
 *   claude --print --bare --mcp-config <path>
 *         --allowedTools "mcp__ledger-runner__*"
 *         --permission-mode dontAsk
 *         --output-format stream-json --verbose
 * with the rendered prompt piped via stdin (no --prompt-file flag exists — D16),
 *
 * --output-format stream-json --verbose makes claude emit one NDJSON event per
 * stdout line (instead of buffering a single blob at exit). The executor streams
 * those lines via forwardClaudeStream → events table (defect #2 observability)
 * and uses them as the idle watchdog's liveness signal. stdout stays buffered
 * (execa tees the buffer and the line iterator), so result.stdout is unaffected.
 * LEDGER_TASK_ID env set, and cwd set to the project root.
 *
 * --allowedTools grants all five runner.* MCP tools (wildcard on server key).
 * --permission-mode dontAsk auto-denies any tool not in the allowlist without
 * blocking on an interactive prompt (the default mode prompts, which hangs in
 * --print mode).
 *
 * Returns a ResultPromise which is both awaitable (resolves to Result on exit)
 * and killable (exposes .kill(signal) for the cancellation registry).
 *
 * reject: false — non-zero exit codes return rather than throw, so the
 * lifecycle reconciler can inspect result.exitCode directly.
 */

import { execa, type ResultPromise } from "execa";

export interface SpawnOpts {
  cwd: string;
  env: Record<string, string>;
  mcpConfigPath: string;
  stdin: string;
  /**
   * Additional tools to add to --allowedTools beyond the base MCP wildcard.
   * Used by write-capable personas (implement, spec_draft, doc_refactor) to
   * grant Edit, Write, Bash. Read-only personas (spec_review, verify, etc.)
   * pass an empty array — Read is allowed by default in --print mode.
   */
  extraAllowedTools?: string[];
  /**
   * Test-only override for the binary (default "claude"). Production code
   * never passes this. Tests pass `${process.execPath} path/to/fake-claude.mjs`
   * to substitute a node-driven fake without mutating PATH (D5; Spec Review B3).
   *
   * If the value contains spaces the first token is the command and the rest
   * are prefix arguments prepended before the --print argv.
   */
  claudeBin?: string;
  /**
   * Watchdog wall-clock timeout in milliseconds. Passed straight to execa's
   * `timeout` option: on elapse execa sends SIGTERM, escalating to SIGKILL after
   * `forceKillAfterDelay` (5 s default) so a process that ignores SIGTERM is
   * still killed. The resolved Result carries `timedOut: true`, which the
   * lifecycle reconciler maps to FAILED:subprocess_timeout. Omit / 0 disables it
   * (no watchdog) — see docs/_investigations/dispatcher-hang-issue.md, defect #1.
   */
  timeoutMs?: number;
}

export function spawnClaudeCode(opts: SpawnOpts): ResultPromise {
  const bin = opts.claudeBin ?? "claude";
  // If bin is a multi-token string (`node /path/to/fake-claude.mjs`),
  // split into [cmd, ...prefixArgs] so execa receives them separately.
  const parts = bin.split(" ");
  // parts always has ≥1 element (String.prototype.split never returns []).
  // The ?? fallback satisfies noUncheckedIndexedAccess without a non-null assertion.
  const cmd = parts[0] ?? bin;
  const prefixArgs = parts.slice(1);

  const allowedTools = ["mcp__ledger-runner__*", ...(opts.extraAllowedTools ?? [])].join(",");

  return execa(
    cmd,
    [
      ...prefixArgs,
      "--print", "--bare",
      "--mcp-config", opts.mcpConfigPath,
      "--allowedTools", allowedTools,
      "--permission-mode", "dontAsk",
      "--output-format", "stream-json", "--verbose",
    ],
    {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      input: opts.stdin, // execa@9 pipes string → stdin automatically
      all: false, // stderr captured separately; stdout captured by default
      reject: false, // don't throw on non-zero exit; lifecycle reconciler reads result.exitCode
      // Watchdog: undefined leaves execa's default (no timeout). A positive value
      // bounds the run; on elapse execa kills the process and resolves with
      // timedOut:true (reject:false keeps it a resolve, not a throw).
      ...(opts.timeoutMs && opts.timeoutMs > 0 ? { timeout: opts.timeoutMs } : {}),
    },
  );
}
