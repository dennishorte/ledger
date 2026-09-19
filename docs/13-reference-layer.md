# Reference Layer — `docs/_reference/` Current-State Docs

**Node ID:** `13-reference-layer`
**Parent:** project root (`docs/00-project.md`)
**Status:** COMPLETE (v1, 2026-09-18)
**Created:** 2026-09-18
**Last Updated:** 2026-09-18
**Dependencies:** `CLAUDE.md`, `.ledger/process/leaf-workflow.md`, `.ledger/process/maintenance-round.md`, `.ledger/process/decomposition.md`, `.claude/workflows/leaf-workflow-finish.js` (`11-workflow-scripts`), `.claude/scripts/new-project`, `.claude/scripts/sync-process`

---

## Requirements

### Context

The `docs/` node tree is an append-only audit trail: node docs accumulate DRAFT → COMPLETE history — spec-review findings, superseded decisions, abandoned approaches. Correct behaviour, but it makes "what is true today" expensive to answer: a reader must mentally subtract every dead end across dozens of nodes.

The worldgen project piloted a second layer at `docs/_reference/` — curated current-state docs, one per subsystem (module map / entry points / data contracts / state surfaces / invariants / active migration), with a **Last verified** commit stamp instead of a lifecycle status. The pilot (`/Users/dennis/code/worldgen/docs/_reference/README.md` + `tectonics.md`) is committed and is the canonical shape. This node makes the pilot a framework convention.

### In scope

- **R1 — Convention documented in ledger `CLAUDE.md`.** The Process-notes underscore-folders bullet gains `_reference/` with its distinct semantics: living current-state reference, one doc per subsystem, non-obvious claims cite their owning node id or a source file, generated tables preferred over hand-written ones, **Last verified** commit stamp. The text must state the three-lifecycle distinction explicitly: node docs = append-only audit trail (never retroactively cleaned), `_investigations/` = point-in-time analyses backing Open Issues, `_reference/` = present-tense reference rewritten freely. This is an **amend**, not only an append: the same bullet currently calls underscore-dir files "**LIVING** reference material" — that clause must be rephrased (e.g. "framework-internal material") or it contradicts the new text's "point-in-time" label for `_investigations/` inside one bullet.
- **R2 — VERIFY→COMPLETE gate in `leaf-workflow.md` stage 9.** The promotion checklist gains a diff-shaped check: list the files the node touched, grep `docs/_reference/` for docs citing them **or citing the node's own id** (the citation rule allows node-id references, which a paths-only grep would miss), fold any stale-section delta plus stamp bump into the same commit. No covering doc → nothing to do. Phrased as a cheap mechanical check, not a writing task.
- **R3 — Same gate wired into the automation.** `.claude/workflows/leaf-workflow-finish.js` automates stage 9; its Promote prompt (~lines 164–173) currently instructs "Only status bumps in this commit — no other changes." Add the reference check as a numbered step and amend that line to admit `_reference` updates — prose-only gates decay because the script is the executed path.
- **R4 — Underscore-sibling enumerations updated.** `decomposition.md`'s file-naming line (currently lists `_process/`, `_investigations/`, `_schemas/`) and **both** spots in `.claude/scripts/new-project`'s embedded CLAUDE.md template (the file-naming enumeration ~line 236 and the Process-notes line ~line 249) gain `_reference/`. The template is the source for every future child's CLAUDE.md — updating worldgen's file by hand but not the generator leaves the next scaffold stale. Same amend discipline as R1: `decomposition.md`'s Notes section (line ~72) also calls underscore dirs "LIVING reference material (CLAUDE.md)" — tighten it to whatever phrasing the amended CLAUDE.md bullet uses.
- **R5 — `maintenance-round.md` staleness sweep.** The operator-triggered reading pass (the "Rounds are operator-triggered" pattern bullet and/or stage-1 punch-list guidance) gains `docs/_reference/` stamps as a sweep target: a doc whose described files changed since its **Last verified** commit is punch-list material. This is v1's only backstop for commits that bypass the node lifecycle.
- **R6 — Stamp semantics defined once.** Wherever the convention is written, the stamp rule reads: **Last verified** = the commit the claims were last verified against — operationally `git rev-parse HEAD` *immediately before* committing the doc's update. A doc never names the commit it lives in (the folded-into-transition-commit case would otherwise be unwritable). `_reference` updates never ride merge commits — if one must, stamp `git rev-parse MERGE_HEAD` (the incoming tip whose tree was verified), since pre-merge HEAD's tree lacks the described changes and the doc would self-flag under R5's `git log` test.
- **R7 — Propagation to worldgen.** Run `.claude/scripts/sync-process` (pushes the three edited playbooks to `.ledger/child-projects` entries); add the one-line `_reference/` mention to worldgen's `CLAUDE.md` Process-notes underscore-siblings line, same style as its `_investigations/`/`_schemas/` mention. Do not touch worldgen's `docs/_reference/` content — the pilot files are already correct.

