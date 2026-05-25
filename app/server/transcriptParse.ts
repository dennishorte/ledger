/**
 * JSONL transcript parser — converts lines from Claude Code 2.1.148 JSONL
 * transcripts into typed LogEvent arrays.
 *
 * Type mapping (from spec §Design > JSONL line types):
 *  assistant      → reasoning (thinking/message) and/or tool_call events
 *  user           → tool_result events (tool_result content blocks only)
 *  system         → status_change (local_command) or error (api_error)
 *  ai-title       → consumed for title derivation; NOT emitted as a LogEvent
 *  last-prompt    → skipped
 *  file-history-snapshot → skipped
 *  attachment     → skipped (internal Claude Code metadata)
 *  queue-operation → skipped
 *  permission-mode → skipped
 *  unknown types  → skipped with once-per-kind console.warn
 *
 * Sub-agent task-type inference keyword table (D2) lives here and is expected
 * to evolve as the operator's description conventions stabilise.
 */

import * as fs from "node:fs";
import type { LogEvent, NodeId, TaskId, TaskStatus, TaskType } from "../src/lib/types.js";
import { serverIdForPath } from "./serverIdForPath.js";

// ---------------------------------------------------------------------------
// Once-per-kind warning registry
// ---------------------------------------------------------------------------

const warnedTypes = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (!warnedTypes.has(key)) {
    warnedTypes.add(key);
    console.warn(`[transcriptParse] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// D2 keyword table: sub-agent description → TaskType
// ---------------------------------------------------------------------------

// Table is evaluated top-to-bottom — more-specific patterns must come before
// their more-general prefixes (e.g. `^implementation review` before `^implement`).
const KEYWORD_TABLE: Array<{ patterns: RegExp[]; type: TaskType }> = [
  {
    patterns: [
      /^implementation review/i,
      /^review implementation/i,
      /^verify/i,
      /^verification of/i,
    ],
    type: "verify",
  },
  {
    patterns: [
      /^spec review/i,
      /^review spec/i,
      /^review draft/i,
      /^SPEC_REVIEW/,
    ],
    type: "spec_review",
  },
  {
    patterns: [/^implement/i, /^implementation of/i],
    type: "implement",
  },
  {
    patterns: [
      /^draft/i,
      /^author spec/i,
      /^author draft/i,
      /^spec draft/i,
    ],
    type: "spec_draft",
  },
  {
    patterns: [/^refactor/i, /^doc refactor/i],
    type: "doc_refactor",
  },
  {
    patterns: [/^triage/i, /^investigate/i, /^diagnose/i],
    type: "issue_triage",
  },
  {
    patterns: [/^re-?verify/i, /^reverify/i],
    type: "reverify",
  },
];

/**
 * Infer TaskType from the first 40 characters of a sub-agent description.
 */
export function inferTaskType(description: string): TaskType {
  const prefix = description.slice(0, 40);
  for (const row of KEYWORD_TABLE) {
    for (const pattern of row.patterns) {
      if (pattern.test(prefix)) return row.type;
    }
  }
  return "agent_task";
}

// ---------------------------------------------------------------------------
// Internal JSONL shapes (observed against Claude Code 2.1.148)
//
// All line objects parsed from disk are treated as unknown, then narrowed by
// reading the `type` field. Interfaces below describe the shapes we expect;
// we use type-guard helpers rather than casts.
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(obj: JsonObject, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function getBoolean(obj: JsonObject, key: string): boolean | undefined {
  const v = obj[key];
  return typeof v === "boolean" ? v : undefined;
}

// Represents a single parsed line — contains at minimum a `type` string.
export interface ParsedLine {
  type: string;
  uuid?: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Content-block helpers
// ---------------------------------------------------------------------------

interface ContentBlockThinking {
  type: "thinking";
  thinking: string;
}

interface ContentBlockText {
  type: "text";
  text: string;
}

interface ContentBlockToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ContentBlockToolResult {
  type: "tool_result";
  tool_use_id: string;
  is_error?: boolean;
  content: string | ContentBlock[];
}

type ContentBlock =
  | ContentBlockThinking
  | ContentBlockText
  | ContentBlockToolUse
  | ContentBlockToolResult;

function parseContentBlock(raw: unknown): ContentBlock | null {
  if (!isJsonObject(raw)) return null;
  const type = getString(raw, "type");
  if (type === "thinking") {
    const thinking = getString(raw, "thinking") ?? "";
    return { type: "thinking", thinking };
  }
  if (type === "text") {
    const text = getString(raw, "text") ?? "";
    return { type: "text", text };
  }
  if (type === "tool_use") {
    const id = getString(raw, "id") ?? "";
    const name = getString(raw, "name") ?? "";
    const input = raw["input"];
    return { type: "tool_use", id, name, input };
  }
  if (type === "tool_result") {
    const tool_use_id = getString(raw, "tool_use_id") ?? "";
    const is_error = getBoolean(raw, "is_error");
    const rawContent = raw["content"];
    let content: string | ContentBlock[];
    if (typeof rawContent === "string") {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      content = rawContent
        .map((b) => parseContentBlock(b))
        .filter((b): b is ContentBlock => b !== null);
    } else {
      content = "";
    }
    return { type: "tool_result", tool_use_id, is_error, content };
  }
  return null;
}

function parseContentBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => parseContentBlock(b))
    .filter((b): b is ContentBlock => b !== null);
}

// ---------------------------------------------------------------------------
// Title extraction helpers (used by deriveTask.ts)
// ---------------------------------------------------------------------------

/**
 * Parse a single JSONL line, returning null on failure.
 */
export function parseLine(raw: string): ParsedLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isJsonObject(parsed)) return null;
  const type = getString(parsed, "type");
  if (!type) return null;
  const result: ParsedLine & Record<string, unknown> = {
    ...parsed,
    type,
    uuid: getString(parsed, "uuid"),
    timestamp: getString(parsed, "timestamp"),
  };
  return result;
}

/**
 * Extract the most recent ai-title from parsed lines.
 */
export function extractAiTitle(lines: ParsedLine[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    if (line.type === "ai-title") {
      const aiTitle = (line as ParsedLine & { aiTitle?: unknown })["aiTitle"];
      if (typeof aiTitle === "string" && aiTitle.length > 0) {
        return aiTitle;
      }
    }
  }
  return undefined;
}

/**
 * Extract the first qualifying user prompt for title fallback (D14).
 * Qualifying: string content, isMeta !== true, does not start with <command-name>.
 */
export function extractFirstUserPrompt(lines: ParsedLine[]): string | undefined {
  for (const line of lines) {
    if (line.type !== "user") continue;
    const obj = line as ParsedLine & Record<string, unknown>;
    if (obj["isMeta"] === true) continue;
    const message = obj["message"];
    if (!isJsonObject(message)) continue;
    const content = message["content"];
    if (typeof content !== "string") continue;
    if (content.startsWith("<command-name>")) continue;
    const truncated = content.slice(0, 80);
    if (truncated.length > 0) return truncated;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main parser: JSONL text → LogEvent[]
// ---------------------------------------------------------------------------

/**
 * Stringify a tool_result content field (string or ContentBlock array).
 */
function stringifyContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .map((b): string => {
      if (b.type === "text") return b.text;
      if (b.type === "thinking") return b.thinking;
      return JSON.stringify(b);
    })
    .join("\n");
}

/** Safely stringify tool input to JSON. */
function inputToJson(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "{}";
  }
}

// ---------------------------------------------------------------------------
// Artifact derivation — D6
//
// Successful Write / Edit / MultiEdit / NotebookEdit tool_results produce a
// single `artifact` LogEvent. MultiEdit emits one event per call (one path,
// multiple hunks aggregated; hunk-level granularity is intentionally lost).
// Bash, Read, and all other tools are excluded.
// ---------------------------------------------------------------------------

const ARTIFACT_TOOLS = new Set<string>(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

interface ArtifactPayload {
  artifactKind: "doc_created" | "doc_updated" | "file_written";
  path: string;
  docNodeId?: NodeId;
  summary?: string;
}

function artifactFromToolCall(
  toolName: string,
  argsJson: string,
): ArtifactPayload | null {
  if (!ARTIFACT_TOOLS.has(toolName)) return null;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  const filePath = typeof args["file_path"] === "string" ? args["file_path"] : null;
  if (filePath === null) return null;

  const nodeId = serverIdForPath(filePath) ?? undefined;
  // Phase-1: we cannot tell from the JSONL whether `Write` was targeting an
  // existing or new file. We map Write→doc_created when nodeId is set, else
  // file_written; Edit/MultiEdit/NotebookEdit always indicate an update.
  let artifactKind: ArtifactPayload["artifactKind"];
  if (toolName === "Write") {
    artifactKind = nodeId !== undefined ? "doc_created" : "file_written";
  } else if (nodeId !== undefined) {
    artifactKind = "doc_updated";
  } else {
    artifactKind = "file_written";
  }

  const summary =
    typeof args["description"] === "string"
      ? args["description"].slice(0, 80)
      : undefined;

  const out: ArtifactPayload = { artifactKind, path: filePath };
  if (nodeId !== undefined) out.docNodeId = nodeId;
  if (summary !== undefined) out.summary = summary;
  return out;
}

export interface ParseResult {
  events: LogEvent[];
  /** Parsed line objects (used by deriveTask for title/model extraction). */
  lines: ParsedLine[];
}

/**
 * Parse the full content of a JSONL transcript file into a ParseResult.
 *
 * @param taskId   The TaskId to stamp on every LogEvent.
 * @param content  Raw file content (UTF-8 string).
 */
export function parseTranscript(taskId: TaskId, content: string): ParseResult {
  const rawLines = content.split("\n");
  const parsedLines: ParsedLine[] = [];
  const events: LogEvent[] = [];

  let seq = 0;

  // Track open tool_use calls by id → timestamp, for durationMs derivation.
  const pendingToolCalls = new Map<
    string,
    { at: string; name: string; argsJson: string }
  >();

  for (const rawLine of rawLines) {
    const line = parseLine(rawLine);
    if (!line) continue;
    parsedLines.push(line);

    const obj = line as ParsedLine & Record<string, unknown>;
    const id = line.uuid ?? `${taskId}-${String(seq)}`;
    const at = line.timestamp ?? new Date().toISOString();

    switch (line.type) {
      case "assistant": {
        const message = obj["message"];
        const msgContent = isJsonObject(message) ? message["content"] : undefined;
        const blocks = parseContentBlocks(msgContent);
        for (const block of blocks) {
          if (block.type === "thinking") {
            events.push({
              id: `${id}-thinking`,
              taskId,
              at,
              seq: seq++,
              kind: "reasoning",
              text: block.thinking,
              subkind: "thinking",
            });
          } else if (block.type === "text") {
            if (block.text.trim()) {
              events.push({
                id: `${id}-text`,
                taskId,
                at,
                seq: seq++,
                kind: "reasoning",
                text: block.text,
                subkind: "message",
              });
            }
          } else if (block.type === "tool_use") {
            const argsJson = inputToJson(block.input);
            pendingToolCalls.set(block.id, { at, name: block.name, argsJson });
            events.push({
              id: `${id}-tu-${block.id}`,
              taskId,
              at,
              seq: seq++,
              kind: "tool_call",
              callId: block.id,
              toolName: block.name,
              arguments: argsJson,
            });
          } else {
            // block.type === "tool_result" inside assistant: unexpected; skip
            warnOnce(
              `block:${block.type}`,
              `Unexpected assistant content block type: "${block.type}" — skipping`,
            );
          }
        }
        break;
      }

      case "user": {
        const message = obj["message"];
        const msgContent = isJsonObject(message) ? message["content"] : undefined;
        if (Array.isArray(msgContent)) {
          for (const rawBlock of msgContent) {
            const block = parseContentBlock(rawBlock);
            if (block?.type === "tool_result") {
              const callId = block.tool_use_id;
              const pending = pendingToolCalls.get(callId);
              let durationMs: number | undefined;
              if (pending !== undefined) {
                const callTs = new Date(pending.at).getTime();
                const resultTs = new Date(at).getTime();
                if (isFinite(callTs) && isFinite(resultTs)) {
                  durationMs = resultTs - callTs;
                }
                pendingToolCalls.delete(callId);
              }
              const status: "ok" | "error" =
                block.is_error === true ? "error" : "ok";
              events.push({
                id: `${id}-tr-${callId}`,
                taskId,
                at,
                seq: seq++,
                kind: "tool_result",
                callId,
                status,
                body: stringifyContent(block.content),
                durationMs,
              });
              // Emit an artifact event when a write-like tool succeeded.
              if (pending !== undefined && status === "ok") {
                const artifact = artifactFromToolCall(pending.name, pending.argsJson);
                if (artifact !== null) {
                  events.push({
                    id: `${id}-art-${callId}`,
                    taskId,
                    at,
                    seq: seq++,
                    kind: "artifact",
                    ...artifact,
                  });
                }
              }
            }
            // Other user content blocks (non-tool_result) are skipped per spec.
          }
        }
        // String content (operator messages) are skipped per spec.
        break;
      }

      case "system": {
        const subtype = getString(obj, "subtype");
        if (subtype === "local_command") {
          const reason = getString(obj, "content");
          events.push({
            id: `${id}-sc`,
            taskId,
            at,
            seq: seq++,
            kind: "status_change",
            from: "RUNNING" as TaskStatus,
            to: "RUNNING" as TaskStatus,
            reason,
          });
        } else if (subtype === "api_error") {
          const message =
            getString(obj, "error") ??
            getString(obj, "content") ??
            getString(obj, "message") ??
            "API error";
          events.push({
            id: `${id}-err`,
            taskId,
            at,
            seq: seq++,
            kind: "error",
            message,
          });
        } else if (subtype === "turn_duration" || subtype === "away_summary") {
          // skipped — internal timing / summary
        } else if (subtype !== undefined) {
          warnOnce(
            `system:${subtype}`,
            `Unknown system subtype: "${subtype}" — skipping`,
          );
        }
        break;
      }

      case "ai-title":
        // Consumed by title derivation in deriveTask.ts; not emitted as LogEvent.
        break;

      case "last-prompt":
      case "file-history-snapshot":
      case "attachment":
      case "queue-operation":
      case "permission-mode":
        // Known-skip types — internal Claude Code metadata.
        break;

      default: {
        warnOnce(
          `type:${line.type}`,
          `Unknown top-level JSONL type: "${line.type}" — skipping`,
        );
        break;
      }
    }
  }

  return { events, lines: parsedLines };
}

/**
 * Read a JSONL file from disk and parse it.
 * Returns an empty ParseResult on read error.
 */
export function parseTranscriptFile(
  taskId: TaskId,
  jsonlPath: string,
): ParseResult {
  let content: string;
  try {
    content = fs.readFileSync(jsonlPath, "utf8");
  } catch {
    return { events: [], lines: [] };
  }
  return parseTranscript(taskId, content);
}
