/**
 * Unit tests for EventBus (createEventBus) and withPublishing Store decorator.
 *
 * Spec: docs/05-task-runner/04-api-endpoints.md §Tests item 2
 */

import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";
import { createStore } from "../../src/runner/store.js";
import { createEventBus, withPublishing } from "../../src/runner/events.js";
import type { Store } from "../../src/runner/store.js";

function makeMemoryStore(): Store {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return createStore(db);
}

// ---------------------------------------------------------------------------
// EventBus: createEventBus
// ---------------------------------------------------------------------------

describe("createEventBus", () => {
  it("subscribe + publish → callback fires with taskId", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.subscribe("task-1", cb);
    bus.publish("task-1");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("task-1");
    bus.close();
  });

  it("multiple subscribers on same taskId → all fire", () => {
    const bus = createEventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.subscribe("task-1", cb1);
    bus.subscribe("task-1", cb2);
    bus.publish("task-1");
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    bus.close();
  });

  it("subscriber on taskA does NOT fire on publish(taskB)", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.subscribe("task-A", cb);
    bus.publish("task-B");
    expect(cb).not.toHaveBeenCalled();
    bus.close();
  });

  it("unsubscribe function removes the subscriber", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const unsub = bus.subscribe("task-1", cb);
    unsub();
    bus.publish("task-1");
    expect(cb).not.toHaveBeenCalled();
    bus.close();
  });

  it("calling unsubscribe twice is idempotent", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const unsub = bus.subscribe("task-1", cb);
    unsub();
    // Second call should not throw
    expect(() => { unsub(); }).not.toThrow();
    bus.publish("task-1");
    expect(cb).not.toHaveBeenCalled();
    bus.close();
  });

  it("publish is a no-op when there are no subscribers", () => {
    const bus = createEventBus();
    // Should not throw
    expect(() => { bus.publish("task-no-subs"); }).not.toThrow();
    bus.close();
  });

  it("close() drops all subscribers; subsequent publish is a no-op", () => {
    const bus = createEventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.subscribe("task-1", cb1);
    bus.subscribe("task-2", cb2);
    bus.close();
    bus.publish("task-1");
    bus.publish("task-2");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it("D5: snapshot iteration — a callback that unsubscribes itself does not skip siblings", () => {
    const bus = createEventBus();
    const calls: string[] = [];

    // Use a container to allow cbA to reference its own unsubscribe fn
    const unsub: { a?: () => void } = {};

    const cbA = () => {
      calls.push("A");
      // unsubscribe self mid-publish
      if (unsub.a !== undefined) {
        unsub.a();
      }
    };
    const cbB = () => {
      calls.push("B");
    };

    unsub.a = bus.subscribe("task-1", cbA);
    bus.subscribe("task-1", cbB);

    bus.publish("task-1");

    // Both A and B should have been called despite A unsubscribing itself
    expect(calls).toContain("A");
    expect(calls).toContain("B");

    // After self-unsubscribe, cbA should not fire on next publish
    bus.publish("task-1");
    expect(calls.filter((x) => x === "A")).toHaveLength(1); // only the first publish
    expect(calls.filter((x) => x === "B")).toHaveLength(2); // both publishes

    bus.close();
  });
});

// ---------------------------------------------------------------------------
// withPublishing Store decorator
// ---------------------------------------------------------------------------

describe("withPublishing", () => {
  it("createTask publishes the new task's id", () => {
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const publishSpy = vi.spyOn(bus, "publish");

    const task = store.createTask({ type: "noop", title: "pub-test" });

    expect(publishSpy).toHaveBeenCalledWith(task.id);
    store.close();
  });

  it("appendEvent publishes the taskId", () => {
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const task = store.createTask({ type: "noop", title: "ev-test" });
    const publishedIds: string[] = [];
    bus.subscribe(task.id, (id) => { publishedIds.push(id); });

    store.appendEvent(task.id, { kind: "status_change", from: "PENDING", to: "RUNNING" } as Parameters<Store["appendEvent"]>[1]);
    expect(publishedIds).toHaveLength(1);
    expect(publishedIds[0]).toBe(task.id);
    store.close();
  });

  it("updateTaskStatus publishes the taskId", () => {
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const task = store.createTask({ type: "noop", title: "upd-test" });
    const publishedIds: string[] = [];
    bus.subscribe(task.id, (id) => { publishedIds.push(id); });

    store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    expect(publishedIds).toHaveLength(1);
    expect(publishedIds[0]).toBe(task.id);
    store.close();
  });

  it("read methods do not publish", () => {
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const task = store.createTask({ type: "noop", title: "read-test" });
    const publishSpy = vi.spyOn(bus, "publish").mockClear();

    // All read methods — none should publish
    store.loadTask(task.id);
    store.getStatus(task.id);
    store.listTasks();
    store.listPendingEligible();
    store.getEvents(task.id);

    expect(publishSpy).not.toHaveBeenCalled();
    store.close();
  });

  it("withPublishing preserves return values for write methods", () => {
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const task = store.createTask({ type: "noop", title: "retval-test" });
    expect(task).toBeDefined();
    expect(task.status).toBe("PENDING");

    const ev = store.appendEvent(task.id, { kind: "status_change", from: "PENDING", to: "RUNNING" } as Parameters<Store["appendEvent"]>[1]);
    expect(ev).toBeDefined();
    expect(ev.taskId).toBe(task.id);

    const updated = store.updateTaskStatus(task.id, { from: "RUNNING", to: "COMPLETE" });
    expect(updated.status).toBe("COMPLETE");

    store.close();
  });

  it("close() closes store first then bus (N2: defensive ordering)", () => {
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const closedOrder: string[] = [];
    const origStoreClose = rawStore.close.bind(rawStore);
    const origBusClose = bus.close.bind(bus);

    vi.spyOn(rawStore, "close").mockImplementation(() => {
      closedOrder.push("store");
      origStoreClose();
    });
    vi.spyOn(bus, "close").mockImplementation(() => {
      closedOrder.push("bus");
      origBusClose();
    });

    store.close();
    expect(closedOrder).toEqual(["store", "bus"]);
  });

  it("D12: read method pass-throughs return the same result as calling the underlying store directly", () => {
    // Verifies that D12 (method references, not wrapper closures) produces
    // identical results to calling the underlying store directly.
    const rawStore = makeMemoryStore();
    const bus = createEventBus();
    const store = withPublishing(rawStore, bus);

    const task = store.createTask({ type: "noop", title: "ref-test" });

    // loadTask — same result
    const viaWrapper = store.loadTask(task.id);
    const viaDirect = rawStore.loadTask(task.id);
    expect(viaWrapper).toEqual(viaDirect);

    // getStatus — same result
    expect(store.getStatus(task.id)).toBe(rawStore.getStatus(task.id));

    // listTasks — same count
    expect(store.listTasks().length).toBe(rawStore.listTasks().length);

    // getEvents — same events
    expect(store.getEvents(task.id)).toEqual(rawStore.getEvents(task.id));

    store.close();
  });
});
