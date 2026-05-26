import { parseDocNode } from "../schema/parseDocNode";
import { validateDocNode } from "../schema/validateDocNode";
const KNOWN_STATUSES = new Set([
    "DRAFT",
    "SPEC_REVIEW",
    "APPROVED",
    "IN_PROGRESS",
    "VERIFY",
    "COMPLETE",
    "ISSUE_OPEN",
    "PLANNED",
]);
function normalizeStatus(raw) {
    if (!raw)
        return "DRAFT";
    const head = raw.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
    const replaced = head.replace(/-/g, "_");
    return KNOWN_STATUSES.has(replaced) ? replaced : "DRAFT";
}
function firstHeading(md) {
    const m = md.match(/^#\s+(.+)$/m);
    return m?.[1]?.trim() ?? "(untitled)";
}
function field(md, label) {
    const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
    return md.match(re)?.[1]?.trim();
}
function backtickedId(value) {
    return value?.match(/`([^`]+)`/)?.[1];
}
function parseChildrenManifest(md) {
    const headerIdx = md.search(/^##\s+Children\s*$/m);
    if (headerIdx === -1)
        return [];
    const after = md.slice(headerIdx);
    const nextH2 = after.slice(1).search(/^##\s+(?!#)/m);
    const section = nextH2 === -1 ? after : after.slice(0, nextH2 + 1);
    const rows = [];
    for (const line of section.split("\n")) {
        const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
        if (!m)
            continue;
        const relId = m[1];
        const depsField = m[3] ?? "";
        const statusField = m[4] ?? "";
        if (!relId)
            continue;
        const dependsOnRel = [];
        for (const dm of depsField.matchAll(/`([^`]+)`/g)) {
            if (dm[1])
                dependsOnRel.push(dm[1]);
        }
        rows.push({ relId, dependsOnRel, status: normalizeStatus(statusField) });
    }
    return rows;
}
/**
 * Map a rawDocs key (docs-relative path like "01-ui/01-shell.md") to a NodeId.
 *
 * Keys in the rawDocs Record passed to buildDocGraph are docs-relative paths.
 * This is the variant that accepts docs-relative paths directly (no leading /docs/).
 */
function pathKeyToNodeId(docsRelPath) {
    if (!docsRelPath.endsWith(".md"))
        return null;
    if (docsRelPath.startsWith("process/"))
        return null;
    if (docsRelPath.startsWith("_schemas/"))
        return null;
    if (docsRelPath === "00-project.md")
        return "root";
    const noExt = docsRelPath.slice(0, -3);
    const parts = noExt.split("/");
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && last?.startsWith("00-")) {
        return parts.slice(0, -1).join("/");
    }
    return noExt;
}
/**
 * Map an absolute-path glob key (e.g. `/abs/.../docs/01-ui/01-shell.md`) to a NodeId.
 * Used when rawDocs keys are absolute paths (Vite glob output).
 */
function absPathToNodeId(filePath) {
    const idx = filePath.indexOf("/docs/");
    if (idx === -1)
        return null;
    const sub = filePath.slice(idx + "/docs/".length);
    return pathKeyToNodeId(sub);
}
/**
 * Normalise a rawDocs key to a docs-relative sub-path for parseDocNode.
 * Works with both absolute Vite glob keys and plain docs-relative keys.
 */
function toDocsRelPath(key) {
    const idx = key.indexOf("/docs/");
    if (idx !== -1)
        return key.slice(idx + "/docs/".length);
    return key;
}
function isLeafPath(sub) {
    if (sub === "00-project.md")
        return false;
    const noExt = sub.endsWith(".md") ? sub.slice(0, -3) : sub;
    const parts = noExt.split("/");
    const last = parts[parts.length - 1];
    return !(parts.length >= 2 && last?.startsWith("00-"));
}
function parseOne(key, md) {
    const absId = key.indexOf("/docs/") !== -1 ? absPathToNodeId(key) : pathKeyToNodeId(key);
    if (!absId)
        return null;
    const title = firstHeading(md);
    const status = normalizeStatus(field(md, "Status"));
    let parentId;
    if (absId === "root") {
        parentId = null;
    }
    else {
        const parentField = field(md, "Parent");
        if (parentField && /project root/i.test(parentField)) {
            parentId = "root";
        }
        else {
            const parentBacktick = backtickedId(parentField);
            if (parentBacktick) {
                parentId = parentBacktick;
            }
            else {
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
        source: key,
        validated: false,
    };
}
function resolveChildId(parentAbsId, relId) {
    if (parentAbsId === "root")
        return relId;
    return `${parentAbsId}/${relId}`;
}
/**
 * Map a relative author-written doc path (e.g. `docs/01-ui/02-dag.md`) to a NodeId.
 *
 * Accepts either `docs/foo.md` or `./docs/foo.md`. Returns null for unrecognised inputs.
 */
export function idForPath(path) {
    const normalised = path.replace(/^\.\//, "");
    if (!normalised.startsWith("docs/"))
        return null;
    const sub = normalised.slice("docs/".length);
    return pathKeyToNodeId(sub);
}
/**
 * Build the full project node set from a raw docs map.
 *
 * @param rawDocs - Map from path key to raw markdown content.
 *   Keys may be absolute Vite glob paths (e.g. `/abs/.../docs/foo.md`)
 *   or docs-relative paths (e.g. `01-ui/01-shell.md`).
 */
export function buildDocGraph(rawDocs) {
    const parsed = [];
    const validationErrors = [];
    for (const [key, body] of Object.entries(rawDocs)) {
        const sub = toDocsRelPath(key);
        if (sub.startsWith("process/") || sub.startsWith("_schemas/"))
            continue;
        if (isLeafPath(sub)) {
            const candidate = parseDocNode(sub, body);
            if (candidate === null) {
                const p = parseOne(key, body);
                if (p)
                    parsed.push(p);
                continue;
            }
            const result = validateDocNode(candidate);
            if (!result.ok) {
                validationErrors.push({ path: key });
                continue;
            }
            const node = result.node;
            const children = node.children.map((row) => ({
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
                source: key,
                validated: true,
            });
        }
        else {
            const p = parseOne(key, body);
            if (p)
                parsed.push(p);
        }
    }
    if (validationErrors.length > 0) {
        console.error("[buildDocGraph] validation errors:", validationErrors);
    }
    const byId = new Map();
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
    for (const p of parsed) {
        for (const row of p.children) {
            const childAbsId = resolveChildId(p.absId, row.relId);
            const dependsOn = row.dependsOnRel.map((rel) => resolveChildId(p.absId, rel));
            const existing = byId.get(childAbsId);
            if (existing) {
                existing.dependsOn = dependsOn;
            }
            else {
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
        validationErrorPaths: validationErrors.map((e) => e.path),
    };
}
