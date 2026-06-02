import { describe, it, expect } from "vitest";
import {
  buildSubtreeParentIds,
  computeDefaultExpansion,
  computeEffectiveExpansion,
} from "@/lib/dagExpansion";
import type { DocNode, NodeId, NodeStatus } from "@/lib/types";

function node(id: NodeId, parentId: NodeId | null, status: NodeStatus): DocNode {
  return { id, parentId, title: id, status, dependsOn: [], authored: true };
}

// root
//  ├─ a            (subtree parent: a1, a2)
//  │   ├─ a1  COMPLETE
//  │   └─ a2  COMPLETE
//  ├─ b            (subtree parent: b1, b2)
//  │   ├─ b1  COMPLETE
//  │   └─ b2  IN_PROGRESS      ← active frontier
//  ├─ c            (subtree parent: c1, c2; c1 is itself a subtree parent)
//  │   ├─ c1       (subtree parent: c1x, c1y)
//  │   │   ├─ c1x COMPLETE
//  │   │   └─ c1y VERIFY        ← active frontier, two levels deep
//  │   └─ c2  COMPLETE
//  └─ d  COMPLETE  (leaf — single, no subtree)
function fixture(): DocNode[] {
  return [
    node("root", null, "COMPLETE"),
    node("a", "root", "COMPLETE"),
    node("a1", "a", "COMPLETE"),
    node("a2", "a", "COMPLETE"),
    node("b", "root", "IN_PROGRESS"),
    node("b1", "b", "COMPLETE"),
    node("b2", "b", "IN_PROGRESS"),
    node("c", "root", "COMPLETE"),
    node("c1", "c", "COMPLETE"),
    node("c1x", "c1", "COMPLETE"),
    node("c1y", "c1", "VERIFY"),
    node("c2", "c", "COMPLETE"),
    node("d", "root", "COMPLETE"),
  ];
}

describe("buildSubtreeParentIds", () => {
  it("includes only nodes with ≥2 children", () => {
    const ids = buildSubtreeParentIds(fixture());
    expect([...ids].sort()).toEqual(["a", "b", "c", "c1", "root"].sort());
    expect(ids.has("d")).toBe(false); // leaf
    expect(ids.has("c2")).toBe(false); // leaf
  });
});

describe("computeDefaultExpansion", () => {
  it("always expands the root", () => {
    expect(computeDefaultExpansion(fixture()).has("root")).toBe(true);
  });

  it("expands a subtree with an active-frontier descendant", () => {
    expect(computeDefaultExpansion(fixture()).has("b")).toBe(true);
  });

  it("collapses an all-terminal subtree", () => {
    expect(computeDefaultExpansion(fixture()).has("a")).toBe(false);
  });

  it("expands the whole path to a deep frontier node", () => {
    const exp = computeDefaultExpansion(fixture());
    expect(exp.has("c")).toBe(true); // ancestor of c1y (VERIFY)
    expect(exp.has("c1")).toBe(true); // direct parent of c1y
  });
});

describe("computeEffectiveExpansion", () => {
  it("falls back to the default when no override exists", () => {
    const { expanded } = computeEffectiveExpansion(fixture(), {});
    expect(expanded.has("b")).toBe(true); // default-expanded
    expect(expanded.has("a")).toBe(false); // default-collapsed
  });

  it("lets an override collapse a default-expanded subtree", () => {
    const { expanded } = computeEffectiveExpansion(fixture(), { b: false });
    expect(expanded.has("b")).toBe(false);
  });

  it("lets an override expand a default-collapsed subtree", () => {
    const { expanded } = computeEffectiveExpansion(fixture(), { a: true });
    expect(expanded.has("a")).toBe(true);
  });

  it("forces the root expanded even against an override", () => {
    const { expanded } = computeEffectiveExpansion(fixture(), { root: false });
    expect(expanded.has("root")).toBe(true);
  });

  it("reports every subtree parent as a collapse candidate", () => {
    const { subtreeParentIds } = computeEffectiveExpansion(fixture(), {});
    expect([...subtreeParentIds].sort()).toEqual(["a", "b", "c", "c1", "root"].sort());
  });
});
