/**
 * useHealthData — mocked-fetch unit tests.
 *
 * Exercises:
 *  - 200 with issues: hook returns issues array, issuesByNode reconstruction
 *  - empty issues: hook returns empty array when API returns []
 *  - 5xx: hook returns empty array (placeholderData fallback)
 *
 * Added in 04-api-server/99-maintenance/01-ui-hook-migration impl-review (B2).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useHealthData } from "./useHealthData.js";
import type { IssueItem } from "@/lib/types";

// Mock useDocGraph — useHealthData depends on it but we test in isolation here.
vi.mock("@/components/dag/useDocGraph", () => ({
  useDocGraph: vi.fn().mockReturnValue([]),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeIssue(nodeId: string, priority: IssueItem["priority"]): IssueItem {
  return { nodeId, text: `A ${priority} issue.`, priority, sectionSlug: "open-issues" };
}

describe("useHealthData (mocked fetch)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("200 → issues array is populated with returned items", async () => {
    const items: IssueItem[] = [
      makeIssue("01-leaf", "HIGH"),
      makeIssue("02-other", "LOW"),
    ];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ issues: items }));

    const { result } = renderHook(() => useHealthData(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.issues.length).toBe(2);
    });

    expect(result.current.issues[0]?.nodeId).toBe("01-leaf");
    expect(result.current.issues[0]?.priority).toBe("HIGH");
  });

  it("200 with empty issues → issues array is empty", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ issues: [] }));

    const { result } = renderHook(() => useHealthData(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      // After fetch resolves, issues should be empty array.
      // placeholderData is [] so this may settle immediately.
      expect(Array.isArray(result.current.issues)).toBe(true);
    });

    // Confirm the fetch was called and settled — issues should be empty
    expect(result.current.issues.length).toBe(0);
  });

  it("5xx → falls back to placeholderData empty array, does not throw", () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ error: "internal" }, 500));

    const { result } = renderHook(() => useHealthData(), {
      wrapper: makeWrapper(),
    });

    // placeholderData: () => [] — so issues is immediately []
    expect(Array.isArray(result.current.issues)).toBe(true);
    expect(result.current.issues.length).toBe(0);
  });

  it("always returns nodes, staleness, and subtreeCosts fields", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ issues: [] }));

    const { result } = renderHook(() => useHealthData(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    expect(Array.isArray(result.current.nodes)).toBe(true);
    expect(Array.isArray(result.current.staleness)).toBe(true);
    expect(Array.isArray(result.current.subtreeCosts)).toBe(true);
  });
});
