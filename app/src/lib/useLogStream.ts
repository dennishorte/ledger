/**
 * Hook that combines an initial TanStack Query fetch with an SSE EventSource
 * for live log streaming.
 *
 * - `status: "missing"` — initial fetch 404'd.
 * - `status: "live"` — EventSource is OPEN.
 * - `status: "ended"` — SSE closed cleanly (server signalled task COMPLETE).
 * - `status: "stub"` — reserved for unit-test / Storybook contexts (unused here).
 *
 * `reconnectVisible` flips true once an error state has persisted for
 * RECONNECT_VISIBLE_DELAY_MS; the connection pill reads it directly.
 *
 * On reconnect, the EventSource sends Last-Event-ID automatically (built into
 * the browser's EventSource API), and the server re-parses from line 0,
 * skipping events with seq ≤ Last-Event-ID.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTask } from "./useTask.js";
import type { ConnectionStatus, LogEvent, TaskId } from "./types.js";

/** Minimum ms the error state must persist before the pill shows "reconnecting…". */
const RECONNECT_VISIBLE_DELAY_MS = 500;

export interface UseLogStreamResult {
  events: LogEvent[];
  status: ConnectionStatus;
  /** True only after an onerror has persisted for ≥ RECONNECT_VISIBLE_DELAY_MS. */
  reconnectVisible: boolean;
}

export function useLogStream(taskId: TaskId): UseLogStreamResult {
  const taskQuery = useTask(taskId);

  const [streamedEvents, setStreamedEvents] = useState<LogEvent[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("missing");
  const [reconnectVisible, setReconnectVisible] = useState(false);

  // Track the highest seq we've seen so EventSource sends Last-Event-ID.
  const lastSeqRef = useRef<number>(-1);
  const esRef = useRef<EventSource | null>(null);
  // Timer that fires setReconnectVisible after the threshold elapses.
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    es.onopen = () => {
      // Clear any pending reconnect timer and hide the pill on successful open.
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setReconnectVisible(false);
    };

    es.onerror = () => {
      // EventSource will attempt to reconnect automatically.
      setConnStatus("live"); // will restore when reconnected
      // Only show the reconnecting pill after the threshold elapses.
      if (reconnectTimerRef.current === null) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          setReconnectVisible(true);
        }, RECONNECT_VISIBLE_DELAY_MS);
      }
    };

    return () => {
      es.close();
      esRef.current = null;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [taskId, queryStatus, taskQuery.data]);

  // Merge initial events + streamed deltas (deduplicated by seq).
  const allEvents =
    streamedEvents.length > 0 ? streamedEvents : (initialEvents ?? []);

  return {
    events: allEvents,
    status: connStatus,
    reconnectVisible,
  };
}
