import type { JSX } from "react";
import { Network } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { useShellStore } from "@/stores/shell";

export default function DagPanel(): JSX.Element {
  const openInspector = useShellStore((s) => s.openInspector);

  return (
    <EmptyState
      icon={Network}
      title="No tasks yet."
      description="The DAG appears here once tasks are enqueued."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            openInspector(
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
                  Debug
                </div>
                <p className="text-[color:var(--color-fg)]">
                  Inspector content is owned by the shell store. Press{" "}
                  <kbd className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)] px-1 font-mono text-[11px]">
                    Esc
                  </kbd>{" "}
                  or click the X to close.
                </p>
              </div>,
            );
          }}
        >
          Open inspector
        </Button>
      }
    />
  );
}
