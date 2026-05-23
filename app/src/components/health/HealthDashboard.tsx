/**
 * HealthDashboard — 2×2 CSS grid of four health widgets.
 *
 * Card chrome: 1px --color-border border, rounded, cream background, p-4.
 * Grid: 2 columns at md+ breakpoint, single column on smaller viewports.
 * Spec: docs/01-ui/06-health.md §Design > Layout
 */

import type { JSX } from "react";
import type { HealthData } from "./useHealthData";
import { IssueRollupWidget } from "./IssueRollupWidget";
import { StalenessWidget } from "./StalenessWidget";
import { TokenCostWidget } from "./TokenCostWidget";
import { DepImpactWidget } from "./DepImpactWidget";

interface HealthDashboardProps {
  data: HealthData;
}

interface WidgetCardProps {
  title: string;
  badge?: string;
  children: React.ReactNode;
}

function WidgetCard({ title, badge, children }: WidgetCardProps): JSX.Element {
  return (
    <div
      className="flex flex-col gap-3 overflow-hidden rounded-md p-4"
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface-raised)",
        minHeight: "16rem",
      }}
    >
      {/* Card header */}
      <div className="flex items-center gap-2">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-muted)" }}
        >
          {title}
        </h2>
        {badge !== undefined && (
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              backgroundColor: "var(--color-surface-sunken)",
              color: "var(--color-muted)",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {/* Card content — scrollable */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export function HealthDashboard({ data }: HealthDashboardProps): JSX.Element {
  const authoredNodeIds = data.nodes
    .filter((n) => n.authored)
    .map((n) => n.id)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <WidgetCard
        title="Open Issues"
        badge={String(data.issues.length)}
      >
        <IssueRollupWidget issues={data.issues} nodeIds={authoredNodeIds} />
      </WidgetCard>

      <WidgetCard
        title="Staleness"
        badge={data.staleness.length > 0 ? String(data.staleness.length) : undefined}
      >
        <StalenessWidget staleness={data.staleness} nodes={data.nodes} />
      </WidgetCard>

      <WidgetCard title="Token Cost">
        <TokenCostWidget subtreeCosts={data.subtreeCosts} />
      </WidgetCard>

      <WidgetCard title="Dep-Impact Preview">
        <DepImpactWidget nodes={data.nodes} />
      </WidgetCard>
    </div>
  );
}
