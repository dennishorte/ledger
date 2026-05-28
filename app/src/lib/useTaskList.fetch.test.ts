/**
 * Mocked-fetch integration tests for useTaskList.
 * Exercises both-200, partial-404, both-404, and 5xx-error cases.
 * 5xx symmetry: both runner-500 and transcript-500 paths covered per
 * Impl Review N2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useTaskList } from "./useTaskList.js";
import type { Task } from "./types.js";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeTask(id: string, createdAt: string): Task {
  return {
    id,
    type: "noop",
    status: "COMPLETE",
    title: "test task",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useTaskList (mocked fetch)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("both 200 → returns merged list sorted createdAt DESC", async () => {
    const runnerTask = makeTask("runner-1", "2026-01-02T00:00:00Z");
    const transcriptTask = makeTask("session:abc", "2026-01-01T00:00:00Z");

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ tasks: [runnerTask] }))    // /api/tasks
      .mockResolvedValueOnce(jsonResponse({ tasks: [transcriptTask] })); // /api/transcripts

    const { result } = renderHook(() => useTaskList(), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data?.map((t) => t.id)).toEqual(["runner-1", "session:abc"]);
  });

  it("runner 200 + transcript 404 → returns just runner tasks", async () => {
    const runnerTask = makeTask("runner-1", "2026-01-01T00:00:00Z");

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ tasks: [runnerTask] }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const { result } = renderHook(() => useTaskList(), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data?.map((t) => t.id)).toEqual(["runner-1"]);
  });

  it("runner 404 + transcript 200 → returns just transcript tasks", async () => {
    const transcriptTask = makeTask("session:abc", "2026-01-01T00:00:00Z");

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ tasks: [transcriptTask] }));

    const { result } = renderHook(() => useTaskList(), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data?.map((t) => t.id)).toEqual(["session:abc"]);
  });

  it("both 404 → returns empty list (success, not error)", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const { result } = renderHook(() => useTaskList(), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data).toEqual([]);
  });

  it("runner 500 (non-404 error) → query enters isError", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const { result } = renderHook(() => useTaskList(), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isError).toBe(true); });

    expect(result.current.data).toBeUndefined();
  });

  it("transcript 500 + runner 404 → query enters isError (Impl Review N2 — 5xx symmetry)", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("server error", { status: 500 }));

    const { result } = renderHook(() => useTaskList(), { wrapper: makeWrapper() });
    await waitFor(() => { expect(result.current.isError).toBe(true); });

    expect(result.current.data).toBeUndefined();
  });
});
