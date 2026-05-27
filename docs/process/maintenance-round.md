# Maintenance-round Workflow

**Status:** LIVING (revise when the framework's automation reshapes the procedure)
**Last Updated:** 2026-05-26 (round-1 retro: stage 10 must also scrub in-prose code references on affected siblings, not just Open Issues bullets)

A specialization of [`leaf-workflow.md`](./leaf-workflow.md) for **batched fixes to accumulated Open Issues across already-COMPLETE sibling leaves**. A maintenance round is itself a leaf node — it runs the full DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE lifecycle. This playbook describes only the deltas from `leaf-workflow.md`; the rest applies unchanged.

The round mechanism exists because the per-leaf ISSUE_OPEN loop (leaf-workflow §8b) is right-sized for bugs caught during a leaf's own verification but too heavy for accumulated trivial nits that span several COMPLETE leaves. Rather than carve out a "patch lane" that skips the review gates, batch the fixes into a new leaf that earns its COMPLETE the same way every other leaf does. Two reviews still gate the work: SPEC_REVIEW scrutinizes the curated punch list before any code is written; Implementation Review scrutinizes the diff before merge.

---

## When to use this playbook (vs. leaf-workflow §8b)

| Situation | Playbook |
|---|---|
| Bug found while verifying a leaf that is still in-flight (any state pre-COMPLETE) | Fix in the originating worktree — no new node. |
| Bug found during verification of a freshly-completing leaf, regardless of severity | leaf-workflow §8b (COMPLETE → ISSUE_OPEN → ...) on that leaf. |
| HIGH-priority bug discovered post-COMPLETE on a single leaf | leaf-workflow §8b on the originating leaf. The full single-leaf cycle is appropriate weight for a HIGH. |
| MEDIUM/LOW/TRIVIAL Open Issues accumulated across multiple COMPLETE siblings in the same subtree | **This playbook.** Batch them into a maintenance round. |
| Maintenance work that spans multiple subtrees | One round per subtree. Each subtree's `99-maintenance/` is independent. Cross-subtree resource-claim sprawl defeats the SPEC_REVIEW pass. |

A round is appropriate when the curated punch list contains at least two items from at least two siblings. A one-item round is just §8b with extra ceremony.

---

## Where rounds live

`docs/<subtree>/99-maintenance/00-maintenance.md` is the parent doc (created lazily when the first round is instigated). Children are rounds, numbered sequentially:

```
docs/01-ui/99-maintenance/
  00-maintenance.md       # parent — holds the rounds manifest
  01-round-1.md           # first round (COMPLETE)
  02-round-2.md           # second round (any state)
  ...
```

Each round's Node ID is its path slug (e.g., `01-ui/99-maintenance/01-round-1`). The parent's children manifest gains one row per round and never shrinks — completed rounds stay visible as durable provenance of past maintenance work.

A round is **never re-cycled through ISSUE_OPEN** to address newly-discovered work. New work goes into the next round. This keeps each round's lifecycle linear and its audit tables interpretable.

---

## Stages — deltas from `leaf-workflow.md`

### 1. DRAFT — author the round spec (deltas)

Same schema as leaf-workflow §1 with these section-specific specifics:

- **Requirements** is a curated punch list. One bullet per item with three fields each:
  - Source: `01-ui/04-tasks` Open Issues bullet *N* (or verbatim quote if the bullet is short).
  - Originating priority tag (HIGH / MEDIUM / LOW / TRIVIAL).
  - Why this round: 1–2 sentences (e.g., "groups with two other token-naming nits in this round" / "blocking the maintenance pass on `06-health` next round").
- **Out of scope** lists Open Issues from the same subtree that were **considered and rejected**, with reasoning. This is the SPEC_REVIEW pass's primary scrutiny surface — "why these and not those" is exactly what the reviewer must validate.
- **Design** describes the batching shape: per-sibling subsections in the implementation? a single shared refactor? mechanical-only with no cross-cutting changes? Trivial rounds may state "each fix is self-contained — no shared design surface."
- **Decisions** records non-obvious calls (e.g., "round-1 rewrites type X across three callers rather than patching at each call site").
- **Verification** lists the acceptance check **per curated item**, not just an overall pass/fail. The operator walks them all in stage 8.

Add the round to the `99-maintenance/00-maintenance.md` children manifest in the same commit. If this is the first round, also create `00-maintenance.md` itself and add the `99-maintenance` row to the subtree parent's manifest (e.g., `01-ui/00-ui.md`) in the same commit.

### 2. SPEC_REVIEW — extra reviewer focus

Standard leaf-workflow §2 reviewer dispatch, with these extra evaluation criteria layered on:

- **Punch list curation.** Are the chosen items genuinely batchable, or is one disguised structural work that deserves its own leaf? Anything that warrants more than a mechanical patch should be split out.
- **Severity gate.** Any HIGH-priority items sneaking in? Reject and route through leaf-workflow §8b on the originating leaf.
- **Out-of-scope justification.** Are the deferred items genuinely lower priority or being skipped for convenience? Convenience-skips drift toward a "patch lane" anti-pattern.
- **Cross-leaf coupling.** Do any two items in the list change the same file? If so, is the round prepared to reason about the combined diff, or should one be deferred?

### 3 – 9. Identical to leaf-workflow

No deltas. The round goes through implementation in an isolated worktree, rebases, reviews, operator-verifies, and bumps to COMPLETE exactly as any other leaf. The Spec Review and Implementation Review audit tables land in the same locations.

### 10. Merge — extra cross-doc sync on affected siblings

In addition to the standard cross-doc sync from leaf-workflow §10 (CLAUDE.md, PRD §14, sibling sample-tree pictures), the merge commit also edits each affected sibling's Open Issues section:

- The originating bullet gets struck through with a forward pointer:
  `- ~~Original Open Issues bullet text...~~ → addressed by `99-maintenance/01-round-1` (2026-05-26).`
- The strikethrough + pointer stays in the sibling's Open Issues **forever**. This preserves where the bug was first observed (often a meaningful clue for future regression investigation) while making the resolution discoverable from both ends of the link.

If a round only partially addresses an originating bullet (fixed the symptom but not the root cause, or addressed two of three sub-points), strike through only the addressed portion and append a remainder bullet describing what was left.

**Scrub in-prose code references too, not just Open Issues bullets.** When a round renames a file, moves a module, renames a field, or otherwise changes a code-level identifier, sibling specs may carry buried mentions in their Design sections, Implementation Notes, Decisions tables, or acceptance checks. The strikethrough convention above only catches Open Issues bullets — it does **not** catch lines like "`StatusChip` lives at `src/components/dag/StatusChip.tsx`" buried in §Design > Components. Before finalizing the merge commit, grep the affected siblings for every identifier the round changed (old file paths, old interface field names, old function names) and rewrite each stale mention to the new truth. Preserve provenance with an inline "(relocated by `99-maintenance/01-round-N` …)" note where a future reader might be confused by the change; pure replacements are fine where the historical detail no longer matters. This was added after round-1 missed seven such mentions across `03-docs`, `05-logs`, `06-health`, and `10-orchestration`; a follow-up `docs(01-ui): clean up references stale after round-1` commit was required.

The merge commit message follows the standard format: `Merge <branch>: 01-ui/99-maintenance/01-round-1 → COMPLETE + doc sync`.

### 11. Worktree cleanup

Identical to leaf-workflow §11.

---

## Patterns to lean on

- **Rounds are leaves, not exceptions.** Everything in `leaf-workflow.md`'s "Patterns to lean on" applies as-is. The audit tables, the commit-per-transition rule, the worktree isolation, the reviewer-in-clean-context discipline — none of it is optional because the work is small. The point of the playbook is to fold accumulated small fixes into the existing discipline, not to escape it.
- **Two reviews on small work is the feature.** SPEC_REVIEW catches "you're batching the wrong things" before any code lands; Implementation Review catches "the batched diff regressed something elsewhere" before merge. Either gate alone is insufficient for cross-cutting fixes — the planning side and the diff side fail in different ways.
- **One round = one subtree.** Cross-subtree maintenance happens via serial rounds, each owned by that subtree's own `99-maintenance/`. This keeps each round's resource claims narrow and each SPEC_REVIEW focused.
- **Cross-references on siblings are durable.** The strikethrough-plus-pointer convention on stage 10 is the maintenance equivalent of the audit-tables-stay-forever rule. A reader bisecting a regression should be able to trace from a symptom on `04-tasks` to the resolution in `99-maintenance/01-round-1` in one hop.
- **Discovered-mid-round bugs go to the next round.** The implementer in stage 4 will sometimes find a related bug while patching a curated item. Do not expand the current round's scope. File the new finding into the originating leaf's Open Issues and pick it up in round N+1. Expanding scope mid-stream invalidates the SPEC_REVIEW pass.
- **Rounds are operator-triggered, not scheduled.** No cadence is prescribed. The trigger is operator judgement: "the accumulated punch list is round-sized." Until the health daemon exists (PRD §6.4), this is a manual reading pass over the subtree's Open Issues sections.

---

## Known limitations

- **No automatic accumulation surfacing.** The operator decides when a subtree's Open Issues backlog has crossed the round-worth threshold by reading sibling docs manually. The eventual fix is the health daemon (PRD §6.4) emitting a `maintenance_round_ready` signal when a subtree's Open Issues count crosses a configurable threshold.
- **No deduplication assistance.** If the same Open Issue text appears across multiple siblings (e.g., one token-naming inconsistency observed by three different panel implementers), the operator dedupes by hand when assembling the round's Requirements punch list.
- **Strikethrough churn on siblings.** A heavily-maintained subtree's COMPLETE leaves will accumulate strikethrough bullets in their Open Issues sections over time. This is intentional (durable provenance), but a future reader scanning a sibling for "current" issues must visually filter out the addressed-by-round entries. Consider this a sign that the sibling needs `doc_refactor` (PRD §6.5) to archive the resolved history.

---

## What changes when the framework is built

- The health daemon (PRD §6.4) emits `maintenance_round_ready` tasks when a subtree's Open Issues backlog crosses a configurable threshold — Requirements stage 1 becomes prefilled.
- The curated-list judgement (which Open Issues batch well together) becomes an `issue_triage` task type, run by the dispatcher with the same reviewer-in-clean-context discipline as today's SPEC_REVIEW pass.
- Strikethrough cross-references on sibling leaves (stage 10) become bidirectional doc-graph edges maintained by the orchestration layer; the manual edit step disappears.
- Multi-subtree coordination (today: serial rounds) becomes parallel rounds with resource-claim arbitration handling cross-subtree conflicts.

The *shape* of the workflow — full lifecycle per round, two review gates, audit tables, durable cross-references — stays the same. Automation removes the operator from per-step driving, not from the review discipline.
