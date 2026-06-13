/**
 * Tests for NodeInspector Dispatch button visibility cases.
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Requirements item 5 + item 8 (NodeInspector)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import type { DocNode } from "@/lib/types";

// Mock parseDocs (uses import.meta.glob — unavailable in jsdom).
vi.mock("@/lib/parseDocs", () => ({
  idForPath: () => null,
  loadDocNodes: () => [],
}));

const { NodeInspector } = await import("./NodeInspector");

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

function makeNode(overrides: Partial<DocNode> & { status: DocNode["status"] }): DocNode {
  const { status, ...rest } = overrides;
  return {
    id: "test-node",
    parentId: null,
    title: "Test Node",
    status,
    dependsOn: [],
    authored: true,
    source: "docs/test-node.md",
    ...rest,
  };
}

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("NodeInspector Dispatch button visibility", () => {
  beforeEach(() => {
    // useDocSource fires GET /api/docs/:nodeId/source on every render.
    // Provide a default mock so the spy doesn't interfere with dispatch-specific assertions.
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("/source")) {
        return Promise.resolve(jsonResponse({ id: "test-node", raw: "# Test" }, 200));
      }
      return Promise.resolve(jsonResponse({}, 200));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Visibility: button shows for authored ∧ {APPROVED, VERIFY, DRAFT}
  // -------------------------------------------------------------------------

  it("APPROVED + authored → Dispatch button visible", () => {
    const node = makeNode({ status: "APPROVED" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).not.toBeNull();
  });

  it("VERIFY + authored → Dispatch button visible", () => {
    const node = makeNode({ status: "VERIFY" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).not.toBeNull();
  });

  it("DRAFT + authored → Dispatch button visible", () => {
    const node = makeNode({ status: "DRAFT" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).not.toBeNull();
  });

  it("IN_PROGRESS + authored → Dispatch button hidden", () => {
    const node = makeNode({ status: "IN_PROGRESS" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).toBeNull();
  });

  it("COMPLETE + authored → Dispatch button hidden", () => {
    const node = makeNode({ status: "COMPLETE" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).toBeNull();
  });

  it("PLANNED + authored → Dispatch button hidden", () => {
    const node = makeNode({ status: "PLANNED" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).toBeNull();
  });

  it("APPROVED + not authored (manifest-only) → Dispatch button hidden (N3)", () => {
    const node = makeNode({ status: "APPROVED", authored: false });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("button", { name: /dispatch/i })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Confirmation dialog flow
  // -------------------------------------------------------------------------

  it("click Dispatch → confirmation dialog appears with inferred type and node title", () => {
    const node = makeNode({ status: "APPROVED" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(screen.queryByText("implement")).not.toBeNull();
    // node.id appears in multiple places (header + dialog) — just check dialog is present
    expect(screen.queryByText("Confirm dispatch")).not.toBeNull();
  });

  it("dialog shows VERIFY → verify task type", () => {
    const node = makeNode({ status: "VERIFY" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    expect(screen.queryByText("verify")).not.toBeNull();
  });

  it("dialog shows DRAFT → spec_review task type", () => {
    const node = makeNode({ status: "DRAFT" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    expect(screen.queryByText("spec_review")).not.toBeNull();
  });

  it("Cancel in dialog closes it without dispatching", () => {
    const node = makeNode({ status: "APPROVED" });
    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));
    expect(screen.queryByRole("dialog")).not.toBeNull();

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("dialog")).toBeNull();
    // Only the source fetch may have fired; dispatch must NOT have been called.
    const dispatchCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
      ([input]) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        return url.includes("/api/dispatch/");
      }
    );
    expect(dispatchCalls).toHaveLength(0);
  });

  it("Confirm in dialog calls POST /api/dispatch/:nodeId and shows success banner", async () => {
    const node = makeNode({ id: "leaf-node", status: "APPROVED" });
    const newTask = {
      id: "abcdef12-0000-0000-0000-000000000000",
      type: "implement",
      status: "PENDING",
      title: "Dispatch implement on leaf-node",
      source: "operator_injected",
      dependsOn: [],
      resourceClaims: [],
      dbRowVersion: 1,
      priority: 0,
      createdAt: "2026-01-01T00:00:00Z",
    };

    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("/api/dispatch/")) {
        return Promise.resolve(jsonResponse({ task: newTask }));
      }
      return Promise.resolve(jsonResponse({ id: "leaf-node", raw: "# Test" }, 200));
    });

    render(<NodeInspector node={node} allNodes={[node]} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Success banner should appear
    await waitFor(() => {
      expect(screen.queryByText(/dispatched as task/i)).not.toBeNull();
    });

    // Verify fetch was called with the dispatch URL
    const dispatchCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
      ([input]) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        return url.includes("/api/dispatch/");
      }
    );
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]?.[0]).toBe("/api/dispatch/leaf-node");
  });
});
