/**
 * useDocSource — build-time raw markdown lookup by NodeId.
 *
 * Uses the same `import.meta.glob` + `pathToNodeId` pattern as parseDocs.ts.
 * Returns the raw markdown payload for an authored node, or `undefined` for
 * manifest-only or unknown nodes.
 *
 * Spec: docs/01-ui/03-docs.md §Design > Data source
 */

import type { DocSource, NodeId } from "@/lib/types";
import { idForPath } from "@/lib/parseDocs";

// Eager glob of every doc file as raw string. The path is relative to this
// source file: app/src/components/docs/useDocSource.ts → ../../../../docs/**/*.md
const rawGlob = import.meta.glob<string>("../../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Build a NodeId → raw map from the glob entries.
 * Uses idForPath to normalise absolute Vite keys into NodeIds via the same
 * docs-relative form parseDocs.ts uses.
 */
function buildSourceMap(): ReadonlyMap<NodeId, string> {
  const map = new Map<NodeId, string>();
  for (const [absPath, raw] of Object.entries(rawGlob)) {
    // Convert abs Vite key to relative docs/… form for idForPath.
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
 * `undefined` if the node has no authored doc.
 *
 * Never throws for unknown ids — callers use `undefined` to detect
 * manifest-only or 404 states.
 */
export function useDocSource(id: NodeId): DocSource | undefined {
  const raw = sourceMap.get(id);
  if (raw === undefined) return undefined;
  return { id, raw };
}
