/**
 * Shared doc-link resolver — converts a docs-relative path to a React Router
 * `/docs/:nodeId` route target.
 *
 * Introduced as a shared module when 01-ui/05-logs became the second consumer
 * of this logic (D9). Previously inlined in DocViewer.tsx around idForPath.
 *
 * Module-level function: `idForPath` is pure and stable; no closure needed.
 * The stable reference identity keeps <MarkdownBody>'s components memoisation
 * effective across renders.
 */

import { idForPath } from "@/lib/parseDocs";
import type { NodeId } from "@/lib/types";

/**
 * Resolve a docs-tree href to a React Router route, or null if the href is
 * not a recognised project doc path.
 *
 * Accepts both `docs/foo.md` and `./docs/foo.md` forms (idForPath normalises).
 */
export function resolveDocLink(href: string): string | null {
  const id: NodeId | null = idForPath(href);
  if (id === null) return null;
  return `/docs/${encodeURIComponent(id)}`;
}
