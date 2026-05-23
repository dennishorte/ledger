/**
 * parseIssues — pure string extraction of open-issue items from raw markdown.
 *
 * No React imports. No remark. Fast, testable in isolation.
 * Spec: docs/01-ui/06-health.md §Design > Issue extraction
 */

import type { IssueItem, IssuePriority, NodeId } from "@/lib/types";

const PRIORITY_RE = /\(Priority:\s*(HIGH|MEDIUM|LOW|TRIVIAL)\)/i;

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
  // Locate "## Open Issues" (case-insensitive, allows trailing spaces)
  const headingMatch = raw.match(/^##\s+Open Issues\s*$/im);
  if (!headingMatch || headingMatch.index === undefined) return [];

  const afterHeading = raw.slice(headingMatch.index + headingMatch[0].length);

  // Collect everything up to the next ## heading (or EOF)
  const nextH2 = afterHeading.search(/^##\s+/m);
  const section = nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);

  const items: IssueItem[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    // Accept both `- text` and `* text` bullet styles
    if (!trimmed.startsWith("- ") && !trimmed.startsWith("* ")) continue;
    const text = trimmed.slice(2).trim();
    if (!text) continue;
    items.push({
      nodeId,
      text,
      priority: extractPriority(text),
      sectionSlug: "open-issues",
    });
  }

  return items;
}
