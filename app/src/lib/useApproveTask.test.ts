/**
 * Tests for useApproveTask mutation hook.
 * Three cases: 200 + invalidation, 409 version_conflict, 409 wrong_status.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useApproveTask } from "./useApproveTask.js";
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
    type: "human_review",
    status: "AWAITING_HUMAN_REVIEW",
    title: "review me",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 3,
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

describe("useApproveTask", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("200 → response-based setQueryData on ['task', id] + invalidates both keys (stage-8b Fix A)", async () => {
    const task = makeTask("runner-uuid-1");
    const approvedTask: Task = { ...task, status: "COMPLETE", dbRowVersion: 4 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: approvedTask }),
    );

    const { queryClient, wrapper } = makeWrapperWithClient();
    // Pre-seed query data so we can observe BOTH setQueryData (task) AND
    // invalidation (background events refresh).
    const seedEvents = [{ id: "ev-seed", taskId: task.id, seq: 0, at: "2026-01-01T00:00:00Z", kind: "status_change" as const, to: "PENDING" as const }];
    queryClient.setQueryData<TaskDetail>(["task", task.id], { task, events: seedEvents });
    queryClient.setQueryData(["tasks"], [task]);

    const { result } = renderHook(() => useApproveTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
      });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Fix A: ["task", id] cache was updated with the post-transition task
    // immediately on onSuccess, BEFORE the background refetch. Events are
    // preserved from the prior cache (mutation response carries only `task`).
    const taskData = queryClient.getQueryData<TaskDetail>(["task", task.id]);
    expect(taskData?.task.status).toBe("COMPLETE");
    expect(taskData?.task.dbRowVersion).toBe(4);
    expect(taskData?.events).toEqual(seedEvents);

    // Both query keys are also invalidated (background refresh).
    const taskState = queryClient.getQueryState(["task", task.id]);
    const tasksState = queryClient.getQueryState(["tasks"]);
    expect(taskState?.isInvalidated).toBe(true);
    expect(tasksState?.isInvalidated).toBe(true);
  });

  it("200 → setQueryData no-ops when ['task', id] cache is empty (Fix A defensive)", async () => {
    const task = makeTask("runner-uuid-1-empty");
    const approvedTask: Task = { ...task, status: "COMPLETE", dbRowVersion: 4 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task: approvedTask }),
    );

    const { queryClient, wrapper } = makeWrapperWithClient();
    // No pre-seed: ["task", id] cache is empty. setQueryData's updater
    // receives `undefined` (typed as `null`) and returns `null` per the
    // `(old) => (old ? {...} : old)` guard. The background invalidate
    // would fill the cache via refetch, not the response-based path.
    const { result } = renderHook(() => useApproveTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
      });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    const taskData = queryClient.getQueryData<TaskDetail>(["task", task.id]);
    expect(taskData).toBeUndefined();  // cache stays empty; refetch is what would fill it
  });

  it("409 version_conflict → mutation.error carries {status: 409, body: {error: 'version_conflict'}}", async () => {
    const task = makeTask("runner-uuid-2");
    const conflictBody = { error: "version_conflict", expected: 2, actual: 3 };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(conflictBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useApproveTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
      });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = (result.current.error as unknown) as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("version_conflict");
  });

  it("409 wrong_status → mutation.error carries {status: 409, body: {error: 'wrong_status'}}", async () => {
    const task = makeTask("runner-uuid-3");
    const wrongStatusBody = {
      error: "wrong_status",
      expected: "AWAITING_HUMAN_REVIEW",
      actual: "COMPLETE",
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(wrongStatusBody, 409),
    );

    const { wrapper } = makeWrapperWithClient();
    const { result } = renderHook(() => useApproveTask(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        dbRowVersion: task.dbRowVersion,
      });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });

    const err = (result.current.error as unknown) as { status: number; body: { error: string } };
    expect(err.status).toBe(409);
    expect(err.body.error).toBe("wrong_status");
  });
});
