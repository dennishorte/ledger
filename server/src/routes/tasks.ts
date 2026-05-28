/**
 * /api/tasks route — four handlers:
 *
 *   GET  /           list with optional status/type/parent filters
 *   GET  /:id        single task + events (404 on missing id)
 *   GET  /:id/stream SSE log stream with Last-Event-ID resume, heartbeat, auto-close
 *   POST /           operator injection via validateTaskInput
 *
 * Spec: docs/05-task-runner/04-api-endpoints.md
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validateTaskInput } from "@ledger/parser";
import type { TaskStatus, TaskType } from "@ledger/parser";
import type { ServerEnv } from "../server.js";

const TERMINAL_STATUSES = new Set<TaskStatus>(["COMPLETE", "FAILED", "CANCELLED"]);
const SSE_HEARTBEAT_MS = 15_000;
const SSE_AUTO_CLOSE_MS = 60_000;

export const tasksRoute = new Hono<ServerEnv>()
  // -------------------------------------------------------------------------
  // GET / — list with optional filters
  // -------------------------------------------------------------------------
  .get("/", (c) => {
    const project = c.get("project");
    const url = new URL(c.req.url);
    // D3: deliberate unsoundness — unknown enum values are passed through as
    // no-match filters (return empty list) rather than rejected with 400.
    const status = url.searchParams.getAll("status") as TaskStatus[];
    const type = url.searchParams.getAll("type") as TaskType[];
    const parent = url.searchParams.get("parent") ?? undefined;
    const filter = {
      ...(status.length > 0 ? { status } : {}),
      ...(type.length > 0 ? { type } : {}),
      ...(parent !== undefined ? { parent } : {}),
    };
    const tasks = project.runner.store.listTasks(filter);
    return c.json({ tasks });
  })
  // -------------------------------------------------------------------------
  // GET /:id — single task + events
  // -------------------------------------------------------------------------
  .get("/:id", (c) => {
    const project = c.get("project");
    const id = c.req.param("id");
    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);
    const events = project.runner.store.getEvents(id);
    return c.json({ task, events });
  })
  // -------------------------------------------------------------------------
  // GET /:id/stream — SSE log stream
  // -------------------------------------------------------------------------
  .get("/:id/stream", (c) => {
    const project = c.get("project");
    const id = c.req.param("id");
    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);

    // Parse Last-Event-ID header (default -1 → emit everything from seq 0).
    const lastEventIdHeader = c.req.header("Last-Event-ID");
    let lastSeq = -1;
    if (typeof lastEventIdHeader === "string") {
      const parsed = parseInt(lastEventIdHeader, 10);
      if (Number.isFinite(parsed)) lastSeq = parsed;
    }

    return streamSSE(c, async (stream) => {
      let emittedSeq = lastSeq;
      let terminalSince: number | undefined;

      async function flush(): Promise<void> {
        const fresh = project.runner.store.getEvents(id, { afterSeq: emittedSeq });
        for (const ev of fresh) {
          // StreamingApi.write swallows post-close errors silently
          // (verified hono@4.12.23 stream.js:42), so no try/catch needed.
          // (Spec Review S5.)
          await stream.writeSSE({
            id: String(ev.seq),
            data: JSON.stringify(ev),
          });
          emittedSeq = ev.seq;
        }
        // Check terminal status after flushing.
        const current = project.runner.store.getStatus(id);
        if (current !== undefined && TERMINAL_STATUSES.has(current) && terminalSince === undefined) {
          terminalSince = Date.now();
        }
      }

      // B2: SUBSCRIBE FIRST, THEN BACKFILL — eliminates the window where a
      // publish arriving between flush() and subscribe() would be dropped.
      // flush() is idempotent: advancing emittedSeq means a second call in
      // rapid succession is a no-op for the second call.
      const unsubscribe = project.runner.events.subscribe(id, () => {
        // Synchronous callback; flush is async. void fire-and-forget is
        // intentional — blocking the publisher (scheduler's tick) on network
        // writes would add scheduler latency. Acceptable for v1 local-only.
        void flush();
      });

      // Initial backfill — emit anything with seq > lastSeq.
      await flush();

      // Heartbeat: SSE comment line (`: ping\n\n`) — invisible to EventSource
      // listeners but keeps TCP alive through proxies. S1: use stream.write,
      // NOT stream.writeSSE({event:"ping",...}) which emits a named-event
      // frame visible to listeners. Same wire format as transcript bootstrap
      // (app/server/middleware.ts:142) and parent §SSE contract.
      const heartbeat = setInterval(() => {
        stream.write(": ping\n\n").catch(() => undefined);
      }, SSE_HEARTBEAT_MS);

      // Auto-close ticker: 1 Hz (D11). Closes stream 60s after the task first
      // enters a terminal status.
      const autoCloseTicker = setInterval(() => {
        if (terminalSince !== undefined && Date.now() - terminalSince >= SSE_AUTO_CLOSE_MS) {
          clearInterval(heartbeat);
          clearInterval(autoCloseTicker);
          unsubscribe();
          void stream
            .writeSSE({
              event: "close",
              data: JSON.stringify({ reason: "task_terminal" }),
            })
            .then(() => stream.close());
        }
      }, 1_000);

      // D9: Multiple stream.onAbort handlers are stacked (verified
      // hono@4.12.23 StreamingApi: abortSubscribers is an array).
      stream.onAbort(() => {
        clearInterval(heartbeat);
        clearInterval(autoCloseTicker);
        unsubscribe();
      });

      // Keep the handler alive until the client disconnects or auto-close fires.
      // streamSSE awaits this promise; resolving it ends the response.
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  })
  // -------------------------------------------------------------------------
  // POST / — operator injection
  // -------------------------------------------------------------------------
  .post("/", async (c) => {
    const project = c.get("project");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = validateTaskInput(raw);
    if (!result.ok) {
      // D7: 400 (Bad Request) for schema failures. Inconsistent with docs.ts
      // which returns 422; logged as an Open Issue for coordinated cleanup.
      return c.json({ errors: result.errors }, 400);
    }
    // B1: success branch is { ok: true; input: TaskInput } — use result.input.
    // D8: ajv useDefaults:true already applied defaults in validateTaskInput;
    // no explicit per-field fallback needed.
    // Spec: "Returns the post-tick Task" — reload from store so the response
    // reflects any synchronous tick (e.g., noop → COMPLETE) rather than the
    // PENDING snapshot that runner.createTask returns.
    const created = project.runner.createTask(result.input);
    const task = project.runner.store.loadTask(created.id) ?? created;
    return c.json({ task }, 201);
  });
