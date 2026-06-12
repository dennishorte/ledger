/**
 * IssueItem type and parseIssueItems function — canonical in @ledger/parser.
 *
 * Promoted from app/src/lib/types.ts + app/src/lib/parseIssues.ts
 * per 04-api-server/99-maintenance/01-ui-hook-migration item 0.
 */

import type { NodeId } from "../coreTypes.js";

export type IssuePriority = "HIGH" | "MEDIUM" | "LOW" | "TRIVIAL" | "UNKNOWN";

/**
 * A single open-issue item extracted from a doc node's "## Open Issues" section.
 */
export interface IssueItem {
  /** Source node. */
  nodeId: NodeId;
  /** The raw markdown text of the bullet (single item, may be multi-line). */
  text: string;
  /** Priority tag extracted from the item text, e.g. "HIGH", "MEDIUM", "LOW", "TRIVIAL". */
  priority: IssuePriority;
  /**
   * Slug of the "## Open Issues" heading in the source doc, for anchor deep-linking.
   * Always "open-issues" for the current doc schema.
   */
  sectionSlug: string;
}

// Tolerant of the continuation forms used across the docs:
//   "(Priority: LOW)"  "(Priority: HIGH — confusing today)"  "(Priority: MEDIUM, blocks X)"
const PRIORITY_RE = /\(Priority:\s*(HIGH|MEDIUM|LOW|TRIVIAL)/i;

function extractPriority(text: string): IssuePriority {
  const m = text.match(PRIORITY_RE);
  if (!m) return "UNKNOWN";
  const tag = m[1];
  if (!tag) return "UNKNOWN";
  return tag.toUpperCase() as IssuePriority;
}

/**
 * Extract all open-issue bullet items from a single doc's raw markdown.
 *
 * Algorithm:
 *  1. Find the `## Open Issues` heading.
 *  2. Collect contiguous bullet lines (starting with `- ` or `* `) until the
 *     next `## ` heading or end of file.
 *  3. For each bullet, derive priority from `(Priority: X)` tag.
 *  4. Return one IssueItem per bullet; sectionSlug is always "open-issues".
 *
 * Returns [] when the section is absent or empty — never throws.
 */
export function parseIssueItems(nodeId: NodeId, raw: string): IssueItem[] {
  const headingMatch = raw.match(/^##\s+Open Issues\s*$/im);
  if (!headingMatch || headingMatch.index === undefined) return [];

  const afterHeading = raw.slice(headingMatch.index + headingMatch[0].length);

  const nextH2 = afterHeading.search(/^##\s+/m);
  const section = nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);

  const items: IssueItem[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") && !trimmed.startsWith("* ")) continue;
    const text = trimmed.slice(2).trim();
    if (!text) continue;
    if (text.startsWith("~~")) continue;
    items.push({
      nodeId,
      text,
      priority: extractPriority(text),
      sectionSlug: "open-issues",
    });
  }

  return items;
}
