/**
 * Per-dispatch MCP config JSON — written to os.tmpdir() before subprocess
 * spawn, cleaned up on subprocess exit (best-effort).
 *
 * Shape per parent §MCP config JSON (per-dispatch):
 *   { mcpServers: { "ledger-runner": { type: "http", url, headers } } }
 *
 * The `headers` map carries X-Ledger-Task-Id so the runner's MCP server
 * can bind the session to the task at `initialize` time (D9).
 */

import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface McpConfigHandle {
  path: string;
  cleanup(): Promise<void>;
}

export async function writeMcpConfig(
  taskId: string,
  port: number,
): Promise<McpConfigHandle> {
  const path = join(tmpdir(), `ledger-dispatch-${taskId}.mcp.json`);
  const config = {
    mcpServers: {
      "ledger-runner": {
        type: "http",
        url: `http://127.0.0.1:${String(port)}/mcp`,
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
      try {
        await unlink(path);
      } catch {
        // OS tmpdir cleanup is the fallback if the file is already gone
      }
    },
  };
}
