import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { HealthScan } from "./useHealthScans.js";

async function postScan(): Promise<HealthScan> {
  const res = await fetch("/api/health/scan", { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/health/scan: ${res.status.toString()}`);
  return res.json() as Promise<HealthScan>;
}

export function useRunScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postScan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["health-scans"] });
    },
  });
}
