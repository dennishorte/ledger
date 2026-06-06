# Doc Size Resolution Playbook

This playbook covers the operator steps when a health scan produces a **`size`** finding — a doc whose estimated token count exceeds the configured threshold (`sizeThresholdTokens`, default 12 000).

---

## When this applies

A `size` finding means the doc file has grown large enough to degrade context quality when an agent reads it. This is usually a signal that the doc covers more than one cohesive responsibility and should become a parent node. Less commonly, the doc has simply accumulated noise (history blocks, redundant notes) without actually expanding in scope.

The finding is informational. You decide whether and how to act.

---

## Evaluating the flagged doc

Open the doc and ask: does it cover more than one distinct responsibility?

- **Yes** — the doc needs to be decomposed into a parent manifest + child nodes. This is the primary resolution path.
- **No** — the doc is scope-coherent but noisy. Historical content, superseded decisions, or bloated Implementation Notes have accumulated. Clean it up manually (Option A).

---

## Resolution steps

### Option A — Manual edit (noise-only cases)
Edit the file directly. Remove or relocate historical content (v1 history blocks, archived sections, superseded decisions). Re-run a scan to confirm the finding is gone.

### Option B — Agent-assisted decomposition
For docs that cover multiple responsibilities, dispatch a `doc_decompose` task from the Health panel:

1. In the **Health** panel, expand the scan that contains the finding.
2. Click **Decompose** on the `size` finding row for the target doc.
3. Confirm the dispatch dialog (task type: `doc_decompose`).
4. Navigate to the **Tasks** panel. When the task reaches `AWAITING_HUMAN_REVIEW`, open it and review the agent's proposed changes — the original doc reduced to a parent manifest, plus new child node files at PLANNED.
5. **Approve** if the decomposition is correct. **Reject** (with a rationale) if the agent missed the mark — it will re-attempt once.
6. After the task reaches `COMPLETE`, return to the Health panel and click **Run Scan**.
7. Confirm the size finding is no longer present in the new scan row.

---

## Notes

- The HITL gate (step 4–5) is mandatory. A `doc_decompose` agent creates new files and rewrites the original; always review before approving.
- If the doc's `nodeId` is not a dispatchable node (e.g., a `docs/_process/` file), the dispatch will return a 409. Handle those manually (Option A).
- A re-scan after resolution creates a new snapshot row; old scan rows with the finding are retained verbatim per the append-log design (07-health-daemon D3).
