/**
 * Shared utilities for log event kind filtering.
 *
 * Separated from LogFilters.tsx so that non-component exports don't trigger
 * the react-refresh/only-export-components lint rule.
 */

import type { LogEvent } from "@/lib/types";

export type LogEventKind = LogEvent["kind"];

export const ALL_KINDS: readonly LogEventKind[] = [
  "reasoning",
  "tool_call",
  "tool_result",
  "artifact",
  "status_change",
  "error",
] as const;

/**
 * Return the active kind set from the `?kind=` URL param.
 * Empty set = "all visible" (no filter active).
 */
export function parseKindsFromParam(param: string | null): Set<LogEventKind> {
  if (!param) return new Set();
  const parts = param.split(",").map((s) => s.trim());
  const valid = parts.filter((k): k is LogEventKind =>
    (ALL_KINDS as readonly string[]).includes(k),
  );
  if (valid.length === ALL_KINDS.length) return new Set(); // all on = no filter
  return new Set(valid);
}
