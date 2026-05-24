import type { DocNode, NodeId, NodeStatus } from "@/lib/types";

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
 */
function pathToNodeId(filePath: string): NodeId | null {
  const idx = filePath.indexOf("/docs/");
  if (idx === -1) return null;
  const sub = filePath.slice(idx + "/docs/".length);
  if (!sub.endsWith(".md")) return null;
  if (sub.startsWith("process/")) return null;
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

interface ParsedDoc {
  absId: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  children: RawChildRow[];
  source: string;
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

/** Returns the full project node set: authored docs plus manifest-only children. */
export function loadDocNodes(): DocNode[] {
  const parsed: ParsedDoc[] = [];
  for (const [path, body] of Object.entries(rawDocs)) {
    const p = parseOne(path, body);
    if (p) parsed.push(p);
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

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}
