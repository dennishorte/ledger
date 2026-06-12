/**
 * Unit tests for useLogStream — runner-stream branch.
 *
 * Uses a FakeEventSource to exercise the SSE path without a live server.
 * The transcript variant is covered by the same FakeEventSource infra; this
 * file focuses on the runner-stream branch (item 3, 05-task-runner round-2).
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useLogStream } from "./useLogStream.js";
import type { Task, LogEvent } from "./types.js";

// ---------------------------------------------------------------------------
// FakeEventSource
// ---------------------------------------------------------------------------

type ESListener = (evt: MessageEvent<string>) => void;
type CloseListener = (evt: Event) => void;

class FakeEventSource {
  readonly url: string;
  onmessage: ESListener | null = null;
  onopen: ((evt: Event) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  private closeListeners: CloseListener[] = [];
  static instances: FakeEventSource[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: CloseListener): void {
    if (event === "close") {
      this.closeListeners.push(listener);
    }
  }

  removeEventListener(_event: string, _listener: CloseListener): void {
    // no-op for test purposes
  }

  close(): void {
    this.closed = true;
  }

  // Test helpers
  emitMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  emitClose(): void {
    for (const l of this.closeListeners) l(new Event("close"));
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeTask(id: string): Task {
  return {
    id,
    type: "noop",
    status: "PENDING",
    title: "test task",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeLogEvent(seq: number): LogEvent {
  return {
    id: `evt-${String(seq)}`,
    taskId: "runner-uuid",
    seq,
    at: "2026-01-01T00:00:00Z",
    kind: "status_change",
    from: "PENDING",
    to: "RUNNING",
  } as LogEvent;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useLogStream — runner-stream branch", () => {
  it("happy path: EventSource connects to /api/tasks/:id/stream for runner IDs", async () => {
    const runnerId = "550e8400-e29b-41d4-a716-446655440000"; // bare UUID, no colon
    const task = makeTask(runnerId);

    (vi.mocked(globalThis.fetch) as Mock).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    const { result } = renderHook(() => useLogStream(runnerId), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = FakeEventSource.instances[0]!;
    expect(es.url).toBe(`/api/tasks/${encodeURIComponent(runnerId)}/stream`);
    expect(result.current.status).toBe("live");
  });

  it("incoming data events are appended to stream state", async () => {
    const runnerId = "runner-plain-uuid";
    const task = makeTask(runnerId);

    (vi.mocked(globalThis.fetch) as Mock).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    const { result } = renderHook(() => useLogStream(runnerId), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = FakeEventSource.instances[0]!;

    act(() => {
      es.emitMessage(makeLogEvent(0));
      es.emitMessage(makeLogEvent(1));
    });

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThanOrEqual(2);
    });

    const seqs = result.current.events.map((e) => e.seq);
    expect(seqs).toContain(0);
    expect(seqs).toContain(1);
  });

  it("EventSource.close() is called on unmount", async () => {
    const runnerId = "runner-unmount-test";
    const task = makeTask(runnerId);

    (vi.mocked(globalThis.fetch) as Mock).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    const { unmount } = renderHook(() => useLogStream(runnerId), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = FakeEventSource.instances[0]!;
    expect(es.closed).toBe(false);

    unmount();

    expect(es.closed).toBe(true);
  });

  it("transcript IDs use the transcript SSE URL, not the tasks URL", async () => {
    const transcriptId = "session:abc-123";
    const task = makeTask(transcriptId);

    (vi.mocked(globalThis.fetch) as Mock).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    renderHook(() => useLogStream(transcriptId), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = FakeEventSource.instances[0]!;
    expect(es.url).toBe(
      `/api/transcripts/${encodeURIComponent(transcriptId)}/stream`,
    );
  });

  it("seq-based deduplication: duplicate seq is not appended twice", async () => {
    const runnerId = "runner-dedup-test";
    const task = makeTask(runnerId);

    (vi.mocked(globalThis.fetch) as Mock).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    const { result } = renderHook(() => useLogStream(runnerId), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = FakeEventSource.instances[0]!;
    const ev = makeLogEvent(0);

    act(() => {
      es.emitMessage(ev);
      es.emitMessage(ev); // duplicate
    });

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThanOrEqual(1);
    });

    const seqZeroCount = result.current.events.filter((e) => e.seq === 0).length;
    expect(seqZeroCount).toBe(1);
  });

  it("status transitions to 'ended' when server emits close event", async () => {
    const runnerId = "runner-close-test";
    const task = makeTask(runnerId);

    (vi.mocked(globalThis.fetch) as Mock).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    const { result } = renderHook(() => useLogStream(runnerId), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = FakeEventSource.instances[0]!;

    act(() => {
      es.emitClose();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ended");
    });
  });
});
