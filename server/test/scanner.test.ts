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
import { checkSize, checkOpenIssues } from "../src/scanner/monitors.js";
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

const DEFAULT_CONFIG: HealthConfig = { sizeThresholdTokens: 12000 };

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

describe("checkOpenIssues", () => {
  it("fires on a stable-state doc with an unstruck HIGH issue", () => {
    const doc = withOpenIssues("- **Bug.** Something broken. *(Priority: HIGH — visible today)*", {
      status: "COMPLETE",
    });
    const finding = checkOpenIssues(doc);
    expect(finding?.monitor).toBe("open_issue");
    expect(finding?.detail).toContain("1 HIGH");
  });

  it("fires on MEDIUM with em-dash continuation tags, in any stable state", () => {
    const doc = withOpenIssues("- **Drift.** schema. *(Priority: MEDIUM — revisit later)*", {
      status: "DEFERRED",
    });
    expect(checkOpenIssues(doc)?.monitor).toBe("open_issue");
  });

  it("ignores LOW / TRIVIAL / untagged / deferred items", () => {
    const stable = { status: "COMPLETE" as const };
    expect(checkOpenIssues(withOpenIssues("- A nit. *(Priority: LOW)*", stable))).toBeNull();
    expect(checkOpenIssues(withOpenIssues("- A nit. *(Priority: TRIVIAL)*", stable))).toBeNull();
    expect(checkOpenIssues(withOpenIssues("- Untagged note, no priority.", stable))).toBeNull();
    expect(checkOpenIssues(withOpenIssues("- Deferred thing. *(Defer.)*", stable))).toBeNull();
  });

  it("ignores struck-through (resolved) issues even when HIGH", () => {
    const doc = withOpenIssues("- ~~**Was broken.**~~ Closed by xyz. *(Priority: HIGH)*", {
      status: "COMPLETE",
    });
    expect(checkOpenIssues(doc)).toBeNull();
  });

  it("ignores non-stable states (DRAFT) even with a HIGH issue", () => {
    expect(checkOpenIssues(withOpenIssues("- **Bug.** *(Priority: HIGH)*", { status: "DRAFT" }))).toBeNull();
  });

  it("treats placeholder / None sections as no issues", () => {
    const stable = { status: "COMPLETE" as const };
    expect(checkOpenIssues(withOpenIssues("None.", stable))).toBeNull();
    expect(checkOpenIssues(withOpenIssues("*(none yet — pre-implementation)*", stable))).toBeNull();
  });

  it("counts multiple live issues and surfaces the highest-priority snippet", () => {
    const section = [
      "- **Critical bug.** Big problem. *(Priority: HIGH — confusing today)*",
      "- **Schema drift.** *(Priority: MEDIUM)*",
      "- A nit. *(Priority: LOW)*",
    ].join("\n");
    const finding = checkOpenIssues(withOpenIssues(section, { status: "COMPLETE" }));
    expect(finding?.detail).toContain("2 unresolved issue(s)");
    expect(finding?.detail).toContain("1 HIGH, 1 MEDIUM");
    expect(finding?.detail).toContain("Critical bug.");
    expect(finding?.detail).not.toContain("Priority:"); // priority tag stripped from snippet
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

    // conformant DRAFT leaves produce nothing at default thresholds (open_issue
    // only fires on stable states; the fixture leaves are DRAFT)
    expect(scan.findings.some((f) => f.monitor === "size")).toBe(false);
    expect(scan.findings.some((f) => f.monitor === "open_issue")).toBe(false);

    // the scan was persisted via the scanner's only write path
    const persisted = ctx.store.listScans();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe(scan.id);
  });

  it("emits size findings for conformant docs when the threshold is low", async () => {
    const ctx = makeScannerCtx({ config: { sizeThresholdTokens: 1 } });
    const scan = await createHealthScanner(ctx).runScan();
    const sized = scan.findings
      .filter((f) => f.monitor === "size")
      .map((f) => f.nodeId)
      .sort();
    // 02-broken is schema_invalid (short-circuited before size); the parent + underscore docs are skipped
    expect(sized).toEqual(["01-leaf", "subdir/03-nested"]);
  });
});
