/**
 * Shared duration formatter.
 *
 * Introduced by 01-ui/04-tasks; also consumed by 01-ui/05-logs (D7).
 *
 * @param startedAt  - ISO 8601 string for the start time.
 * @param completedAt - ISO 8601 string for the end time, or undefined/null
 *                      if the task is still running.
 * @param now         - Reference timestamp (ms). Defaults to Date.now().
 *                      Accepting it as a parameter keeps the function pure
 *                      for tests.
 * @returns           A short human-readable string, e.g. "12m", "3s", "1h 4m",
 *                    or "—" when startedAt is absent.
 */
export function formatDuration(
  startedAt: string | undefined | null,
  completedAt: string | undefined | null,
  now: number = Date.now(),
): string {
  if (!startedAt) return "—";
  const start = Date.parse(startedAt);
  if (isNaN(start)) return "—";
  const end = completedAt ? Date.parse(completedAt) : now;
  if (isNaN(end)) return "—";
  const ms = Math.max(0, end - start);
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${String(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${String(minutes)}m ${String(seconds)}s` : `${String(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${String(hours)}h ${String(remainingMinutes)}m`
    : `${String(hours)}h`;
}

/**
 * Formats a timestamp as a human-readable relative time string,
 * e.g. "12m ago", "just now", "2h ago".
 *
 * @param isoString - ISO 8601 timestamp string.
 * @param now       - Reference timestamp (ms). Defaults to Date.now().
 * @returns         A relative time string or "—" if isoString is absent.
 */
export function formatRelativeTime(
  isoString: string | undefined | null,
  now: number = Date.now(),
): string {
  if (!isoString) return "—";
  const ts = Date.parse(isoString);
  if (isNaN(ts)) return "—";
  const diffMs = now - ts;
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${String(diffMinutes)}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${String(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${String(diffDays)}d ago`;
}
