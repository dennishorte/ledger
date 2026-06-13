# Open-Issue Queue

**Last triage pass:** 2026-06-12
**Pass stats:** 63 bullets · 12 nodes · 18 groups · 1 resolved (doc-only) · 2 queued (maintenance-pass) · 15 parked → re-evaluated 2026-06-12: 5 promoted, 0 wont-fix → 7 active, 10 parked

This file is the durable output of the triage stages (0–3) of `open-issue-resolution.md`. Update it after each pass: mark resolved groups, promote parked groups when their park rationale expires, add new groups discovered mid-pass. Do not delete resolved rows — strike them with a resolution pointer.

---

## Active queue (tackle in order)

| # | Slug | Priority | Resolution | Nodes | Issues |
|---|------|----------|------------|-------|--------|
| ~~1~~ | ~~`dispatcher-sigkill-escalation`~~ | ~~MEDIUM~~ | ~~maintenance-pass~~ | ~~`06-agent-dispatcher/03-claude-code-executor`, `06-agent-dispatcher/05-dispatch-api`~~ | ~~2~~ |
| ~~2~~ | ~~`hitl-rejection-rationale-ui-display`~~ | ~~MEDIUM~~ | ~~maintenance-pass~~ | ~~`05-task-runner/03-hitl-gate`, `05-task-runner/05-ui-hook-migration`~~ | ~~2~~ |
| ~~3~~ | ~~`ui-hook-migration-remaining-consumers`~~ | ~~MEDIUM~~ | ~~maintenance-pass~~ | ~~`04-api-server/05-ui-hook-migration`, `04-api-server/00-api-server`~~ | ~~Migrate `useDocSource` and `useHealthData` to the live API (two active call sites in `WorkflowProgressSection` and `DocViewerPanel`).~~ |
| ~~4~~ | ~~`task-runner-ui-trivial-polish`~~ | ~~LOW~~ | ~~maintenance-pass~~ | ~~`05-task-runner/05-ui-hook-migration`~~ | ~~Round-2 UI polish pass: 40+ LOW/TRIVIAL items across 5 siblings; maintenance-round infrastructure confirmed working.~~ |
| ~~5~~ | ~~`dispatcher-executor-trivial-polish`~~ | ~~TRIVIAL~~ | ~~maintenance-pass~~ | ~~`06-agent-dispatcher/03-claude-code-executor`~~ | ~~Trivial polish items; bundle into a maintenance round.~~ |
| ~~6~~ | ~~`dispatch-api-trivial-polish`~~ | ~~TRIVIAL~~ | ~~maintenance-pass~~ | ~~`06-agent-dispatcher/05-dispatch-api`~~ | ~~Trivial polish items; bundle into a maintenance round.~~ |
| ~~7~~ | ~~`prompt-templates-trivial-polish`~~ | ~~TRIVIAL~~ | ~~maintenance-pass~~ | ~~`06-agent-dispatcher/04-prompt-templates`~~ | ~~Trivial polish items; bundle into a maintenance round.~~ |

### ~~`dispatcher-sigkill-escalation`~~ → resolved by `06-agent-dispatcher/99-maintenance/01-round-1` (2026-06-12)

### ~~`hitl-rejection-rationale-ui-display`~~ → resolved by `05-task-runner/99-maintenance/01-hitl-rejection-rationale-ui-display` (2026-06-12)

### ~~`ui-hook-migration-remaining-consumers`~~ → resolved by `04-api-server/99-maintenance/01-ui-hook-migration` (2026-06-12)

---

## Parked

Re-evaluate at next collection pass. A parked group re-enters the active queue when its park rationale expires (the condition it names is triggered, the deferral scope ends, or a new path dependency appears).

