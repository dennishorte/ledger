import type { JSX } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { StatusChip } from "@/components/dag/StatusChip";
import { WorkflowProgressSection } from "@/components/dag/WorkflowProgressSection";
import type { DocNode } from "@/lib/types";

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
