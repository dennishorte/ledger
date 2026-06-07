import { parseDocNode, validateDocNode } from "@ledger/parser";
import { readDocsTree } from "../readDocs.js";
import { checkSize, checkOrphans } from "./monitors.js";
import type { HealthScan, HealthFinding, HealthScannerHandle, ScannerContext } from "./types.js";

export type { HealthScan, HealthFinding, HealthScannerHandle, ScannerContext } from "./types.js";

function newScanId(): string {
  return crypto.randomUUID();
}

export function createHealthScanner(ctx: ScannerContext): HealthScannerHandle {
  async function runScan(): Promise<HealthScan> {
    const findings: HealthFinding[] = [];

    const rawDocs = await readDocsTree(ctx.docsRoot);

    for (const [relKey, content] of Object.entries(rawDocs)) {
      // Per-doc isolation: any failure (parse, validate, or a monitor) is logged
      // and skipped so a single bad file never aborts the whole scan (spec hard
      // constraint). `continue` inside the try is fine — it does not trip the catch.
      try {
        const parsed = parseDocNode(relKey, content);

        // parseDocNode returns null for out-of-scope paths (underscore-prefixed folders, parent docs)
        if (parsed === null) continue;

        const result = validateDocNode(parsed);
        if (!result.ok) {
          const nodeId = relKey.replace(/\.md$/, "");
          const errorDetail = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
          findings.push({ monitor: "schema_invalid", nodeId, detail: errorDetail });
          continue;
        }

        const doc = result.node;

        const sizeFinding = checkSize(doc, content, ctx.config.sizeThresholdTokens);
        if (sizeFinding !== null) findings.push(sizeFinding);

        const orphanFinding = checkOrphans(doc, ctx.config.orphanThresholdDays);
        if (orphanFinding !== null) findings.push(orphanFinding);
      } catch (err) {
        console.warn(`[scanner] monitor error for ${relKey}; skipping:`, (err as Error).message);
        continue;
      }
    }

    const scan: HealthScan = {
      id: newScanId(),
      scannedAt: new Date().toISOString(),
      findings,
    };

    ctx.store.insertScan(scan);
    console.log(`[scanner] scan complete: ${findings.length.toString()} finding(s)`);
    return scan;
  }

  return { runScan };
}
