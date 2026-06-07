import type { DocumentNode } from "@ledger/parser";
import type { HealthFinding } from "./types.js";

const CHARS_PER_TOKEN = 4;

// Stable lifecycle states: a node here is considered "settled", so an unresolved
// HIGH/MEDIUM open issue on it is meaningful work deferred past completion —
// worth surfacing. DRAFT/SPEC_REVIEW/etc. legitimately carry open work mid-flight.
const STABLE_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETE",
  "PLANNED",
  "DEFERRED",
  "ISSUE_OPEN",
]);

// Priority tag, tolerant of the continuation forms used across the docs
// ("(Priority: HIGH — …)", "(Priority: HIGH, …)", "(Priority: LOW.)"). Unlike
// app/src/lib/parseIssues.ts it does NOT require a closing paren right after the
// word — that parser under-tags the em-dash form (see 07-health-daemon v2.1).
const PRIORITY_RE = /\(Priority:\s*(HIGH|MEDIUM|LOW|TRIVIAL)/i;

type Priority = "HIGH" | "MEDIUM" | "LOW" | "TRIVIAL" | "UNKNOWN";

interface OpenIssueItem {
  text: string;
  /** Resolved issues are retained struck-through for provenance; they lead with `~~`. */
  struck: boolean;
  priority: Priority;
}

export function checkSize(
  doc: DocumentNode,
  content: string,
  sizeThresholdTokens: number,
): HealthFinding | null {
  const estimatedTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
  if (estimatedTokens <= sizeThresholdTokens) return null;
  return {
    monitor: "size",
    nodeId: doc.nodeId,
    detail: `~${estimatedTokens.toString()} tokens (threshold: ${sizeThresholdTokens.toString()})`,
  };
}

/** Split a doc's "Open Issues" section into bullet items with priority + struck status. */
function parseOpenIssueItems(section: string): OpenIssueItem[] {
  const items: OpenIssueItem[] = [];
  let current: string | null = null;

  const flush = (): void => {
    if (current === null) return;
    const text = current.trim();
    current = null;
    if (text.length === 0) return;
    const m = PRIORITY_RE.exec(text);
    const priority: Priority = m?.[1] ? (m[1].toUpperCase() as Priority) : "UNKNOWN";
    // Project convention for a resolved item: "- ~~**Title**~~ — Closed by …".
    const struck = text.replace(/^[-*]\s+/, "").trimStart().startsWith("~~");
    items.push({ text, struck, priority });
  };

  for (const line of section.split("\n")) {
    if (/^\s*[-*]\s/.test(line)) {
      flush();
      current = line;
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  flush();
  return items;
}

function summarize(text: string): string {
  const cleaned = text
    .replace(/^[-*]\s+/, "")
    .replace(/\*?\(Priority:[^)]*\)\*?/i, "")
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 100 ? cleaned.slice(0, 99) + "…" : cleaned;
}

/**
 * Fire when a node in a stable lifecycle state still carries at least one
 * UNRESOLVED (unstruck) HIGH or MEDIUM open issue. No time component — the signal
 * is "settled node, unfinished meaningful work", not "the doc went quiet". LOW /
 * TRIVIAL / untagged / struck-through items never trigger.
 */
export function checkOpenIssues(doc: DocumentNode): HealthFinding | null {
  if (!STABLE_STATUSES.has(doc.status)) return null;

  const items = parseOpenIssueItems(doc.sections["Open Issues"]);
  const live = items.filter(
    (i) => !i.struck && (i.priority === "HIGH" || i.priority === "MEDIUM"),
  );
  if (live.length === 0) return null;

  const high = live.filter((i) => i.priority === "HIGH");
  const medium = live.filter((i) => i.priority === "MEDIUM");
  const parts: string[] = [];
  if (high.length > 0) parts.push(`${high.length.toString()} HIGH`);
  if (medium.length > 0) parts.push(`${medium.length.toString()} MEDIUM`);

  const top = high[0] ?? medium[0];
  const snippet = top ? `: ${summarize(top.text)}` : "";

  return {
    monitor: "open_issue",
    nodeId: doc.nodeId,
    detail: `${live.length.toString()} unresolved issue(s) (${parts.join(", ")})${snippet}`,
  };
}
