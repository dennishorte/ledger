import { useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { TaskStatusChip } from "@/components/tasks/TaskStatusChip";
import { useShellStore } from "@/stores/shell";
import { formatDuration, formatRelativeTime } from "@/lib/formatDuration";
import { useTask } from "@/lib/useTask";
import { useApproveTask } from "@/lib/useApproveTask";
import { useRejectTask } from "@/lib/useRejectTask";
import { useCancelTask } from "@/lib/useCancelTask";
import { cn } from "@/lib/cn";
import type { Task, TaskType, ResourceClaim } from "@/lib/types";
import type { MutationErrorBody } from "@/lib/errors";

interface TaskInspectorProps {
  task: Task;
  allTasks: Task[];
}

/**
 * Inspector content for a selected task.
 *
 * Pattern mirrors NodeInspector (02-dag): opened via useShellStore.openInspector().
 * The "Parent task [open]" button calls openInspector again to swap content.
 * Per 04-tasks S1 / D8 — pure shell-store update, no navigation.
 *
 * 05-ui-hook-migration additions:
 * - Calls useTask(taskProp.id) internally for live data + events.
 * - Renders Status reason row from latest status_change event's reason field.
 * - Renders Approve/Reject buttons for runner-emitted AWAITING_HUMAN_REVIEW tasks.
 */
export function TaskInspector({
  task: taskProp,
  allTasks,
}: TaskInspectorProps): JSX.Element {
  const openInspector = useShellStore.getState().openInspector;
  const now = Date.now();

  // Live task + events from the GET /:id endpoint (runner OR transcript,
  // by id-format discrimination — see useTask). The prop is the fallback
  // until the query resolves.
  const taskQuery = useTask(taskProp.id);
  const live = taskQuery.data;
  const task = live?.task ?? taskProp;
  const liveEvents = live?.events;

  const parent = task.parentTaskId
    ? allTasks.find((t) => t.id === task.parentTaskId)
    : null;

  // Latest status_change event's `reason` field, if any. Parent §Status
  // reasons enumerates the canonical values (blocked_by_dep:<id>, …).
  // Use liveEvents directly in the dep array (not `liveEvents ?? []`) to
  // avoid a new [] reference on every render triggering unnecessary recomputes.
  const latestStatusReason = useMemo<string | undefined>(() => {
    const events = liveEvents ?? [];
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev !== undefined && ev.kind === "status_change" && ev.reason !== undefined) {
        return ev.reason;
      }
    }
    return undefined;
  }, [liveEvents]);

  // Approve/Reject gating: runner-emitted ∧ AWAITING_HUMAN_REVIEW.
  // `transcriptPath === undefined` is the discriminant per parent §Type
  // coordination. Use the *live* task status so a successful mutation's
  // invalidation removes the buttons on next render without a manual close.
  // Spec Review S3: gating on `live?.task.status` (not `taskProp.status`)
  // ensures the buttons only render when the query has resolved — so the
  // `task` reference inside <HitlActions> is always the live task with a
  // fresh dbRowVersion, never the closed-over prop. Invariant pinned here.
  const isRunnerEmitted = task.transcriptPath === undefined;
  const showHitlButtons =
    isRunnerEmitted && live?.task.status === "AWAITING_HUMAN_REVIEW";

  // Cancel button gating: runner-emitted ∧ live status is cancellable
  // (RUNNING, BLOCKED, or PENDING). BLOCKED/PENDING have no subprocess;
  // the server handles them with a direct status transition.
  const cancellableStatus =
    live?.task.status === "RUNNING" ||
    live?.task.status === "BLOCKED" ||
    live?.task.status === "PENDING";
  const showCancelButton = isRunnerEmitted && cancellableStatus;

  // "task no longer found" branch (404 from the right endpoint — D2).
  if (taskQuery.status === "success" && live === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-xs text-[color:var(--color-muted)]">
          Task no longer found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
          Task
        </div>
        <div className="mt-1 flex items-start justify-between gap-2">
          <span
            className="font-mono text-[11px] text-[color:var(--color-muted)] break-all"
            title={task.id}
          >
            {task.id}
          </span>
          <TaskStatusChip status={task.status} />
        </div>
        <div className="mt-1 text-sm text-[color:var(--color-fg)]">
          {task.title}
        </div>
      </div>

      {/* Type */}
      <Field label="Type">
        <span className="font-mono text-xs text-[color:var(--color-fg)]">
          {task.type}
        </span>
      </Field>

      {/* Source */}
      <Field label="Source">
        <span className="font-mono text-xs text-[color:var(--color-fg)]">
          {task.source}
        </span>
      </Field>

      {/* Agent */}
      {task.agent && (
        <Field label="Agent">
          <span className="text-xs text-[color:var(--color-fg)]">
            {task.agent.model}
            {task.agent.persona ? (
              <span className="text-[color:var(--color-muted)]">
                {" · persona: "}
                {task.agent.persona}
              </span>
            ) : null}
          </span>
        </Field>
      )}

      {/* Parent task */}
      <Field label="Parent task">
        {parent ? (
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-[11px] text-[color:var(--color-fg)] truncate"
              title={parent.id}
            >
              {parent.id}
            </span>
            <button
              type="button"
              className="shrink-0 rounded border border-[color:var(--color-border-strong)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)]"
              onClick={() => {
                openInspector(<TaskInspector task={parent} allTasks={allTasks} />);
              }}
            >
              open
            </button>
          </div>
        ) : (
          <span className="text-xs text-[color:var(--color-muted)]">—</span>
        )}
      </Field>

      {/* Depends on */}
      <Field label={`Depends on (${String(task.dependsOn.length)})`}>
        {task.dependsOn.length === 0 ? (
          <span className="text-xs text-[color:var(--color-muted)]">—</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {task.dependsOn.map((depId) => (
              <li key={depId}>
                <span className="font-mono text-[11px] text-[color:var(--color-fg)] break-all">
                  {depId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Field>

      {/* Resource claims */}
      <Field label={`Resource claims (${String(task.resourceClaims.length)})`}>
        {task.resourceClaims.length === 0 ? (
          <span className="text-xs text-[color:var(--color-muted)]">—</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {task.resourceClaims.map((claim, i) => (
              <li key={i} className="flex items-start gap-1 text-xs">
                <span className="text-[color:var(--color-muted)] shrink-0">•</span>
                <ClaimDisplay claim={claim} />
              </li>
            ))}
          </ul>
        )}
      </Field>

      {/* Status reason — intentionally shows the 80-char truncated form from
          status_change.reason (per 03-hitl-gate D4/reasons.rejected). The full
          untruncated rejection rationale is in the kind="error" detail event,
          which renders in the LogStream panel's ErrorRow. Do NOT switch this to
          read the detail event stack — the truncated form is the row-level summary;
          the full text belongs in the log stream view. */}
      {latestStatusReason !== undefined && (
        <Field label="Status reason">
          <span className="text-xs text-[color:var(--color-fg)] break-all">
            {latestStatusReason}
          </span>
        </Field>
      )}

      {/* Timing */}
      <Field label="Timing">
        <div className="flex flex-col gap-0.5 text-xs">
          <TimingRow label="Created" value={formatRelativeTime(task.createdAt, now)} />
          <TimingRow label="Started" value={formatRelativeTime(task.startedAt, now)} />
          <TimingRow label="Completed" value={formatRelativeTime(task.completedAt, now)} />
          <TimingRow
            label="Duration"
            value={formatDuration(task.startedAt, task.completedAt, now)}
          />
        </div>
      </Field>

      {/* HITL buttons — above the Open log stream link.
          Only rendered when runner-emitted ∧ live status === AWAITING_HUMAN_REVIEW.
          When showHitlButtons is true, `task` is guaranteed to be the live task
          (not the prop fallback) because gating requires live?.task.status. */}
      {showHitlButtons && <HitlActions task={task} />}

      {/* Cancel button — only rendered when runner-emitted ∧ live status === RUNNING.
          D9: visibility does not filter by task type — 409 no_subprocess is the
          documented edge case for noop tasks. */}
      {showCancelButton && <CancelAction taskId={task.id} />}

      {/* Open log stream */}
      <Link
        to={`/logs/${encodeURIComponent(task.id)}`}
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent-fg)] hover:opacity-90"
      >
        Open log stream
        <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CancelAction — Cancel button for RUNNING runner-emitted tasks.
// D9: visibility does not distinguish noop — the 409 no_subprocess path is the
// documented edge case. The inline banner surfaces it clearly.
// ---------------------------------------------------------------------------

function CancelAction({ taskId }: { taskId: string }): JSX.Element {
  const cancel = useCancelTask();

  const banner = cancelErrorBanner(cancel.error);

  return (
    <div className="flex flex-col gap-2">
      {banner !== null && (
        <div className="rounded border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-2 py-1 text-xs">
          {banner}
        </div>
      )}
      <button
        type="button"
        disabled={cancel.isPending}
        onClick={() => { cancel.mutate({ taskId }); }}
        className="inline-flex items-center self-start rounded-md border border-[color:var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
      >
        {cancel.isPending ? "Cancelling…" : "Cancel task"}
      </button>
    </div>
  );
}

function cancelErrorBanner(err: unknown): string | null {
  if (err === null || err === undefined) return null;
  const e = err as MutationErrorBody;
  const body = e.body as { error?: string; taskType?: string } | undefined;
  if (e.status === 409 && body?.error === "no_subprocess") {
    return `Task is RUNNING but no subprocess to cancel (type: ${body.taskType ?? "unknown"}). Was it noop?`;
  }
  if (e.status === 409 && body?.error === "wrong_status") {
    return "Task can no longer be cancelled — it may have already completed or transitioned.";
  }
  return `Cancel failed (HTTP ${String(e.status)}).`;
}

// ---------------------------------------------------------------------------
// HitlActions — Approve / Reject buttons for AWAITING_HUMAN_REVIEW tasks.
// Sibling component in the same file (single inspector concern — spec D11 pattern).
// ---------------------------------------------------------------------------

// DispatchableTaskType is defined BEFORE the state declaration (not after) to
// avoid a TypeScript forward-reference error — the type alias must be in scope
// before the useState generic uses it.
// DispatchableTaskType = Exclude<TaskType, "noop" | "human_review" | "operator_session">
// Not exported (scoped to this UI concern only).
type DispatchableTaskType = Exclude<
  TaskType,
  "noop" | "human_review" | "operator_session"
>;

const DISPATCHABLE_TYPES: DispatchableTaskType[] = [
  "agent_task",
  "implement",
  "spec_review",
  "spec_draft",
  "doc_refactor",
  "doc_decompose",
  "issue_triage",
  "verify",
  "reverify",
  "project_status_review",
];

function HitlActions({ task }: { task: Task }): JSX.Element {
  const approve = useApproveTask();
  const reject = useRejectTask();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  // "Queue follow-up task" toggle — undefined means toggle off.
  const [followUpData, setFollowUpData] = useState<
    { title: string; type: DispatchableTaskType } | undefined
  >(undefined);

  // The most recent error from either mutation, for the 409 banner.
  const lastError = reject.error ?? approve.error;
  const banner = errorBanner(lastError);

  return (
    <div className="flex flex-col gap-2">
      {banner !== null && (
        <div
          className={cn(
            "rounded border px-2 py-1 text-xs",
            banner.tone === "conflict"
              ? "border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)]"
              : "border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)]",
          )}
        >
          {banner.text}
        </div>
      )}

      {!rejectOpen ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={approve.isPending}
              onClick={() => {
                approve.mutate({
                  taskId: task.id,
                  dbRowVersion: task.dbRowVersion,
                  ...(note.length > 0 ? { note } : {}),
                });
              }}
              className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50"
            >
              {approve.isPending ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={reject.isPending}
              onClick={() => { setRejectOpen(true); }}
              className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
            >
              Reject…
            </button>
          </div>

          {/* Optional approve note — collapsed by default (D11). */}
          <NoteAffordance
            noteOpen={noteOpen}
            note={note}
            setNoteOpen={setNoteOpen}
            setNote={setNote}
          />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); }}
            placeholder="Rejection rationale (required)"
            className="min-h-20 max-h-40 resize-y rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-fg)]"
            aria-label="Rejection rationale"
          />

          {/* "Queue follow-up task" toggle — collapsed by default. */}
          <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-fg)] select-none cursor-pointer">
            <input
              type="checkbox"
              checked={followUpData !== undefined}
              onChange={(e) => {
                if (e.target.checked) {
                  setFollowUpData({ title: "", type: "agent_task" });
                } else {
                  setFollowUpData(undefined);
                }
              }}
              aria-label="Queue follow-up task"
            />
            Queue follow-up task
          </label>

          {followUpData !== undefined && (
            <div className="flex flex-col gap-1.5 pl-5">
              <input
                type="text"
                value={followUpData.title}
                onChange={(e) => {
                  setFollowUpData({ ...followUpData, title: e.target.value });
                }}
                placeholder="Follow-up task title (required)"
                className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-fg)]"
                aria-label="Follow-up task title"
              />
              <select
                value={followUpData.type}
                onChange={(e) => {
                  setFollowUpData({
                    ...followUpData,
                    type: e.target.value as DispatchableTaskType,
                  });
                }}
                className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-fg)]"
                aria-label="Follow-up task type"
              >
                {DISPATCHABLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={
                reason.trim().length === 0 ||
                reject.isPending ||
                (followUpData !== undefined && followUpData.title.trim().length === 0)
              }
              onClick={() => {
                reject.mutate({
                  taskId: task.id,
                  dbRowVersion: task.dbRowVersion,
                  reason: reason.trim(),
                  ...(followUpData !== undefined && followUpData.title.trim().length > 0
                    ? { followUp: { type: followUpData.type, title: followUpData.title.trim() } }
                    : {}),
                });
              }}
              className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-danger-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:opacity-90 disabled:opacity-50"
            >
              {reject.isPending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectOpen(false);
                setReason("");
                setFollowUpData(undefined);
              }}
              className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteAffordance — "Add note" link that reveals a single-line input for the
// optional approve note (D11: collapsed by default, not in the way).
// ---------------------------------------------------------------------------

function NoteAffordance({
  noteOpen,
  note,
  setNoteOpen,
  setNote,
}: {
  noteOpen: boolean;
  note: string;
  setNoteOpen: (v: boolean) => void;
  setNote: (v: string) => void;
}): JSX.Element {
  if (!noteOpen) {
    return (
      <button
        type="button"
        onClick={() => { setNoteOpen(true); }}
        className="self-start text-[10px] text-[color:var(--color-muted)] underline hover:text-[color:var(--color-fg)]"
      >
        Add note
      </button>
    );
  }
  return (
    <input
      type="text"
      value={note}
      onChange={(e) => { setNote(e.target.value); }}
      placeholder="Optional approval note"
      className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-fg)]"
      aria-label="Approval note"
    />
  );
}

