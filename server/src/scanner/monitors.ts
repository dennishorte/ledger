import type { DocumentNode } from "@ledger/parser";
import type { HealthFinding } from "./types.js";

const CHARS_PER_TOKEN = 4;

const EMPTY_PLACEHOLDERS = [
  /^\s*\*\(none[^)]*\)\*\s*$/i,
  /^\s*none\.?\s*$/i,
];

const ORPHAN_ELIGIBLE_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETE",
  "PLANNED",
  "DEFERRED",
  "ISSUE_OPEN",
]);

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

export function checkOrphans(
  doc: DocumentNode,
  orphanThresholdDays: number,
): HealthFinding | null {
  if (!ORPHAN_ELIGIBLE_STATUSES.has(doc.status)) return null;

  const openIssuesText: string = doc.sections["Open Issues"] ?? "";
  const trimmed = openIssuesText.trim();
  const hasRealIssues =
    trimmed.length > 0 && !EMPTY_PLACEHOLDERS.some((p) => p.test(trimmed));

  if (!hasRealIssues) return null;

  const lastUpdatedAge = Date.now() - new Date(doc.lastUpdated + "T00:00:00Z").getTime();
  if (lastUpdatedAge <= orphanThresholdDays * 86_400_000) return null;

  const ageDays = Math.floor(lastUpdatedAge / 86_400_000);
  return {
    monitor: "orphan",
    nodeId: doc.nodeId,
    detail: `open issues present; lastUpdated ${doc.lastUpdated} is ${ageDays.toString()}d ago`,
  };
}
