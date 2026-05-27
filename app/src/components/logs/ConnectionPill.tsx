/**
 * ConnectionPill — visual indicator for the SSE connection state.
 *
 * Spec: 05-logs.md §Requirements R4 and §Design N1
 *
 * States:
 *   loading  — query pending; render neutral "Loading" (avoids red-pill flash on mount)
 *   live     — green dot + "Streaming"; with reconnect suffix when reconnectVisible = true
 *   ended    — muted dot + "Ended"
 *   missing  — red dot + "No transcript"
 *   stub     — muted + "Stub" (tests only)
 */

import type { JSX } from "react";
import type { ConnectionStatus } from "@/lib/types";

interface ConnectionPillProps {
  status: ConnectionStatus;
  /**
   * True only after an onerror has persisted for ≥ RECONNECT_VISIBLE_DELAY_MS.
   * Suppresses the "(reconnecting…)" flash during sub-threshold blips.
   */
  reconnectVisible: boolean;
  /** True when the TanStack Query for the task is still pending. */
  queryPending: boolean;
}

interface PillStyle {
  dot: string;
  label: string;
  suffix?: string;
}

function pillConfig(
  status: ConnectionStatus,
  reconnectVisible: boolean,
  queryPending: boolean,
): PillStyle {
  // N1: neutral loading state while query is pending
  if (queryPending) {
    return { dot: "var(--color-faint)", label: "Loading" };
  }

  switch (status) {
    case "live":
      return {
        dot: "var(--color-success)",
        label: "Streaming",
        suffix: reconnectVisible ? "(reconnecting…)" : undefined,
      };
    case "ended":
      return { dot: "var(--color-muted)", label: "Ended" };
    case "missing":
      return { dot: "var(--color-danger)", label: "No transcript" };
    case "stub":
      return { dot: "var(--color-muted)", label: "Stub" };
  }
}

export function ConnectionPill({
  status,
  reconnectVisible,
  queryPending,
}: ConnectionPillProps): JSX.Element {
  const { dot, label, suffix } = pillConfig(status, reconnectVisible, queryPending);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
      <span
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: dot }}
        aria-hidden
      />
      <span style={status === "live" && !queryPending ? { color: "var(--color-success)" } : undefined}>
        {label}
      </span>
      {suffix && (
        <span className="text-[color:var(--color-faint)]">{suffix}</span>
      )}
    </span>
  );
}