### Out of scope (v1)

- **Parser/UI/server code changes.** Verified by reading the skip logic, not assumed: `isInternalDocsPath` is a per-segment `startsWith("_")` prefix rule in `packages/parser/src/schema/parseDocNode.ts:28-30`, `packages/parser/src/docs/buildDocGraph.ts:91-93`, and `app/server/serverIdForPath.ts:19-21`. `_reference/` is already invisible to the DAG; no explicit-list edit exists to make.
- **Retroactive edits to node docs.** `02-schema.md`'s convention text (lines ~50, ~142) and every other node's `_investigations`/`_schemas` mentions are audit trail — they stay as authored.
- **Migrating `_investigations` content into `_reference`.** Different lifecycles; `_investigations` is point-in-time backing material, `_reference` is living present-tense.
- **Authoring `_reference` content for ledger's own subsystems.** This node lands the convention, not the content. Creating a `_reference` doc is opt-in per subsystem, needs no approval, and is a plain docs commit — reference docs are not nodes and carry no status front-matter.
- **Automated staleness detection** (health-scanner monitor) — filed as an Open Issue; candidate for a future node extending `07-health-daemon`.
- **Status front-matter, manifests, or lifecycle on `_reference` docs.** They are framework-internal files, not `DocNode`s — same rule as `_investigations/` and `_schemas/`.

---

## Design

### Files changed

```
CLAUDE.md                                  # R1 — Process-notes convention paragraph
.ledger/process/leaf-workflow.md           # R2 — stage-9 gate question
.ledger/process/maintenance-round.md       # R5 — staleness sweep
.ledger/process/decomposition.md           # R4 — enumeration line ~55
.claude/workflows/leaf-workflow-finish.js  # R3 — Promote prompt step + "only status bumps" amendment
.claude/scripts/new-project                # R4 — template, two spots (~lines 236, 249)
```

Plus worldgen-side changes produced by R7 (committed in the worldgen repo, not this one):

```
/Users/dennis/code/worldgen/CLAUDE.md              # one-line `_reference/` mention
/Users/dennis/code/worldgen/.ledger/process/*.md   # sync-process copies of the three edited playbooks
```

### Convention paragraph (ledger `CLAUDE.md`, Process notes)

Extend the existing underscore-folders bullet — it already names `_investigations/` and `_schemas/` and states "add a new internal folder by prefixing its name with `_`." Two edits: first **amend** its "they are LIVING reference material, not implementation nodes" clause to "framework-internal material, not implementation nodes" (the folder class is mixed-lifecycle — `_investigations/` is frozen, `_reference/` is living — so the blanket "LIVING" label contradicts the distinction this paragraph draws); then append the `_reference/` semantics in the same dense style:

