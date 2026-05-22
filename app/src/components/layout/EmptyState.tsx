import type { JSX, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/**
 * Reusable empty / loading / error fallback per 01-shell.md D4.
 *
 * Kept stateless and presentational: caller controls icon, copy, and actions.
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center p-8",
        className,
      )}
    >
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        {Icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-muted)]">
            <Icon className="h-5 w-5" aria-hidden strokeWidth={1.5} />
          </div>
        )}
        <h2 className="text-base font-medium text-[color:var(--color-fg)]">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[color:var(--color-muted)]">
            {description}
          </p>
        )}
        {actions && <div className="mt-2 flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
