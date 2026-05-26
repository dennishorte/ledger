import type { NodeId } from "../coreTypes";
import type { DocNode } from "./types";
export interface BuildDocGraphResult {
    nodes: DocNode[];
    validationErrorPaths: string[];
}
/**
 * Map a relative author-written doc path (e.g. `docs/01-ui/02-dag.md`) to a NodeId.
 *
 * Accepts either `docs/foo.md` or `./docs/foo.md`. Returns null for unrecognised inputs.
 */
export declare function idForPath(path: string): NodeId | null;
/**
 * Build the full project node set from a raw docs map.
 *
 * @param rawDocs - Map from path key to raw markdown content.
 *   Keys may be absolute Vite glob paths (e.g. `/abs/.../docs/foo.md`)
 *   or docs-relative paths (e.g. `01-ui/01-shell.md`).
 */
export declare function buildDocGraph(rawDocs: Record<string, string>): BuildDocGraphResult;
//# sourceMappingURL=buildDocGraph.d.ts.map