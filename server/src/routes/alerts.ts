/**
 * /api/alerts route (08-alerts) — two handlers:
 *
 *   GET /         recent alerts (cold fetch / page reload backfill)
 *   GET /stream   SSE live alert stream with Last-Event-ID resume + heartbeat
 *
 * Mirrors the /api/tasks/:id/stream pattern (routes/tasks.ts): an idempotent
 * flush re-reads the ring for seq > emittedSeq, so subscribe-then-backfill and
 * live publishes converge without dropped or duplicated alerts. No per-task
 * auto-close — the alert stream is app-lifetime.
 *
 * Spec: docs/08-alerts.md §Design "Routes"
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerEnv } from "../server.js";

const SSE_HEARTBEAT_MS = 15_000;

export const alertsRoute = new Hono<ServerEnv>()
  // -------------------------------------------------------------------------
  // GET / — recent alerts from the ring buffer
  // -------------------------------------------------------------------------
  .get("/", (c) => {
    const project = c.get("project");
    return c.json({ alerts: project.alerts.getRecent() });
  })
  // -------------------------------------------------------------------------
  // GET /stream — SSE live stream
  // -------------------------------------------------------------------------
  .get("/stream", (c) => {
    const project = c.get("project");

    const lastEventIdHeader = c.req.header("Last-Event-ID");
    let lastSeq = -1;
    if (typeof lastEventIdHeader === "string") {
      const parsed = parseInt(lastEventIdHeader, 10);
      if (Number.isFinite(parsed)) lastSeq = parsed;
    }

    return streamSSE(c, async (stream) => {
      let emittedSeq = lastSeq;
      let flushing = false;

      // Idempotent: emit every ring alert with seq > emittedSeq, re-reading
      // after each batch so alerts raised during an await are not stranded.
      // The flushing guard prevents re-entrant overlap from concurrent publishes.
      async function flush(): Promise<void> {
        if (flushing) return;
        flushing = true;
        try {
          let pending = project.alerts.getRecent(emittedSeq);
          while (pending.length > 0) {
            for (const alert of pending) {
              await stream.writeSSE({ id: String(alert.seq), data: JSON.stringify(alert) });
              emittedSeq = alert.seq;
            }
            pending = project.alerts.getRecent(emittedSeq);
          }
        } finally {
          flushing = false;
        }
      }

      // Subscribe before the initial flush: a publish between the two is handled
      // because flush re-reads the ring (no missed window).
      const unsubscribe = project.alerts.subscribe(() => {
        void flush();
      });

      await flush();

      const heartbeat = setInterval(() => {
        stream.write(": ping\n\n").catch(() => undefined);
      }, SSE_HEARTBEAT_MS);

      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
      });

      // Keep the handler alive until the client disconnects.
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  });
