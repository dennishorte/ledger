import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { TaskStatusChip } from "@/components/tasks/TaskStatusChip";
import { useShellStore } from "@/stores/shell";
import { formatDuration, formatRelativeTime } from "@/lib/formatDuration";
import type { Task, ResourceClaim } from "@/lib/types";

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
 */
export function TaskInspector({
  task,
  allTasks,
}: TaskInspectorProps): JSX.Element {
  const openInspector = useShellStore.getState().openInspector;
  const now = Date.now();

  const parent = task.parentTaskId
    ? allTasks.find((t) => t.id === task.parentTaskId)
    : null;

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
