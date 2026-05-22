import type { JSX } from "react";
import { X } from "lucide-react";
import { useShellStore } from "@/stores/shell";
import { cn } from "@/lib/cn";

export function Inspector(): JSX.Element {
  const open = useShellStore((s) => s.inspectorOpen);
  const content = useShellStore((s) => s.inspectorContent);
  const close = useShellStore((s) => s.closeInspector);

  return (
    <aside
      aria-hidden={!open}
      aria-label="Inspector"
      className={cn(
        "shrink-0 overflow-hidden border-l border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] transition-[width] duration-150 ease-out",
        open ? "w-[360px]" : "w-0",
      )}
    >
      {/* Inner wrapper sized to the open width so its contents don't reflow during the close transition. */}
      <div className="flex h-full w-[360px] flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
            Inspector
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close inspector"
            className="rounded-md p-1 text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-fg)]"
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 text-sm">
          {content ?? (
            <p className="text-[color:var(--color-muted)]">
              Nothing selected.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
