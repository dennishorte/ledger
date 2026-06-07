/**
 * S1 regression: a monitor that throws on one doc must not abort the whole scan.
 *
 * The spec's hard constraint — "a single bad file never aborts a scan" — was
 * violated pre-fix because only parseDocNode was wrapped in try/catch; a throw
 * from validateDocNode or a monitor propagated and rejected runScan. This file
 * mocks checkSize to throw and asserts the scan still resolves, persists, and
 * surfaces the schema_invalid finding (which is determined before the monitors run).
 *
 * Lives in its own file because vi.mock is hoisted to module scope and would
 * otherwise force the real-monitor tests in scanner.test.ts to use the throwing stub.
 */

import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("../src/scanner/monitors.js", () => ({
  // checkSize throws for every doc the orchestrator reaches; checkOrphans is a
  // never-reached stub (index.ts calls checkSize first, so the catch fires before it).
  checkSize: () => {
    throw new Error("boom: monitor blew up");
  },
  checkOrphans: () => null,
}));

import { applyMigrations } from "../src/runner/migrations/runner.js";
import { createStore } from "../src/runner/store.js";
import { createHealthScanner } from "../src/scanner/index.js";
import type { ScannerContext } from "../src/scanner/types.js";

const sampleProject = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "__fixtures__",
  "sample-project",
);

describe("runScan error isolation (S1)", () => {
  it("a throwing monitor on one doc does not abort the whole scan", async () => {
    const db = new Database(":memory:");
    applyMigrations(db);
    const store = createStore(db);
    const ctx: ScannerContext = {
      projectRoot: sampleProject,
      docsRoot: join(sampleProject, "docs"),
      store,
      config: { sizeThresholdTokens: 12000, orphanThresholdDays: 14 },
    };

    // checkSize throws for every conformant doc; the scan must still resolve and
    // persist, and the schema_invalid finding (determined before the monitors run)
    // must still surface. Pre-fix, the throw propagated and rejected runScan.
    const scan = await createHealthScanner(ctx).runScan();

    expect(scan.findings.some((f) => f.monitor === "schema_invalid" && f.nodeId === "02-broken")).toBe(
      true,
    );
    expect(store.listScans()).toHaveLength(1);
  });
});
