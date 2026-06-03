import path from "node:path";
import { execa } from "execa";
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

export async function checkStaleness(
  doc: DocumentNode,
  absFilePath: string,
  projectRoot: string,
  stalenessGraceDays: number,
): Promise<HealthFinding | null> {
  if (doc.status !== "COMPLETE") return null;

  const relPath = path.relative(projectRoot, absFilePath);
  let gitMtimeStr: string;
  try {
    const result = await execa("git", ["log", "-1", "--format=%aI", "--", relPath], {
      cwd: projectRoot,
    });
    gitMtimeStr = result.stdout.trim();
  } catch {
    return null;
  }

  if (!gitMtimeStr) return null; // untracked

  const gitMtime = new Date(gitMtimeStr);
  const lastUpdatedDate = new Date(doc.lastUpdated + "T00:00:00Z");
  const staleByMs = gitMtime.getTime() - lastUpdatedDate.getTime();

  if (staleByMs <= stalenessGraceDays * 86_400_000) return null;

  const staleByDays = Math.floor(staleByMs / 86_400_000);
  return {
    monitor: "staleness",
    nodeId: doc.nodeId,
    detail: `git mtime ${gitMtimeStr.slice(0, 10)} is ${staleByDays.toString()}d past lastUpdated ${doc.lastUpdated}`,
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
