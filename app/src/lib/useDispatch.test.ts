/**
 * Tests for useDispatch mutation hook.
 * Three cases: 201 + invalidation, 409 no_inferred_type, 404 node_not_found.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useDispatch } from "./useDispatch.js";
import type { Task } from "./types.js";

function makeWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
  return { queryClient, wrapper };
}

function makeTask(id: string): Task {
  return {
    id,
    type: "implement",
    status: "PENDING",
    title: "Dispatch implement on leaf-node",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 1,
    priority: 0,
    createdAt: "2026-01-01T00:00:00Z",
    agent: { model: "claude-code", persona: "implement" },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useDispatch", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("201 → invalidates ['tasks'] only (no setQueryData for the new task, Spec Review S3)", async () => {
    const newTask = makeTask("new-uuid-1");

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: newTask }, 201),
    );

    const { queryClient, wrapper } = makeWrapperWithClient();
    // Pre-seed ["tasks"] list
    queryClient.setQueryData(["tasks"], [] as Task[]);

    const { result } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      result.current.mutate({ nodeId: "leaf-node" });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Result data carries the new task
    expect(result.current.data?.task.id).toBe("new-uuid-1");

    // ["tasks"] is invalidated
    const tasksState = queryClient.getQueryState(["tasks"]);
    expect(tasksState?.isInvalidated).toBe(true);

    // ["task", id] is NOT set (S3 rationale — PENDING snapshot would flicker)
    const taskCacheEntry = queryClient.getQueryData(["task", "new-uuid-1"]);
    expect(taskCacheEntry).toBeUndefined();
  });

  it("201 with explicit type override in variables", async () => {
    const newTask = makeTask("new-uuid-2");
    newTask.type = "spec_review";

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: newTask }, 201),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      result.current.mutate({ nodeId: "another-node", type: "spec_review" });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Verify fetch was called with the right body
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (call !== undefined) {
      expect(call[0]).toBe("/api/dispatch/another-node");
      const reqInit = call[1] as RequestInit;
      const body = JSON.parse(reqInit.body as string) as { type: string };
      expect(body.type).toBe("spec_review");
    }
  });

  it("409 no_inferred_type → mutation.error carries {status: 409, body: {error: 'no_inferred_type'}}", async () => {
    const errBody = {
      error: "no_inferred_type",
      nodeStatus: "COMPLETE",
      hint: "Node is COMPLETE — no work to dispatch.",
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(errBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      result.current.mutate({ nodeId: "complete-node" });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = result.current.error as unknown as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("no_inferred_type");
  });

  it("404 node_not_found → mutation.error carries {status: 404, body: {error: 'node_not_found'}}", async () => {
    const errBody = { error: "node_not_found", nodeId: "unknown-node" };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(errBody, 404),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      result.current.mutate({ nodeId: "unknown-node" });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = result.current.error as unknown as { status: number; body: { error: string } };
    expect(err.status).toBe(404);
    expect(err.body.error).toBe("node_not_found");
  });

  it("fetch URL encodes nodeId with slashes correctly", async () => {
    const newTask = makeTask("encoded-uuid");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: newTask }, 201),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      result.current.mutate({ nodeId: "06-agent-dispatcher/05-dispatch-api" });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0]?.[0]).toBe(
      "/api/dispatch/06-agent-dispatcher%2F05-dispatch-api",
    );
  });
});
