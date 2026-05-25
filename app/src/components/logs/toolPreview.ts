/**
 * Tool-call argument preview heuristics.
 *
 * Each tool has a "load-bearing" argument that best describes what the call
 * does at scan-time. The table is open to evolution as new tools surface.
 * Unknown tools fall back to JSON-stringify + truncation.
 *
 * Spec: 05-logs.md §Design > Argument preview heuristics for tool_call
 */

const MAX_CHARS = 120;

/** Truncate a string to at most maxLen chars, appending "…" if shortened. */
function truncate(s: string, maxLen = MAX_CHARS): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/**
 * Truncate a file path in the middle when it is longer than maxLen:
 *   "/very/long/path/to/file.ts"  →  "/very/…/file.ts"
 */
function truncatePath(path: string, maxLen = MAX_CHARS): string {
  if (path.length <= maxLen) return path;
  const half = Math.floor((maxLen - 3) / 2);
  return path.slice(0, half) + "…" + path.slice(-half);
}

/**
 * Parse a JSON arguments string and extract a human-readable preview line.
 * Returns an empty string on parse failure.
 */
export function toolPreview(toolName: string, argsJson: string): string {
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(argsJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return truncate(argsJson);
    }
    args = parsed as Record<string, unknown>;
  } catch {
    return truncate(argsJson);
  }

  const str = (key: string): string => {
    const v = args[key];
    return typeof v === "string" ? v : "";
  };

  switch (toolName) {
    // File-path tools
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return truncatePath(str("file_path"));

    // Shell
    case "Bash":
      return truncate(str("command"));

    // Search tools
    case "Grep":
    case "Glob": {
      const pattern = str("pattern");
      const pathVal = str("path");
      return pathVal
        ? truncate(`${pattern} in ${pathVal}`)
        : truncate(pattern);
    }

    // Agent / Task
    case "Agent":
    case "Task":
      return truncate(str("description"));

    // Generic fallback
    default: {
      try {
        return truncate(JSON.stringify(args));
      } catch {
        return "";
      }
    }
  }
}
