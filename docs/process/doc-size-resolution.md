# Doc Size Resolution Playbook

This playbook covers the operator steps when a health scan produces a **`size`** finding — a doc whose estimated token count exceeds the configured threshold (`sizeThresholdTokens`, default 12 000).

---

## When this applies

A `size` finding in a scan row means the doc file has grown large enough to degrade context quality when an agent reads it. This usually happens because:

- Implementation Notes accumulated over multiple iteration cycles
- A long Decisions table with detailed rationale
- Archived history sections (e.g., v1 history blocks) that could live elsewhere
- A leaf node whose scope crept — it may need to become a parent

The finding is informational. You decide whether and how to act.

---

## Evaluating the flagged doc

Open the doc and look for:

1. **Archived / historical content** — v1 history blocks, "archived" sections, or superseded decisions. These are candidates for removal or relocation to a separate `*-history.md` in `docs/process/` or as an appendix sibling file.
2. **Oversized Implementation Notes** — per-iteration notes that have exceeded their usefulness. Trim to the salient pinned deviations; move the rest to a git commit message or remove.
3. **Scope creep** — the doc covers more than one cohesive responsibility. This is the signal to decompose: extract child nodes with their own lifecycle, and reduce the parent to a coordination manifest.

If the doc is genuinely complex and scope-coherent, decomposition is the right answer. If it's accumulated noise, trim it manually or dispatch an agent to do it.

---

## Resolution steps

### Option A — Manual trim (small, obvious cases)
Edit the file directly. Remove or relocate historical content. Re-run a scan to confirm the finding is gone.

### Option B — Agent-assisted trim
For docs that need a thorough editorial pass, dispatch a `doc_trim` task from the Health panel:

1. In the **Health** panel, expand the scan that contains the finding.
2. Click **Refactor** on the `size` finding row for the target doc.
3. Confirm the dispatch dialog (task type: `doc_trim`).
4. Navigate to the **Tasks** panel. When the task reaches `AWAITING_HUMAN_REVIEW`, open it and review the agent's proposed changes.
5. **Approve** if the refactor is correct. **Reject** (with a rationale) if the agent missed the mark — it will re-attempt once.
6. After the task reaches `COMPLETE`, return to the Health panel and click **Run Scan**.
7. Confirm the size finding is no longer present in the new scan row.

---

## Notes

- The HITL gate (step 4–5) is mandatory. A `doc_refactor` agent writes files; always review before approving.
- If the doc's `nodeId` is not a dispatachable leaf (e.g., a parent or a `docs/process/` file), the dispatch will return a 409. Handle those manually (Option A).
- A re-scan after resolution creates a new snapshot row; old scan rows with the finding are retained verbatim per the append-log design (07-health-daemon D3).
