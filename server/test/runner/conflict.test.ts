/**
 * Pure unit tests for the conflict primitive.
 * No Store, no DB — just function calls.
 */

import { describe, expect, it } from "vitest";
import { conflicts } from "../../src/runner/conflict.js";
import type { ResourceClaim } from "@ledger/parser";

describe("conflicts", () => {
  // 1. Two read claims on same node: no conflict.
  it("two read claims on same node: no conflict", () => {
    const a: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "read" }];
    const b: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "read" }];
    expect(conflicts(a, b)).toBe(false);
  });

  // 2. Read + write on same node: conflict.
  it("read + write on same node: conflict", () => {
    const a: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "read" }];
    const b: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "write" }];
    expect(conflicts(a, b)).toBe(true);
  });

  // 3. Two writes on same node: conflict.
  it("two writes on same node: conflict", () => {
    const a: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "write" }];
    const b: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "write" }];
    expect(conflicts(a, b)).toBe(true);
  });

  // 4. Two reads on same path: no conflict.
  it("two read claims on same path: no conflict", () => {
    const a: ResourceClaim[] = [{ kind: "path", path: "foo/bar.md", mode: "read" }];
    const b: ResourceClaim[] = [{ kind: "path", path: "foo/bar.md", mode: "read" }];
    expect(conflicts(a, b)).toBe(false);
  });

  // 5. Read + write on same path: conflict.
  it("read + write on same path: conflict", () => {
    const a: ResourceClaim[] = [{ kind: "path", path: "foo/bar.md", mode: "read" }];
    const b: ResourceClaim[] = [{ kind: "path", path: "foo/bar.md", mode: "write" }];
    expect(conflicts(a, b)).toBe(true);
  });

  // 6. node + path with same string value: NO conflict (different claim spaces).
  it("node:foo vs path:foo is not a conflict (different claim spaces)", () => {
    const a: ResourceClaim[] = [{ kind: "node", nodeId: "foo", mode: "write" }];
    const b: ResourceClaim[] = [{ kind: "path", path: "foo", mode: "write" }];
    expect(conflicts(a, b)).toBe(false);
  });

  // 7. Empty arrays: no conflict (either side or both).
  it("empty arrays on both sides: no conflict", () => {
    expect(conflicts([], [])).toBe(false);
  });

  it("empty a, non-empty b: no conflict", () => {
    const b: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "write" }];
    expect(conflicts([], b)).toBe(false);
  });

  it("non-empty a, empty b: no conflict", () => {
    const a: ResourceClaim[] = [{ kind: "node", nodeId: "x", mode: "write" }];
    expect(conflicts(a, [])).toBe(false);
  });

  // 8. Symmetric: conflicts(a, b) === conflicts(b, a) over 20 randomised cases.
  it("is symmetric over 20 randomised claim-set pairs", () => {
    const kinds: ReadonlyArray<"node" | "path"> = ["node", "path"];
    const modes: ReadonlyArray<"read" | "write"> = ["read", "write"];
    const nodeIds: ReadonlyArray<string> = ["alpha", "beta", "gamma", "delta"];
    const paths: ReadonlyArray<string> = ["a/b.md", "c/d.md", "e/f.md"];

    function pickRandom<T>(arr: ReadonlyArray<T>): T {
      const idx = Math.floor(Math.random() * arr.length);
      // arr is non-empty (all arrays above have at least 2 elements)
      return arr[idx] as T;
    }

    function randomClaim(): ResourceClaim {
      const kind = pickRandom(kinds);
      const mode = pickRandom(modes);
      if (kind === "node") {
        const nodeId = pickRandom(nodeIds);
        return { kind: "node", nodeId, mode };
      }
      const path = pickRandom(paths);
      return { kind: "path", path, mode };
    }

    function randomClaimSet(maxLen = 3): ResourceClaim[] {
      const len = Math.floor(Math.random() * (maxLen + 1));
      return Array.from({ length: len }, randomClaim);
    }

    for (let i = 0; i < 20; i++) {
      const a = randomClaimSet();
      const b = randomClaimSet();
      expect(conflicts(a, b)).toBe(conflicts(b, a));
    }
  });
});
