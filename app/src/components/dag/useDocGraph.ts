import { useMemo } from "react";
import { loadDocNodes } from "@/lib/parseDocs";
import type { DocNode } from "@/lib/types";

/**
 * Phase-1 data source: the parsed `docs/**` tree, frozen at build time.
 * Replace with a TanStack Query against the API once the backend exists.
 * Kept as a hook so the swap is a one-line change in DagCanvas.
 */
export function useDocGraph(): DocNode[] {
  return useMemo(() => loadDocNodes(), []);
}
