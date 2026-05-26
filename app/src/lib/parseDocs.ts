import { buildDocGraph, idForPath } from "@ledger/parser";
import type { DocNode } from "@ledger/parser";

/**
 * Build-time parser for the project's `docs/**.md` tree.
 *
 * Vite eagerly inlines every markdown file as raw text; this module feeds that
 * Record<path, content> to the pure `buildDocGraph()` from @ledger/parser.
 *
 * Swap-out plan: when the API server exists, replace `loadDocNodes()` with a
 * TanStack Query against /api/docs. Component code never touches markdown directly.
 */

const rawDocs = import.meta.glob<string>("../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function getBuilt(): { nodes: DocNode[]; validationErrorPaths: string[] } {
  return buildDocGraph(rawDocs);
}

const _built = getBuilt();

export function loadDocNodes(): DocNode[] {
  return _built.nodes;
}

export const docValidationErrorPaths: readonly string[] = _built.validationErrorPaths;

export { idForPath };