// ---------------------------------------------------------------------------
// errorBanner — maps a mutation error to a banner tone + text, or null.
// ---------------------------------------------------------------------------

function errorBanner(
  err: unknown,
): { tone: "conflict" | "generic"; text: string } | null {
  if (err === null || err === undefined) return null;
  const e = err as { status?: number; body?: { error?: string } };
  if (e.status === 409) {
    if (e.body?.error === "version_conflict") {
      return {
        tone: "conflict",
        text: "This task was updated elsewhere — please refresh.",
      };
    }
    if (e.body?.error === "wrong_status") {
      return {
        tone: "conflict",
        text: "Task is no longer awaiting review.",
      };
    }
  }
  return { tone: "generic", text: "Action failed — see browser console." };
}

// ---------------------------------------------------------------------------
// Field / TimingRow / ClaimDisplay — unchanged layout helpers.
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TimingRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="font-mono text-[color:var(--color-fg)]">{value}</span>
    </div>
  );
}

function ClaimDisplay({ claim }: { claim: ResourceClaim }): JSX.Element {
  if (claim.kind === "node") {
    return (
      <span>
        <span className="font-mono text-[color:var(--color-fg)]">
          {claim.nodeId}
        </span>
        <span className="text-[color:var(--color-muted)]">
          {" "}({claim.mode})
        </span>
      </span>
    );
  }
  return (
    <span
      className="font-mono text-[color:var(--color-fg)] break-all"
      title={claim.path}
    >
      {claim.path}
      <span className="text-[color:var(--color-muted)]">
        {" "}({claim.mode})
      </span>
    </span>
  );
}
