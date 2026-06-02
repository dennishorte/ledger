import { describe, it, expect } from "vitest";
import { computeDagLayout } from "@/components/dag/useDagLayout";
import type { DocNode, NodeId, NodeStatus } from "@/lib/types";

function node(
  id: NodeId,
  parentId: NodeId | null,
  status: NodeStatus,
  dependsOn: NodeId[] = [],
): DocNode {
  return { id, parentId, title: id, status, dependsOn, authored: true };
}

const noop = (): void => {};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function tileBoxes(nodes: { type?: string; position: { x: number; y: number } }[]): Box[] {
  return nodes
    .filter((n) => n.type === "doc")
    .map((n) => ({ x: n.position.x, y: n.position.y, w: 240, h: 64 }));
}

function bbox(boxes: Box[]): { width: number; height: number } {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { width: maxX - minX, height: maxY - minY };
}

describe("computeDagLayout — rectpacking top tier (D15/v1.4)", () => {
  it("packs many independent top-level children into a grid, not one wide row", async () => {
    // root + 8 independent children (no deps among them).
    const docs: DocNode[] = [node("root", null, "IN_PROGRESS")];
    for (let i = 0; i < 8; i += 1) docs.push(node(`c${String(i)}`, "root", "COMPLETE"));

    const { nodes } = await computeDagLayout(docs, new Set(["root"]), noop, noop);
    const boxes = tileBoxes(nodes);
    expect(boxes).toHaveLength(8);

    const finite = nodes.every(
      (n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y),
    );
    expect(finite).toBe(true);

    const { width, height } = bbox(boxes);
    // A single row of 8×240 tiles would be ~2000+ wide and one tile tall.
    // rectpacking must wrap into ≥2 rows (taller than one tile) and stay
    // far narrower than the full single-row width.
    expect(height).toBeGreaterThan(64); // wrapped past a single row
    expect(width).toBeLessThan(8 * 240); // not the full stretched rank
  });

  it("packs the real-shape collapsed overview (build-order chain among subsystems) without error", async () => {
    // Mirrors the live default view: root + subsystems, all COMPLETE and
    // collapsed, with a build-order dependency chain among them. The top-level
    // edges have LCA=root (rectpacking) so they are dropped from ELK but still
    // rendered by React Flow. Must not throw and must pack, not stretch.
    const docs: DocNode[] = [
      node("root", null, "COMPLETE"),
      node("ui", "root", "COMPLETE"), // independent subsystem
      node("s2", "root", "COMPLETE"),
      node("s3", "root", "COMPLETE"),
      node("s4", "root", "COMPLETE", ["s2", "s3"]),
      node("s5", "root", "COMPLETE", ["s4"]),
      node("s6", "root", "COMPLETE", ["s5"]),
      node("s7", "root", "COMPLETE", ["s6"]),
    ];

    const { nodes, edges } = await computeDagLayout(docs, new Set(["root"]), noop, noop);

    // All seven subsystem tiles render; the chain edges are still drawn.
    const tiles = nodes.filter((n) => n.type === "doc");
    expect(tiles).toHaveLength(7);
    expect(edges.length).toBeGreaterThan(0);
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }

    // Packed, not a single 7-wide rank.
    const { width, height } = bbox(tileBoxes(nodes));
    expect(height).toBeGreaterThan(64);
    expect(width).toBeLessThan(7 * 240);
  });

  it("keeps a dependency chain ranked (layered) when flow exists, and routes edges to visible nodes", async () => {
    // A subsystem `sub` with an internal dependency chain a→b→c→d, plus a
    // sibling leaf so `root` has ≥2 children and is itself a container.
    const docs: DocNode[] = [
      node("root", null, "IN_PROGRESS"),
      node("sub", "root", "IN_PROGRESS"),
      node("sibling", "root", "COMPLETE"),
      node("a", "sub", "COMPLETE"),
      node("b", "sub", "COMPLETE", ["a"]),
      node("c", "sub", "COMPLETE", ["b"]),
      node("d", "sub", "COMPLETE", ["c"]),
    ];
    const { nodes, edges } = await computeDagLayout(
      docs,
      new Set(["root", "sub"]),
      noop,
      noop,
    );

    // Every rendered edge endpoint resolves to a rendered node id.
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }

    // Layered/DOWN: the chain descends, so y(a) < y(b) < y(c) < y(d).
    const y = (id: string): number =>
      nodes.find((n) => n.id === id)?.position.y ?? Number.NaN;
    expect(y("a")).toBeLessThan(y("b"));
    expect(y("b")).toBeLessThan(y("c"));
    expect(y("c")).toBeLessThan(y("d"));
  });
});
