import { useQuery } from "@tanstack/react-query";
import { loadDocNodes } from "@/lib/parseDocs";
import type { DocNode } from "@/lib/types";

const API_BASE = "/api";

interface DocsApiResponse {
  nodes: DocNode[];
  validation: { errorPaths: string[] };
}

/**
 * Runtime data source: TanStack Query against GET /api/docs.
 * `placeholderData` returns the build-time `loadDocNodes()` so the
 * first paint is instant and the UI degrades to the build-time tree
 * if the server is unreachable. The Vite dev proxy (vite.config.ts)
 * makes `/api/*` same-origin during development; production builds
 * carry no baked-in API host.
 */
export function useDocGraph(): DocNode[] {
  const { data } = useQuery({
    queryKey: ["docs"],
    queryFn: async (): Promise<DocNode[]> => {
      const res = await fetch(`${API_BASE}/docs`);
      if (!res.ok) throw new Error(`/api/docs returned ${res.status.toString()}`);
      const body = (await res.json()) as DocsApiResponse;
      return body.nodes;
    },
    placeholderData: () => loadDocNodes(),
    staleTime: 30_000,
  });
  return data ?? [];
}
