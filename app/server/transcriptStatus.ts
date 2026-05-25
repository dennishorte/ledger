/**
 * Status derivation from JSONL transcript file mtime + last-entry kind (D5).
 *
 * Evaluation order:
 *  1. File mtime within RUNNING_WINDOW_S  → RUNNING
 *  2. File quiet ≥ RUNNING_WINDOW_S AND last entry is assistant with pending
 *     tool_use (unmatched by a subsequent tool_result)  → RUNNING
 *  3. File quiet ≥ RUNNING_WINDOW_S AND last entry is assistant with no
 *     pending tool_use  → AWAITING_HUMAN_REVIEW
 *  4. File quiet ≥ COMPLETE_WINDOW_S  → COMPLETE
 *  5. (Else)  → RUNNING  (model preparing next turn after user tool_result)
 *
 * FAILED and CANCELLED are reserved for the eventual task runner; not derived
 * from transcripts in v1.
 *
 * Threshold env vars:
 *  LEDGER_RUNNING_WINDOW_S   (default 5)
 *  LEDGER_COMPLETE_WINDOW_S  (default 1800)
 */

import * as fs from "node:fs";
import type { TaskStatus } from "../src/lib/types.js";

const RUNNING_WINDOW_S = (() => {
  const v = Number(process.env["LEDGER_RUNNING_WINDOW_S"] ?? "5");
  return isFinite(v) && v > 0 ? v : 5;
})();

const COMPLETE_WINDOW_S = (() => {
  const v = Number(process.env["LEDGER_COMPLETE_WINDOW_S"] ?? "1800");
  return isFinite(v) && v > 0 ? v : 1800;
})();

interface LastEntryInfo {
  /** True when the last line is an `assistant` type. */
  isAssistant: boolean;
  /** True when the last assistant line has at least one tool_use content block
   *  that has no matching tool_result seen in the transcript. */
  hasPendingToolUse: boolean;
}

/**
 * Parse the transcript file to extract info needed for status derivation.
 * Reads lazily — only enough to determine last-entry kind and tool pairing.
 */
function analyzeLastEntry(jsonlPath: string): LastEntryInfo {
  let content: string;
  try {
    content = fs.readFileSync(jsonlPath, "utf8");
  } catch {
    return { isAssistant: false, hasPendingToolUse: false };
  }

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { isAssistant: false, hasPendingToolUse: false };
  }

  // Collect all tool_use ids and all tool_result call ids to find pending ones.
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();

  let lastParsed: Record<string, unknown> | null = null;

  for (const line of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    lastParsed = obj;

    if (obj["type"] === "assistant") {
      const content = obj["message"] as
        | { content?: unknown[] }
        | undefined;
      const blocks = content?.content ?? [];
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          const b = block as Record<string, unknown>;
          if (b["type"] === "tool_use" && typeof b["id"] === "string") {
            toolUseIds.add(b["id"]);
          }
        }
      }
    } else if (obj["type"] === "user") {
      const content = obj["message"] as
        | { content?: unknown[] }
        | undefined;
      const blocks = content?.content ?? [];
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          const b = block as Record<string, unknown>;
          if (
            b["type"] === "tool_result" &&
            typeof b["tool_use_id"] === "string"
          ) {
            toolResultIds.add(b["tool_use_id"]);
          }
        }
      }
    }
  }

  if (!lastParsed) {
    return { isAssistant: false, hasPendingToolUse: false };
  }

  const isAssistant = lastParsed["type"] === "assistant";

  // Check if any tool_use lacks a matching tool_result
  let hasPendingToolUse = false;
  for (const id of toolUseIds) {
    if (!toolResultIds.has(id)) {
      hasPendingToolUse = true;
      break;
    }
  }

  return { isAssistant, hasPendingToolUse };
}

/**
 * Derive TaskStatus for a transcript file.
 *
 * @param jsonlPath  Absolute path to the .jsonl file.
 * @param nowMs      Current time in ms (defaults to Date.now()).
 */
export function deriveStatus(
  jsonlPath: string,
  nowMs: number = Date.now(),
): TaskStatus {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(jsonlPath);
  } catch {
    return "COMPLETE";
  }

  const quietMs = nowMs - stat.mtimeMs;
  const quietS = quietMs / 1000;

  // Rule 1: file was modified within RUNNING_WINDOW_S → RUNNING
  if (quietS < RUNNING_WINDOW_S) return "RUNNING";

  // Rules 2 & 3: quiet ≥ RUNNING_WINDOW_S
  const { isAssistant, hasPendingToolUse } = analyzeLastEntry(jsonlPath);

  if (isAssistant) {
    if (hasPendingToolUse) {
      // Rule 2: model is waiting for tool execution
      return "RUNNING";
    } else {
      // Rule 3: model emitted response, waiting for human
      return "AWAITING_HUMAN_REVIEW";
    }
  }

  // Rule 4: file quiet ≥ COMPLETE_WINDOW_S
  if (quietS >= COMPLETE_WINDOW_S) return "COMPLETE";

  // Rule 5: default — model preparing next turn (after user tool_result)
  return "RUNNING";
}
