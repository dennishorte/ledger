import type { DocNode, NodeId, NodeStatus } from "@/lib/types";
import { parseDocNode } from "@/lib/schema/parseDocNode";
import { validateDocNode } from "@/lib/schema/validateDocNode";
import type { ValidationError } from "@/lib/schema/validateDocNode";

/**
 * Build-time parser for the project's `docs/**.md` tree.
 *
 * Phase-1 data source for the DAG panel (01-ui/02-dag, D1). Vite eagerly
 * inlines every markdown file as raw text; this module turns that into a
 * `DocNode[]` by extracting the bold-labelled metadata at the top of each
 * doc and the rows of each "## Children" manifest table.
 *
 * Swap-out plan: when the API server exists, replace `loadDocNodes()` with a
 * TanStack Query against the same `DocNode[]` shape. Component code never
 * touches markdown directly.
 *
 * Internally, leaf docs are validated against the JSON Schema in
 * docs/_schemas/document-node.schema.json via parseDocNode + validateDocNode
 * (02-schema). Root and parent docs bypass validation (schema validates
 * leaf-only in v1; see 02-schema §S2). Validation errors are collected and
 * reported via console.error; failing docs are omitted from the node set (D9).
 */

const KNOWN_STATUSES: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  "DRAFT",
  "SPEC_REVIEW",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFY",
  "COMPLETE",
  "ISSUE_OPEN",
  "PLANNED",
]);

function normalizeStatus(raw: string | undefined): NodeStatus {
  if (!raw) return "DRAFT";
  // Take the first word, strip parenthetical annotations like
  // "APPROVED (shell at VERIFY; round-2 panels planned)".
  const head = raw.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  const replaced = head.replace(/-/g, "_") as NodeStatus;
  return KNOWN_STATUSES.has(replaced) ? replaced : "DRAFT";
}

function firstHeading(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? "(untitled)";
}

function field(md: string, label: string): string | undefined {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
  return md.match(re)?.[1]?.trim();
}

