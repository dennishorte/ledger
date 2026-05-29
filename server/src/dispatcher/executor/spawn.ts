/**
 * Thin execa wrapper that pins the exact claude argv:
 *   claude --print --bare --mcp-config <path>
 * with the rendered prompt piped via stdin (no --prompt-file flag exists — D16),
 * LEDGER_TASK_ID env set, and cwd set to the project root.
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
   * Test-only override for the binary (default "claude"). Production code
   * never passes this. Tests pass `${process.execPath} path/to/fake-claude.mjs`
   * to substitute a node-driven fake without mutating PATH (D5; Spec Review B3).
   *
   * If the value contains spaces the first token is the command and the rest
   * are prefix arguments prepended before the --print argv.
   */
  claudeBin?: string;
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

  return execa(
    cmd,
    [...prefixArgs, "--print", "--bare", "--mcp-config", opts.mcpConfigPath],
    {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      input: opts.stdin, // execa@9 pipes string → stdin automatically
      all: false, // stderr captured separately; stdout captured by default
      reject: false, // don't throw on non-zero exit; lifecycle reconciler reads result.exitCode
    },
  );
}
