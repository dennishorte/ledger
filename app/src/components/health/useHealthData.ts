/**
 * useHealthData — assembles all health-dashboard signals from live API data.
 *
 * Migrated from build-time import.meta.glob to TanStack Query against
 * GET /api/health/issues in 04-api-server/99-maintenance/01-ui-hook-migration.
 *
 * - `issues` comes from GET /api/health/issues (IssueItem[], server-side parsed)
 * - `staleness` is derived client-side from useDocGraph() nodes + issues
 * - `subtreeCosts` remains PLACEHOLDER_COSTS (out of scope for this round)
 * - `nodes` comes from useDocGraph() (already live-API-backed)
 *
 * Spec: docs/01-ui/06-health.md §Design > Components and files
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDocGraph } from "@/components/dag/useDocGraph";
import type {
  DocNode,
  IssueItem,
  NodeId,
  StalenessSignal,
  SubtreeCost,
} from "@/lib/types";
import { deriveStaleness } from "@/lib/deriveHealth";

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
   * in widgets.
   */
  nodes: DocNode[];
}

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

  const { data: issuesData } = useQuery<IssueItem[]>({
    queryKey: ["health", "issues"] as const,
    queryFn: async (): Promise<IssueItem[]> => {
      const res = await fetch("/api/health/issues");
      if (!res.ok)
        throw new Error(`/api/health/issues returned ${res.status.toString()}`);
      const body = (await res.json()) as { issues: IssueItem[] };
      return body.issues;
    },
    placeholderData: () => [],
    staleTime: 60_000,
  });

  return useMemo(() => {
    const issues: IssueItem[] = issuesData ?? [];

    // Rebuild issuesByNode map for deriveStaleness (group by nodeId)
    const issuesByNode = new Map<NodeId, IssueItem[]>();
    for (const issue of issues) {
      const list = issuesByNode.get(issue.nodeId);
      if (list) {
        list.push(issue);
      } else {
        issuesByNode.set(issue.nodeId, [issue]);
      }
    }

    const allStaleness = deriveStaleness(nodes, issuesByNode);
    const staleNodes = allStaleness.filter((s) => s.isStale);

    return {
      issues,
      staleness: staleNodes,
      subtreeCosts: PLACEHOLDER_COSTS,
      nodes,
    };
  }, [nodes, issuesData]);
}