> `docs/_reference/` holds **living current-state docs** — one per subsystem (module map / entry points / data contracts / state surfaces / invariants / active migration), rewritten freely as reality changes. Every non-obvious claim cites its owning node id or a source file so stale sections are greppable when a node changes status; prefer generated tables over hand-written lists (generated content can't drift — regeneration commands live in the doc). Each doc carries a **Last verified** commit stamp: the commit its claims were last verified against — `git rev-parse HEAD` immediately before committing the update (a doc never names the commit it lives in; updates never ride merge commits — if one must, stamp `MERGE_HEAD`). Three lifecycles, don't blur them: node docs are the append-only audit trail, `_investigations/` are point-in-time analyses, `_reference/` is present-tense only. Creating one is opt-in per subsystem and needs no approval; each project's `docs/_reference/README.md` carries its rules. Leaf-workflow stage 9 checks whether a promoting node's diff touched anything a `_reference` doc describes.

### Stage-9 gate text (`leaf-workflow.md`)

Stage 9 currently reads "Once verification passes, bump: … Single commit in the worktree." Add one bullet before the closing line:

```markdown
- **`_reference` check.** List the files this node touched
  (`git diff --name-only <base>...HEAD`), grep `docs/_reference/` for docs citing
  those paths or this node's id; update any stale section and set its
  **Last verified** stamp to `git rev-parse HEAD` — run it *before* committing,
  since a doc never names the commit it lives in. Fold the delta into this
  commit. If no `_reference` doc covers the touched surface (or the directory
  doesn't exist), nothing to do.
```

### Automation delta (`leaf-workflow-finish.js`)

In the Promote `callAgent` prompt (~lines 164–173), insert a step between the manifest-row step and the `git add` step (renumber the git steps accordingly — the prompt's steps are 1–4):

```
'3. Reference check:\n' +
'   - git -C ' + worktreePath + ' diff --name-only ' + baseBranch + '...HEAD — files this node touched\n' +
'   - if "' + worktreePath + '/' + docsDir + '/_reference/" exists, grep its *.md for those paths or for "' + nodeId + '"\n' +
'   - update any stale section; set **Last verified** to `git -C ' + worktreePath + ' rev-parse HEAD` (before committing)\n\n' +
```

and change the closing line to `'Only status bumps + _reference updates in this commit — no other changes.'`

### `new-project` template edits (two spots)

- File-naming note (~line 236): `Underscore-prefixed siblings (\`_investigations/\`, \`_schemas/\`, \`_reference/\`) never carry \`NN-\` numbering.`
- Process-notes line (~line 249): add `docs/_reference/` to the underscore-siblings parenthetical.

### `maintenance-round.md` edit

Extend the "Rounds are operator-triggered, not scheduled" pattern bullet: the manual reading pass over a subtree's Open Issues gains a second sweep target — `docs/_reference/` stamps. A doc whose cited files have commits after its **Last verified** stamp (`git log <stamp>..HEAD -- <cited paths>`) is punch-list material.

### Worldgen edits (R7)

- `.claude/scripts/sync-process` run from the ledger repo — reports `sync` for the three edited playbooks. (The `leaf-workflow-finish.js` edit propagates differently: it reaches children's automated path via the `~/.claude/workflows/` global-fallback refresh inside the script's own merge step (Step 5, ~lines 217–219) — not via `sync-process`.)
- Worldgen `CLAUDE.md` Process-notes line gains `docs/_reference/` in the parenthetical — one line, same style.
- Both land as a single worldgen commit (`docs: sync process playbooks + _reference convention note`), made directly in the worldgen checkout — trivial file copies + one line; no worktree needed. Do not touch `docs/_reference/` itself.

### Acceptance checks

- **A1:** `grep -n "_reference" CLAUDE.md .ledger/process/leaf-workflow.md .ledger/process/maintenance-round.md .ledger/process/decomposition.md .claude/scripts/new-project .claude/workflows/leaf-workflow-finish.js` — every convention surface carries the update.
- **A2:** `git diff --name-only main -- packages/parser app server` — empty; no code changed.
- **A3:** The finish script still parses — but note neither plain `node --check` form works on it: the file mixes `export` (module goal) with top-level `return` (script goal) because the workflow harness wraps the body at load time. The working check is de-export + function-wrap: `{ echo '(async () => {'; sed 's/^export //' .claude/workflows/leaf-workflow-finish.js; echo '})'; } | node --check`. Also `bash -n .claude/scripts/new-project` — the template edits land inside a single-quoted heredoc, but the check is free. The Promote prompt contains the reference-check step and the amended closing line.
- **A4:** The stage-9 text and the script prompt both state the stamp rule (stamp = pre-commit `git rev-parse HEAD`), and the CLAUDE.md paragraph states the three-lifecycle distinction verbatim-clearly.
- **A5:** `.claude/scripts/sync-process` exits 0 and reports `sync` for `leaf-workflow.md` and `decomposition.md` against worldgen (`maintenance-round.md` will report `ok` — worldgen already carries the bb17f01-state copy via `a5e6183`).
- **A6:** Worldgen's doc graph contains no `_reference` node — `GET /api/docs` against worldgen's ledger server (`./dev.sh` boots it; api on its configured port) returns no `nodeId` containing `_reference`. Equally: the `/dag` panel shows no `_reference` node.
- **A7:** Worldgen `CLAUDE.md` carries the `_reference/` mention; `worldgen/docs/_reference/` contents are byte-identical to before this node.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Three doc lifecycles, stated explicitly wherever the convention is cited | The failure this node prevents is exactly a blur: node docs are append-only audit trail, `_investigations/` is frozen point-in-time analysis, `_reference/` is living present-tense. Each has a different edit discipline (never clean / append-once / rewrite freely). Citing them together keeps the distinction load-bearing. |
| D2 | Gate at stage 9 (VERIFY→COMPLETE commit), not stage 10 (merge) | The check is part of verification — "does the doc still describe reality" is a correctness question answered by the node's diff, not merge mechanics. Stage 10's cross-doc sync bundles files *outside* the worktree's concern; `_reference` docs describing this node's files are inside it. Consistent with "promotion bundles doc-and-code." |
| D3 | Wire the check into `leaf-workflow-finish.js`, not just the playbook | The playbook is the spec; the script is what executes. A prose-only gate decays the first time the automated path runs — the Promote prompt's "only status bumps" line would actively *forbid* the update. Small prompt edit, same semantic content. |
| D4 | Stamp = `git rev-parse HEAD` immediately before committing the doc update | Resolves the self-reference problem mechanically: when a doc's delta folds into the transition commit, it cannot name that commit's hash. Pre-commit HEAD is always the newest commit whose *described state* the doc reflects. Staleness then means "commits after `<stamp>` touching a described surface other than the doc itself" — checkable with one `git log`. |
| D5 | `_reference` docs are opt-in per subsystem, no approval needed | They are not nodes — no lifecycle, no spec review, no manifest row. Requiring a gate to create one would reintroduce the cost the layer exists to remove. Coverage grows where operators find the audit trail most expensive to read (worldgen seeded tectonics — the 8.5k-line monolith — first). |
| D6 | No parser change — verified prefix rule | `isInternalDocsPath` checks `seg.startsWith("_")` on every directory segment in all three implementations (parser ×2, server mirror ×1). An explicit-list implementation would have needed `_reference` added; the prefix rule covers it by convention. Verified by reading the code, per the original brief's own instruction. |
| D7 | Check is grep-shaped: node's touched files vs. `_reference` citations | The citation rule (claims cite owning nodes *or source files*) exists precisely so this check is one `grep`, not a judgment call. If a project's `_reference` docs stop citing files, the gate degrades to unactionable — the convention text makes citation a rule for this reason. |

---

## Open Issues

- **MEDIUM — No automated staleness detection for non-lifecycle commits.** The stage-9 gate only fires on VERIFY→COMPLETE; direct commits, hotfixes, and any work outside the node lifecycle drift `_reference` silently. The stamp makes this *detectable* (doc is "true as of X"), not *surfaced*. Natural fix: a `reference_staleness` monitor on the health scanner (`07-health-daemon` v2 architecture already runs report-only monitors) — parse `docs/_reference/*.md` for stamp + cited paths, fire when `git log <stamp>..HEAD -- <paths>` is non-empty. Candidate future node; v1's only backstop is the R5 maintenance-round sweep.
- **LOW — The stage-9 check is a convention, not an enforced gate.** An operator or agent can skip it and still promote. Same enforcement gap as `12-workflow-decomposition`'s open issue — true enforcement is a task-runner COMPLETE-transition gate, deferred until dispatch is the default path.
- **TRIVIAL — `doc-status` doesn't filter underscore dirs.** `.claude/scripts/doc-status` skips `*/process/*` only; `_investigations` already renders as `—` rows and `_reference` will too. Cosmetic noise, pre-existing; fix would be tightening the filter to `*/_*/*`.
- **TRIVIAL — Stale `docs/_process/` references.** `decomposition.md`'s enumeration (the line R4 edits — names `_process/` without the `docs/` prefix), `doc-size-resolution.md:45`, and `docs/00-project.md:218` ("Operator procedure: `docs/_process/decomposition.md`") still reference `docs/_process/`, which no longer exists — playbooks moved to `.ledger/process/`. Pre-existing; the implementer may fix the touched line inline and leave the rest for a maintenance round.
- **TRIVIAL — `sync-process` overwrites living per-project playbooks.** The script copies every `.ledger/process/*.md` unconditionally; `open-issue-queue.md` is a living per-project working artifact (per `open-issue-resolution.md`), so a child's local triage edits would be silently clobbered by the next sync. Harmless today (worldgen's copy is a verbatim duplicate of ledger's). Out of this node's scope — candidate maintenance-round item: skip-list or per-project-override semantics in `sync-process`.

---

## Spec Review (2026-09-18)

Independent clean-context review. Verdict: **NEEDS_MINOR_REVISIONS** — no Blocking, no FAIL rows; PARTIALs on R1, R6, A3. Sign-off matrix: R2/R3/R4/R5/R7 PASS, R1/R6/A3 PARTIAL, A1/A2/A4/A5/A6/A7 PASS (all with evidence).

| # | Finding | Resolution |
|---|---------|------------|
| S1 | Should-fix: R1 append-only edit leaves CLAUDE.md:109 self-contradicting — the bullet calls all underscore-dir files "LIVING reference material" while the new text calls `_investigations/` point-in-time. | Applied — R1 + Design paragraph now specify an amend ("framework-internal material"), not just an append. |
| S2 | Should-fix: R6/D4 stamp rule produces a misleading stamp if a `_reference` update rides a stage-10 merge commit (pre-merge HEAD lacks the described changes; doc self-flags under R5's `git log` test). | Applied — R6 + Design paragraph now state updates never ride merge commits; if one must, stamp `MERGE_HEAD`. |
| S3 | Should-fix: A3 `node --check` is machine-dependent (ESM file, no `type: module`; fails on Node <22 regardless of correctness). | Applied — A3 amended; at implementation the file turned out to be neither module- nor script-goal parseable (harness-wrapped: top-level `export` + `return`), so A3 now specifies the de-export + function-wrap `node --check` form, plus `bash -n` for `new-project`. |
| S4 | Should-fix: R2's paths-only grep misses `_reference` docs that cite the owning node id instead of a file path; also `[NN.MM.LL]` notation is worldgen-style — ledger ids are slugged paths. | Applied — R2, the stage-9 bullet, and the script prompt now grep for touched paths *or* the node id; citation wording generalised to "owning node id". |
| N1 | Nit: Dependencies header omitted `CLAUDE.md` (an edited file). | Applied. |
| N2 | Nit: TRIVIAL `_process` issue missed `docs/00-project.md:218` and mis-described `decomposition.md`'s wording. | Applied — issue now lists all three sites, corrected. |
| N3 | Nit: `decomposition.md:72` also says "LIVING reference material (CLAUDE.md)" — consistent only if S1's fix lands there too. | Applied — R4 now scopes the same tighten to that line. |
| N4 | Nit: script-edit propagation path unmentioned — `~/.claude/workflows/` global fallback refreshes via the finish script's own merge step, not `sync-process`. | Applied — one sentence added to Design §Worldgen edits. |
| N5 | Nit: prompt step "2.5." reads awkwardly; `rev-parse` lacked `-C <worktreePath>`. | Applied — step renumbered to 3 (git steps renumber to 4–5); `-C` added. |
| N6 | Nit: spec could cite per-project `docs/_reference/README.md` as the rules doc (scaffolded children otherwise get only the one-line parenthetical). | Applied — pointer added to the convention paragraph. |
| N7 | Nit: pre-existing footgun — `sync-process` unconditionally overwrites living per-project playbooks (`open-issue-queue.md`); harmless today, clobbers future child edits. | Applied — filed as a TRIVIAL Open Issue, deferred to a maintenance round (out of this node's scope). |

---

## Implementation Notes

**v1 — 2026-09-18**

- **Partial pre-landing on main (`bb17f01`) — lifecycle deviation.** An out-of-band commit landed most of R1/R2/R4(decomposition.md)/R5 directly on `main` while this node sat at APPROVED — no IN_PROGRESS transition, no worktree. The implementer worktree branched from `bb17f01`, so this node's commits contain only the *remaining* scope; the audit trail for the earlier chunk lives in `bb17f01`'s message. Recorded here so the gap is durable rather than invisible.
- **bb17f01 covered:** `leaf-workflow.md` stage-9 bullet, `decomposition.md:55` enumeration, `maintenance-round.md` punch-list row, `CLAUDE.md` `_reference` paragraph. Its worldgen side also pre-landed: commit `a5e6183` synced the bb17f01-state playbooks and added the `CLAUDE.md` mention — so post-merge `sync-process` owes only `leaf-workflow.md` + `decomposition.md` (worldgen `maintenance-round.md` already matches → will report `ok`, not `sync`; A5 expectation corrected accordingly).
- **Worktree added:** `CLAUDE.md` S1 amend (`LIVING reference material` → `framework-internal material`) + stamp rule + README pointer; stage-9 bullet rewritten to the spec's mechanics (touched-files list, grep for paths *or* node id, stamp = pre-commit `git rev-parse HEAD`); `leaf-workflow-finish.js` Promote step 3 + amended closing line (`_reference updates` admitted); `new-project` template both spots; `decomposition.md:72` tighten.
- **Deviation — A3 check form.** Neither `node --check` variant parses `leaf-workflow-finish.js` standalone (top-level `export` + top-level `return` — the harness wraps the body at load). Used `{ echo '(async () => {'; sed 's/^export //' …; echo '})'; } | node --check`; A3 text updated to match.
- **Gates:** `pnpm install` + `pnpm -C packages/parser build` required in the fresh worktree (gitignored `node_modules`/`dist` — the documented build-order quirk); then typecheck exit 0, lint exit 0, build exit 0. `bash -n new-project` exit 0. No TS files changed; gates confirm baseline.
- **E2E:** N/A — no UI/API surface.
- **Dogfood note:** ledger has no `docs/_reference/` — this node's own stage-9 `_reference` check is vacuous (directory absent → nothing to do).

### Implementation Review (2026-09-18)

**Verdict:** READY_WITH_FOLLOWUPS — no Blocking, no FAIL rows. Matrix: R2/R3/R4/R6 PASS, R1/R5 PARTIAL, R7 N/A–post-merge (correctly deferred), A1/A4 PASS, A2/A3 PASS-static, A5–A7 N/A–post-merge.

| # | Item | Verdict | Evidence / Resolution |
|---|------|---------|------------------------|
| 1 | Should-fix: R5 sweep mechanics absent — spec Design prescribed extending the "Rounds are operator-triggered" bullet with the stamp sweep + `git log <stamp>..HEAD` recipe; only the "When to use" table row landed. | Applied — bullet now carries the `_reference` stamp sweep and the `git log` test. |
| 2 | Should-fix: R1 dropped "prefer generated tables" and "entry points" from the CLAUDE.md paragraph. | Applied — both restored. |
| 3 | Should-fix: Implementation Notes under-recorded the worldgen side of bb17f01 (`a5e6183` already synced those playbook states + the CLAUDE.md mention); A5's expectation was stale. | Applied — notes + A5 corrected (`sync` for leaf-workflow/decomposition, `ok` for maintenance-round). |
| 4 | Nit: S3 audit row wording stale after the A3 check-form change. | Applied — row reworded. |
| 5 | Nit: `worktreePath` unquoted in the new prompt lines. | Applied — `-C "<worktreePath>"`. |
| 6 | Nit: fallback-refresh line cite off (~213–215 → actual ~217–219). | Applied. |

**Skipped:** none.

---

## Verification

This node introduces no UI panel and no API endpoint. The artifacts are text edits to process docs, one JS script prompt, one shell-script template, and propagation to a registered child project.

See Design §Acceptance checks (A1–A7) for the full criteria. Verifier confirms each by running the named command and checking the stated condition:

- **A1–A2** are direct `grep`/`git diff` runs.
- **A3:** `node --check` plus `grep -n "Reference check" .claude/workflows/leaf-workflow-finish.js` and `grep -n "_reference updates" .claude/workflows/leaf-workflow-finish.js`.
- **A4:** read the landed text in `leaf-workflow.md` stage 9, the script prompt, and `CLAUDE.md` — the stamp rule and three-lifecycle distinction must survive wordsmithing.
- **A5:** run `.claude/scripts/sync-process` from the ledger repo; expect `sync` for `leaf-workflow.md` + `decomposition.md` and `ok` for `maintenance-round.md` under `/Users/dennis/code/worldgen` (the bb17f01-state copy already synced via worldgen `a5e6183`).
- **A6:** boot worldgen's stack (`./dev.sh`) or `pnpm -C server dev /Users/dennis/code/worldgen`, then `GET /api/docs` — assert no `nodeId` contains `_reference`. (Note: `.claude/scripts/doc-status` is hardcoded to ledger's own `docs/` and cannot be used for this check.)
- **A7:** `grep -n "_reference" /Users/dennis/code/worldgen/CLAUDE.md`; `git -C /Users/dennis/code/worldgen status docs/_reference/` clean or identical content.
- Gates: `pnpm -C app typecheck`, `lint`, `build` — no TypeScript changed; gates confirm baseline health.
- E2E: N/A — no UI or API surface. "Passes existing suite" applies.

---

## Children

None. Single responsibility (one convention documented and wired into its enforcement surfaces), single implementer, bounded diff across ~6 files + 2 worldgen files — leaf per §6.6.
