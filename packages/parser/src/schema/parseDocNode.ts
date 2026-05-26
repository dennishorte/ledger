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

import type { NodeId } from "../coreTypes";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a docs-relative path to its nodeId, or null for out-of-scope paths. */
function pathToNodeId(docsRelPath: string): NodeId | null {
  // Must end in .md
  if (!docsRelPath.endsWith(".md")) return null;

  // Skip process/ and _schemas/
  if (docsRelPath.startsWith("process/")) return null;
  if (docsRelPath.startsWith("_schemas/")) return null;

  // Root doc
  if (docsRelPath === "00-project.md") return "root";

  const noExt = docsRelPath.slice(0, -3);
  const parts = noExt.split("/");
  const last = parts[parts.length - 1];

  // Parent docs: any <dir>/00-<slug>.md at any nesting level
  if (parts.length >= 2 && last?.startsWith("00-")) {
    return null; // parent doc — out of validation scope
  }

  return noExt;
}

/**
 * Normalize a raw status token: uppercase + hyphen-to-underscore. The
 * resulting string is handed to the validator regardless of whether it
 * matches a known enum value — invalid statuses are rejected there with a
 * useful error message rather than swallowed here.
 */
function normalizeStatus(raw: string): string {
  return raw.trim().split(/\s+/)[0]?.toUpperCase().replace(/-/g, "_") ?? "";
}

/** Extract the value of a **Label:** bold front-matter line. */
function extractField(md: string, label: string): string | undefined {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
  return md.match(re)?.[1]?.trim();
}

/** Extract the first backtick-delimited id in a string. */
function firstBacktickId(value: string): string | undefined {
  return value.match(/`([^`]+)`/)?.[1];
}

/** Extract all backtick-delimited ids from a string. */
function allBacktickIds(value: string): string[] {
  const ids: string[] = [];
  for (const m of value.matchAll(/`([^`]+)`/g)) {
    if (m[1]) ids.push(m[1]);
  }
  return ids;
}

/** Extract the first # heading. */
function extractTitle(md: string): string {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

/**
 * Extract all ## sections as { heading → rawBody }.
 * Section body = text from after the heading line to the next ## (exclusive) or EOF.
 */
function extractSections(md: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const h2Re = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const headings: Array<{ heading: string; start: number }> = [];

  while ((match = h2Re.exec(md)) !== null) {
    headings.push({ heading: match[1]?.trim() ?? "", start: match.index + match[0].length });
  }

  for (let i = 0; i < headings.length; i++) {
    const entry = headings[i];
    if (!entry) continue;
    const { heading, start } = entry;
    const body = i + 1 < headings.length
      ? md.slice(start, findNextH2Start(md, start))
      : md.slice(start);
    sections[heading] = body.trim();
  }

  return sections;
}

/** Find the start position of the next ## heading at or after offset. */
function findNextH2Start(md: string, after: number): number {
  const sub = md.slice(after);
  const m = sub.match(/\n##\s+/);
  if (!m || m.index === undefined) return md.length;
  return after + m.index + 1; // +1 to skip the \n
}

interface ChildManifestRowRaw {
  relId: string;
  title: string;
  dependsOn: string[];
  status: string;
}

/** Parse manifest table rows from a Children section body. */
function parseChildrenSection(body: string): ChildManifestRowRaw[] {
  if (/^None\.\s*$/m.test(body.trim())) return [];

  const rows: ChildManifestRowRaw[] = [];
  for (const line of body.split("\n")) {
    // Match: | `id` | title | deps | status |
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/,
    );
    if (!m) continue;
    const relId = m[1];
    if (!relId) continue;
    const title = m[2]?.trim() ?? "";
    const depsField = m[3] ?? "";
    const statusField = m[4]?.trim() ?? "";
    const dependsOn: string[] = [];
    for (const dm of depsField.matchAll(/`([^`]+)`/g)) {
      if (dm[1]) dependsOn.push(dm[1]);
    }
    rows.push({ relId, title, dependsOn, status: normalizeStatus(statusField) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function parseDocNode(docsRelPath: string, raw: string): unknown {
  const nodeId = pathToNodeId(docsRelPath);
  if (nodeId === null) return null;

  // Root doc is also out of scope (leaf-only validation per S2)
  if (nodeId === "root") return null;

  const title = extractTitle(raw);

  // Status field: normalize first token; extract annotation parenthetical
  const statusRaw = extractField(raw, "Status");
  const statusFirstToken = statusRaw?.trim().split(/\s+/)[0] ?? "";
  const normalizedStatus = normalizeStatus(statusFirstToken);
  const statusAnnotationMatch = statusRaw?.match(/\(([^)]+)\)/);
  const statusAnnotation = statusAnnotationMatch?.[1];

  // Parent ID
  let parentId: string | null;
  if (nodeId === "root") {
    parentId = null;
  } else {
    const parentField = extractField(raw, "Parent");
    if (parentField && /project root/i.test(parentField)) {
      parentId = "root";
    } else if (parentField) {
      const backtick = firstBacktickId(parentField);
      if (backtick) {
        parentId = backtick;
      } else {
        // Derive from path
        const segments = nodeId.split("/");
        parentId = segments.length > 1 ? segments.slice(0, -1).join("/") : "root";
      }
    } else {
      const segments = nodeId.split("/");
      parentId = segments.length > 1 ? segments.slice(0, -1).join("/") : "root";
    }
  }

  // Created / lastUpdated
  const created = extractField(raw, "Created") ?? "";
  const lastUpdatedRaw = extractField(raw, "Last Updated") ?? "";
  // Drop trailing parenthetical annotation
  const lastUpdated = lastUpdatedRaw.replace(/\s*\([^)]*\)\s*$/, "").trim();

  // Dependencies
  const depsField = extractField(raw, "Dependencies");
  let dependencies: string[] = [];
  if (depsField && depsField.trim() !== "—") {
    dependencies = allBacktickIds(depsField);
  }

  // Sections
  const sections = extractSections(raw);

  // Children manifest
  const childrenBody = sections["Children"] ?? "";
  const children = parseChildrenSection(childrenBody);

  // Build candidate; schemaVersion is injected here (not in the markdown)
  const candidate: Record<string, unknown> = {
    schemaVersion: 1,
    nodeId,
    parentId,
    title,
    status: normalizedStatus,
    created,
    lastUpdated,
    dependencies,
    sections,
    children,
  };

  if (statusAnnotation !== undefined) {
    candidate["statusAnnotation"] = statusAnnotation;
  }

  return candidate;
}
