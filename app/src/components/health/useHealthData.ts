/**
 * useHealthData — assembles all health-dashboard signals from build-time data.
 *
 * Spec: docs/01-ui/06-health.md §Design > Components and files
 *
 * HOOK-RULES NOTE (spec R2 — §Design > Data source):
 * The spec calls for useDocSource(id) to be called in a loop over authored
 * nodes. That pattern is safe when the underlying hook is a thin synchronous
 * lookup over an eager build-time map — no conditional hooks, no Suspense, no
 * side effects that shift hook call order.
 *
 * In practice, calling any hook (even a safe one) inside .map() violates the
 * ESLint react-hooks/rules-of-hooks rule, which cannot introspect the
 * implementation. To stay lint-clean and future-proof, this file builds its
 * own module-level source map using the same import.meta.glob + idForPath
 * pattern as useDocSource.ts. If useDocSource ever becomes async (TanStack
 * Query, lazy glob, etc.), replace this map with a single batch query
 * returning Map<NodeId, string>. The component structure is unchanged.
 *
 * UPGRADE TRIGGER: async useDocSource → refactor to batch query.
 */

import { useMemo } from "react";
import { useDocGraph } from "@/components/dag/useDocGraph";
import { idForPath } from "@/lib/parseDocs";
import type {
  DocNode,
  IssueItem,
  NodeId,
  StalenessSignal,
  SubtreeCost,
} from "@/lib/types";
import { parseIssueItems } from "@/lib/parseIssues";
import { deriveStaleness } from "@/lib/deriveHealth";

// ---------------------------------------------------------------------------
// Module-level eager raw-body map — same glob pattern as useDocSource.ts,
// scoped to this file so the loop in assembleHealthData is a plain Map lookup
// with no hook calls inside it.
// ---------------------------------------------------------------------------

const rawGlob = import.meta.glob<string>("../../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function buildRawMap(): ReadonlyMap<NodeId, string> {
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

/** NodeId → raw markdown, built once at module load (build-time). */
const rawByNodeId: ReadonlyMap<NodeId, string> = buildRawMap();

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HealthData {
  /** Flat list of all open-issue items across all authored nodes, HIGH→TRIVIAL→UNKNOWN. */
  issues: IssueItem[];
  /** Only nodes where isStale === true. */
  staleness: StalenessSignal[];
  /** Phase-1: placeholder array with zeros. Real data arrives with the API server. */
  subtreeCosts: SubtreeCost[];
  /**
   * Full node set passed through for dep-impact queries and node-label lookups
   * in widgets. Phase-1 coupling to parseDocs.ts shape; acceptable until a
   * dedicated label/graph slice is warranted. See spec N4 audit note.
   */
  nodes: DocNode[];
}

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  TRIVIAL: 3,
  UNKNOWN: 4,
};

// Subtree roots for the token-cost placeholder table.
// Phase-1: hard-coded. The API server will supply real SubtreeCost[] entries.
const PLACEHOLDER_COSTS: SubtreeCost[] = [
  { subtreeRootId: "root", inputTokens: null, outputTokens: null },
  { subtreeRootId: "01-ui", inputTokens: null, outputTokens: null },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHealthData(): HealthData {
  const nodes = useDocGraph();

  return useMemo(() => {
    const issuesByNode = new Map<NodeId, IssueItem[]>();

    for (const node of nodes) {
      if (!node.authored) continue;
      const raw = rawByNodeId.get(node.id);
      if (raw === undefined) continue;
      issuesByNode.set(node.id, parseIssueItems(node.id, raw));
    }

    const allIssues = Array.from(issuesByNode.values())
      .flat()
      .sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
      );

    const allStaleness = deriveStaleness(nodes, issuesByNode);
    const staleNodes = allStaleness.filter((s) => s.isStale);

    return {
      issues: allIssues,
      staleness: staleNodes,
      subtreeCosts: PLACEHOLDER_COSTS,
      nodes,
    };
  }, [nodes]);
}
