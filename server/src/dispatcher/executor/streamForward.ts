/**
 * Stream-json telemetry forwarding + idle watchdog.
 *
 * dispatcher-hang-issue.md defect #2 ("no telemetry-based liveness signal") and
 * the "better" idle watchdog. The dispatched
 *   claude --print --bare --output-format stream-json --verbose
 * subprocess emits one NDJSON event per stdout line. forwardClaudeStream()
 * iterates those lines as they arrive, maps each to a runner LogEvent, and emits
 * it via handle.emit — which lands in the events table AND streams live to the
 * Logs UI through the withPublishing decorator. A black-box run becomes an
 * inspectable transcript.
 *
 * The same line stream is the idle watchdog's liveness signal: an inactivity
 * timer is re-armed on every line, and if the stream goes silent for `idleMs`
 * the subprocess is killed (SIGTERM, SIGKILL backstop). The executor maps the
 * resulting `idleKilled` flag to FAILED:subprocess_idle (lifecycle.ts), so a
 * frozen agent is reconciled in minutes instead of waiting out the hard
 * wall-clock `timeout`.
 *
 * mapStreamEvent is pure + stateless so it is exhaustively unit-testable against
 * captured claude output; forwardClaudeStream owns the I/O, timer, and emit.
 */

import type { ResultPromise } from "execa";
import type { LogEvent, TaskId } from "@ledger/parser";
import type { RunnerHandle } from "../../runner/executors.js";

// Distributive Omit: a plain Omit<LogEvent, …> collapses the discriminated union
// to its common key (`kind`) only. Distributing over each member preserves the
// kind-specific fields so mapStreamEvent's return type is fully checked. Each
// member still has `kind`, so it stays assignable to handle.emit's parameter.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventPayload = DistributiveOmit<LogEvent, "id" | "taskId" | "seq" | "at">;

// Caps so a pathological transcript line cannot bloat a single events row.
const MAX_TEXT = 16_000;
const MAX_BODY = 4_000;
// Grace between the idle SIGTERM and the SIGKILL backstop (matches execa's
// forceKillAfterDelay default for the hard timeout).
const FORCE_KILL_GRACE_MS = 5_000;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asObject(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

/**
 * Map one parsed stream-json object to zero or more LogEvent payloads.
 *
 * Recognised claude stream-json shapes (claude 2.1.x, --output-format stream-json):
 *   { type: "system", subtype: "init", model, mcp_servers, tools, ... }
 *   { type: "assistant", message: { content: [ {type:"text"|"thinking"|"tool_use"} ] } }
 *   { type: "user",      message: { content: [ {type:"tool_result"} ] } }
 *   { type: "result", subtype, is_error, duration_ms, result, ... }
 * Anything else (partial deltas, unknown types) maps to [] and is skipped.
 *
 * Runner MCP tool calls (mcp__ledger-runner__*) are forwarded too: seeing the
 * agent's own complete_task / emit_event calls in the transcript is useful, and
 * filtering by name would require correlating tool_result ids back to names
 * (stateful) — not worth the noise reduction.
 */
export function mapStreamEvent(obj: unknown): EventPayload[] {
  const e = asObject(obj);
  if (e === undefined) return [];

  switch (e["type"]) {
    case "system": {
      if (e["subtype"] !== "init") return [];
      const model = asString(e["model"]) ?? "?";
      const mcp = JSON.stringify(e["mcp_servers"] ?? []);
      return [
        {
          kind: "reasoning",
          subkind: "message",
          text: `session init — model=${model}, mcp_servers=${mcp}`.slice(0, MAX_TEXT),
        },
      ];
    }
    case "assistant":
    case "user":
      return mapMessageContent(e);
    case "result": {
      const subtype = asString(e["subtype"]) ?? "unknown";
      if (e["is_error"] === true) {
        const msg = asString(e["result"]) ?? subtype;
        return [{ kind: "error", message: `agent run error (${subtype}): ${msg}`.slice(0, MAX_TEXT) }];
      }
      const dur = typeof e["duration_ms"] === "number" ? `${String(e["duration_ms"])}ms` : "?";
      return [{ kind: "reasoning", subkind: "message", text: `agent run ${subtype} (${dur})` }];
    }
    default:
      return [];
  }
}

function mapMessageContent(e: Record<string, unknown>): EventPayload[] {
  const message = asObject(e["message"]);
  const out: EventPayload[] = [];
  for (const raw of asArray(message?.["content"])) {
    const block = asObject(raw);
    if (block === undefined) continue;
    switch (block["type"]) {
      case "text": {
        const text = asString(block["text"]);
        if (text) out.push({ kind: "reasoning", subkind: "message", text: text.slice(0, MAX_TEXT) });
        break;
      }
      case "thinking": {
        const text = asString(block["thinking"]);
        if (text) out.push({ kind: "reasoning", subkind: "thinking", text: text.slice(0, MAX_TEXT) });
        break;
      }
      case "tool_use": {
        const name = asString(block["name"]);
        if (name) {
          out.push({
            kind: "tool_call",
            callId: asString(block["id"]) ?? "",
            toolName: name,
            arguments: JSON.stringify(block["input"] ?? {}).slice(0, MAX_BODY),
          });
        }
        break;
      }
      case "tool_result": {
        const content = block["content"];
        const body = (typeof content === "string" ? content : JSON.stringify(content ?? "")).slice(0, MAX_BODY);
        out.push({
          kind: "tool_result",
          callId: asString(block["tool_use_id"]) ?? "",
          status: block["is_error"] === true ? "error" : "ok",
          body,
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export interface ForwardResult {
  /** True if the idle watchdog fired and killed the subprocess. */
  idleKilled: boolean;
  /** Count of LogEvents forwarded into the store (for tests/diagnostics). */
  eventsEmitted: number;
}

/**
 * Consume the subprocess stdout line stream to completion, forwarding each
 * stream-json event into the runner store and re-arming the idle watchdog on
 * every line. Resolves when the stream ends (subprocess exit or kill).
 *
 * MUST be awaited before the caller awaits the subprocess result: it is the
 * stdout consumer, and `await subprocess` only resolves once the process exits.
 */
export async function forwardClaudeStream(opts: {
  taskId: TaskId;
  handle: RunnerHandle;
  subprocess: ResultPromise;
  /** Idle timeout in ms; <= 0 disables the idle watchdog (forwarding still runs). */
  idleMs: number;
}): Promise<ForwardResult> {
  const { taskId, handle, subprocess, idleMs } = opts;
  let idleKilled = false;
  let eventsEmitted = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const armIdle = (): void => {
    if (idleMs <= 0) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      idleKilled = true;
      subprocess.kill("SIGTERM");
      const force = setTimeout(() => {
        try {
          subprocess.kill("SIGKILL");
        } catch {
          // already exited — nothing to kill
        }
      }, FORCE_KILL_GRACE_MS);
      force.unref();
    }, idleMs);
  };

  armIdle();
  try {
    for await (const line of subprocess) {
      armIdle();
      const trimmed = typeof line === "string" ? line.trim() : "";
      if (trimmed.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue; // non-JSON noise (e.g. a stray log line) — skip
      }
      for (const payload of mapStreamEvent(parsed)) {
        try {
          handle.emit(taskId, payload);
          eventsEmitted++;
        } catch {
          // A store/emit failure must not crash the run or stop forwarding.
        }
      }
    }
  } catch {
    // The iterator throws when the subprocess is killed or errors mid-stream;
    // the caller's `await subprocess` handles the terminal result.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  return { idleKilled, eventsEmitted };
}
