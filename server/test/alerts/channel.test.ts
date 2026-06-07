/**
 * Unit tests for the algedonic alert channel (08-alerts).
 *
 * Uses a fake store (only loadTask + getEvents — the channel is report-only, D3)
 * and a real EventBus. The Pick<Store, ...> type on createAlertChannel makes the
 * "no store writes" guarantee structural: the channel cannot call createTask /
 * updateTaskStatus because they are not on its store interface.
 *
 * Spec: docs/08-alerts.md §Verification
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createEventBus } from "../../src/runner/events.js";
import { createAlertChannel } from "../../src/alerts/channel.js";
import type { Task, LogEvent, TaskId } from "@ledger/parser";

function makeTask(id: TaskId, status: Task["status"], title = "T"): Task {
  return {
    id,
    type: "implement",
    status,
    title,
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-06-07T00:00:00.000Z",
  };
}

function failEvent(taskId: TaskId, reason: string): LogEvent {
  return {
    id: `${taskId}-sc`,
    taskId,
    at: "2026-06-07T00:00:01.000Z",
    seq: 1,
    kind: "status_change",
    from: "RUNNING",
    to: "FAILED",
    reason,
  };
}

interface FakeStore {
  tasks: Map<TaskId, Task>;
  events: Map<TaskId, LogEvent[]>;
  loadTask(id: TaskId): Task | undefined;
  getEvents(id: TaskId): LogEvent[];
}

function makeFakeStore(): FakeStore {
  const tasks = new Map<TaskId, Task>();
  const events = new Map<TaskId, LogEvent[]>();
  return {
    tasks,
    events,
    loadTask: (id) => tasks.get(id),
    getEvents: (id) => events.get(id) ?? [],
  };
}

describe("createAlertChannel", () => {
  it("raises a critical alert when a task is FAILED, carrying the reason", () => {
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("t1", makeTask("t1", "FAILED", "Build the thing"));
    store.events.set("t1", [failEvent("t1", "subprocess_failed: boom")]);

    const channel = createAlertChannel({ store });
    channel.attach(bus);
    const received: unknown[] = [];
    channel.subscribe((a) => received.push(a));

    bus.publish("t1");

    expect(received).toHaveLength(1);
    expect(channel.getRecent()).toMatchObject([
      {
        seq: 0,
        taskId: "t1",
        taskTitle: "Build the thing",
        taskType: "implement",
        kind: "task_failed",
        severity: "critical",
        reason: "subprocess_failed: boom",
      },
    ]);
    bus.close();
  });

  it("does not alert for non-FAILED status changes", () => {
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("t1", makeTask("t1", "COMPLETE"));
    const channel = createAlertChannel({ store });
    channel.attach(bus);

    bus.publish("t1");

    expect(channel.getRecent()).toHaveLength(0);
    bus.close();
  });

  it("dedups: a FAILED task raises exactly one alert across repeated publishes", () => {
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("t1", makeTask("t1", "FAILED"));
    store.events.set("t1", [failEvent("t1", "x")]);
    const channel = createAlertChannel({ store });
    channel.attach(bus);
    const received: unknown[] = [];
    channel.subscribe((a) => received.push(a));

    bus.publish("t1");
    bus.publish("t1");
    bus.publish("t1");

    expect(received).toHaveLength(1);
    bus.close();
  });

  it("reason is empty string when no status_change→FAILED event is present", () => {
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("t1", makeTask("t1", "FAILED"));
    // no events recorded
    const channel = createAlertChannel({ store });
    channel.attach(bus);
    bus.publish("t1");
    expect(channel.getRecent()[0]?.reason).toBe("");
    bus.close();
  });

  it("getRecent(afterSeq) returns only newer alerts (SSE resume)", () => {
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("a", makeTask("a", "FAILED"));
    store.tasks.set("b", makeTask("b", "FAILED"));
    const channel = createAlertChannel({ store });
    channel.attach(bus);
    bus.publish("a"); // seq 0
    bus.publish("b"); // seq 1
    expect(channel.getRecent(0).map((x) => x.seq)).toEqual([1]);
    expect(channel.getRecent()).toHaveLength(2);
    bus.close();
  });

  it("Req 6: a failure whose publish predates attach does not alert (no boot-flood)", () => {
    // Simulates the boot sequence: a task is already FAILED in the store (e.g.
    // recoverOrphans ran RUNNING→FAILED before the channel attached). The bus
    // published that change before subscribeAll existed, so the channel never
    // sees it. Only a NEW publish after attach raises an alert.
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("preexisting", makeTask("preexisting", "FAILED"));

    // Pre-attach publish — no global subscriber yet, so it is not observed.
    bus.publish("preexisting");

    const channel = createAlertChannel({ store });
    channel.attach(bus);

    expect(channel.getRecent()).toHaveLength(0);

    // A fresh failure after attach DOES alert.
    store.tasks.set("fresh", makeTask("fresh", "FAILED"));
    bus.publish("fresh");
    expect(channel.getRecent().map((a) => a.taskId)).toEqual(["fresh"]);
    bus.close();
  });

  it("seq is monotonic across alerts", () => {
    const store = makeFakeStore();
    const bus = createEventBus();
    store.tasks.set("a", makeTask("a", "FAILED"));
    store.tasks.set("b", makeTask("b", "FAILED"));
    const channel = createAlertChannel({ store });
    channel.attach(bus);
    bus.publish("a");
    bus.publish("b");
    expect(channel.getRecent().map((x) => x.seq)).toEqual([0, 1]);
    bus.close();
  });

  describe("webhook delivery", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("POSTs the alert when a webhook URL is configured", async () => {
      const store = makeFakeStore();
      const bus = createEventBus();
      store.tasks.set("t1", makeTask("t1", "FAILED"));
      store.events.set("t1", [failEvent("t1", "boom")]);
      const channel = createAlertChannel({ store, webhookUrl: "http://hook.test/x" });
      channel.attach(bus);

      bus.publish("t1");
      await vi.waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call?.[0]).toBe("http://hook.test/x");
      const body = JSON.parse((call?.[1] as RequestInit).body as string) as { taskId: string };
      expect(body.taskId).toBe("t1");
    });

    it("does not POST when no webhook URL is configured", () => {
      const store = makeFakeStore();
      const bus = createEventBus();
      store.tasks.set("t1", makeTask("t1", "FAILED"));
      const channel = createAlertChannel({ store });
      channel.attach(bus);
      bus.publish("t1");
      expect(fetch).not.toHaveBeenCalled();
      bus.close();
    });

    it("a webhook failure does not throw on the publish path", async () => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const store = makeFakeStore();
      const bus = createEventBus();
      store.tasks.set("t1", makeTask("t1", "FAILED"));
      const channel = createAlertChannel({ store, webhookUrl: "http://hook.test/x" });
      channel.attach(bus);

      expect(() => {
        bus.publish("t1");
      }).not.toThrow();
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalled();
      });
      warn.mockRestore();
      bus.close();
    });
  });
});
