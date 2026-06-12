# Open-Issue Resolution Playbook

**Status:** LIVING (revise when the health daemon gains triage-automation or the issue taxonomy stabilises)
**Last Updated:** 2026-06-12

A structured procedure for working down the accumulation of unstruck open issues across the doc tree. Use this playbook when the health scanner surfaces a non-trivial backlog, when a focused resolution sprint is warranted before a new build phase, or when the PRD §11 roll-up has grown stale. This playbook does not replace the per-node ISSUE_OPEN loop (`leaf-workflow.md §8b`) or the maintenance-round mechanism (`maintenance-round.md`) — it orchestrates them. Think of it as the triage layer that feeds those two execution paths.

---

## Stage 0 — Collect

### 0a. Pull the machine-readable list

Trigger a fresh scan and dump all `open_issue` findings:

```bash
.claude/scripts/api-curl -X POST /api/health/scan
.claude/scripts/api-curl -j /api/health/scans
```

The response is a newest-first list of scan snapshots; take the first entry's `findings` array and filter to `monitor === "open_issue"`. Each finding carries `nodeId` and `detail` (count + priority breakdown + top-issue snippet). This gives you the set of affected nodes.

### 0b. Enumerate raw issue bullets

For each affected node, pull the full Open Issues section text. The fastest path:

```bash
grep -rn "Priority:" docs/ --include="*.md" | grep -v "~~"
```

This surfaces every unstruck priority-tagged bullet. Pipe through `grep -v "^\s*-\s*~~"` to exclude struck items if the pattern catches them.

For a targeted per-node read, use `.claude/scripts/lines` against the known section offset, or read the file directly.

### 0c. Build the triage table

Record one row per raw issue bullet. Columns:

| Doc path | Node ID | Priority | Category (stage 1) | Issue text (truncated) | Notes |
|---|---|---|---|---|---|

The "Category" column is filled in stage 1. "Notes" is for anything immediately obvious: "same root cause as X", "already addressed in code, doc not updated", "deferred by operator in conversation on YYYY-MM-DD".

Do not filter anything out at this stage. The full inventory is the input to stage 1 triage, not the output.

---

## Stage 1 — Triage and group

### 1a. Assign a category to each issue

Use this taxonomy. Pick the single best fit; when an issue spans two categories, assign the one that drives the resolution type.

| Category | Description | Representative examples from the tree |
|---|---|---|
| **functional-bug** | Observable wrong behavior in shipped code; would fail a test if one existed. | Zombie subprocesses after SIGTERM; MCP tool startup race on `--print` turn-0; dedup `Set<TaskId>` grows unbounded. |
| **design-gap** | A decision was deferred or not made; the spec acknowledges the hole explicitly. | Transcript ingestion coupling (three paths un-chosen); no framework/instance separation; parent-doc schema variant not specified. |
| **deferred-v2** | Explicitly scoped out of v1 with a reason; no current user impact. | Subscription-auth OAuth path; retry semantics on FAILED dispatcher tasks; prompt-template hot-reload; `07-replay` panel; `ledger dispatch` CLI subcommand. |
| **tech-debt** | Code works but the implementation is known-unclean or fragile. | No structured stderr capture; scan log grows without bound; OpenAPI typed client absent; `.ledger/project.json` webhook config env-var-only. |
| **doc-only** | The issue is in the text, not the code: stale reference, wrong path, outdated description, missing provenance link. | Stale file path in Design section; Implementation Notes refers to a pre-rename identifier; cross-doc summary line not updated after a merge. |
| **performance** | Correct but slow/heavy at scale beyond v1 usage. | ELK layout re-evaluation past ~100 nodes; pagination for task list past ~500 rows; resource-claim list density for long sessions. |
| **process** | Issue with the framework's own workflow or automation discipline, not product behavior. | No automated enforcement of the decomposition checkpoint; no `maintenance_round_ready` signal from health daemon; no task-runner gate on lifecycle transitions. |

### 1b. Form groups

A group is a set of issues that share at least one of:
- **Same component or data contract** — same file, same type, same endpoint, same doc node.
- **Same root cause** — one fix addresses all members (e.g., all three "no retention policy" bullets are one group).
- **Same resolution owner** — would go into the same maintenance round or the same new leaf spec.

Two issues in different categories can still be in the same group if they share a component (e.g., a functional-bug and a tech-debt item both in `server/src/runner/store.ts`).

Cross-cutting issues — those that touch more than two unrelated nodes with no shared component — form their own group with label `cross-cutting`. Do not force them into a component-specific group.

**Group naming:** a short slug + affected node(s). Example: `runner-store-unbounded`, `dispatch-zombie-sigkill`, `doc-stale-paths-01-ui`, `transcript-path-decision`.

### 1c. Output

A labeled group list:

```
Group: <slug>
Category: <category>
Priority (highest member): HIGH / MEDIUM / LOW
Affected nodes: <node IDs>
Members: <issue bullets, one per line>
---
```

