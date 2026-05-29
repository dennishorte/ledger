/**
 * Tests for useCancelTask mutation hook.
 * Mirrors useApproveTask's test shape: 200 + setQueryData, 409 no_subprocess, generic 409.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useCancelTask } from "./useCancelTask.js";
import type { Task } from "./types.js";
import type { TaskDetail } from "./useTask.js";

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
    status: "RUNNING",
    title: "running-task",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 2,
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

describe("useCancelTask", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("200 → response-based setQueryData on ['task', id] + invalidates both keys (mirrors D12-amended pattern)", async () => {
    const task = makeTask("runner-uuid-cancel-1");
    const cancelledTask: Task = { ...task, status: "CANCELLED", dbRowVersion: 3 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: cancelledTask }),
    );

    const { queryClient, wrapper } = makeWrapperWithClient();
    // Pre-seed query data
    const seedEvents = [{ id: "ev-seed", taskId: task.id, seq: 0, at: "2026-01-01T00:00:00Z", kind: "status_change" as const, to: "RUNNING" as const }];
    queryClient.setQueryData<TaskDetail>(["task", task.id], { task, events: seedEvents });
    queryClient.setQueryData(["tasks"], [task]);

    const { result } = renderHook(() => useCancelTask(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: task.id });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Response-based cache update: task.status flipped to CANCELLED atomically.
    const taskData = queryClient.getQueryData<TaskDetail>(["task", task.id]);
    expect(taskData?.task.status).toBe("CANCELLED");
    expect(taskData?.task.dbRowVersion).toBe(3);
    // Events preserved from prior cache (mutation response carries only `task`).
    expect(taskData?.events).toEqual(seedEvents);

    // Both query keys invalidated for background refresh.
    const taskState = queryClient.getQueryState(["task", task.id]);
    const tasksState = queryClient.getQueryState(["tasks"]);
    expect(taskState?.isInvalidated).toBe(true);
    expect(tasksState?.isInvalidated).toBe(true);
  });

  it("200 → setQueryData no-ops when ['task', id] cache is empty (defensive guard)", async () => {
    const task = makeTask("runner-uuid-cancel-empty");
    const cancelledTask: Task = { ...task, status: "CANCELLED", dbRowVersion: 3 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: cancelledTask }),
    );

    const { queryClient, wrapper } = makeWrapperWithClient();
    // No pre-seed: cache is empty.
    const { result } = renderHook(() => useCancelTask(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: task.id });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Cache stays empty; refetch would fill it via background invalidate.
    const taskData = queryClient.getQueryData<TaskDetail>(["task", task.id]);
    expect(taskData).toBeUndefined();
  });

  it("409 no_subprocess → mutation.error carries {status: 409, body: {error: 'no_subprocess'}}", async () => {
    const task = makeTask("runner-uuid-no-sub");
    const errBody = { error: "no_subprocess", id: task.id, taskType: "implement" };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(errBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useCancelTask(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: task.id });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = result.current.error as unknown as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("no_subprocess");
  });

  it("409 wrong_status → mutation.error carries {status: 409, body: {error: 'wrong_status'}}", async () => {
    const task = makeTask("runner-uuid-wrong-status");
    const errBody = { error: "wrong_status", expected: "RUNNING", actual: "COMPLETE" };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(errBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useCancelTask(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: task.id });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = result.current.error as unknown as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("wrong_status");
  });

  it("optional reason is included in request body when provided", async () => {
    const task = makeTask("runner-uuid-reason");
    const cancelledTask: Task = { ...task, status: "CANCELLED", dbRowVersion: 3 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: cancelledTask }),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useCancelTask(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: task.id, reason: "operator decided to stop" });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const call = calls[0];
    if (call !== undefined) {
      const reqInit = call[1] as RequestInit;
      const body = JSON.parse(reqInit.body as string) as { reason: string };
      expect(body.reason).toBe("operator decided to stop");
    }
  });

  it("no reason in variables → empty object body sent (endpoint defaults to cancelled_by_operator)", async () => {
    const task = makeTask("runner-uuid-no-reason");
    const cancelledTask: Task = { ...task, status: "CANCELLED", dbRowVersion: 3 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: cancelledTask }),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useCancelTask(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: task.id });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const call = calls[0];
    if (call !== undefined) {
      const reqInit = call[1] as RequestInit;
      const body = JSON.parse(reqInit.body as string) as Record<string, unknown>;
      expect(body).toEqual({});
    }
  });
});
