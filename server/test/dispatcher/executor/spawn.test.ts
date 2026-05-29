/**
 * spawn.ts unit tests — spawnClaudeCode argv + env + cwd verification.
 *
 * Uses the claudeBin override (D5, Spec Review B3) to spawn a node script
 * that prints its argv/env and exits 0 — no real claude invocation.
 *
 * Spec: docs/06-agent-dispatcher/03-claude-code-executor.md §Requirements item 10
 */

import { afterEach, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { writeFile, unlink, realpath } from "node:fs/promises";
import { spawnClaudeCode } from "../../../src/dispatcher/executor/spawn.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths to cleanup after tests
const tempFiles: string[] = [];
afterEach(async () => {
  for (const f of tempFiles.splice(0)) {
    await unlink(f).catch(() => undefined);
  }
});

// Write a helper node script to a temp file. The script prints JSON to stdout
// with the argv and env, then exits 0.
async function writeHelperScript(body: string): Promise<string> {
  const path = join(tmpdir(), `spawn-test-helper-${String(Date.now())}.mjs`);
  tempFiles.push(path);
  await writeFile(path, body, "utf8");
  return path;
}

describe("spawnClaudeCode", () => {
  it("includes --print --bare --mcp-config in argv", async () => {
    const mcpConfigPath = "/tmp/test-fake.mcp.json";
    // Script: print argv as JSON, exit 0
    const scriptPath = await writeHelperScript(`
      const args = process.argv.slice(2);
      process.stdout.write(JSON.stringify(args) + "\\n");
      process.exit(0);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath,
      stdin: "test prompt",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    const result = await subprocess;
    expect(result.exitCode).toBe(0);
    const argv = JSON.parse(String(result.stdout)) as string[];
    expect(argv).toContain("--print");
    expect(argv).toContain("--bare");
    expect(argv).toContain("--mcp-config");
    expect(argv).toContain(mcpConfigPath);
    // Order check: --mcp-config immediately before the path
    const mcpIdx = argv.indexOf("--mcp-config");
    expect(argv[mcpIdx + 1]).toBe(mcpConfigPath);
  });

  it("sets LEDGER_TASK_ID in env", async () => {
    const scriptPath = await writeHelperScript(`
      process.stdout.write(JSON.stringify(process.env["LEDGER_TASK_ID"] ?? null) + "\\n");
      process.exit(0);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: { LEDGER_TASK_ID: "task-env-test" },
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "prompt",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    const result = await subprocess;
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(String(result.stdout))).toBe("task-env-test");
  });

  it("inherits parent process env and merges opts.env", async () => {
    const scriptPath = await writeHelperScript(`
      // Check a known env var from the parent (PATH should always exist)
      const pathExists = typeof process.env["PATH"] === "string";
      process.stdout.write(JSON.stringify(pathExists) + "\\n");
      process.exit(0);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: { LEDGER_TASK_ID: "task-1" },
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "prompt",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    const result = await subprocess;
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(String(result.stdout))).toBe(true);
  });

  it("pipes stdin to the subprocess", async () => {
    const scriptPath = await writeHelperScript(`
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      process.stdout.write(JSON.stringify(text) + "\\n");
      process.exit(0);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "hello from stdin",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    const result = await subprocess;
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(String(result.stdout))).toBe("hello from stdin");
  });

  it("reject:false — non-zero exit code resolves (not throws)", async () => {
    const scriptPath = await writeHelperScript(`process.exit(42);`);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    // Should not throw
    const result = await subprocess;
    expect(result.exitCode).toBe(42);
  });

  it("subprocess handle has kill method (for cancellation registry)", () => {
    // Just check the returned object has the kill method before any await
    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "",
      // Use node -e to exit immediately — don't actually invoke "claude"
      claudeBin: `${process.execPath} -e process.exit(0)`,
    });

    expect(typeof subprocess.kill).toBe("function");
    // Let the subprocess finish naturally to avoid dangling processes
    return subprocess;
  });

  it("uses cwd parameter for subprocess working directory", async () => {
    const scriptPath = await writeHelperScript(`
      process.stdout.write(JSON.stringify(process.cwd()) + "\\n");
      process.exit(0);
    `);
    const expectedCwd = tmpdir();

    const subprocess = spawnClaudeCode({
      cwd: expectedCwd,
      env: {},
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    const result = await subprocess;
    expect(result.exitCode).toBe(0);
    // On macOS, /var/folders is a symlink under /private — resolve both sides
    // so the comparison is canonical-path to canonical-path.
    const actual = await realpath(JSON.parse(String(result.stdout)) as string);
    const expected = await realpath(expectedCwd);
    expect(actual).toBe(expected);
  });

  it("claudeBin multi-token split: prefixArgs come before --print", async () => {
    // Test the `${node} ${script}` → [cmd, prefixArg] split
    const scriptPath = await writeHelperScript(`
      const args = process.argv.slice(2);
      process.stdout.write(JSON.stringify(args) + "\\n");
      process.exit(0);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath: "/tmp/p.json",
      stdin: "",
      claudeBin: `${process.execPath} ${scriptPath}`,
    });

    const result = await subprocess;
    const argv = JSON.parse(String(result.stdout)) as string[];
    // First two args (after the node binary are the script path injected as prefix)
    // Then --print, --bare, --mcp-config, /tmp/p.json
    expect(argv[0]).toBe("--print");
  });
});
