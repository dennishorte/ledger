/**
 * Vite dev-middleware plugin exposing the orchestration API (D1, D12).
 *
 * Endpoints:
 *  GET /api/transcripts          → { tasks: Task[] }
 *  GET /api/transcripts/:id      → { task: Task; events: LogEvent[] } | 404
 *  GET /api/transcripts/:id/stream → SSE stream of LogEvent
 *
 * This middleware is dev-only. Production builds ship a static SPA with no
 * middleware — the hooks degrade gracefully when /api/* 404s.
 *
 * Privacy (D12): Never serves to anything outside localhost. Non-localhost Host
 * header requests are rejected with 403.
 */

import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { scanTranscripts } from "./transcriptScan.js";
import { deriveTask, applyParentStatusRollup } from "./deriveTask.js";
import { parseTranscriptFile } from "./transcriptParse.js";
import { deriveStatus } from "./transcriptStatus.js";
import type { Task, LogEvent, TaskId } from "../src/lib/types.js";

// ---------------------------------------------------------------------------
// Localhost guard
// ---------------------------------------------------------------------------

function isLocalhost(host: string | undefined): boolean {
  if (!host) return false;
  const bare = host.split(":")[0] ?? "";
  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1";
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonOk(res: ServerResponse, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function jsonNotFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

function forbidden(res: ServerResponse): void {
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "forbidden" }));
}

// ---------------------------------------------------------------------------
// Task index (rescanned on every list request)
// ---------------------------------------------------------------------------

function buildTaskMap(): Map<TaskId, Task> {
  const entries = scanTranscripts();
  const derived: Task[] = [];
  for (const entry of entries) {
    try {
      derived.push(deriveTask(entry));
    } catch {
      // Skip transcripts that fail to derive
    }
  }
  // Roll up parent status from children — a quiet operator_session must not read
  // COMPLETE while its sub-agents are still RUNNING/AWAITING_REVIEW. Per-entry
  // deriveStatus has no cross-task view, so this pass runs over the full set.
  const map = new Map<TaskId, Task>();
  for (const task of applyParentStatusRollup(derived)) {
    map.set(task.id, task);
  }
  return map;
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

const SSE_HEARTBEAT_MS = 15_000;
const SSE_AUTO_CLOSE_QUIET_MS = 60_000;

function startSseStream(
  req: IncomingMessage,
  res: ServerResponse,
  task: Task,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Determine the last seen seq from the request header.
  // Default to -1 when absent: every event has seq >= 0, and the resume
  // predicate is `seq > lastSeq`. A first connection must emit seq=0.
  const lastEventIdHeader = req.headers["last-event-id"];
  let lastSeq = -1;
  if (typeof lastEventIdHeader === "string") {
    const parsed = parseInt(lastEventIdHeader, 10);
    if (Number.isFinite(parsed)) lastSeq = parsed;
  }

  const taskId = task.id;
  if (!task.transcriptPath) {
    // Runner-emitted tasks have no JSONL transcript — nothing to stream.
    res.write("event: close\ndata: {\"reason\":\"no_transcript\"}\n\n");
    res.end();
    return;
  }
  const jsonlPath = task.transcriptPath;

  // Initial parse — send events with seq > lastSeq
  let { events } = parseTranscriptFile(taskId, jsonlPath);
  let emittedSeq = lastSeq;

  function sendPendingEvents(allEvents: LogEvent[]): void {
    for (const event of allEvents) {
      if (event.seq > emittedSeq) {
        res.write(`id: ${String(event.seq)}\ndata: ${JSON.stringify(event)}\n\n`);
        emittedSeq = event.seq;
      }
    }
  }

  sendPendingEvents(events);

  // Heartbeat + polling loop
  let lastActivityMs = Date.now();
  let closed = false;

  req.on("close", () => {
    closed = true;
  });

  const heartbeatTimer = setInterval(() => {
    if (closed) {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      return;
    }
    res.write(": ping\n\n");
  }, SSE_HEARTBEAT_MS);

  const pollTimer = setInterval(() => {
    if (closed) {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      return;
    }

    // Re-parse the JSONL for new events
    const fresh = parseTranscriptFile(taskId, jsonlPath);
    const prevCount = events.length;
    events = fresh.events;

    if (events.length > prevCount) {
      lastActivityMs = Date.now();
      sendPendingEvents(events);
    }

    // Auto-close when quiet for 60 s AND task is COMPLETE
    const quietMs = Date.now() - lastActivityMs;
    if (quietMs >= SSE_AUTO_CLOSE_QUIET_MS) {
      const currentStatus = deriveStatus(jsonlPath);
      if (currentStatus === "COMPLETE") {
        clearInterval(heartbeatTimer);
        clearInterval(pollTimer);
        res.write("event: close\ndata: {\"reason\":\"task_complete\"}\n\n");
        res.end();
        closed = true;
      }
    }
  }, 1_000);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url ?? "";
  if (!url.startsWith("/api/transcripts")) return false;

  // Localhost guard (D12)
  if (!isLocalhost(req.headers["host"])) {
    forbidden(res);
    return true;
  }

  // GET /api/transcripts
  if (url === "/api/transcripts" && req.method === "GET") {
    const taskMap = buildTaskMap();
    jsonOk(res, { tasks: Array.from(taskMap.values()) });
    return true;
  }

  // GET /api/transcripts/:id/stream
  const streamMatch = url.match(/^\/api\/transcripts\/([^/]+)\/stream$/);
  if (streamMatch && req.method === "GET") {
    const encodedId = streamMatch[1];
    if (!encodedId) {
      jsonNotFound(res);
      return true;
    }
    const taskId = decodeURIComponent(encodedId);
    const taskMap = buildTaskMap();
    const task = taskMap.get(taskId);
    if (!task) {
      jsonNotFound(res);
      return true;
    }
    startSseStream(req, res, task);
    return true;
  }

  // GET /api/transcripts/:id
  const getMatch = url.match(/^\/api\/transcripts\/([^/]+)$/);
  if (getMatch && req.method === "GET") {
    const encodedId = getMatch[1];
    if (!encodedId) {
      jsonNotFound(res);
      return true;
    }
    const taskId = decodeURIComponent(encodedId);
    const taskMap = buildTaskMap();
    const task = taskMap.get(taskId);
    if (!task) {
      jsonNotFound(res);
      return true;
    }
    if (!task.transcriptPath) {
      // Runner-emitted tasks have no JSONL transcript — return the task with empty events.
      jsonOk(res, { task, events: [] });
      return true;
    }
    const { events } = parseTranscriptFile(taskId, task.transcriptPath);
    jsonOk(res, { task, events });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Vite plugin
// ---------------------------------------------------------------------------

export function transcriptMiddleware(): Plugin {
  return {
    name: "ledger-transcript-middleware",
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (!handleRequest(req, res)) {
            next();
          }
        },
      );
    },
  };
}
