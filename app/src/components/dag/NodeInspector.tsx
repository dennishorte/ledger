import { useState } from "react";
import type { JSX } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { StatusChip } from "@/components/ui/StatusChip";
import { WorkflowProgressSection } from "@/components/dag/WorkflowProgressSection";
import { useDispatch } from "@/lib/useDispatch";
import { defaultResourceClaims } from "@/lib/types";
import type { DocNode, NodeStatus, TaskType, ResourceClaim } from "@/lib/types";
import type { MutationErrorBody } from "@/lib/errors";

// Statuses for which the Dispatch button is shown (authored-only check applied separately).
const DISPATCHABLE_STATUSES = new Set<NodeStatus>(["APPROVED", "VERIFY", "DRAFT"]);

// Maps a dispatchable node status to the inferred task type shown in the dialog.
function inferTaskType(status: NodeStatus): TaskType | undefined {
  if (status === "APPROVED") return "implement";
  if (status === "VERIFY") return "verify";
  if (status === "DRAFT") return "spec_review";
  return undefined;
}

interface NodeInspectorProps {
  node: DocNode;
  allNodes: DocNode[];
}

export function NodeInspector({ node, allNodes }: NodeInspectorProps): JSX.Element {
  const parent = allNodes.find((n) => n.id === node.parentId) ?? null;
  const children = allNodes.filter((n) => n.parentId === node.id);
  const blockers = node.dependsOn
    .map((id) => allNodes.find((n) => n.id === id))
    .filter((n): n is DocNode => n !== undefined);

  const dispatch = useDispatch();
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [dispatchBanner, setDispatchBanner] = useState<string | null>(null);
  const [dispatchedTaskId, setDispatchedTaskId] = useState<string | null>(null);

  const showDispatchButton = node.authored && DISPATCHABLE_STATUSES.has(node.status);
  const inferredType = inferTaskType(node.status);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
          Node
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-sm text-[color:var(--color-fg)]">
            {node.id}
          </span>
          <StatusChip status={node.status} />
        </div>
        <div className="mt-1 text-sm text-[color:var(--color-fg)]">
          {node.title}
        </div>
        {!node.authored && (
          <div className="mt-1 text-xs italic text-[color:var(--color-muted)]">
            Manifest-only — no authored doc yet.
          </div>
        )}
      </div>

      <Field label="Parent">
        {parent ? (
          <span className="font-mono text-xs text-[color:var(--color-fg)]">
            {parent.id}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--color-muted)]">
            (project root)
          </span>
        )}
      </Field>

      <Field label="Depends on">
        {blockers.length === 0 ? (
          <span className="text-xs text-[color:var(--color-muted)]">—</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {blockers.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-mono text-xs text-[color:var(--color-fg)]">
                  {b.id}
                </span>
                <StatusChip status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label={`Children (${String(children.length)})`}>
        {children.length === 0 ? (
          <span className="text-xs text-[color:var(--color-muted)]">—</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {children.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-mono text-xs text-[color:var(--color-fg)]">
                  {c.id}
                </span>
                <StatusChip status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Field>

      {node.authored && (
        <Link
          to={`/docs/${encodeURIComponent(node.id)}`}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-[color:var(--color-border-strong)] px-2 py-1 text-xs text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)]"
        >
          Open document
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      )}

      {/* Dispatch button — visibility: authored ∧ status ∈ {APPROVED, VERIFY, DRAFT} (N3) */}
      {showDispatchButton && (
        <button
          type="button"
          onClick={() => {
            setDispatchBanner(null);
            setDispatchedTaskId(null);
            setShowDispatchDialog(true);
          }}
          className="inline-flex items-center self-start rounded-md border border-[color:var(--color-border-strong)] px-2 py-1 text-xs text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)]"
        >
          Dispatch
        </button>
      )}

      {/* Success/error inline banner (N4 — inline-banner pattern, no toast library required) */}
      {dispatchBanner !== null && (
        <div className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-fg)]">
          {dispatchedTaskId !== null ? (
            <Link to={`/logs/${dispatchedTaskId}`}>{dispatchBanner}</Link>
          ) : (
            dispatchBanner
          )}
        </div>
      )}

      {/* Confirmation dialog — inlined per D8 (~50 LOC, single use site) */}
      {showDispatchDialog && inferredType !== undefined && (
        <DispatchConfirmDialog
          node={node}
          inferredType={inferredType}
          defaultClaims={defaultResourceClaims({
            id: node.id,
            type: inferredType,
            parentTaskId: undefined,
          })}
          isPending={dispatch.isPending}
          onCancel={() => { setShowDispatchDialog(false); }}
          onConfirm={() => {
            dispatch.mutate(
              { nodeId: node.id },
              {
                onSuccess: (data) => {
                  setShowDispatchDialog(false);
                  setDispatchBanner(`Dispatched as task ${data.task.id.slice(0, 8)}…`);
                  setDispatchedTaskId(data.task.id);
                },
                onError: (err) => {
                  setShowDispatchDialog(false);
                  setDispatchedTaskId(null);
                  const e = err as MutationErrorBody;
                  const body = e.body as { error?: string; hint?: string } | undefined;
                  setDispatchBanner(
                    body?.error === "no_inferred_type" && body.hint !== undefined
                      ? body.hint
                      : `Dispatch failed (HTTP ${String(e.status)}).`,
                  );
                },
              },
            );
          }}
        />
      )}

      <WorkflowProgressSection node={node} allNodes={allNodes} />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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

// ---------------------------------------------------------------------------
// DispatchConfirmDialog — inlined per D8 (single use site, ~50 LOC).
// Shows: node id + inferred task type + default resource claims.
// Confirm → onConfirm(); Cancel → onCancel().
// ---------------------------------------------------------------------------

function DispatchConfirmDialog({
  node,
  inferredType,
  defaultClaims,
  isPending,
  onCancel,
  onConfirm,
}: {
  node: DocNode;
  inferredType: TaskType;
  defaultClaims: ResourceClaim[];
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm dispatch"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
    >
      <div className="flex w-80 flex-col gap-4 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-4 shadow-lg">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
            Confirm dispatch
          </div>
          <div className="mt-1 font-mono text-sm text-[color:var(--color-fg)]">
            {node.id}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
            Task type
          </div>
          <div className="mt-1 font-mono text-xs text-[color:var(--color-fg)]">
            {inferredType}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
            Resource claims
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {defaultClaims.map((c, i) => (
              <li key={i} className="text-xs text-[color:var(--color-fg)]">
                {c.kind === "node"
                  ? `${c.nodeId} (${c.mode})`
                  : `${c.path} (${c.mode})`}
              </li>
            ))}
            {defaultClaims.length === 0 && (
              <li className="text-xs text-[color:var(--color-muted)]">—</li>
            )}
          </ul>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Dispatching…" : "Confirm"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
