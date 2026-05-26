/**
 * parseDocNode — pure markdown → candidate JSON extractor.
 *
 * Takes a docs/-relative file path and raw markdown string; returns an
 * `unknown` object suitable for passing to validateDocNode, or `null` when
 * the path is outside validation scope:
 *   - paths starting with process/ (operator playbooks)
 *   - paths starting with _schemas/ (machine-readable artifacts)
 *   - root doc (00-project.md → nodeId "root")
 *   - parent docs (any <dir>/00-<slug>.md)
 *
 * No React, no Vite globs, no filesystem access. Pure function.
 *
 * Encoding rules are frozen as of schema v1; see docs/02-schema.md §Design.
 */
/**
 * Parse a markdown doc at the given docs-relative path into a candidate JSON
 * object for schema validation.
 *
 * Returns `null` for paths outside the validation scope (process/, _schemas/,
 * root doc, parent docs). All schema enforcement is delegated to validateDocNode.
 *
 * @param docsRelPath - Path relative to the docs/ directory, e.g. "02-schema.md"
 * @param raw         - Raw markdown file contents
 */
export declare function parseDocNode(docsRelPath: string, raw: string): unknown;
//# sourceMappingURL=parseDocNode.d.ts.map