import type { JSX } from "react";

export function StatusBar(): JSX.Element {
  const version = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)] px-3 font-mono text-[11px] text-[color:var(--color-muted)]">
      <div className="flex items-center gap-3">
        <span>
          v<span className="tabular-nums">{version}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-faint)]"
        />
        <span>offline</span>
      </div>
    </footer>
  );
}
