/**
 * Algedonic alert channel (08-alerts).
 *
 * Observes the runner's EventBus globally; when a task transitions to FAILED
 * (the v1 critical signal, D2) it raises an Alert and fans it out to the two
 * delivery paths — SSE subscribers (UI banner) and the outbound webhook.
 *
 * D3: REPORT-ONLY. This module performs NO store writes — it only reads
 * (loadTask, getEvents) to build the alert. It never creates, mutates, or
 * dispatches a task. Same audit-channel discipline the v2 health scanner holds.
 */

import type { Alert, TaskId } from "@ledger/parser";
import type { Store } from "../runner/store.js";
import type { EventBus } from "../runner/events.js";
import { postWebhook } from "./webhook.js";

/** Most recent alerts kept in memory for cold fetch + SSE Last-Event-ID backfill. */
const RING_CAPACITY = 50;

export type AlertCallback = (alert: Alert) => void;

export interface AlertChannel {
  /** Begin observing the bus. Returns an unsubscribe fn. Call once at wiring time. */
  attach(bus: EventBus): () => void;
  /** Subscribe to live alerts (the SSE route). Returns an unsubscribe fn. */
  subscribe(cb: AlertCallback): () => void;
  /** Alerts in the ring buffer with seq > afterSeq (default: all). */
  getRecent(afterSeq?: number): Alert[];
}

export interface AlertChannelOptions {
  store: Pick<Store, "loadTask" | "getEvents">;
  /** Webhook destination; when undefined the webhook path is a no-op (Req 3). */
  webhookUrl?: string;
}

/** Read the reason from the latest status_change→FAILED event, or "" if none. */
function failureReason(
  store: Pick<Store, "getEvents">,
  taskId: TaskId,
): string {
  const events = store.getEvents(taskId);
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev && ev.kind === "status_change" && ev.to === "FAILED") {
      return ev.reason ?? "";
    }
  }
  return "";
}

export function createAlertChannel(opts: AlertChannelOptions): AlertChannel {
  const { store, webhookUrl } = opts;

  // Dedup: a task raises exactly one alert no matter how many later events it
  // emits (D7). Per-boot; unbounded growth is a noted LOW follow-up.
  const alerted = new Set<TaskId>();
  const subscribers = new Set<AlertCallback>();
  const ring: Alert[] = [];
  let seq = 0;

  function onTaskChanged(taskId: TaskId): void {
    if (alerted.has(taskId)) return;
    const task = store.loadTask(taskId);
    if (task === undefined || task.status !== "FAILED") return;

    alerted.add(taskId);

    const alert: Alert = {
      seq: seq++,
      taskId,
      taskTitle: task.title,
      taskType: task.type,
      kind: "task_failed",
      severity: "critical",
      reason: failureReason(store, taskId),
      at: new Date().toISOString(),
    };

    ring.push(alert);
    if (ring.length > RING_CAPACITY) ring.shift();

    // Snapshot subscribers so a callback that unsubscribes mid-iteration is safe.
    for (const cb of Array.from(subscribers)) cb(alert);

    if (webhookUrl !== undefined && webhookUrl !== "") {
      // Fire-and-forget — never await on the publish hot path (D4).
      void postWebhook(webhookUrl, alert);
    }
  }

  return {
    attach(bus) {
      return bus.subscribeAll(onTaskChanged);
    },
    subscribe(cb) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    getRecent(afterSeq = -1) {
      return ring.filter((a) => a.seq > afterSeq);
    },
  };
}
