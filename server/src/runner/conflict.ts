/**
 * Pure set-intersection conflict primitive for resource claims.
 *
 * Two claim sets conflict iff there exists a pair (one from each) with
 * the same (kind, target) and at least one side `write`. Two `read`
 * claims on the same target do not conflict.
 *
 * O(|a|·|b|) — at v1 scale (≤10 claims per task, ≤10 in-flight tasks)
 * this is hundreds of comparisons, microseconds.
 *
 * Symmetric: conflicts(a, b) === conflicts(b, a).
 */

import type { ResourceClaim } from "@ledger/parser";

export function conflicts(a: ResourceClaim[], b: ResourceClaim[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (claimKey(x) !== claimKey(y)) continue;
      if (x.mode === "write" || y.mode === "write") return true;
    }
  }
  return false;
}

function claimKey(c: ResourceClaim): string {
  return c.kind === "node" ? `node:${c.nodeId}` : `path:${c.path}`;
}
