/**
 * Health scanner tests — monitors (pure), store persistence, and runScan
 * integration over the sample-project fixture.
 *
 * The fixture (server/__fixtures__/sample-project/docs) contains:
 *   00-project.md       — parent doc (parseDocNode → null, skipped)
 *   01-leaf.md          — conformant DRAFT leaf
 *   02-broken.md        — missing ## Decisions (validateDocNode fails → schema_invalid)
 *   subdir/03-nested.md — conformant DRAFT leaf
 *   _process/, _schemas/ — underscore folders (skipped by the parser)
 */

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "../src/runner/migrations/runner.js";
import { createStore, type Store } from "../src/runner/store.js";
import { createHealthScanner } from "../src/scanner/index.js";
import { checkSize, checkOrphans } from "../src/scanner/monitors.js";
import type { HealthScan, ScannerContext } from "../src/scanner/types.js";
import type { DocumentNode, HealthConfig } from "@ledger/parser";

const sampleProject = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "__fixtures__",
  "sample-project",
);
const docsRoot = join(sampleProject, "docs");

const DEFAULT_CONFIG: HealthConfig = { sizeThresholdTokens: 12000, orphanThresholdDays: 14 };

function makeStore(): Store {
  const db = new Database(":memory:");
  applyMigrations(db);
  return createStore(db);
}

function makeScannerCtx(overrides: Partial<ScannerContext> = {}): ScannerContext {
  return { projectRoot: sampleProject, docsRoot, store: makeStore(), config: DEFAULT_CONFIG, ...overrides };
}

/** Baseline valid DocumentNode for the pure-monitor unit tests. */
function makeDoc(overrides: Partial<DocumentNode> = {}): DocumentNode {
  const base: DocumentNode = {
    schemaVersion: 1,
    nodeId: "99-test",
    parentId: "00-project",
    title: "Test Doc",
    status: "COMPLETE",
    created: "2020-01-01",
    lastUpdated: "2020-01-01",
    dependencies: [],
    sections: {
      Requirements: "x",
      Design: "x",
      Decisions: "x",
      "Open Issues": "None.",
      "Implementation Notes": "x",
      Verification: "x",
      Children: "None.",
    },
    children: [],
  };
  return { ...base, ...overrides };
}

function withOpenIssues(text: string, rest: Partial<DocumentNode> = {}): DocumentNode {
  const d = makeDoc(rest);
  return { ...d, sections: { ...d.sections, "Open Issues": text } };
}

describe("checkSize", () => {
  it("returns a size finding when estimated tokens exceed the threshold", () => {
    const finding = checkSize(makeDoc({ nodeId: "big" }), "x".repeat(401), 100);
    expect(finding).not.toBeNull();
    expect(finding?.monitor).toBe("size");
    expect(finding?.nodeId).toBe("big");
    expect(finding?.detail).toContain("threshold: 100");
  });

  it("returns null at exactly the threshold (strict >)", () => {
    // 400 chars / 4 = 100 tokens; 100 is not > 100
    expect(checkSize(makeDoc(), "x".repeat(400), 100)).toBeNull();
  });
});

describe("checkOrphans", () => {
  it("flags a stable-state doc with real open issues and an old lastUpdated", () => {
    const doc = withOpenIssues("- A lingering issue. (Priority: LOW)", {
      status: "COMPLETE",
      lastUpdated: "2020-01-01",
    });
    const finding = checkOrphans(doc, 14);
    expect(finding?.monitor).toBe("orphan");
    expect(finding?.detail).toContain("2020-01-01");
  });

  it("ignores non-stable states (DRAFT) even with real issues", () => {
    const doc = withOpenIssues("- A real issue", { status: "DRAFT", lastUpdated: "2020-01-01" });
    expect(checkOrphans(doc, 14)).toBeNull();
  });

  it("treats placeholder Open Issues as empty", () => {
    expect(
      checkOrphans(withOpenIssues("None.", { status: "COMPLETE", lastUpdated: "2020-01-01" }), 14),
    ).toBeNull();
    expect(
      checkOrphans(withOpenIssues("*(none yet)*", { status: "COMPLETE", lastUpdated: "2020-01-01" }), 14),
    ).toBeNull();
  });

  it("ignores recently-updated docs even with real issues", () => {
    const today = new Date().toISOString().slice(0, 10);
    const doc = withOpenIssues("- A real issue", { status: "COMPLETE", lastUpdated: today });
    expect(checkOrphans(doc, 14)).toBeNull();
  });
});

describe("Store scan persistence", () => {
  it("round-trips a scan through insertScan/listScans (findings survive JSON)", () => {
    const store = makeStore();
    const scan: HealthScan = {
      id: "s1",
      scannedAt: "2026-01-01T00:00:00.000Z",
      findings: [{ monitor: "size", nodeId: "a", detail: "big" }],
    };
    store.insertScan(scan);
    const all = store.listScans();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(scan);
  });

  it("returns scans newest-first by scannedAt", () => {
    const store = makeStore();
    store.insertScan({ id: "older", scannedAt: "2026-01-01T00:00:00.000Z", findings: [] });
    store.insertScan({ id: "newer", scannedAt: "2026-06-01T00:00:00.000Z", findings: [] });
    expect(store.listScans().map((s) => s.id)).toEqual(["newer", "older"]);
  });
});

describe("runScan over the sample-project fixture", () => {
  it("flags the broken doc as schema_invalid, skips parent/clean docs, and persists the scan", async () => {
    const ctx = makeScannerCtx();
    const scan = await createHealthScanner(ctx).runScan();

    expect(typeof scan.id).toBe("string");
    expect(scan.scannedAt).toMatch(/^\d{4}-/);

    const schemaInvalid = scan.findings.filter((f) => f.monitor === "schema_invalid");
    expect(schemaInvalid).toHaveLength(1);
    expect(schemaInvalid[0]?.nodeId).toBe("02-broken");
    expect(schemaInvalid[0]?.detail.length).toBeGreaterThan(0);

    // conformant DRAFT leaves produce nothing at default thresholds
    expect(scan.findings.some((f) => f.monitor === "size")).toBe(false);
    expect(scan.findings.some((f) => f.monitor === "orphan")).toBe(false);

    // the scan was persisted via the scanner's only write path
    const persisted = ctx.store.listScans();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe(scan.id);
  });

  it("emits size findings for conformant docs when the threshold is low", async () => {
    const ctx = makeScannerCtx({ config: { sizeThresholdTokens: 1, orphanThresholdDays: 14 } });
    const scan = await createHealthScanner(ctx).runScan();
    const sized = scan.findings
      .filter((f) => f.monitor === "size")
      .map((f) => f.nodeId)
      .sort();
    // 02-broken is schema_invalid (short-circuited before size); the parent + underscore docs are skipped
    expect(sized).toEqual(["01-leaf", "subdir/03-nested"]);
  });
});
