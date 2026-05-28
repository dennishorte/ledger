/**
 * Mocked-fetch tests for useTask endpoint selection logic.
 * Five cases: colon-id → transcripts, no-colon-id → tasks, 404 → null,
 * 5xx → isError (Spec Review B1), fetch called exactly once (no fallback).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useTask } from "./useTask.js";
import type { Task, LogEvent } from "./types.js";

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
    status: "COMPLETE",
    title: "test",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMPTY_EVENTS: LogEvent[] = [];

describe("useTask (mocked fetch)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("colon id → fetches /api/transcripts/:id, returns {task, events}", async () => {
    const task = makeTask("session:abc-123");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: EMPTY_EVENTS }),
    );

    const { result } = renderHook(() => useTask("session:abc-123"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data?.task.id).toBe("session:abc-123");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "/api/transcripts/session%3Aabc-123",
    );
  });

  it("no-colon id → fetches /api/tasks/:id, returns {task, events}", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const task = makeTask(id);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: EMPTY_EVENTS }),
    );

    const { result } = renderHook(() => useTask(id), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data?.task.id).toBe(id);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `/api/tasks/${encodeURIComponent(id)}`,
    );
  });

  it("404 on chosen endpoint → returns null (no fallback)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("not found", { status: 404 }),
    );

    const { result } = renderHook(() => useTask("runner-uuid"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data).toBeNull();
    // Exactly one fetch call — no fallback to the other endpoint.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("5xx on chosen endpoint → query enters isError (Spec Review B1)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("internal error", { status: 500 }),
    );

    const { result } = renderHook(() => useTask("runner-uuid"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => { expect(result.current.isError).toBe(true); });

    expect(result.current.data).toBeUndefined();
  });

  it("fetch called exactly once — no cross-endpoint fallback", async () => {
    const id = "agent:some-agent";
    const task = makeTask(id);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: EMPTY_EVENTS }),
    );

    const { result } = renderHook(() => useTask(id), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Only one network call regardless of success/failure.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });
});
