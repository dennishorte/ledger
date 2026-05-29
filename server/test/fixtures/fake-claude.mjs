#!/usr/bin/env node
/**
 * fake-claude.mjs — minimal Claude Code substitute for integration tests.
 *
 * Simulates the subprocess the ClaudeCodeExecutor spawns:
 *   1. Reads stdin (the rendered prompt) to completion
 *   2. Parses --mcp-config <path> from argv to get the MCP server URL + task-id header
 *   3. Connects to the runner's MCP server via StreamableHTTPClientTransport
 *   4. Emits one runner.emit_event of kind=reasoning
 *   5. Calls runner.complete_task
 *   6. Closes the MCP client
 *   7. Exits 0
 *
 * The test harness passes this as:
 *   claudeBin: `${process.execPath} ${path.join(__dirname, "../../fixtures/fake-claude.mjs")}`
 *
 * LEDGER_TASK_ID env is set by the executor; the MCP config path comes from argv.
 */

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------------------------------------------------------------------------
// 1. Drain stdin (the rendered prompt)
// ---------------------------------------------------------------------------
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const _prompt = Buffer.concat(chunks).toString("utf8");

// ---------------------------------------------------------------------------
// 2. Parse --mcp-config <path> from argv
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
// Expected argv: [ "--print", "--bare", "--mcp-config", "<path>" ]
// We're invoked as: node fake-claude.mjs --print --bare --mcp-config <path>
const mcpConfigIdx = args.indexOf("--mcp-config");
if (mcpConfigIdx === -1 || !args[mcpConfigIdx + 1]) {
  process.stderr.write("fake-claude: missing --mcp-config argument\n");
  process.exit(1);
}
const mcpConfigPath = args[mcpConfigIdx + 1];

let mcpConfig;
try {
  mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
} catch (err) {
  process.stderr.write(`fake-claude: cannot read mcp config: ${String(err)}\n`);
  process.exit(1);
}

const ledgerRunner = mcpConfig?.mcpServers?.["ledger-runner"];
if (!ledgerRunner) {
  process.stderr.write("fake-claude: missing mcpServers.ledger-runner in config\n");
  process.exit(1);
}

const mcpUrl = ledgerRunner.url;
const taskIdHeader = ledgerRunner.headers?.["X-Ledger-Task-Id"];
const taskId = taskIdHeader ?? process.env["LEDGER_TASK_ID"];

if (!taskId) {
  process.stderr.write("fake-claude: no task ID (no X-Ledger-Task-Id header and no LEDGER_TASK_ID env)\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Connect to the MCP server
// ---------------------------------------------------------------------------
const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
  requestInit: {
    headers: { "X-Ledger-Task-Id": taskId },
  },
});

const client = new Client({ name: "fake-claude", version: "0.0.1" });
await client.connect(transport);

// ---------------------------------------------------------------------------
// 4. Emit one reasoning event
// ---------------------------------------------------------------------------
await client.callTool({
  name: "runner.emit_event",
  arguments: {
    task_id: taskId,
    event: {
      kind: "reasoning",
      subkind: "thinking",
      text: "fake-claude: stub reasoning event emitted by integration test fixture",
    },
  },
});

// ---------------------------------------------------------------------------
// 5. Complete the task
// ---------------------------------------------------------------------------
await client.callTool({
  name: "runner.complete_task",
  arguments: { task_id: taskId },
});

// ---------------------------------------------------------------------------
// 6. Close and exit cleanly
// ---------------------------------------------------------------------------
await client.close();
process.exit(0);
