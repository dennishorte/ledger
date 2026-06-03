import type { Store } from "../runner/store.js";
import type { HealthConfig } from "@ledger/parser";

export interface HealthFinding {
  monitor: "size" | "staleness" | "orphan" | "schema_invalid";
  nodeId: string;
  detail: string;
}

export interface HealthScan {
  id: string;
  scannedAt: string; // ISO 8601
  findings: HealthFinding[];
}

export interface HealthScannerHandle {
  runScan(): Promise<HealthScan>;
}

export interface ScannerContext {
  projectRoot: string;
  docsRoot: string;
  store: Store;
  config: HealthConfig;
}
