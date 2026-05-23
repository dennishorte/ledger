/**
 * TokenCostWidget — subtree cost table (Phase-1: all zeros / placeholder).
 *
 * Table headers and layout are production-ready; swapping in real data from
 * SubtreeCost[] requires no structural changes.
 * Spec: docs/01-ui/06-health.md §Design > Token Cost widget
 */

import type { JSX } from "react";
import type { SubtreeCost } from "@/lib/types";

interface TokenCostWidgetProps {
  subtreeCosts: SubtreeCost[];
}

export function TokenCostWidget({ subtreeCosts }: TokenCostWidgetProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {/* Phase-1 banner */}
      <p
        className="rounded border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-muted)",
          backgroundColor: "var(--color-surface-sunken)",
        }}
      >
        Token cost tracking requires the API server — not yet available.
      </p>

      {/* Cost table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-left font-mono text-[11px] uppercase tracking-wider"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-muted)",
              }}
            >
              <th className="pb-1.5 pr-3">Subtree</th>
              <th className="pb-1.5 pr-3 text-right">Input tokens</th>
              <th className="pb-1.5 pr-3 text-right">Output tokens</th>
              <th className="pb-1.5 text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {subtreeCosts.map((row) => (
              <tr
                key={row.subtreeRootId}
                className="border-b last:border-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                <td className="py-1.5 pr-3 font-mono text-xs text-[--color-fg]">
                  {row.subtreeRootId}
                </td>
                <td className="py-1.5 pr-3 text-right text-[--color-faint]">
                  {row.inputTokens !== null ? row.inputTokens.toLocaleString() : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right text-[--color-faint]">
                  {row.outputTokens !== null ? row.outputTokens.toLocaleString() : "—"}
                </td>
                <td className="py-1.5 text-right text-[--color-faint]">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
