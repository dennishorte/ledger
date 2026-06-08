import type { JSX } from "react";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { docValidationErrorPaths } from "@/lib/parseDocs";
import { projectMetadata } from "@/lib/project/loadProjectMetadata";
import { useProjectMetadata } from "@/lib/project/useProjectMetadata";

interface StatusChipProps {
  label: string;
  value: string;
}

function StatusChip({ label, value }: StatusChipProps): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-2 py-1 text-xs">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="font-mono tabular-nums text-[color:var(--color-fg)]">
        {value}
      </span>
    </div>
  );
}

export function Topbar(): JSX.Element {
  const liveMetadata = useProjectMetadata();
  const name = liveMetadata?.name ?? (projectMetadata.ok ? projectMetadata.metadata.name : "untitled project");
  const metadataFailed = !projectMetadata.ok && liveMetadata === null;
  const totalErrors = docValidationErrorPaths.length + (metadataFailed ? 1 : 0);
  const firstErrorPath = metadataFailed
    ? ".ledger/project.json"
    : docValidationErrorPaths[0];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-4">
      <div className="flex items-center gap-2">
        <div className="font-mono text-sm font-semibold tracking-tight">
          ledger
        </div>
        <span className="text-[color:var(--color-faint)]">/</span>
        <div className="text-sm text-[color:var(--color-muted)]">
          {name}
        </div>
        {import.meta.env.DEV && totalErrors > 0 && (
          <div
            className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
            title={firstErrorPath ?? ""}
          >
            <span>⚠</span>
            <span>
              {totalErrors} validation error{totalErrors > 1 ? "s" : ""}
              {totalErrors === 1 && firstErrorPath
                ? `: ${metadataFailed ? firstErrorPath : firstErrorPath.replace(/^.*\/docs\//, "")}`
                : ""}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <StatusChip label="queue" value="—" />
        <StatusChip label="in-flight" value="—" />
        <StatusChip label="issues" value="—" />
        <Button
          variant="outline"
          size="sm"
          disabled
          aria-label="Open command palette (not yet implemented)"
          title="Command palette — coming soon"
        >
          <Command className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[color:var(--color-muted)]">
            <kbd className="font-mono">⌘K</kbd>
          </span>
        </Button>
      </div>
    </header>
  );
}
