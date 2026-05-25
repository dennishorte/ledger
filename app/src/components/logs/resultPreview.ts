/**
 * Tool-result body preview heuristics.
 *
 * Spec: 05-logs.md §Design > Result preview heuristics for tool_result
 */

const MAX_CHARS = 120;

function truncate(s: string, maxLen = MAX_CHARS): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/**
 * Produce a one-line preview from a tool_result body string.
 *
 * Rules (evaluated in order):
 * 1. If body parses as JSON with a top-level `error` field, show that.
 * 2. First non-blank line of body, truncated to 120 chars.
 * 3. Append "(N lines)" when body is multi-line.
 */
export function resultPreview(body: string): string {
  // Rule 1: JSON with top-level error field
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const obj = parsed as Record<string, unknown>;
      const errorVal = obj["error"];
      if (typeof errorVal === "string" && errorVal.length > 0) {
        return truncate(errorVal);
      }
    }
  } catch {
    // Not JSON — fall through
  }

  // Rule 2 + 3: first non-blank line + optional line count suffix
  const lines = body.split("\n");
  const firstNonBlank = lines.find((l) => l.trim().length > 0) ?? "";
  const lineCount = lines.filter((l) => l.trim().length > 0).length;

  const base = truncate(firstNonBlank);
  if (lineCount > 1) {
    return `${base} … (${String(lineCount)} lines)`;
  }
  return base;
}