Produce this as a working artifact in the conversation; do not commit it to disk unless the batch is large enough that you need it as a reference across multiple sessions.

---

## Stage 2 — Prioritize groups

### 2a. Score each group

Assign a weight on three axes:

1. **Priority ceiling** — the highest `*(Priority: X)*` tag among group members. HIGH > MEDIUM > LOW > TRIVIAL.
2. **Blast radius** — number of distinct affected nodes, plus whether any affected node is currently in active use (IN_PROGRESS or an active dependency of the current work path). Wide blast radius escalates weight.
3. **Path dependency** — does any group member block a currently-APPROVED or IN_PROGRESS leaf from completing? If yes, treat the group as HIGH regardless of its tagged priority.

### 2b. Sequenced execution list

Rank groups: path-dependency blockers first, then by priority ceiling, then by blast radius as tiebreaker. Groups of equal weight may be parallelized (see stage 4 notes on coordination).

For each group, record the ranked position and the chosen resolution type (stage 3). This is the operator's working queue.

### 2c. Tackle-now vs. park

Park a group (move to bottom of queue, no immediate action) when:
- All members are `deferred-v2` with no current path dependency.
- All members are `performance` and current scale does not trigger them.
- The group is `process` but no active workflow is impeded.

Parking is not striking. Parked groups remain in the queue and are re-evaluated at the next collection pass (stage 0).

Strike a group (stage 3d) when it meets the won't-fix criteria, not merely when it's low priority.

---

## Stage 3 — Classify each group by resolution type

For each group, choose exactly one:

### (a) New leaf node

Use when: the group represents a gap or decision that requires new implementation — new types, new endpoints, new files, new cross-cutting behavior. The scope is bounded enough to be a leaf (run the §6.6 leaf tests from `decomposition.md §Step 0`). If it fails those tests, hand off to `decomposition.md` first.

Trigger: hand to `leaf-workflow.md`.

Indicators: functional-bug requiring new code paths, design-gap requiring a decision + implementation, cross-cutting change that would touch shared types or infrastructure.

### (b) Maintenance pass on an existing COMPLETE node

Use when: the group is a bounded set of fixes to already-COMPLETE nodes, with no new data contracts, and the combined diff is the right size for a round (at least two items from at least two siblings). Most `functional-bug` (small), `tech-debt`, and `doc-only` groups that touch COMPLETE nodes land here.

Trigger: hand to `maintenance-round.md`.

Indicators: mechanical patches, identifier renames, missing nil checks, stale cross-references in Implementation Notes, small behavioral corrections with no spec change needed.

### (c) Doc-only fix

Use when: the issue is purely textual — no code change required. The fix is one of: strike through a resolved/won't-fix bullet, correct a stale file path or identifier reference, clarify ambiguous wording, or add a missing provenance link.

Execute directly (stage 4c). No worktree, no review gate, no new node.

Indicators: `doc-only` category, or any category where inspection confirms the code is already correct and only the doc is wrong.

### (d) Won't-fix / strike