function backtickedId(value: string | undefined): string | undefined {
  return value?.match(/`([^`]+)`/)?.[1];
}

interface RawChildRow {
  relId: string;
  dependsOnRel: string[];
  status: NodeStatus;
}

/** Extract `## Children` manifest rows. Returns [] if none present. */
function parseChildrenManifest(md: string): RawChildRow[] {
  const headerIdx = md.search(/^##\s+Children\s*$/m);
  if (headerIdx === -1) return [];
  const after = md.slice(headerIdx);
  // Section ends at the next top-level `## ` heading.
  const nextH2 = after.slice(1).search(/^##\s+(?!#)/m);
  const section = nextH2 === -1 ? after : after.slice(0, nextH2 + 1);

  const rows: RawChildRow[] = [];
  for (const line of section.split("\n")) {
    // Match: | `id` | title | deps | status |
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/,
    );
    if (!m) continue;
    const relId = m[1];
    const depsField = m[3] ?? "";
    const statusField = m[4] ?? "";
    if (!relId) continue;
    const dependsOnRel: string[] = [];
    for (const dm of depsField.matchAll(/`([^`]+)`/g)) {
      if (dm[1]) dependsOnRel.push(dm[1]);
    }
    rows.push({
      relId,
      dependsOnRel,
      status: normalizeStatus(statusField),
    });
  }
  return rows;
}

/**
 * Map a glob key (e.g. `/Users/.../ledger/docs/01-ui/01-shell.md`) to an
 * absolute node id.
 *
 * Conventions used by this project:
 *   - `docs/00-project.md`        → `root`
 *   - `docs/<dir>/00-<slug>.md`   → `<dir>`           (parent doc of subtree)
 *   - `docs/<dir>/<other>.md`     → `<dir>/<other>`
 *   - deeper nesting recurses the same way.
 *   - `docs/process/**`           → null              (process/operator
 *     playbooks live outside the implementation tree; see CLAUDE.md)
 *   - `docs/_schemas/**`          → null              (machine-readable artifacts)
 */
function pathToNodeId(filePath: string): NodeId | null {
  const idx = filePath.indexOf("/docs/");
  if (idx === -1) return null;
  const sub = filePath.slice(idx + "/docs/".length);
  if (!sub.endsWith(".md")) return null;
  if (sub.startsWith("process/")) return null;
  if (sub.startsWith("_schemas/")) return null;
  if (sub === "00-project.md") return "root";
  const noExt = sub.slice(0, -3);
  const parts = noExt.split("/");
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && last?.startsWith("00-")) {
    return parts.slice(0, -1).join("/");
  }
  return noExt;
}

function resolveChildId(parentAbsId: NodeId, relId: string): NodeId {
  if (parentAbsId === "root") return relId;
  return `${parentAbsId}/${relId}`;
}

/**
 * Returns true when a docs-relative path is a leaf implementation node
 * (i.e. will be sent through the schema validator).
 * Root (00-project.md) and parent (any <dir>/00-<slug>.md) docs return false.
 */
function isLeafPath(sub: string): boolean {
  if (sub === "00-project.md") return false;
  const noExt = sub.endsWith(".md") ? sub.slice(0, -3) : sub;
  const parts = noExt.split("/");
  const last = parts[parts.length - 1];
  return !(parts.length >= 2 && last?.startsWith("00-"));
}

interface ParsedDoc {
  absId: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  children: RawChildRow[];
  source: string;
  /** True when this doc was validated against the schema (leaf docs only). */
  validated: boolean;
}

function parseOne(filePath: string, md: string): ParsedDoc | null {
  const absId = pathToNodeId(filePath);
  if (!absId) return null;

  const title = firstHeading(md);
  const status = normalizeStatus(field(md, "Status"));

  let parentId: NodeId | null;
  if (absId === "root") {
    parentId = null;
  } else {
    const parentField = field(md, "Parent");
    // "project root" must win before backtick extraction — the canonical
    // top-level parent line reads `**Parent:** project root (`docs/00-project.md`)`,
    // whose backtick captures the doc path, not the node id `root` (see D8).
    if (parentField && /project root/i.test(parentField)) {
      parentId = "root";
    } else {
      const parentBacktick = backtickedId(parentField);
      if (parentBacktick) {
        parentId = parentBacktick;
      } else {
        // Fallback: derive parent from absId path.
        const segments = absId.split("/");
        parentId = segments.length > 1 ? segments.slice(0, -1).join("/") : "root";
      }
    }
  }

  return {
    absId,
    parentId,
    title,
    status,
    children: parseChildrenManifest(md),
    source: filePath,
    validated: false,
  };
}

// Vite eager-glob the entire docs tree as raw markdown. Path is relative to
// this source file: app/src/lib/parseDocs.ts → ../../../docs/**/*.md.
const rawDocs = import.meta.glob<string>("../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Map a *relative* author-written doc path (e.g. `docs/01-ui/02-dag.md`) to
 * a NodeId.
 *
 * This is a *sibling* helper to `pathToNodeId`, not its strict inverse.
 * `pathToNodeId` receives Vite's absolute glob keys (e.g.
 * `/abs/…/docs/01-ui/02-dag.md`); this helper receives the relative form used
 * in cross-doc references and strips the leading `docs/` before normalising.
 * Both helpers normalise to the same id space (same rules, shared logic).
 *
 * Returns `null` for unrecognised or malformed inputs (no throw).
 */
export function idForPath(path: string): NodeId | null {
  // Accept either `docs/foo.md` or `./docs/foo.md` (defensive).
  const normalised = path.replace(/^\.\//, "");
  if (!normalised.startsWith("docs/")) return null;
  // Prefix with a slash so pathToNodeId's `/docs/` search works.
  return pathToNodeId("/" + normalised);
}

/** Build the full project node set and collect validation errors. Called once at module load. */
function buildDocNodes(): {
  nodes: DocNode[];
  errorPaths: string[];
} {
  const parsed: ParsedDoc[] = [];
  const validationErrors: { path: string; errors: ValidationError[] }[] = [];

  for (const [filePath, body] of Object.entries(rawDocs)) {
    // Determine docs-relative sub-path for the schema extractor.
    const idx = filePath.indexOf("/docs/");
    if (idx === -1) continue;
    const sub = filePath.slice(idx + "/docs/".length);

    // Skip process/ and _schemas/ paths (same as pathToNodeId).
    if (sub.startsWith("process/") || sub.startsWith("_schemas/")) continue;

    if (isLeafPath(sub)) {
      // Leaf doc: run through parseDocNode + validateDocNode.
      const candidate = parseDocNode(sub, body);
      if (candidate === null) {
        // Extractor returned null — treat as non-leaf (shouldn't normally happen
        // given the isLeafPath guard, but be defensive).
        const p = parseOne(filePath, body);
        if (p) parsed.push(p);
        continue;
      }
      const result = validateDocNode(candidate);
      if (!result.ok) {
        validationErrors.push({ path: filePath, errors: result.errors });
        // Omit from node set (D9).
        continue;
      }
      // Validation passed: build ParsedDoc from the validated DocumentNode.
      const node = result.node;
      const children: RawChildRow[] = node.children.map((row) => ({
        relId: row.relId,
        dependsOnRel: row.dependsOn,
        status: row.status,
      }));
      parsed.push({
        absId: node.nodeId,
        parentId: node.parentId,
        title: node.title,
        status: node.status,
        children,
        source: filePath,
        validated: true,
      });
    } else {
      // Root or parent doc: parse with legacy extractor, skip schema validation.
      const p = parseOne(filePath, body);
      if (p) parsed.push(p);
    }
  }

  if (validationErrors.length > 0) {
    console.error("[parseDocs] validation errors:", validationErrors);
  }

  const byId = new Map<NodeId, DocNode>();
  for (const p of parsed) {
    byId.set(p.absId, {
      id: p.absId,
      parentId: p.parentId,
      title: p.title,
      status: p.status,
      dependsOn: [],
      authored: true,
      source: p.source,
    });
  }

  // Manifest pass: surface manifest-only children, attach dependsOn to all
  // children (authored or not). Resolve relative dependsOn ids against the
  // child's own parent (siblings under the same parent).
  for (const p of parsed) {
    for (const row of p.children) {
      const childAbsId = resolveChildId(p.absId, row.relId);
      const dependsOn = row.dependsOnRel.map((rel) =>
        resolveChildId(p.absId, rel),
      );
      const existing = byId.get(childAbsId);
      if (existing) {
        existing.dependsOn = dependsOn;
      } else {
        byId.set(childAbsId, {
          id: childAbsId,
          parentId: p.absId,
          title: row.relId,
          status: row.status,
          dependsOn,
          authored: false,
        });
      }
    }
  }

  return {
    nodes: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id)),
    errorPaths: validationErrors.map((e) => e.path),
  };
}

// Module-level singleton — computed once at build time.
const _built = buildDocNodes();

/**
 * Docs-relative paths of docs that failed schema validation, in the order they
 * were encountered. Empty in normal operation.
 *
 * Exposed for the dev-only topbar banner (D9): a single indicator tells the
 * operator that a doc is malformed without crashing the rest of the UI.
 */
export const docValidationErrorPaths: readonly string[] = _built.errorPaths;

/** Returns the full project node set: authored docs plus manifest-only children. */
export function loadDocNodes(): DocNode[] {
  return _built.nodes;
}
