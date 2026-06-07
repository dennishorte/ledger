import type { JSX } from "react";
import { Link } from "react-router";
import { useAlertStream } from "@/lib/useAlertStream";

/**
 * Always-mounted algedonic alert banner (08-alerts).
 *
 * Rendered by AppShell so a critical task failure surfaces on every route — the
 * push half of the algedonic channel (the operator no longer has to be looking
 * at the Tasks panel). Each alert links to the failed task's log stream and can
 * be dismissed for the session.
 */
export function AlertBanner(): JSX.Element | null {
  const { active, dismiss } = useAlertStream();

  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-4">
      {active.map((alert) => (
        <div
          key={alert.seq}
          role="alert"
          className="pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-md border border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)] px-4 py-3 shadow-md"
        >
          <span aria-hidden className="mt-0.5 text-[color:var(--color-danger)]">
            ⚠
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[color:var(--color-fg)]">
              Task failed — {alert.taskTitle}
            </div>
            {alert.reason !== "" && (
              <div className="mt-0.5 truncate text-xs text-[color:var(--color-muted)]" title={alert.reason}>
                {alert.reason}
              </div>
            )}
            <Link
              to={`/logs/${encodeURIComponent(alert.taskId)}`}
              className="mt-1 inline-block text-xs font-medium text-[color:var(--color-danger)] underline underline-offset-2"
            >
              View log
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              dismiss(alert.seq);
            }}
            aria-label="Dismiss alert"
            className="shrink-0 rounded px-1 text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
