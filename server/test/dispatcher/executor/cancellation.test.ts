/**
 * cancellation.ts unit tests — bind/lookup/unbind round-trip.
 *
 * Spec: docs/06-agent-dispatcher/03-claude-code-executor.md §Requirements item 10
 */

import { describe, expect, it } from "vitest";
import { createCancellationRegistry } from "../../../src/dispatcher/executor/cancellation.js";
import type { Subprocess } from "execa";

// Minimal Subprocess stub — the registry only needs .kill(); it stores the
// reference and returns it on lookup. No actual subprocess created.
function makeStubProcess(): Subprocess {
  return {
    kill: (_signal?: string | number) => true,
    pid: undefined,
  } as unknown as Subprocess;
}

describe("createCancellationRegistry", () => {
  it("starts empty", () => {
    const reg = createCancellationRegistry();
    expect(reg.size()).toBe(0);
    expect(reg.lookup("task-1")).toBeUndefined();
  });

  it("bind makes task lookup-able; size increments", () => {
    const reg = createCancellationRegistry();
    const sub = makeStubProcess();
    reg.bind("task-1", sub);
    expect(reg.lookup("task-1")).toBe(sub);
    expect(reg.size()).toBe(1);
  });

  it("unbind removes the entry; lookup returns undefined; size decrements", () => {
    const reg = createCancellationRegistry();
    const sub = makeStubProcess();
    reg.bind("task-1", sub);
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
    const sub1 = makeStubProcess();
    const sub2 = makeStubProcess();
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
    const sub1 = makeStubProcess();
    const sub2 = makeStubProcess();
    reg.bind("task-1", sub1);
    reg.bind("task-1", sub2);
    expect(reg.lookup("task-1")).toBe(sub2);
    expect(reg.size()).toBe(1);
  });

  it("kill is callable on the looked-up subprocess", () => {
    const reg = createCancellationRegistry();
    let killCalled = false;
    const sub: Subprocess = {
      kill: (_signal?: string | number) => {
        killCalled = true;
        return true;
      },
      pid: undefined,
    } as unknown as Subprocess;
    reg.bind("task-1", sub);
    reg.lookup("task-1")?.kill("SIGTERM");
    expect(killCalled).toBe(true);
  });
});
