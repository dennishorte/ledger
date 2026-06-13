import { useState, type JSX } from "react";
import { useHealthScans, type HealthFinding } from "@/lib/useHealthScans";
import { useRunScan } from "@/lib/useRunScan";
import { useDispatch } from "@/lib/useDispatch";
import { MutationErrorBody } from "@/lib/errors";

const MONITOR_LABEL: Record<HealthFinding["monitor"], string> = {
  size: "size",
  open_issue: "open issue",
  schema_invalid: "schema",
};

// ---------------------------------------------------------------------------
// FindingRow — one <tr> per finding; owns per-row dispatch state for size findings.
// ---------------------------------------------------------------------------

function FindingRow({ finding }: { finding: HealthFinding }): JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const dispatch = useDispatch();

  const isSize = finding.monitor === "size";

  function handleConfirm(): void {
    dispatch.mutate(
      { nodeId: finding.nodeId, type: "doc_decompose" },
      {
        onSuccess: (data) => {
          setConfirmOpen(false);
          setBanner({ kind: "ok", text: `Dispatched ${data.task.id.slice(0, 8)}…` });
        },
        onError: (e) => {
          setConfirmOpen(false);
          setBanner({
            kind: "err",
            text:
              e instanceof MutationErrorBody
                ? `Dispatch failed (HTTP ${String(e.status)}).`
                : "Dispatch failed.",
          });
        },
      },
    );
  }

  return (
    <>
      {confirmOpen && (
        <RefactorConfirmDialog
          nodeId={finding.nodeId}
          isPending={dispatch.isPending}
          onCancel={() => { setConfirmOpen(false); }}
          onConfirm={handleConfirm}
        />
      )}
      <tr style={{ borderBottom: "1px solid var(--color-border-subtle, var(--color-border))" }}>
        <td className="py-1 pr-2 font-mono" style={{ color: "var(--color-muted)", whiteSpace: "nowrap" }}>
          {MONITOR_LABEL[finding.monitor]}
        </td>
        <td className="py-1 pr-2 font-mono" style={{ whiteSpace: "nowrap" }}>
          {finding.nodeId}
        </td>
        <td className="py-1" style={{ color: "var(--color-muted)" }}>
          {finding.detail}
        </td>
        <td className="py-1 pl-2 text-right" style={{ whiteSpace: "nowrap" }}>
          {isSize && banner === null && (
            <button
              type="button"
              className="rounded px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "var(--color-surface-sunken)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
              onClick={() => { setConfirmOpen(true); }}
            >
              Decompose
            </button>
          )}
          {isSize && banner !== null && (
            <span
              className="text-[10px]"
              style={{ color: banner.kind === "ok" ? "var(--color-muted)" : "var(--color-danger, #dc2626)" }}
            >
              {banner.text}
            </span>
          )}
        </td>
      </tr>
    </>
  );
}

// ---------------------------------------------------------------------------
// FindingsTable — renders the findings for one scan.
// ---------------------------------------------------------------------------

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
          <th className="py-1 pl-2 text-right font-semibold" style={{ color: "var(--color-muted)" }}>
            action
          </th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f, i) => (
          <FindingRow key={i} finding={f} />
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// ScanRow — collapsible row showing one scan's timestamp + finding count.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ScanHistoryWidget — exported panel section.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// RefactorConfirmDialog — inlined (single use site).
// ---------------------------------------------------------------------------

function RefactorConfirmDialog({
  nodeId,
  isPending,
  onCancel,
  onConfirm,
}: {
  nodeId: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm refactor dispatch"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
    >
      <div className="flex w-80 flex-col gap-4 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-4 shadow-lg">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
            Confirm dispatch
          </div>
          <div className="mt-1 font-mono text-sm text-[color:var(--color-fg)]">
            {nodeId}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
            Task type
          </div>
          <div className="mt-1 font-mono text-xs text-[color:var(--color-fg)]">
            doc_decompose
          </div>
        </div>

        <p className="text-xs text-[color:var(--color-muted)]">
          The agent will propose changes to this doc. You&apos;ll review them at the HITL gate before anything is written.
        </p>

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
