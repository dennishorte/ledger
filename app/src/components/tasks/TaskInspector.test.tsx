/**
 * Tests for TaskInspector modifications in 05-ui-hook-migration:
 * - Approve/Reject button gating (× 3 conditions)
 * - Approve flow (200 success)
 * - Reject flow (textarea gating + submit)
 * - 409 error banner
 * - Status-reason row visibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import type { Task, LogEvent } from "@/lib/types";

// Mock parseDocs (uses import.meta.glob — unavailable in jsdom).
vi.mock("@/lib/parseDocs", () => ({
  idForPath: () => null,
  loadDocNodes: () => [],
}));

// Mock useShellStore.getState().openInspector so we don't need the full store.
vi.mock("@/stores/shell", () => ({
  useShellStore: {
    getState: () => ({ openInspector: vi.fn() }),
  },
}));

const { TaskInspector } = await import("./TaskInspector");

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}

function makeRunnerTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "550e8400-e29b-41d4-a716-446655440001",
    type: "human_review",
    status: "AWAITING_HUMAN_REVIEW",
    title: "Approve me",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 2,
    priority: 0,
    createdAt: "2026-01-01T00:00:00Z",
    // transcriptPath is absent — runner-emitted discriminant
    ...overrides,
  };
}

function makeTranscriptTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "session:abc-123",
    type: "operator_session",
    status: "AWAITING_HUMAN_REVIEW",
    title: "Transcript task",
    source: "agent_generated",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-01-01T00:00:00Z",
    transcriptPath: "/some/path/transcript.jsonl",
    ...overrides,
  };
}

function makeStatusChangeEvent(reason: string | undefined, seq = 0): LogEvent {
  return {
    id: `evt-${String(seq)}`,
    taskId: "test",
    seq,
    at: "2026-01-01T00:00:00Z",
    kind: "status_change",
    from: "PENDING",
    to: "BLOCKED",
    ...(reason !== undefined ? { reason } : {}),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TaskInspector", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Button gating × 3
  // -------------------------------------------------------------------------

  it("runner-emitted ∧ AWAITING_HUMAN_REVIEW → Approve and Reject buttons visible", async () => {
    const task = makeRunnerTask();
    // useTask returns live task with same status
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /approve/i })).not.toBeNull();
      expect(screen.queryByRole("button", { name: /reject/i })).not.toBeNull();
    });
  });

  it("runner-emitted ∧ COMPLETE → no Approve/Reject buttons", async () => {
    const task = makeRunnerTask({ status: "COMPLETE" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => { expect(screen.queryByText("Approve")).toBeNull(); });
    expect(screen.queryByText("Reject…")).toBeNull();
  });

  it("transcript-derived ∧ AWAITING_HUMAN_REVIEW → no Approve/Reject buttons", async () => {
    // The discriminant is transcriptPath !== undefined, not status.
    const task = makeTranscriptTask({ status: "AWAITING_HUMAN_REVIEW" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => { expect(screen.queryByText("Approve")).toBeNull(); });
    expect(screen.queryByText("Reject…")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Approve flow
  // -------------------------------------------------------------------------

  it("Approve flow: click Approve → fetch POST /approve with dbRowVersion", async () => {
    const task = makeRunnerTask();
    const approvedTask: Task = { ...task, status: "COMPLETE", dbRowVersion: 3 };

    vi.mocked(globalThis.fetch)
      // First call: useTask query
      .mockResolvedValueOnce(jsonResponse({ task, events: [] }))
      // Second call: approve mutation
      .mockResolvedValueOnce(jsonResponse({ task: approvedTask }))
      // Subsequent calls: refetch after invalidation
      .mockResolvedValue(jsonResponse({ task: approvedTask, events: [] }));

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    // Wait for Approve button to appear
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /approve/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const approveCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/approve"),
      );
      expect(approveCall).toBeDefined();
      if (approveCall !== undefined) {
        const reqInit = approveCall[1] as RequestInit;
        const body = JSON.parse(reqInit.body as string) as { dbRowVersion: number };
        expect(body.dbRowVersion).toBe(task.dbRowVersion);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Reject flow
  // -------------------------------------------------------------------------

  it("Reject flow: textarea appears, Confirm disabled until non-empty, then submits", async () => {
    const task = makeRunnerTask();
    const rejectedTask: Task = { ...task, status: "FAILED", dbRowVersion: 3 };

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ task, events: [] }))
      .mockResolvedValueOnce(jsonResponse({ task: rejectedTask }))
      .mockResolvedValue(jsonResponse({ task: rejectedTask, events: [] }));

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /reject/i })).not.toBeNull();
    });

    // Click Reject… → textarea should appear
    fireEvent.click(screen.getByRole("button", { name: /reject…/i }));

    const textarea = await screen.findByRole("textbox", { name: /rejection rationale/i });
    expect(textarea).not.toBeNull();

    // Confirm disabled while empty
    const confirmBtn = screen.getByRole("button", { name: /confirm reject/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    // Type rationale → Confirm enabled
    fireEvent.change(textarea, { target: { value: "needs rework" } });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);

    // Click Confirm → fetch called with reason
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const rejectCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/reject"),
      );
      expect(rejectCall).toBeDefined();
      if (rejectCall !== undefined) {
        const reqInit = rejectCall[1] as RequestInit;
        const body = JSON.parse(reqInit.body as string) as {
          reason: string;
          dbRowVersion: number;
        };
        expect(body.reason).toBe("needs rework");
        expect(body.dbRowVersion).toBe(task.dbRowVersion);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 409 error banner
  // -------------------------------------------------------------------------

  it("409 version_conflict → banner text 'updated elsewhere'", async () => {
    const task = makeRunnerTask();
    const conflictBody = { error: "version_conflict", expected: 1, actual: 2 };

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ task, events: [] }))
      .mockResolvedValueOnce(jsonResponse(conflictBody, 409));

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /approve/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => {
      expect(screen.queryByText(/updated elsewhere/i)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Status-reason row
  // -------------------------------------------------------------------------

  it("Status reason row visible when latest status_change has reason", async () => {
    const task = makeRunnerTask({ status: "BLOCKED" });
    const reasonEvent = makeStatusChangeEvent("blocked_no_executor");

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [reasonEvent] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByText("blocked_no_executor")).not.toBeNull();
    });
  });

  it("Status reason row hidden when no status_change has reason", async () => {
    const task = makeRunnerTask({ status: "COMPLETE" });
    const noReasonEvent = makeStatusChangeEvent(undefined);

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [noReasonEvent] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    // Wait for query to resolve by checking title text
    await waitFor(() => {
      expect(screen.queryByText(task.title)).not.toBeNull();
    });

    expect(screen.queryByText(/status reason/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cancel button visibility (05-dispatch-api)
  // -------------------------------------------------------------------------

  it("runner-emitted ∧ RUNNING → Cancel task button visible", async () => {
    const task = makeRunnerTask({ status: "RUNNING" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /cancel task/i })).not.toBeNull();
    });
  });

  it("runner-emitted ∧ COMPLETE → no Cancel task button", async () => {
    const task = makeRunnerTask({ status: "COMPLETE" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByText(task.title)).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: /cancel task/i })).toBeNull();
  });

  it("runner-emitted ∧ AWAITING_HUMAN_REVIEW → no Cancel task button", async () => {
    const task = makeRunnerTask({ status: "AWAITING_HUMAN_REVIEW" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /approve/i })).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: /cancel task/i })).toBeNull();
  });

  it("transcript-derived ∧ RUNNING → no Cancel task button (discriminant: transcriptPath)", async () => {
    const task = makeTranscriptTask({ status: "RUNNING" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByText(task.title)).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: /cancel task/i })).toBeNull();
  });

  it("Cancel task click → POST /api/tasks/:id/cancel called", async () => {
    const task = makeRunnerTask({ status: "RUNNING" });
    const cancelledTask = { ...task, status: "CANCELLED" as const, dbRowVersion: 3 };

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ task, events: [] }))
      .mockResolvedValueOnce(jsonResponse({ task: cancelledTask }))
      .mockResolvedValue(jsonResponse({ task: cancelledTask, events: [] }));

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /cancel task/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel task/i }));

    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const cancelCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/cancel"),
      );
      expect(cancelCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Item 1 (01-hitl-rejection-rationale-ui-display): status reason row
  // shows the truncated 80-char form, NOT the full rationale.
  // -------------------------------------------------------------------------

  it("Status reason row shows truncated form; full rationale does not appear in that row", async () => {
    // Full rationale is longer than 80 chars; server truncates to 80 in reason field.
    // The suffix " in total length" (16 chars) is NOT in the truncated form.
    const fullRationale = "This is a very long rejection rationale that exceeds eighty characters in total length";
    const truncatedReason = "rejected: " + fullRationale.slice(0, 80);
    const task = makeRunnerTask({ status: "FAILED" });
    const reasonEvent = makeStatusChangeEvent(truncatedReason);

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [reasonEvent] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    // Wait for the Status reason label to appear, then check the row value.
    await waitFor(() => {
      expect(screen.queryByText(/status reason/i)).not.toBeNull();
    });

    // The truncated form starts with "rejected: This is a very long" — verify it is present.
    expect(screen.queryByText(/rejected: This is a very long/i)).not.toBeNull();

    // The trailing text that was sliced off must NOT appear anywhere (it belongs in LogStream ErrorRow).
    expect(screen.queryByText(/in total length/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Item 2 (01-hitl-rejection-rationale-ui-display): follow-up task toggle
  // -------------------------------------------------------------------------

  it("Confirm disabled when follow-up toggle on and title empty", async () => {
    const task = makeRunnerTask();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ task, events: [] }),
    );

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /reject/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /reject…/i }));

    const textarea = await screen.findByRole("textbox", { name: /rejection rationale/i });
    fireEvent.change(textarea, { target: { value: "needs rework" } });

    // Confirm is enabled before toggle.
    const confirmBtn = screen.getByRole("button", { name: /confirm reject/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);

    // Enable follow-up toggle — title is empty, so Confirm should be disabled.
    const toggle = screen.getByRole("checkbox", { name: /queue follow-up task/i });
    fireEvent.click(toggle);

    const titleInput = await screen.findByRole("textbox", { name: /follow-up task title/i });
    expect(titleInput).not.toBeNull();
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Reject with follow-up toggle: submits followUp in request body", async () => {
    const task = makeRunnerTask();
    const rejectedTask: Task = { ...task, status: "FAILED", dbRowVersion: 3 };
    const followUpTask: Task = {
      ...task,
      id: "550e8400-e29b-41d4-a716-446655440099",
      type: "implement",
      status: "PENDING",
      title: "re-implement this",
      dbRowVersion: 1,
    };

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ task, events: [] }))
      .mockResolvedValueOnce(jsonResponse({ task: rejectedTask, followUpTask }))
      .mockResolvedValue(jsonResponse({ task: rejectedTask, events: [] }));

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /reject/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /reject…/i }));

    const textarea = await screen.findByRole("textbox", { name: /rejection rationale/i });
    fireEvent.change(textarea, { target: { value: "needs rework" } });

    const toggle = screen.getByRole("checkbox", { name: /queue follow-up task/i });
    fireEvent.click(toggle);

    const titleInput = await screen.findByRole("textbox", { name: /follow-up task title/i });
    fireEvent.change(titleInput, { target: { value: "re-implement this" } });

    // Select type "implement" from the select
    const typeSelect = screen.getByRole("combobox", { name: /follow-up task type/i });
    fireEvent.change(typeSelect, { target: { value: "implement" } });

    const confirmBtn = screen.getByRole("button", { name: /confirm reject/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const rejectCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/reject"),
      );
      expect(rejectCall).toBeDefined();
      if (rejectCall !== undefined) {
        const reqInit = rejectCall[1] as RequestInit;
        const body = JSON.parse(reqInit.body as string) as {
          reason: string;
          dbRowVersion: number;
          followUp?: { type: string; title: string };
        };
        expect(body.reason).toBe("needs rework");
        expect(body.followUp).toBeDefined();
        expect(body.followUp?.type).toBe("implement");
        expect(body.followUp?.title).toBe("re-implement this");
      }
    });
  });

  it("409 no_subprocess → inline banner shows no_subprocess message", async () => {
    const task = makeRunnerTask({ status: "RUNNING" });
    const errBody = { error: "no_subprocess", id: task.id, taskType: "implement" };

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ task, events: [] }))
      .mockResolvedValueOnce(jsonResponse(errBody, 409));

    render(<TaskInspector task={task} allTasks={[task]} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /cancel task/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel task/i }));

    await waitFor(() => {
      expect(screen.queryByText(/no subprocess to cancel/i)).not.toBeNull();
    });
  });
});
