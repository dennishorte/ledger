/**
 * useDocSource — live API-backed raw markdown lookup by NodeId.
 *
 * Migrated from build-time import.meta.glob to TanStack Query against
 * GET /api/docs/:nodeId/source in 04-api-server/99-maintenance/01-ui-hook-migration.
 *
 * The module-level sourceMap (import.meta.glob) is preserved as placeholderData
 * for the server-down-on-cold-load fallback (D3). It is no longer the primary path.
 *
 * Spec: docs/01-ui/03-docs.md §Design > Data source
 */

import { useQuery } from "@tanstack/react-query";
import type { DocSource, NodeId } from "@/lib/types";
import { idForPath } from "@/lib/parseDocs";

// Build-time glob — kept solely as placeholderData fallback (D3).
// Primary path is the live API.
const rawGlob = import.meta.glob<string>("../../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function buildSourceMap(): ReadonlyMap<NodeId, string> {
  const map = new Map<NodeId, string>();
  for (const [absPath, raw] of Object.entries(rawGlob)) {
    const idx = absPath.indexOf("/docs/");
    if (idx === -1) continue;
    const relPath = "docs" + absPath.slice(idx + "/docs".length);
    const id = idForPath(relPath);
    if (id !== null) {
      map.set(id, raw);
    }
  }
  return map;
}

const sourceMap = buildSourceMap();

/**
 * Returns the `DocSource` (id + raw markdown) for a given NodeId, or
 * `undefined` during loading / when the node has no authored doc.
 *
 * Never throws for unknown ids — callers use `undefined` to detect
 * manifest-only or 404 states.
 */
export function useDocSource(id: NodeId): DocSource | undefined {
  const { data } = useQuery({
    queryKey: ["docs", id, "source"] as const,
    queryFn: async (): Promise<DocSource> => {
      const res = await fetch(`/api/docs/${encodeURIComponent(id)}/source`);
      if (res.status === 404) throw new Error(`source not found: ${id}`);
      if (!res.ok)
        throw new Error(`/api/docs/${id}/source returned ${res.status.toString()}`);
      return (await res.json()) as DocSource;
    },
    placeholderData: (): DocSource | undefined => {
      const raw = sourceMap.get(id);
      return raw !== undefined ? { id, raw } : undefined;
    },
    staleTime: 30_000,
    enabled: id !== "",
  });
  return data;
}
