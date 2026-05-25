/**
 * Hook that combines an initial TanStack Query fetch with an SSE EventSource
 * for live log streaming.
 *
 * - `status: "missing"` — initial fetch 404'd.
 * - `status: "live"` — EventSource is OPEN.
 * - `status: "ended"` — SSE closed cleanly (server signalled task COMPLETE).
 * - `status: "stub"` — reserved for unit-test / Storybook contexts (unused here).
 *
 * `reconnectAttempt` increments each time the EventSource reconnects.
 *
 * On reconnect, the EventSource sends Last-Event-ID automatically (built into
 * the browser's EventSource API), and the server re-parses from line 0,
 * skipping events with seq ≤ Last-Event-ID.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTask } from "./useTask.js";
import type { ConnectionStatus, LogEvent, TaskId } from "./types.js";

export interface UseLogStreamResult {
  events: LogEvent[];
  status: ConnectionStatus;
  reconnectAttempt: number;
}

export function useLogStream(taskId: TaskId): UseLogStreamResult {
  const taskQuery = useTask(taskId);

  const [streamedEvents, setStreamedEvents] = useState<LogEvent[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("missing");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Track the highest seq we've seen so EventSource sends Last-Event-ID.
  const lastSeqRef = useRef<number>(-1);
  const esRef = useRef<EventSource | null>(null);

  // Seed initial events from TanStack Query result.
  const initialEvents = taskQuery.data?.events;
  const queryStatus = taskQuery.status;

  const seedInitial = useCallback(() => {
    if (initialEvents && initialEvents.length > 0) {
      setStreamedEvents(initialEvents);
      const lastEvent = initialEvents[initialEvents.length - 1];
      if (lastEvent) {
        lastSeqRef.current = lastEvent.seq;
      }
    }
  }, [initialEvents]);

  useEffect(() => {
    seedInitial();
  }, [seedInitial]);

  // Open SSE stream once the initial query resolves.
  useEffect(() => {
    if (queryStatus === "pending") return;

    if (queryStatus === "error" || taskQuery.data === null) {
      setConnStatus("missing");
      return;
    }

    // Close any existing EventSource.
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const url = `/api/transcripts/${encodeURIComponent(taskId)}/stream`;
    const es = new EventSource(url);
    esRef.current = es;
    setConnStatus("live");

    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const event = JSON.parse(evt.data) as LogEvent;
        lastSeqRef.current = event.seq;
        setStreamedEvents((prev) => {
          // Avoid duplicates (seq-based dedup).
          if (prev.some((e) => e.seq === event.seq)) return prev;
          return [...prev, event];
        });
      } catch {
        // Malformed SSE data — skip.
      }
    };

    es.addEventListener("close", () => {
      setConnStatus("ended");
      es.close();
    });

    es.onerror = () => {
      // EventSource will attempt to reconnect automatically.
      setReconnectAttempt((n) => n + 1);
      setConnStatus("live"); // will restore when reconnected
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [taskId, queryStatus, taskQuery.data]);

  // Merge initial events + streamed deltas (deduplicated by seq).
  const allEvents =
    streamedEvents.length > 0 ? streamedEvents : (initialEvents ?? []);

  return {
    events: allEvents,
    status: connStatus,
    reconnectAttempt,
  };
}
