import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDocGraph } from "./useDocGraph";
import { loadDocNodes } from "@/lib/parseDocs";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useDocGraph", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns nodes from /api/docs when the fetch succeeds", async () => {
    const mockNodes = [
      { id: "test-node", parentId: null, title: "Test", status: "DRAFT", dependsOn: [], authored: true },
    ];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ nodes: mockNodes, validation: { errorPaths: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useDocGraph(), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual(mockNodes);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/docs");
  });

  it("falls back to placeholderData (loadDocNodes) on first render", () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      () => new Promise<Response>((_resolve) => { /* never resolves */ })
    );

    const { result } = renderHook(() => useDocGraph(), { wrapper });
    expect(result.current).toEqual(loadDocNodes());
  });

  it("falls back to placeholderData when /api/docs returns 500", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("server error", { status: 500 })
    );

    const { result } = renderHook(() => useDocGraph(), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual(loadDocNodes());
    });
  });

  it("hits /api/docs exactly once within staleTime", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ nodes: [], validation: { errorPaths: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { rerender } = renderHook(() => useDocGraph(), { wrapper });
    await waitFor(() => { expect(globalThis.fetch).toHaveBeenCalledTimes(1); });

    rerender();
    rerender();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