| Slug | Priority | Resolution | Nodes | Park rationale |
|------|----------|------------|-------|----------------|
| `assertcontained-symlink-escape` | MEDIUM | maintenance-pass | `04-api-server/03-server-package` | No symlink use in current projects; no active trigger. Re-evaluate when a second project is onboarded. |
| ~~`ui-hook-migration-remaining-consumers`~~ | ~~MEDIUM~~ | ~~maintenance-pass~~ | ~~`04-api-server/05-ui-hook-migration`, `04-api-server/00-api-server`~~ | ~~Promoted 2026-06-12: `useDocSource` has two active call sites in COMPLETE panels; e2e suite (22 passing) confirms UI polish phase has arrived.~~ |
| `decompose-mode-a-parent-status` | MEDIUM | park | `06-agent-dispatcher/04-prompt-templates` | Mode A (forward decompose from APPROVED) not yet exercised live. No decision data. Re-evaluate after first live Mode A decompose. |
| `topbar-docvalidation-live-api` | LOW | park | `04-api-server/05-ui-hook-migration` | Low priority, no active user impact. |
| `cli-launcher-deferred-features` | LOW | park | `04-api-server/04-cli-launcher` | All items explicitly deferred in the node's Implementation Notes. |
| `workspace-conversion-deferred` | LOW | park | `04-api-server/01-workspace-conversion` | Deferred items with no active trigger. |
| `api-server-parent-deferred-polish` | LOW | park | `04-api-server/00-api-server` | Deferred polish, no current path dependency. |
| `server-package-03-deferred-low` | LOW | park | `04-api-server/03-server-package` | Low-priority deferred items; no active trigger. |
| `cli-launcher-trivial-polish` | TRIVIAL | park | `04-api-server/04-cli-launcher` | Trivial. Bundle into a future maintenance round. |
| `hook-migration-05-trivial-polish` | TRIVIAL | park | `04-api-server/05-ui-hook-migration` | Trivial. Bundle into a future maintenance round. |
| ~~`task-runner-ui-trivial-polish`~~ | ~~TRIVIAL~~ | ~~park~~ | ~~`05-task-runner/05-ui-hook-migration`~~ | ~~Promoted 2026-06-12: sibling maintenance node confirmed infrastructure works; round-2 pass warranted.~~ |
| ~~`dispatcher-executor-trivial-polish`~~ | ~~TRIVIAL~~ | ~~park~~ | ~~`06-agent-dispatcher/03-claude-code-executor`~~ | ~~Promoted 2026-06-12: bundle into upcoming maintenance round.~~ |
| ~~`dispatch-api-trivial-polish`~~ | ~~TRIVIAL~~ | ~~park~~ | ~~`06-agent-dispatcher/05-dispatch-api`~~ | ~~Promoted 2026-06-12: bundle into upcoming maintenance round.~~ |
| ~~`prompt-templates-trivial-polish`~~ | ~~TRIVIAL~~ | ~~park~~ | ~~`06-agent-dispatcher/04-prompt-templates`~~ | ~~Promoted 2026-06-12: bundle into upcoming maintenance round.~~ |
| `hitl-gate-trivial-polish` | TRIVIAL | park | `05-task-runner/03-hitl-gate` | Trivial. Bundle into a future maintenance round. |

---

## Resolved (this file)

| Slug | Resolved | How |
|------|----------|-----|
| `executor-stdout-stderr-stale-issue` | 2026-06-12 | doc-only — struck stale MEDIUM bullet in `03-claude-code-executor`; code had already shipped (`lifecycle.ts:92`). Commit `16e07c4`. |
| `dispatcher-sigkill-escalation` | 2026-06-12 | `06-agent-dispatcher/99-maintenance/01-round-1` — `killWithEscalation` + escalation timer in `cancellation.ts`; `subprocess_killed` LogEvent kind; doc-strikes in `03`/`05`/parent. |
| `hitl-rejection-rationale-ui-display` | 2026-06-12 | `05-task-runner/99-maintenance/01-hitl-rejection-rationale-ui-display` — protective comment + test at `latestStatusReason` usage; "Queue follow-up task" toggle in `HitlActions`; `useRejectTask` extended with `followUp`; doc-strikes in `03-hitl-gate`/`05-ui-hook-migration`. Commit `b479706`. |
| `task-runner-ui-trivial-polish` | 2026-06-12 | `05-task-runner/99-maintenance/02-round-2` — bus throw-isolation, `isRunnerTaskId` predicate, `useLogStream` runner-stream tests, 422 convention in tasks.ts, dependsOn validation in store.createTask. |
| `dispatcher-executor-trivial-polish` | 2026-06-12 | `06-agent-dispatcher/99-maintenance/02-round-2` — MCP config type verified (no code change), dispatch banner `<Link>`, `MutationErrorBody` extraction, tool-contract reminder assertion, Mode A lifecycle decision in PRD §6.2. |
| `dispatch-api-trivial-polish` | 2026-06-12 | `06-agent-dispatcher/99-maintenance/02-round-2` — see above. |
| `prompt-templates-trivial-polish` | 2026-06-12 | `06-agent-dispatcher/99-maintenance/02-round-2` — see above. |
| `ui-hook-migration-remaining-consumers` | 2026-06-12 | `04-api-server/99-maintenance/01-ui-hook-migration` — `useDocSource` and `useHealthData` migrated to TanStack Query against live API; B4 test fix in `NodeInspector.test.tsx`; doc-strikes in `05-ui-hook-migration`/`00-api-server`. |
