import path from "node:path";
import { parseDocNode, validateDocNode } from "@ledger/parser";
import { readDocsTree } from "../readDocs.js";
import { checkSize, checkStaleness, checkOrphans } from "./monitors.js";
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
      let parsed: unknown;
      try {
        parsed = parseDocNode(relKey, content);
      } catch (err) {
        console.warn(`[scanner] parseDocNode failed for ${relKey}:`, (err as Error).message);
        continue;
      }

      // parseDocNode returns null for out-of-scope paths (process/, _schemas/, parent docs)
      if (parsed === null) continue;

      const result = validateDocNode(parsed);
      if (!result.ok) {
        const nodeId = relKey.replace(/\.md$/, "");
        const errorDetail = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
        findings.push({ monitor: "schema_invalid", nodeId, detail: errorDetail });
        continue;
      }

      const doc = result.node;
      const absFilePath = path.join(ctx.docsRoot, relKey);

      const sizeFinding = checkSize(doc, content, ctx.config.sizeThresholdTokens);
      if (sizeFinding !== null) findings.push(sizeFinding);

      try {
        const stalenessFinding = await checkStaleness(
          doc,
          absFilePath,
          ctx.projectRoot,
          ctx.config.stalenessGraceDays,
        );
        if (stalenessFinding !== null) findings.push(stalenessFinding);
      } catch (err) {
        console.warn(`[scanner] checkStaleness failed for ${doc.nodeId}:`, (err as Error).message);
      }

      const orphanFinding = checkOrphans(doc, ctx.config.orphanThresholdDays);
      if (orphanFinding !== null) findings.push(orphanFinding);
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
