import { useQuery } from "@tanstack/react-query";

export interface HealthFinding {
  monitor: "size" | "open_issue" | "schema_invalid";
  nodeId: string;
  detail: string;
}

export interface HealthScan {
  id: string;
  scannedAt: string;
  findings: HealthFinding[];
}

async function fetchScans(): Promise<HealthScan[]> {
  const res = await fetch("/api/health/scans");
  if (!res.ok) throw new Error(`GET /api/health/scans: ${res.status.toString()}`);
  return res.json() as Promise<HealthScan[]>;
}

export function useHealthScans() {
  return useQuery({ queryKey: ["health-scans"], queryFn: fetchScans });
}
