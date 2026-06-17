# Bug report — leaf-workflow discards the implementation worktree/branch on rebase conflict

**Project:** ledger framework (leaf-workflow / workflow runner with `isolation: "worktree"`)
**Reported from:** worldgen project, 2026-06-17
**Severity:** High — silent, unrecoverable loss of completed implementation work.

---

## Summary

When a `leaf-workflow` run hits a **rebase conflict** at the rebase stage (stage 5,
after the implementer has produced its commits), the run terminates with a result that
**claims the work is recoverable** —

```json
{
  "nodeId": "docs/24-feature-schema-expansion/01-river-network-topology.md",
  "status": "rebase-conflict",
  "worktreePath": "/Users/dennis/code/worldgen/.claude/worktrees/wf_9466edfa-900-9",
  "branchName": "worktree-wf_9466edfa-900-9",
  "conflicts": [],
  "message": "Rebase conflicts — resolve manually, then run leaf-workflow-finish."
}
```

— but in fact the **worktree directory, the branch, and the implementation commits are
all gone** by the time control returns. The instruction to "resolve manually" is
impossible to follow: there is nothing left to resolve.

A rebase conflict is a normal, expected, fully recoverable situation. It should leave the
branch intact (and ideally the worktree paused mid-rebase) so the operator can resolve and
continue. Instead the implementation is destroyed and the only safe option is to re-run the
entire implement→review cycle from scratch.

---

## Environment

- Two `leaf-workflow` runs dispatched **in parallel** for two **sibling leaf nodes** of the
  same parent (`24.01` and `24.08`, children of `24`).
- Both nodes were already at `APPROVED`; the runs resumed at the Implement stage.
- Runner isolation: `isolation: "worktree"` (the "auto-cleaned if unchanged" mode).
- Run IDs / artifacts (for the ledger team to inspect):
  - 24.01: run `wf_9466edfa-900`, branch `worktree-wf_9466edfa-900-9`,
    transcript `…/subagents/workflows/wf_9466edfa-900`,
    script `…/workflows/scripts/leaf-workflow-wf_9466edfa-900.js`
  - 24.08: run `wf_88a2052d-3ff`, branch `worktree-wf_88a2052d-3ff-9`,
    transcript `…/subagents/workflows/wf_88a2052d-3ff`

---

## Steps to reproduce

1. Decompose a parent node into ≥2 sibling leaves.
2. Dispatch `leaf-workflow` for two siblings **concurrently** (both at `APPROVED`).
3. Each runs its doc lifecycle commits on `main`, then spawns an isolated worktree off
   `main` and produces implementation commits.
4. At least one of:
   - both worktrees edit a **shared file** (here: the parent's children-manifest doc
     `00-…​.md`, which *every* sibling's lifecycle commits touch; and `ui/src/lib/types.ts`,
     edited by both implementations), and/or
   - `main` advances (the sibling's lifecycle commits) between worktree creation and the
     rebase.
5. Stage 5 `git rebase` onto `main` hits a conflict in the shared file.

**Result:** both runs returned `status: "rebase-conflict"` with `conflicts: []` and a
`worktreePath`/`branchName` that no longer exist.

---

## Expected vs. actual

| | Expected | Actual |
|---|---|---|
| Branch after conflict | Preserved (implementation commits reachable) | **Deleted** — not in `git branch`, not in `git worktree list` |
| Worktree after conflict | Left in the paused mid-rebase state at `worktreePath` (so the operator can `git rebase --continue`), or at minimum the commits kept on the branch | **Removed** — `worktreePath` does not exist on disk |
| Commits | Recoverable | **Unreachable** — `git fsck --dangling` shows no implementation commits from either run (only old, unrelated WIP stashes) |
| `conflicts` field | Lists the conflicting paths | **Empty `[]`** despite `status: "rebase-conflict"` |
| `message` guidance | Actionable | **Misleading** — instructs manual resolution against a worktree that has been deleted |

Observed git state afterward: `main` clean, **not** mid-rebase, both nodes correctly at
`APPROVED` (the doc lifecycle commits landed fine). Only the implementation was lost.

---

## Likely root cause (hypothesis — for the ledger team to confirm)

The `isolation: "worktree"` teardown ("auto-cleaned if unchanged") appears to run on the
**error/conflict exit path** and removes the worktree **and deletes the branch**
(`git worktree remove --force` + branch delete), rather than preserving them when the
rebase did not complete cleanly. Because the conflicted rebase had already moved/reset the
branch ref, deleting the branch orphaned the implementation commits; they were then
unreachable (and the report's `worktreePath` is stale).

Two contributing issues compound it:

1. **The conflict handler conflates "unchanged worktree" with "worktree whose rebase
   failed."** A failed rebase is the one case where teardown must *not* fire.
2. **`conflicts: []` suggests the conflict detection ran after the state was already torn
   down / `git status` reparsed**, so the conflicting paths were never captured.

---

## Suggested fixes

1. **Never auto-remove the worktree or delete the branch on a non-clean rebase.** On
   `rebase-conflict`, leave the worktree exactly as `git rebase` left it (mid-rebase, index
   marked) and keep the branch. The operator's `leaf-workflow-finish` (or a manual
   `git rebase --continue`) can then actually work.
2. **Make the result honest.** If the framework *does* intend to tear down on conflict, the
   result must not say "resolve manually … then run leaf-workflow-finish" — it should say
   the work was discarded and must be re-run. Better: stash/preserve the commits on a named
   recovery branch and report that ref.
3. **Populate `conflicts[]`** with the actual conflicting paths (capture `git diff
   --name-only --diff-filter=U` before any teardown).
4. **Guard parallel sibling dispatch.** Sibling leaf-workflows of the same parent *always*
   contend on the parent's children-manifest doc; their lifecycle commits race on `main`
   and their worktree rebases predictably conflict. The runner should either serialize
   siblings, or detect the shared-parent-manifest write and warn/queue rather than letting
   two runs collide. (This is the *trigger*; the *bug* is that the collision destroys work.)

---

## Impact / workaround

Workaround in use: re-dispatch the affected nodes **serially** (one at a time, merging each
before starting the next) so no two runs share a worktree-rebase window. This avoids the
trigger but does not address the underlying data-loss behavior — any future rebase conflict
(even from a single run racing an unrelated `main` advance) will silently discard a
completed implementation.
