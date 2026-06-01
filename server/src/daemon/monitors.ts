/**
 * Health-daemon monitor functions.
 *
 * Each monitor takes a parsed DocumentNode (and optional extras) and returns
 * zero or one TaskInput. Dedup is handled by the caller in daemon/index.ts.
 *
 * monitor functions are pure / near-pure — execa call in checkStaleness is the
 * only side-effect-carrying one.
 */

import path from "node:path";
import { execa } from "execa";
import type { DocumentNode } from "@ledger/parser";
import type { TaskInput, TaskType, TaskStatus, ResourceClaim } from "@ledger/parser";
import type { Store } from "../runner/store.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;

const EMPTY_PLACEHOLDERS = [
  /^\s*\*\(none[^)]*\)\*\s*$/i, // *(none...)*  form
  /^\s*none\.?\s*$/i, // None.  or  none  (bare prose form)
];

// Statuses in scope for orphan detection
const ORPHAN_ELIGIBLE_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETE",
  "PLANNED",
  "DEFERRED",
  "ISSUE_OPEN",
]);

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

/**
 * Returns true if a task of the given type with a write-claim on nodeId
 * already exists in an active state (PENDING | RUNNING | AWAITING_HUMAN_REVIEW).
 */
export function isDuplicate(store: Store, type: TaskType, nodeId: string): boolean {
  const activeStatuses: TaskStatus[] = ["PENDING", "RUNNING", "AWAITING_HUMAN_REVIEW"];
  return store
    .listTasks({ type: [type], status: activeStatuses })
    .some((t) =>
      t.resourceClaims.some(
        (c): c is Extract<ResourceClaim, { kind: "node" }> =>
          c.kind === "node" && c.nodeId === nodeId,
      ),
    );
}

// ---------------------------------------------------------------------------
// Size monitor
// ---------------------------------------------------------------------------

/**
 * Returns a `doc_refactor` TaskInput if the doc's estimated token count
 * exceeds `sizeThresholdTokens`. Returns undefined otherwise.
 */
export function checkSize(
  doc: DocumentNode,
  content: string,
  sizeThresholdTokens: number,
): TaskInput | undefined {
  const estimatedTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
  if (estimatedTokens <= sizeThresholdTokens) return undefined;

  return {
    type: "doc_refactor",
    title: `[daemon] doc_refactor: ${doc.nodeId}`,
    source: "daemon_triggered",
    resourceClaims: [{ kind: "node", nodeId: doc.nodeId, mode: "write" }],
  };
}

// ---------------------------------------------------------------------------
// Staleness monitor
// ---------------------------------------------------------------------------

/**
 * Returns a `reverify` TaskInput if the doc's git mtime is more than
 * `stalenessGraceDays` past its `lastUpdated` frontmatter field.
 * Returns undefined for non-COMPLETE nodes, untracked files, or docs within
 * the grace window.
 */
export async function checkStaleness(
  doc: DocumentNode,
  absFilePath: string,
  projectRoot: string,
  stalenessGraceDays: number,
): Promise<TaskInput | undefined> {
  if (doc.status !== "COMPLETE") return undefined;

  const relPath = path.relative(projectRoot, absFilePath);

  let gitMtimeStr: string;
  try {
    const result = await execa("git", ["log", "-1", "--format=%aI", "--", relPath], {
      cwd: projectRoot,
    });
    gitMtimeStr = result.stdout.trim();
  } catch {
    // git not available or error — skip
    return undefined;
  }

  if (!gitMtimeStr) {
    // Untracked file — no git history, skip
    return undefined;
  }

  const gitMtime = new Date(gitMtimeStr);
  // doc.lastUpdated is already annotation-stripped by parseDocNode (bare YYYY-MM-DD)
  const lastUpdatedDate = new Date(doc.lastUpdated + "T00:00:00Z");
  const staleBy = gitMtime.getTime() - lastUpdatedDate.getTime();

  if (staleBy <= stalenessGraceDays * 86_400_000) return undefined;

  return {
    type: "reverify",
    title: `[daemon] reverify: ${doc.nodeId}`,
    source: "daemon_triggered",
    resourceClaims: [{ kind: "node", nodeId: doc.nodeId, mode: "write" }],
  };
}

// ---------------------------------------------------------------------------
// Orphan monitor
// ---------------------------------------------------------------------------

/**
 * Returns an `issue_triage` TaskInput if the doc is in a stable state,
 * has non-placeholder Open Issues content, and its `lastUpdated` field is
 * older than `orphanThresholdDays`. Returns undefined otherwise.
 */
export function checkOrphans(
  doc: DocumentNode,
  orphanThresholdDays: number,
): TaskInput | undefined {
  if (!ORPHAN_ELIGIBLE_STATUSES.has(doc.status)) return undefined;

  const openIssuesText: string = doc.sections["Open Issues"];
  const trimmed = openIssuesText.trim();

  const hasRealIssues =
    trimmed.length > 0 && !EMPTY_PLACEHOLDERS.some((p) => p.test(trimmed));

  if (!hasRealIssues) return undefined;

  const lastUpdatedDate = new Date(doc.lastUpdated + "T00:00:00Z");
  const lastUpdatedAge = Date.now() - lastUpdatedDate.getTime();

  if (lastUpdatedAge <= orphanThresholdDays * 86_400_000) return undefined;

  return {
    type: "issue_triage",
    title: `[daemon] issue_triage: ${doc.nodeId}`,
    source: "daemon_triggered",
    resourceClaims: [{ kind: "node", nodeId: doc.nodeId, mode: "write" }],
  };
}
