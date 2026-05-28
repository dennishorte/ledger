/**
 * Tests for useRejectTask mutation hook.
 * Four cases: 200 + invalidation, 409 wrong_status, 409 version_conflict
 * (symmetry with useApproveTask per Impl Review N1), 400 schema-failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useRejectTask } from "./useRejectTask.js";
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
    type: "human_review",
    status: "AWAITING_HUMAN_REVIEW",
    title: "review me",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 5,
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

describe("useRejectTask", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("200 → returns {task}, invalidates ['tasks'] and ['task', id]", async () => {
    const task = makeTask("runner-uuid-r1");
    const rejectedTask: Task = { ...task, status: "FAILED", dbRowVersion: 6 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: rejectedTask }),
    );

    const { queryClient, wrapper } = makeWrapperWithClient();
    queryClient.setQueryData(["task", task.id], { task, events: [] });
    queryClient.setQueryData(["tasks"], [task]);

    const { result } = renderHook(() => useRejectTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
        reason: "needs rework",
      });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    const taskState = queryClient.getQueryState(["task", task.id]);
    const tasksState = queryClient.getQueryState(["tasks"]);
    expect(taskState?.isInvalidated).toBe(true);
    expect(tasksState?.isInvalidated).toBe(true);
  });

  it("409 → mutation.error carries {status: 409, body}", async () => {
    const task = makeTask("runner-uuid-r2");
    const conflictBody = {
      error: "wrong_status",
      expected: "AWAITING_HUMAN_REVIEW",
      actual: "FAILED",
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(conflictBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useRejectTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
        reason: "too late",
      });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = (result.current.error as unknown) as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("wrong_status");
  });

  it("409 version_conflict → mutation.error carries {status: 409, body.error: 'version_conflict'} (Impl Review N1 — symmetry with useApproveTask)", async () => {
    const task = makeTask("runner-uuid-r-vc");
    const conflictBody = {
      error: "version_conflict",
      expected: 5,
      actual: 7,
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(conflictBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useRejectTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
        reason: "stale version",
      });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = (result.current.error as unknown) as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("version_conflict");
  });

  it("400 schema-failure (empty reason) → mutation.error carries {status: 400}", async () => {
    // The UI prevents empty reason via disabled button (D11), but the mutation
    // handles a server-side 400 gracefully if bypassed.
    const task = makeTask("runner-uuid-r3");
    const badRequestBody = {
      error: "validation_error",
      message: "reason must be non-empty",
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(badRequestBody, 400),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useRejectTask(), { wrapper });

    act(() => {
      // Bypass the UI guard by calling mutate directly with an empty string.
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
        reason: "",
      });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = (result.current.error as unknown) as { status: number; body: unknown };
    expect(err.status).toBe(400);
  });
});
