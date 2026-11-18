# Parent Decomposition Playbook

The procedure for turning a single node into a **parent** — a coordination manifest plus child nodes — and for deciding when *not* to. The leaf-workflow (`leaf-workflow.md`) explicitly excludes this: it drives a leaf from PLANNED to COMPLETE; decomposition is what happens *before* a node is a leaf at all.

The leaf tests in Step 0 are the rule for when a node stays whole. The steps after that are the procedure for splitting it.

---

## Step 0 — Should this node decompose at all?

Run the leaf tests against the node. It is a **leaf — do not decompose** when *any* hold:

1. **Single responsibility** — you cannot name ≥2 children with non-overlapping data contracts.
2. **Single-implementer rule** — one implementer can ship it in one worktree without dispatching sub-agents.
3. **Size floor** — the DRAFT spec is comfortably under the size threshold and the diff is bounded.
4. **Depth cap** — decomposing would push the tree past 4 levels without a coordination justification.

Decompose **only** when the single-responsibility test fails *and* the size-floor *or* single-implementer test also fails. One failing test is a nudge; resist splitting a node that merely *feels* big. A doc that is large because it repeats itself or keeps finished history is cleaned in place. The smallest tree that satisfies the constraints wins.

---

## Step 1 — Name the children by data contract

Before writing anything, list the prospective children and the **distinct data contract each owns** (the file/type/endpoint it is authoritative for). If two children would write the same surface, the boundary is wrong — merge them or move the contested surface to one owner. Catching the overlap here is cheaper than catching it when the second worktree is rebased.

Record the contracts — they become the children-manifest dependency declarations.

---

## Step 2 — Reduce the original doc to a parent manifest

The original node keeps its document and becomes a coordinator:

- **Requirements / Design / Decisions** stay, but at the *parent* altitude — the cross-child concerns, shared contracts, and sequencing rationale. Per-child detail moves to the child specs.
- The parent's **Verification** section must enumerate an acceptance artifact per sequencing tier — something the operator can inspect after each tier's children land, before advancing to the next (a runnable test suite, a curl-able endpoint, or a UI surface). A Verification section that only describes the final-state check ("all children COMPLETE") is incomplete and will be flagged at spec review.
- Add a **Children** manifest section: one row per child with its `Node ID`, one-line responsibility, declared `Dependencies` on sibling children, and a `Status` column (all start `PLANNED`).
- Do **not** change the parent's own lifecycle status as a side effect of decomposition. Add a `Decomposed YYYY-MM-DD` subsection to the parent's Implementation Notes saying what was split and why.

---

## Step 3 — Create each child at PLANNED

For each child, create `docs/_plans/<parent-path>/<id>.md` at Status `PLANNED` with the full heading set from `leaf-workflow.md`. The children inherit the parent as `Parent:` and declare their inter-child `Dependencies`.

A forward child is a requirements seed, not a design. Requirements holds the one-line responsibility from Step 1 as the Outcome, sets `**Requirements confirmed:** unconfirmed`, and leaves Acceptance, Constraints, and Out of scope as `_(operator)_`. Design, Decisions, Open Issues, Implementation Notes, and Verification say `*(not started)*`. Children is `None`. Do not write a design into a forward child. The leaf-workflow requirements phase (stage 1a) fills the rest.

A retroactive split of already-shipped work is different: those children describe the implemented design and inherit the parent's shipped status. They are not entering the requirements phase.

A child that is itself multi-responsibility re-runs this playbook from Step 0 — but the depth cap means that should be rare.

**File placement rules:**

| Case | Parent doc | Child docs |
|------|-----------|------------|
| Fresh parent (new node, always had children) | `docs/_plans/NN-name/00-name.md` | `docs/_plans/NN-name/MM-child.md` |
| Decomposed former-leaf (doc already exists at `docs/_plans/NN-name.md`) | stays at `docs/_plans/NN-name.md` | `docs/_plans/NN-name/MM-child.md` |
| Top-level leaf (no children) | `docs/_plans/NN-name.md` | — |

`NN` and `MM` are zero-padded two-digit sequence numbers within their parent scope. They set display order only. Leave a gap when inserting; do not renumber. A lasting description is a markdown file at the top of `docs/`. A point-in-time writeup stays in `docs/_investigations/`.

---

## Step 4 — Sequence and dispatch

Build order follows the declared dependencies: a child cannot reach APPROVED-and-implementable before the children it depends on land their data contracts. Independent children may be dispatched in parallel — but heed the parallel-worktree shared-file gap (`leaf-workflow.md` Known Limitations): only parallelise children whose data contracts genuinely don't overlap, which Step 1 already verified.

Before dispatching, verify two sequencing properties. First, at least one child in the first tier (children with no declared sibling dependencies) must produce an artifact the operator can independently verify — a runnable test suite, a curl-able endpoint, or a UI surface. A schema file or type definition that only pays off downstream does not count. If every meaningful acceptance criterion lives in a final-sequenced child, restructure: extract the verifiable core into an earlier child, or collapse children and resequence. Second, if the plan introduces a user-facing UI panel or a GET endpoint the operator is expected to inspect during verification, that surface must appear no later than the midpoint of the sequencing order. A plan where nothing visible happens until the last merge is a sequencing defect, not a dependency declaration.

From here each child is an ordinary leaf — hand it to the leaf-workflow at stage 1a when Requirements are unconfirmed.

---

## Notes

- **Decomposition is not a lifecycle transition of the parent.** It changes the parent's *shape* (leaf → coordinator), not its status. The parent reaches COMPLETE when its children do and its own coordination concerns are satisfied — not before.
- **This playbook splits a node that already lives in `docs/_plans/`.** A lasting description is a markdown file at the top of `docs/`. A point-in-time writeup stays in `docs/_investigations/`.
- The recursion bottoms out at the single-implementer rule. If you find yourself decomposing to a depth where each leaf is trivial, you have over-decomposed — collapse back up.
