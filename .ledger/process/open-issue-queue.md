# Open-Issue Queue

**Last triage pass:** 2026-06-12
**Pass stats:** 63 bullets · 12 nodes · 18 groups · 1 resolved (doc-only) · 2 queued (maintenance-pass) · 15 parked

This file is the durable output of the triage stages (0–3) of `open-issue-resolution.md`. Update it after each pass: mark resolved groups, promote parked groups when their park rationale expires, add new groups discovered mid-pass. Do not delete resolved rows — strike them with a resolution pointer.

---

## Active queue (tackle in order)

| # | Slug | Priority | Resolution | Nodes | Issues |
|---|------|----------|------------|-------|--------|
| 1 | `dispatcher-sigkill-escalation` | MEDIUM | maintenance-pass | `06-agent-dispatcher/03-claude-code-executor`, `06-agent-dispatcher/05-dispatch-api` | 2 |
| 2 | `hitl-rejection-rationale-ui-display` | MEDIUM | maintenance-pass | `05-task-runner/03-hitl-gate`, `05-task-runner/05-ui-hook-migration` | 2 |

### `dispatcher-sigkill-escalation`
**Category:** functional-bug  
**Execution notes:** Add a per-task `setTimeout` (5–10 s) in `server/src/dispatcher/executor/cancellation.ts` triggered on `kill("SIGTERM")`. Cancel it on clean subprocess exit. On timeout, fire `kill("SIGKILL")` and emit a `subprocess_killed` log event. Strike both issue bullets and add a cross-ref pointer from `05-dispatch-api` to the `03` fix.

Members:
- `06-agent-dispatcher/03-claude-code-executor` — "No SIGKILL escalation after SIGTERM … *(Priority: MEDIUM)*"
- `06-agent-dispatcher/05-dispatch-api` — "SIGKILL escalation for hung cancels. Inherited from `03`'s Open Issues … *(Priority: MEDIUM)*"

### `hitl-rejection-rationale-ui-display`
**Category:** tech-debt  
**Execution notes:** (1) Verify `TaskInspector` reads the full rationale from the `kind=error` detail event body, not `status_change.reason` (80-char truncated). If it reads `reason`, fix to read the detail event. (2) Add a "Reject and queue follow-up" toggle in `TaskInspector` that calls `useRejectTask` with a `followUp` field populated from the UI form; inherit rejected task's `resourceClaims` by default.

Members:
- `05-task-runner/03-hitl-gate` — "`reasons.rejected(rationale)` truncates at 80 chars … *(Priority: MEDIUM)*"
- `05-task-runner/05-ui-hook-migration` — "Follow-up task injection on Reject (D9) … *(Priority: MEDIUM)*"

---

## Parked

Re-evaluate at next collection pass. A parked group re-enters the active queue when its park rationale expires (the condition it names is triggered, the deferral scope ends, or a new path dependency appears).

| Slug | Priority | Resolution | Nodes | Park rationale |
|------|----------|------------|-------|----------------|
| `assertcontained-symlink-escape` | MEDIUM | maintenance-pass | `04-api-server/03-server-package` | No symlink use in current projects; no active trigger. Re-evaluate when a second project is onboarded. |
| `ui-hook-migration-remaining-consumers` | MEDIUM | maintenance-pass | `04-api-server/05-ui-hook-migration`, `04-api-server/00-api-server` | Orchestration hooks already migrated. `useDocSource`/`useHealthData` remaining surface has no active path dependency. Re-evaluate at next UI polish phase. |
| `decompose-mode-a-parent-status` | MEDIUM | park | `06-agent-dispatcher/04-prompt-templates` | Mode A (forward decompose from APPROVED) not yet exercised live. No decision data. Re-evaluate after first live Mode A decompose. |
| `topbar-docvalidation-live-api` | LOW | park | `04-api-server/05-ui-hook-migration` | Low priority, no active user impact. |
| `cli-launcher-deferred-features` | LOW | park | `04-api-server/04-cli-launcher` | All items explicitly deferred in the node's Implementation Notes. |
| `workspace-conversion-deferred` | LOW | park | `04-api-server/01-workspace-conversion` | Deferred items with no active trigger. |
| `api-server-parent-deferred-polish` | LOW | park | `04-api-server/00-api-server` | Deferred polish, no current path dependency. |
| `server-package-03-deferred-low` | LOW | park | `04-api-server/03-server-package` | Low-priority deferred items; no active trigger. |
| `cli-launcher-trivial-polish` | TRIVIAL | park | `04-api-server/04-cli-launcher` | Trivial. Bundle into a future maintenance round. |
| `hook-migration-05-trivial-polish` | TRIVIAL | park | `04-api-server/05-ui-hook-migration` | Trivial. Bundle into a future maintenance round. |
| `task-runner-ui-trivial-polish` | TRIVIAL | park | `05-task-runner/05-ui-hook-migration` | Trivial. Bundle into a future maintenance round. |
| `dispatcher-executor-trivial-polish` | TRIVIAL | park | `06-agent-dispatcher/03-claude-code-executor` | Trivial. Bundle into a future maintenance round. |
| `dispatch-api-trivial-polish` | TRIVIAL | park | `06-agent-dispatcher/05-dispatch-api` | Trivial. Bundle into a future maintenance round. |
| `prompt-templates-trivial-polish` | TRIVIAL | park | `06-agent-dispatcher/04-prompt-templates` | Trivial. Bundle into a future maintenance round. |
| `hitl-gate-trivial-polish` | TRIVIAL | park | `05-task-runner/03-hitl-gate` | Trivial. Bundle into a future maintenance round. |

---

## Resolved (this file)

| Slug | Resolved | How |
|------|----------|-----|
| `executor-stdout-stderr-stale-issue` | 2026-06-12 | doc-only — struck stale MEDIUM bullet in `03-claude-code-executor`; code had already shipped (`lifecycle.ts:92`). Commit `16e07c4`. |
