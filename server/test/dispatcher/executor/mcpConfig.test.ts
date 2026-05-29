/**
 * mcpConfig.ts unit tests — writeMcpConfig round-trip + cleanup.
 *
 * Spec: docs/06-agent-dispatcher/03-claude-code-executor.md §Requirements item 10
 */

import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { writeMcpConfig } from "../../../src/dispatcher/executor/mcpConfig.js";

// Track created files so any that weren't cleaned up by the test can be
// deleted in afterEach if the test failed mid-way.
const createdPaths: string[] = [];

afterEach(async () => {
  for (const p of createdPaths.splice(0)) {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(p);
    } catch {
      // Already cleaned up by the test itself — fine.
    }
  }
});

describe("writeMcpConfig", () => {
  it("writes a JSON file at tmpdir with the expected shape", async () => {
    const handle = await writeMcpConfig("test-task-123", 4180);
    createdPaths.push(handle.path);

    const raw = await readFile(handle.path, "utf8");
    const parsed: unknown = JSON.parse(raw);

    expect(parsed).toMatchObject({
      mcpServers: {
        "ledger-runner": {
          type: "http",
          url: "http://127.0.0.1:4180/mcp",
          headers: { "X-Ledger-Task-Id": "test-task-123" },
        },
      },
    });

    await handle.cleanup();
  });

  it("file path contains the task ID", async () => {
    const handle = await writeMcpConfig("abc-task", 4180);
    createdPaths.push(handle.path);
    expect(handle.path).toContain("abc-task");
    await handle.cleanup();
  });

  it("file path is under tmpdir", async () => {
    const { tmpdir } = await import("node:os");
    const handle = await writeMcpConfig("task-xyz", 4180);
    createdPaths.push(handle.path);
    expect(handle.path.startsWith(tmpdir())).toBe(true);
    await handle.cleanup();
  });

  it("uses the provided port in the URL", async () => {
    const handle = await writeMcpConfig("port-test", 9999);
    createdPaths.push(handle.path);

    const raw = await readFile(handle.path, "utf8");
    const parsed = JSON.parse(raw) as { mcpServers: { "ledger-runner": { url: string } } };
    expect(parsed.mcpServers["ledger-runner"].url).toBe("http://127.0.0.1:9999/mcp");

    await handle.cleanup();
  });

  it("cleanup removes the file", async () => {
    const handle = await writeMcpConfig("cleanup-test", 4180);
    createdPaths.push(handle.path); // belt-and-suspenders

    await handle.cleanup();

    // File should be gone — readFile throws ENOENT
    await expect(readFile(handle.path)).rejects.toThrow();
  });

  it("double cleanup is safe (idempotent)", async () => {
    const handle = await writeMcpConfig("double-cleanup", 4180);
    createdPaths.push(handle.path);

    await handle.cleanup();
    // Second call must not throw
    await expect(handle.cleanup()).resolves.toBeUndefined();
  });

  it("filename matches ledger-dispatch-<taskId>.mcp.json pattern", async () => {
    const taskId = "my-unique-task-id";
    const handle = await writeMcpConfig(taskId, 4180);
    createdPaths.push(handle.path);

    const nodePath = await import("node:path");
    expect(nodePath.basename(handle.path)).toBe(`ledger-dispatch-${taskId}.mcp.json`);

    await handle.cleanup();
  });
});
