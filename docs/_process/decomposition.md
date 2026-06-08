# Parent Decomposition Playbook

The procedure for turning a single node into a **parent** — a coordination manifest plus child nodes — and for deciding when *not* to. The leaf-workflow (`leaf-workflow.md`) explicitly excludes this: it drives a leaf from PLANNED to COMPLETE; decomposition is what happens *before* a node is a leaf at all.

The canonical **rules** (when a node is a leaf vs. when it must split) live in PRD §6.6. This playbook is the operator **procedure** that applies them.

---

## Step 0 — Should this node decompose at all?

Run the §6.6 leaf tests against the node. It is a **leaf — do not decompose** when *any* hold:

1. **Single responsibility** — you cannot name ≥2 children with non-overlapping data contracts.
2. **Single-implementer rule** — one implementer can ship it in one worktree without dispatching sub-agents.
3. **Size floor** — the DRAFT spec is comfortably under the size threshold and the diff is bounded.
4. **Depth cap** — decomposing would push the tree past 4 levels without a coordination justification.

Decompose **only** when the single-responsibility test fails *and* the size-floor *or* single-implementer test also fails. One failing test is a nudge; resist splitting a node that merely *feels* big. The smallest tree that satisfies the constraints wins.

If a `size` health finding is what brought you here, also read `doc-size-resolution.md` — a large doc is sometimes noise, not genuine multi-responsibility (Option A there is a manual cleanup, not a decomposition).

---

## Step 1 — Name the children by data contract

Before writing anything, list the prospective children and the **distinct data contract each owns** (the file/type/endpoint it is authoritative for). If two children would write the same surface, the boundary is wrong — merge them or move the contested surface to one owner. This is the same set-intersection logic the scheduler's conflict primitive enforces at runtime (§6.3); catching the overlap here is cheaper than catching it at rebase.

Record the contracts — they become the children-manifest dependency declarations.

---

## Step 2 — Reduce the original doc to a parent manifest

The original node keeps its document and becomes a coordinator:

- **Requirements / Design / Decisions** stay, but at the *parent* altitude — the cross-child concerns, shared contracts, and sequencing rationale. Per-child detail moves to the child specs.
- Add a **Children** manifest section: one row per child with its `Node ID`, one-line responsibility, declared `Dependencies` on sibling children, and a `Status` column (all start `PLANNED`).
- Do **not** change the parent's own lifecycle status as a side effect of decomposition. (If a `doc_decompose` agent ran this, it adds a `Decomposed YYYY-MM-DD` subsection to Implementation Notes per the prompt template — see `server/src/dispatcher/prompts/docDecompose.ts`.)

---

## Step 3 — Create each child at PLANNED

For each child, create `docs/<parent-path>/<id>.md` with the full §6.1 schema (Requirements, Design, Decisions, Open Issues, Implementation Notes, Status: PLANNED). The children inherit the parent as `Parent:` and declare their inter-child `Dependencies`. A child that is itself multi-responsibility re-runs this playbook from Step 0 — but the depth cap (§6.6 rule 4) means that should be rare.

**File placement rules:**

| Case | Parent doc | Child docs |
|------|-----------|------------|
| Fresh parent (new node, always had children) | `docs/NN-name/00-name.md` | `docs/NN-name/MM-child.md` |
| Decomposed former-leaf (doc already exists at `docs/NN-name.md`) | stays at `docs/NN-name.md` | `docs/NN-name/MM-child.md` |
| Top-level leaf (no children) | `docs/NN-name.md` | — |

`NN` and `MM` are zero-padded two-digit sequence numbers within their parent scope. The sequence determines display order in the DAG but carries no semantic meaning — leave gaps rather than renumber when inserting. The `_process/`, `_investigations/`, and `_schemas/` siblings always use an underscore prefix and never carry `NN-` numbering.

---

## Step 4 — Sequence and dispatch

Build order follows the declared dependencies: a child cannot reach APPROVED-and-implementable before the children it depends on land their data contracts. Independent children may be dispatched in parallel — but heed the parallel-worktree shared-file gap (`leaf-workflow.md` Known Limitations): only parallelise children whose data contracts genuinely don't overlap, which Step 1 already verified.

From here each child is an ordinary leaf — hand it to the leaf-workflow.

---

## Notes

- **Decomposition is not a lifecycle transition of the parent.** It changes the parent's *shape* (leaf → coordinator), not its status. The parent reaches COMPLETE when its children do and its own coordination concerns are satisfied — not before.
- **Underscore-prefixed paths are not nodes** and cannot be decomposed this way; they are LIVING reference material (CLAUDE.md). A `doc_decompose` dispatch against one returns 409.
- The recursion bottoms out at the single-implementer rule (§6.6 rule 2). If you find yourself decomposing to a depth where each leaf is trivial, you have over-decomposed — collapse back up.
