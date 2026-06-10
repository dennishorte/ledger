/**
 * In-process pub/sub bridge for the task runner.
 *
 * EventBus: lightweight Map<TaskId, Set<callback>> — one bus per Runner instance.
 * withPublishing: Store decorator that calls bus.publish(taskId) after every
 * successful write, without changing any method's return value or throwing
 * behaviour. Closes the 02-scheduler Open Issue "No in-process pub/sub for events".
 *
 * Key invariants:
 * - D5: publish iterates Array.from(set) snapshot — a subscriber can unsubscribe
 *   itself mid-publish without skipping siblings.
 * - N2: withPublishing.close() closes store first, then bus (defensive ordering).
 * - D12: read method pass-through uses method references, not wrapper closures.
 */

import type { TaskId } from "@ledger/parser";
import type { Store } from "./store.js";

export type TaskChangedCallback = (taskId: TaskId) => void;

export interface EventBus {
  /** Subscribe to publish events for one taskId. Returns an unsubscribe fn. */
  subscribe(taskId: TaskId, cb: TaskChangedCallback): () => void;
  /**
   * Subscribe to publish events for EVERY taskId. Returns an unsubscribe fn.
   * Added in 08-alerts so the algedonic channel can observe tasks it has not
   * seen before (the per-taskId subscribe can't watch unknown ids). The callback
   * receives the changed taskId on every publish.
   */
  subscribeAll(cb: TaskChangedCallback): () => void;
  /** Notify all subscribers (per-taskId and global) for a taskId. No-op if none. */
  publish(taskId: TaskId): void;
  /** Drop all subscriptions. */
  close(): void;
}

export function createEventBus(): EventBus {
  const subs = new Map<TaskId, Set<TaskChangedCallback>>();
  const globalSubs = new Set<TaskChangedCallback>();

  return {
    subscribe(taskId, cb) {
      let set = subs.get(taskId);
      if (set === undefined) {
        set = new Set();
        subs.set(taskId, set);
      }
      set.add(cb);
      return () => {
        const s = subs.get(taskId);
        if (s === undefined) return;
        s.delete(cb);
        if (s.size === 0) subs.delete(taskId);
      };
    },
    subscribeAll(cb) {
      globalSubs.add(cb);
      return () => {
        globalSubs.delete(cb);
      };
    },
    publish(taskId) {
      // D5: snapshot each set — a callback can unsubscribe itself mid-iteration
      // without skipping siblings (live-Set iteration would skip the next element).
      const set = subs.get(taskId);
      if (set !== undefined) {
        for (const cb of Array.from(set)) cb(taskId);
      }
      if (globalSubs.size > 0) {
        for (const cb of Array.from(globalSubs)) cb(taskId);
      }
    },
    close() {
      subs.clear();
      globalSubs.clear();
    },
  };
}

export function withPublishing(store: Store, bus: EventBus): Store {
  return {
    createTask(input) {
      const t = store.createTask(input);
      bus.publish(t.id);
      return t;
    },
    appendEvent(taskId, event) {
      const ev = store.appendEvent(taskId, event);
      bus.publish(taskId);
      return ev;
    },
    updateTaskStatus(id, transition, expected) {
      const t = store.updateTaskStatus(id, transition, expected);
      bus.publish(id);
      return t;
    },
    // D12: pass-through method references (bound to satisfy the linter's
    // unbound-method rule). The Store is a factory-closure pattern — methods
    // don't use `this`, so .bind() is a no-op semantically. Binding avoids
    // the per-call closure allocation that arrow wrappers would introduce.
    deleteTask: store.deleteTask.bind(store),
    loadTask: store.loadTask.bind(store),
    getStatus: store.getStatus.bind(store),
    listTasks: store.listTasks.bind(store),
    listPendingEligible: store.listPendingEligible.bind(store),
    getEvents: store.getEvents.bind(store),
    // updateReviewPayload does not emit a task-changed event — the caller
    // (runner.await_human_review tool) follows immediately with awaitHumanReview
    // which writes a status_change event; that write's updateTaskStatus call
    // publishes the task-changed event. Pass through without publishing.
    updateReviewPayload: store.updateReviewPayload.bind(store),
    insertScan: store.insertScan.bind(store),
    listScans: store.listScans.bind(store),
    close() {
      // Spec Review N2: store first, bus second. If a future Store-close handler
      // observed bus state it would still be valid; better-sqlite3 db.close()
      // has no callbacks today but the reverse order is the safer default.
      store.close();
      bus.close();
    },
  };
}
