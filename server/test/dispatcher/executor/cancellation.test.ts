/**
 * cancellation.ts unit tests — bind/lookup/unbind round-trip + SIGKILL escalation.
 *
 * Spec: docs/06-agent-dispatcher/03-claude-code-executor.md §Requirements item 10
 * Escalation spec: docs/06-agent-dispatcher/99-maintenance/01-round-1.md §Verification item 1
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createCancellationRegistry } from "../../../src/dispatcher/executor/cancellation.js";
import type { Subprocess } from "execa";

// Minimal Subprocess stub — the registry only needs .kill(); it stores the
// reference and returns it on lookup. No actual subprocess created.
function makeStubProcess(): { subprocess: Subprocess; killCalls: { signal: string | undefined }[] } {
  const killCalls: { signal: string | undefined }[] = [];
  const subprocess = {
    kill: (signal?: string | number) => {
      killCalls.push({ signal: signal !== undefined ? String(signal) : undefined });
      return true;
    },
    pid: undefined,
  } as unknown as Subprocess;
  return { subprocess, killCalls };
}

describe("createCancellationRegistry", () => {
  it("starts empty", () => {
    const reg = createCancellationRegistry();
    expect(reg.size()).toBe(0);
    expect(reg.lookup("task-1")).toBeUndefined();
  });

  it("bind makes task lookup-able; size increments", () => {
    const reg = createCancellationRegistry();
    const { subprocess } = makeStubProcess();
    reg.bind("task-1", subprocess);
    expect(reg.lookup("task-1")).toBe(subprocess);
    expect(reg.size()).toBe(1);
  });

  it("unbind removes the entry; lookup returns undefined; size decrements", () => {
    const reg = createCancellationRegistry();
    const { subprocess } = makeStubProcess();
    reg.bind("task-1", subprocess);
    reg.unbind("task-1");
    expect(reg.lookup("task-1")).toBeUndefined();
    expect(reg.size()).toBe(0);
  });

  it("unbind on missing key is a no-op", () => {
    const reg = createCancellationRegistry();
    expect(() => { reg.unbind("non-existent"); }).not.toThrow();
    expect(reg.size()).toBe(0);
  });

  it("supports concurrent task IDs independently", () => {
    const reg = createCancellationRegistry();
    const { subprocess: sub1 } = makeStubProcess();
    const { subprocess: sub2 } = makeStubProcess();
    reg.bind("task-1", sub1);
    reg.bind("task-2", sub2);
    expect(reg.size()).toBe(2);
    expect(reg.lookup("task-1")).toBe(sub1);
    expect(reg.lookup("task-2")).toBe(sub2);

    reg.unbind("task-1");
    expect(reg.size()).toBe(1);
    expect(reg.lookup("task-1")).toBeUndefined();
    expect(reg.lookup("task-2")).toBe(sub2);
  });

  it("bind overwrites prior entry for the same task ID", () => {
    const reg = createCancellationRegistry();
    const { subprocess: sub1 } = makeStubProcess();
    const { subprocess: sub2 } = makeStubProcess();
    reg.bind("task-1", sub1);
    reg.bind("task-1", sub2);
    expect(reg.lookup("task-1")).toBe(sub2);
    expect(reg.size()).toBe(1);
  });

  it("kill is callable on the looked-up subprocess (legacy path)", () => {
    const reg = createCancellationRegistry();
    const { subprocess, killCalls } = makeStubProcess();
    reg.bind("task-1", subprocess);
    reg.lookup("task-1")?.kill("SIGTERM");
    expect(killCalls).toHaveLength(1);
    expect(killCalls[0]?.signal).toBe("SIGTERM");
  });
});

describe("createCancellationRegistry — killWithEscalation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false on unknown taskId (no panic)", () => {
    const reg = createCancellationRegistry({ escalationDelayMs: 50 });
    expect(reg.killWithEscalation("missing", "SIGTERM")).toBe(false);
  });

  it("returns true and sends SIGTERM immediately when registered", () => {
    const reg = createCancellationRegistry({ escalationDelayMs: 50 });
    const { subprocess, killCalls } = makeStubProcess();
    reg.bind("task-1", subprocess);
    const result = reg.killWithEscalation("task-1", "SIGTERM");
    expect(result).toBe(true);
    expect(killCalls).toHaveLength(1);
    expect(killCalls[0]?.signal).toBe("SIGTERM");
  });

  it("SIGKILL escalation fires after delay when subprocess has not exited", () => {
    const emitEvent = vi.fn();
    const reg = createCancellationRegistry({ escalationDelayMs: 50, emitEvent });
    const { subprocess, killCalls } = makeStubProcess();
    reg.bind("task-1", subprocess);
    reg.killWithEscalation("task-1", "SIGTERM");

    // Before escalation fires, only SIGTERM was sent.
    expect(killCalls).toHaveLength(1);
    expect(emitEvent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    // After delay, SIGKILL sent and emitEvent called.
    expect(killCalls).toHaveLength(2);
    expect(killCalls[1]?.signal).toBe("SIGKILL");
    expect(emitEvent).toHaveBeenCalledOnce();
    expect(emitEvent).toHaveBeenCalledWith("task-1", {
      kind: "subprocess_killed",
      signal: "SIGKILL",
      taskId: "task-1",
    });
  });

  it("unbind before escalation cancels the timer — SIGKILL NOT sent", () => {
    const emitEvent = vi.fn();
    const reg = createCancellationRegistry({ escalationDelayMs: 50, emitEvent });
    const { subprocess, killCalls } = makeStubProcess();
    reg.bind("task-1", subprocess);
    reg.killWithEscalation("task-1", "SIGTERM");
    reg.unbind("task-1"); // clean exit path — executor's finally block calls unbind

    vi.advanceTimersByTime(100);

    // Only SIGTERM was sent; no SIGKILL.
    expect(killCalls).toHaveLength(1);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("killWithEscalation('SIGKILL') sends SIGKILL immediately without starting a timer", () => {
    const emitEvent = vi.fn();
    const reg = createCancellationRegistry({ escalationDelayMs: 50, emitEvent });
    const { subprocess, killCalls } = makeStubProcess();
    reg.bind("task-1", subprocess);
    reg.killWithEscalation("task-1", "SIGKILL");

    vi.advanceTimersByTime(100);

    expect(killCalls).toHaveLength(1);
    expect(killCalls[0]?.signal).toBe("SIGKILL");
    // emitEvent is NOT called — escalation path only emits on timer-driven SIGKILL.
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("emitEvent absent: SIGKILL fires without error (safe degradation)", () => {
    const reg = createCancellationRegistry({ escalationDelayMs: 50 }); // no emitEvent
    const { subprocess, killCalls } = makeStubProcess();
    reg.bind("task-1", subprocess);
    reg.killWithEscalation("task-1", "SIGTERM");

    expect(() => { vi.advanceTimersByTime(50); }).not.toThrow();
    expect(killCalls).toHaveLength(2);
    expect(killCalls[1]?.signal).toBe("SIGKILL");
  });
});
