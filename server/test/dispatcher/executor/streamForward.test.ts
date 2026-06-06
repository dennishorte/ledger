/**
 * streamForward.ts tests — stream-json → LogEvent mapping (pure) + the
 * forwardClaudeStream forwarding loop and idle watchdog (live subprocess).
 *
 * dispatcher-hang-issue.md defect #2.
 */

import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile, unlink } from "node:fs/promises";
import { spawnClaudeCode } from "../../../src/dispatcher/executor/spawn.js";
import {
  mapStreamEvent,
  forwardClaudeStream,
} from "../../../src/dispatcher/executor/streamForward.js";
import type { RunnerHandle } from "../../../src/runner/executors.js";
import type { LogEvent } from "@ledger/parser";

type EmittedEvent = Omit<LogEvent, "id" | "taskId" | "seq" | "at">;

function makeHandle(): { handle: RunnerHandle; emitted: EmittedEvent[] } {
  const emitted: EmittedEvent[] = [];
  const handle: RunnerHandle = {
    emit: (taskId, event) => {
      emitted.push(event);
      return { id: "ev", taskId, seq: emitted.length, at: "t", ...event } as ReturnType<RunnerHandle["emit"]>;
    },
    complete: (taskId) => ({ id: taskId }) as ReturnType<RunnerHandle["complete"]>,
    fail: (taskId) => ({ id: taskId }) as ReturnType<RunnerHandle["fail"]>,
    awaitHumanReview: (taskId) => ({ id: taskId }) as ReturnType<RunnerHandle["awaitHumanReview"]>,
  };
  return { handle, emitted };
}

// ---------------------------------------------------------------------------
// mapStreamEvent — pure mapping
// ---------------------------------------------------------------------------

describe("mapStreamEvent", () => {
  it("system/init → a reasoning message with model + mcp_servers", () => {
    const out = mapStreamEvent({ type: "system", subtype: "init", model: "claude-x", mcp_servers: [{ name: "ledger-runner", status: "pending" }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "reasoning", subkind: "message" });
    expect((out[0] as { text: string }).text).toContain("claude-x");
    expect((out[0] as { text: string }).text).toContain("ledger-runner");
  });

  it("non-init system events map to nothing", () => {
    expect(mapStreamEvent({ type: "system", subtype: "other" })).toEqual([]);
  });

  it("assistant text → reasoning message", () => {
    const out = mapStreamEvent({ type: "assistant", message: { content: [{ type: "text", text: "thinking out loud" }] } });
    expect(out).toEqual([{ kind: "reasoning", subkind: "message", text: "thinking out loud" }]);
  });

  it("assistant thinking → reasoning thinking", () => {
    const out = mapStreamEvent({ type: "assistant", message: { content: [{ type: "thinking", thinking: "hmm" }] } });
    expect(out).toEqual([{ kind: "reasoning", subkind: "thinking", text: "hmm" }]);
  });

  it("assistant tool_use → tool_call with serialized arguments", () => {
    const out = mapStreamEvent({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { cmd: "ls" } }] } });
    expect(out).toEqual([{ kind: "tool_call", callId: "t1", toolName: "Bash", arguments: JSON.stringify({ cmd: "ls" }) }]);
  });

  it("assistant with multiple blocks maps each in order", () => {
    const out = mapStreamEvent({
      type: "assistant",
      message: { content: [{ type: "text", text: "a" }, { type: "tool_use", id: "t1", name: "Read", input: {} }] },
    });
    expect(out).toHaveLength(2);
    expect(out[0]?.kind).toBe("reasoning");
    expect(out[1]?.kind).toBe("tool_call");
  });

  it("user tool_result → tool_result (ok)", () => {
    const out = mapStreamEvent({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "file contents" }] } });
    expect(out).toEqual([{ kind: "tool_result", callId: "t1", status: "ok", body: "file contents" }]);
  });

  it("user tool_result with is_error → status error", () => {
    const out = mapStreamEvent({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true }] } });
    expect(out[0]).toMatchObject({ kind: "tool_result", status: "error" });
  });

  it("result success → reasoning summary", () => {
    const out = mapStreamEvent({ type: "result", subtype: "success", duration_ms: 900 });
    expect(out[0]).toMatchObject({ kind: "reasoning", subkind: "message" });
    expect((out[0] as { text: string }).text).toContain("900ms");
  });

  it("result is_error → error event", () => {
    const out = mapStreamEvent({ type: "result", subtype: "error_max_turns", is_error: true, result: "limit reached" });
    expect(out[0]).toMatchObject({ kind: "error" });
    expect((out[0] as { message: string }).message).toContain("limit reached");
  });

  it("unknown / garbage maps to nothing", () => {
    expect(mapStreamEvent({ type: "stream_event" })).toEqual([]);
    expect(mapStreamEvent("not an object")).toEqual([]);
    expect(mapStreamEvent(null)).toEqual([]);
    expect(mapStreamEvent(42)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// forwardClaudeStream — live subprocess
// ---------------------------------------------------------------------------

const tempFiles: string[] = [];
afterEach(async () => {
  for (const f of tempFiles.splice(0)) await unlink(f).catch(() => undefined);
});

async function writeFake(body: string): Promise<string> {
  const path = join(tmpdir(), `streamfwd-fake-${String(process.pid)}-${String(tempFiles.length)}.mjs`);
  tempFiles.push(path);
  await writeFile(path, body, "utf8");
  return path;
}

describe("forwardClaudeStream", () => {
  it("forwards NDJSON stream-json lines into the store as LogEvents", async () => {
    const script = await writeFake(`
      const lines = [
        {type:"system",subtype:"init",model:"m",mcp_servers:[]},
        {type:"assistant",message:{content:[{type:"text",text:"hello"},{type:"tool_use",id:"t1",name:"Bash",input:{cmd:"ls"}}]}},
        {type:"result",subtype:"success",duration_ms:42},
      ];
      for (const l of lines) process.stdout.write(JSON.stringify(l) + "\\n");
      process.exit(0);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "",
      claudeBin: `${process.execPath} ${script}`,
    });

    const { handle, emitted } = makeHandle();
    const result = await forwardClaudeStream({ taskId: "task-1", handle, subprocess, idleMs: 0 });
    await subprocess;

    expect(result.idleKilled).toBe(false);
    // init → reasoning, text → reasoning, tool_use → tool_call, result → reasoning
    expect(emitted.map((e) => e.kind)).toEqual(["reasoning", "reasoning", "tool_call", "reasoning"]);
    expect(result.eventsEmitted).toBe(4);
  });

  it("idle watchdog kills a subprocess that goes silent", async () => {
    // Prints one line, then hangs for 60s. The idle timer (250ms) fires.
    const script = await writeFake(`
      process.stdout.write(JSON.stringify({type:"system",subtype:"init",model:"m",mcp_servers:[]}) + "\\n");
      setTimeout(() => process.exit(0), 60000);
    `);

    const subprocess = spawnClaudeCode({
      cwd: process.cwd(),
      env: {},
      mcpConfigPath: "/tmp/ignored.json",
      stdin: "",
      claudeBin: `${process.execPath} ${script}`,
    });

    const { handle, emitted } = makeHandle();
    const result = await forwardClaudeStream({ taskId: "task-2", handle, subprocess, idleMs: 250 });
    await subprocess;

    expect(result.idleKilled).toBe(true);
    // The one line before the freeze was still forwarded.
    expect(emitted.length).toBeGreaterThanOrEqual(1);
  }, 10_000);
});
