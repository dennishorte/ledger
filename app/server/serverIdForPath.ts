/**
 * Server-side replica of `idForPath` from app/src/lib/parseDocs.ts.
 *
 * The client-side parseDocs.ts uses Vite's `import.meta.glob` (build-time
 * only; not available in Node.js). This module replicates the *pure*
 * path-to-NodeId mapping logic so server code can call it without importing
 * the Vite-specific client module.
 *
 * Must stay in sync with parseDocs.ts `pathToNodeId` / `idForPath`.
 */

import type { NodeId } from "../src/lib/types.js";

/**
 * Folders whose name begins with `_` are framework-internal (e.g. `_schemas/`,
 * `_process/`, `_investigations/`) and map to no node. Mirrors the parser's
 * `isInternalDocsPath`; every directory segment is checked.
 */
function isInternalDocsPath(sub: string): boolean {
  return sub.split("/").slice(0, -1).some((seg) => seg.startsWith("_"));
}

function pathToNodeId(filePath: string): NodeId | null {
  const idx = filePath.indexOf("/docs/");
  if (idx === -1) return null;
  const sub = filePath.slice(idx + "/docs/".length);
  if (!sub.endsWith(".md")) return null;
  if (isInternalDocsPath(sub)) return null;
  if (sub === "00-project.md") return "root";
  const noExt = sub.slice(0, -3);
  const parts = noExt.split("/");
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && last?.startsWith("00-")) {
    return parts.slice(0, -1).join("/");
  }
  return noExt;
}

/**
 * Map a relative or absolute path to a NodeId.
 * Returns null for unrecognised or non-doc paths.
 */
export function serverIdForPath(path: string): NodeId | null {
  const normalised = path.replace(/^\.\//, "");
  if (normalised.startsWith("docs/")) {
    return pathToNodeId("/" + normalised);
  }
  // Absolute path: try to find /docs/ in it
  if (normalised.includes("/docs/")) {
    return pathToNodeId(normalised);
  }
  return null;
}