Use when: the issue is superseded by an architectural decision that renders it moot, has been implicitly resolved by work elsewhere (and the doc just wasn't updated), is a pure speculative future concern with no current or foreseeable trigger, or the cost of fixing it clearly exceeds any realistic benefit at current scale.

Do not use `(d)` for issues that are merely low priority or inconvenient — those are `(b)` or parked. Won't-fix is a permanent closure.

Document the rationale inline at the strike site.

---

## Stage 4 — Execute

### 4a. New leaf node

If the group's scope needs decomposing: `→ decomposition.md`.

Otherwise: `→ leaf-workflow.md` from stage 1 (DRAFT).

Brief the implementing agent with the group's issue list as the Requirements input. The issues are already the "what we need to fix" — translate them into spec Requirements bullets with explicit out-of-scope lines for everything the group deliberately excludes.

### 4b. Maintenance pass

`→ maintenance-round.md`.

The group's member list becomes the punch list for Requirements. The "Out of scope" section must account for every group member that was considered and excluded.

### 4c. Doc-only fix

Edit the affected docs directly. For each issue being struck, use the strikethrough-plus-pointer convention:

```markdown
- ~~Original issue text...~~ → struck YYYY-MM-DD: <one-line rationale or resolution pointer>.
```

If the fix is a correction (stale path, wrong identifier), rewrite in place. If it adds a missing link, append inline. No audit table is required for doc-only fixes.

Commit all affected docs in a single commit. Message format:

```
docs(<scope>): resolve <N> open issues (<category>) — doc-only
```

Update the parent manifest row if any affected node's Open Issues count change would affect the parent's summary.

### 4d. Won't-fix / strike

Same strikethrough convention as 4c, with the rationale stating the won't-fix reason explicitly:

```markdown
- ~~Original issue text...~~ → won't-fix YYYY-MM-DD: <rationale>.
```

Commit as a single doc-only commit. No node lifecycle transition unless striking the last unstruck item in a doc that is currently `ISSUE_OPEN` (in which case follow the promotion path back to VERIFY in `leaf-workflow.md §8`).

### 4e. Cross-cutting coordination

When a group touches more than two unrelated nodes with no shared implementation owner:

1. Sequence sub-tasks in dependency order: nodes with no dependents first.
2. If two sub-tasks would touch the same file, serialize them — do not dispatch in parallel.
3. For (b) maintenance passes, a cross-cutting group that spans more than one subtree must be split into one round per subtree (per `maintenance-round.md §"One round = one subtree"`).
4. For (a) new leaf nodes, the cross-cutting behavior belongs in the leaf's data contract; the leaf owns the shared surface and other nodes declare a dependency on it.

---

## Stage 5 — Close the loop

After each group resolves:

**5a. PRD §11 update.** If the issue (or a version of it) appears in the PRD's §11 roll-up, update that entry: strike it with a forward pointer, or demote it if partially resolved. PRD §11 is the project-level issue register; it must not carry items that are resolved at the node level.

**5b. Targeted health scan.** Trigger a new scan and confirm the `open_issue` monitor no longer fires for the affected nodes:

```bash
.claude/scripts/api-curl -X POST /api/health/scan
.claude/scripts/api-curl -j /api/health/scans
```

If the monitor still fires after a (c) or (d) resolution, the scanner parsed the strikethrough incorrectly or the item was not properly struck — investigate before closing.

**5c. Verify the transition.** For (a) and (b) resolutions, confirm the relevant node has advanced to COMPLETE (or VERIFY, pending operator gate). A node that was ISSUE_OPEN before the resolution pass should not remain ISSUE_OPEN after.

**5d. Commit hygiene.** Each group's resolution lands in its own commit (or in the merge commit for a full leaf/maintenance-round lifecycle). Do not bundle two groups' resolutions in one commit unless they are (c)/(d) doc-only fixes to the same doc.

---

## Stage 6 — Retrospective (optional)

Run this stage when five or more groups from the same pass have resolved.

Add a dated `Open-Issue Resolution (YYYY-MM-DD)` subsection to Implementation Notes on the most relevant parent doc (or PRD §11 if the pass was cross-subtree). Record:

- Total issues collected, groups formed, resolution-type breakdown.
- Any systemic patterns (e.g., "7 of 12 groups were doc-only — Implementation Notes discipline needs attention", "3 functional-bug groups all traced to missing nil checks in the same module").
- New open issues the resolution pass revealed. File them immediately into the originating node's Open Issues section; do not buffer them.

This is provenance, not ceremony. Skip it for small passes (≤5 groups) where the commit log tells the story.

---

## Patterns to lean on

- **Collect before triage, triage before executing.** Running stage 4 on the first issue you read skips the sequencing work that prevents you from fixing a symptom while a root-cause fix is three groups away.

- **The resolution type determines the gate discipline.** (a) and (b) get two review passes and operator sign-off — same as every other leaf. (c) and (d) are self-authorizing doc edits with no review gate. Do not let a group slide from (a) to (c) just to skip the gates.

- **Won't-fix is permanent; low-priority is not.** A parked group re-enters the queue. A won't-fix group does not. Be conservative about using (d).

- **Cross-cutting groups are a design signal.** An issue that touches five unrelated nodes usually means a missing abstraction, not five independent bugs. Check whether the group warrants a new leaf that owns the shared surface rather than a patch on each affected node.

- **Strike at the source, link from the summary.** The authoritative record of an issue's resolution is the strikethrough in the originating doc. PRD §11 and parent summaries carry forward pointers, not duplicates. Start from the originating doc when tracing a resolution.

- **Health scanner is the oracle.** The `open_issue` monitor's definition (unstruck, MEDIUM+ priority, stable-state nodes) is the canonical definition of "open". If an issue is struck correctly and the scanner still fires, investigate the scanner. If an issue is not struck but you believe it is resolved, the belief is wrong until the doc is updated.

---

## Known limitations

- **No machine-readable group assignments.** The triage table (stage 0c) and group list (stage 1c) are working artifacts in the conversation, not stored state. A long triage pass that spans multiple sessions must reconstruct the table from the scanner output and docs. The eventual fix is a `triage` task type that persists group assignments in the runner store.

- **Priority tags are self-reported.** Issue severity is tagged by the implementer who filed the issue, not by an independent assessor. Stage 2's blast-radius and path-dependency scoring partially compensates, but a systematically under-tagged subtree will sort lower than it deserves. Mitigation: read the issue text, not just the tag, when scoring for path dependency.

- **Doc-only fixes are unreviewed.** Stage 4c has no review gate. An incorrect strikethrough or a misattributed provenance link can survive into the permanent record. Mitigation: keep (c) and (d) strictly mechanical — if you find yourself making a judgment call about whether the code is correct, the issue is not doc-only.
