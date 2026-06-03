import { useState, type JSX } from "react";
import { useHealthScans, type HealthFinding } from "@/lib/useHealthScans";
import { useRunScan } from "@/lib/useRunScan";

const MONITOR_LABEL: Record<HealthFinding["monitor"], string> = {
  size: "size",
  staleness: "staleness",
  orphan: "orphan",
  schema_invalid: "schema",
};

function FindingsTable({ findings }: { findings: HealthFinding[] }): JSX.Element {
  if (findings.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-muted)" }}>
        No findings — all docs healthy.
      </p>
    );
  }
  return (
    <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          <th className="py-1 pr-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>
            monitor
          </th>
          <th className="py-1 pr-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>
            node
          </th>
          <th className="py-1 text-left font-semibold" style={{ color: "var(--color-muted)" }}>
            detail
          </th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--color-border-subtle, var(--color-border))" }}>
            <td className="py-1 pr-2 font-mono" style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
              {MONITOR_LABEL[f.monitor]}
            </td>
            <td className="py-1 pr-2 font-mono" style={{ whiteSpace: "nowrap" }}>
              {f.nodeId}
            </td>
            <td className="py-1" style={{ color: "var(--color-muted)" }}>
              {f.detail}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScanRow({
  scan,
  defaultOpen,
}: {
  scan: { id: string; scannedAt: string; findings: HealthFinding[] };
  defaultOpen: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const d = new Date(scan.scannedAt);
  const label = d.toLocaleString();
  const count = scan.findings.length;

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <button
        className="flex w-full items-center gap-2 py-2 text-left text-sm"
        onClick={() => { setOpen((v) => !v); }}
      >
        <span style={{ color: "var(--color-muted)", fontSize: "0.65rem" }}>
          {open ? "▾" : "▸"}
        </span>
        <span className="flex-1">{label}</span>
        <span
          className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
          style={{
            backgroundColor: count > 0 ? "var(--color-warning-soft, #fef3c7)" : "var(--color-surface-sunken)",
            color: "var(--color-muted)",
          }}
        >
          {count.toString()} finding{count !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="pb-3">
          <FindingsTable findings={scan.findings} />
        </div>
      )}
    </div>
  );
}

export function ScanHistoryWidget(): JSX.Element {
  const { data: scans, isLoading, error } = useHealthScans();
  const mutation = useRunScan();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          className="rounded px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: "var(--color-surface-sunken)",
            border: "1px solid var(--color-border)",
            color: mutation.isPending ? "var(--color-muted)" : "var(--color-text)",
            cursor: mutation.isPending ? "not-allowed" : "pointer",
          }}
          disabled={mutation.isPending}
          onClick={() => { mutation.mutate(); }}
        >
          {mutation.isPending ? "Scanning…" : "Run Scan"}
        </button>
        {mutation.error instanceof Error && (
          <span className="text-xs" style={{ color: "var(--color-danger, #dc2626)" }}>
            {mutation.error.message}
          </span>
        )}
      </div>

      {isLoading && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Loading scan history…
        </p>
      )}
      {error instanceof Error && (
        <p className="text-sm" style={{ color: "var(--color-danger, #dc2626)" }}>
          {error.message}
        </p>
      )}
      {scans !== undefined && scans.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          No scans yet. Run a scan to check doc health.
        </p>
      )}
      {scans !== undefined && scans.length > 0 && (
        <div>
          {scans.map((scan, i) => (
            <ScanRow key={scan.id} scan={scan} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
