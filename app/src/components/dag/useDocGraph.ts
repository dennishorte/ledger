import { useQuery } from "@tanstack/react-query";
import { loadDocNodes, docValidationErrors as buildTimeValidationErrors } from "@/lib/parseDocs";
import type { DocNode, DocValidationFailure } from "@ledger/parser";

const API_BASE = "/api";

interface DocsApiResponse {
  nodes: DocNode[];
  validation: {
    errorPaths: string[];
    errors: DocValidationFailure[];
  };
}

const DOCS_QUERY_KEY = ["docs"] as const;

async function fetchDocs(): Promise<DocsApiResponse> {
  const res = await fetch(`${API_BASE}/docs`);
  if (!res.ok) throw new Error(`/api/docs returned ${res.status.toString()}`);
  return (await res.json()) as DocsApiResponse;
}

function placeholderDocs(): DocsApiResponse {
  return {
    nodes: loadDocNodes(),
    validation: { errorPaths: [], errors: [...buildTimeValidationErrors] },
  };
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
    queryKey: DOCS_QUERY_KEY,
    queryFn: fetchDocs,
    select: (resp) => resp.nodes,
    placeholderData: placeholderDocs,
    staleTime: 30_000,
  });
  return data ?? [];
}

/** Returns schema validation failures from the most recent /api/docs fetch. */
export function useDocValidationErrors(): DocValidationFailure[] {
  const { data } = useQuery({
    queryKey: DOCS_QUERY_KEY,
    queryFn: fetchDocs,
    select: (resp) => resp.validation.errors,
    placeholderData: placeholderDocs,
    staleTime: 30_000,
  });
  return data ?? [];
}
