# Agent Dispatcher — Maintenance Round 2: Dispatcher–Executor Trivial Polish

**Node ID:** `06-agent-dispatcher/99-maintenance/02-round-2`
**Parent:** `06-agent-dispatcher/99-maintenance` (`docs/06-agent-dispatcher/99-maintenance/00-maintenance.md`)
**Status:** APPROVED
**Created:** 2026-06-12
**Last Updated:** 2026-06-12

**Dependencies:** `06-agent-dispatcher/03-claude-code-executor` (MCP config type, watchdog note); `06-agent-dispatcher/04-prompt-templates` (tool-contract reminder, Mode A doc); `06-agent-dispatcher/05-dispatch-api` (banner link, `MutationErrorBody` home)

---

## Requirements

Curated punch list — five items spanning three siblings.

### Item 1 — Verify and close `"type": "http"` MCP config value (code + doc)

- **Source:** `06-agent-dispatcher/03-claude-code-executor` Spec Review confidence note 2 and Implementation Notes §Acceptance check §4: *"`--mcp-config` JSON `"type": "http"` value UNVERIFIED. … The implementer runs a one-line smoke at install time and adjusts." … "The `"type": "http"` MCP config value needs real-claude round-trip to confirm. If it fails, adjust the `type` field in `mcpConfig.ts` (likely candidate: `"streamable-http"`)."* Also carried in `docs/06-agent-dispatcher/00-agent-dispatcher.md` §Open Issues.
- **Priority:** LOW (tagged as such in the issue pool; risk materialises on a fresh `claude` version bump where the transport type string changes silently).
- **Why this round:** Mechanical to close — one `claude --mcp-config <test.json>` invocation confirms or refutes the assumption. If it passes, the open-issue bullet and confidence note are struck. If it fails, a one-field string change in `mcpConfig.ts` closes it. Either path is bounded, self-contained, and produces durable verification evidence that the other open-issue bullets from this sibling can reference.

### Item 2 — Add `<Link>` to dispatch success banner (code)

- **Source:** `06-agent-dispatcher/05-dispatch-api` Implementation Notes: *"No toast navigation from the dispatch success banner: The spec §Verification item 3 says 'toast `Dispatched as task <id>` with a link to Tasks panel filtered on the new id.' The inline banner currently shows the truncated ID as text, not a link."* Also noted in the spec's Open Issues: *"DispatchConfirmDialog toast surface depends on whether the UI has a toast system… If no toast lib exists, the dispatch button's success path could navigate to the new task's detail view directly."*
- **Priority:** LOW (issue pool item 5 — spec verification item explicitly named the link; the core dispatch flow works; this is UX polish).
- **Why this round:** One-line `<Link>` addition inside the existing banner `<div>` at `NodeInspector.tsx:142–145`. No new component, no new hook, no library dependency — React Router v7's `<Link>` is already imported in the file. Fits the "mechanical fix" bar and is blocked only by the absence of a round to pick it up.

### Item 3 — Extract `MutationErrorBody` to `app/src/lib/errors.ts` (code)

- **Source:** `06-agent-dispatcher/05-dispatch-api` Open Issues: *"`MutationErrorBody` lives in `useApproveTask.ts` as its 'home'. The convention works but couples hook files. A future `app/src/lib/errors.ts` extraction would centralise."*
- **Priority:** TRIVIAL (tagged as such in both the spec's Open Issues and the issue pool). Coupled hook files are a maintainability smell, not a correctness issue; but the extraction is a pure rename-and-re-export with no behaviour change and closes the coupling explicitly.
- **Why this round:** Groups naturally with item 2 (same sibling, same file neighbourhood, same operator verification session). The extraction is 5–10 LOC in a new file + updated imports in `useApproveTask.ts`, `useRejectTask.ts`, `useCancelTask.ts`, and `NodeInspector.tsx`. No risk of behavioural regression.

### Item 4 — Add build-time assertion that `mcpToolContractReminder()` mentions all MCP tool names (code)

- **Source:** `06-agent-dispatcher/04-prompt-templates` Open Issues: *"MCP tool contract reminder is fixed-string; future tool additions in `02-runner-tools` require manual reminder update. … when a sibling adds tools, update `mcpToolContractReminder()` in the same commit."* Also issue pool item 3: *"A future `runner.delegate_subtask` or `runner.pause` addition must manually update `mcpToolContractReminder()` in `shared.ts`. The risk is agents silently omitting the new tool because the prompt never mentioned it. Straightforward to add a build-time assertion (enumerate exported tool names against the reminder text)."*
- **Priority:** TRIVIAL (issue pool) / cross-sibling coupling that is easy to miss on a `02-runner-tools` extension.
- **Why this round:** A failing assertion at test time is a zero-cost safety net; the assertion itself is ~10 LOC in a new test file in `server/test/dispatcher/prompts/`. It imports the five canonical tool names from `02-runner-tools`'s exported registry and `assert`s each appears as a substring in `mcpToolContractReminder()`'s return value. Groups naturally with item 1 (same sibling tree, `04-prompt-templates` → `prompts/` directory).

### Item 5 — Record PRD §6.2 lifecycle decision for Mode A forward decompose (doc-only)

- **Source:** `06-agent-dispatcher/04-prompt-templates` Open Issues D12 follow-up: *"Parent status on forward (Mode A) decompose is undecided (D12 follow-up). When an APPROVED node (approved to implement as one unit) is decomposed into PLANNED children, the parent is no longer 'ready to implement directly' — it is now a coordinator awaiting child work — yet D12 keeps the target's status unchanged."* Priority: MEDIUM.
- **Priority:** MEDIUM (only bites Mode A, which has not been exercised live yet, but the first live Mode A decompose will produce a misleading parent state without an explicit decision recorded).
- **Why this round:** Doc-only: add one numbered decision row to PRD `docs/00-project.md` §6.2 (lifecycle section) and update `docs/06-agent-dispatcher/04-prompt-templates.md`'s D12 row to reference the new PRD decision. No code change. Closes the "undecided" tag on the open issue. Batches cleanly with item 4 (same sibling doc) because both touch `04-prompt-templates.md`'s Open Issues section — single strikethrough pass.

### Out of scope

The following open issues from the `06-agent-dispatcher` subtree were considered and excluded from this round:

- **`03`: No watchdog timeout on dispatched subprocess** (LOW) — configurable per-task `setTimeout` → SIGKILL in the cancellation registry; adds a new `opts.watchdogMs` field to `createCancellationRegistry` and modifies `claudeCode.ts` to set it from task priority or a config default. Scope exceeds a mechanical fix; overlaps with cancellation design in a way that warrants its own leaf or round when the need is operationally demonstrated. Defer.
- **`03`: `smoke.test.ts` skipped by default** (LOW) — CI infrastructure item blocked on having `claude` pre-installed + secrets bound; not a code problem. Defer.
- **`03`: MCP config JSON best-effort cleanup** (TRIVIAL) — startup sweep of orphaned tmp files. Unrelated to any other item in this round; defer to a cleanup-focused round or fold into a server-startup maintenance pass.
- **`03`: `Subprocess` type loose-typed at cancellation registry boundary** (TRIVIAL) — type-tightening refactor changing the `CancellationRegistry` interface and all call sites; explicit round-1 exclusion maintained. Defer.
- **`03`: No structured stderr capture beyond reason tail** (LOW) — separate observability concern with its own design surface (new `LogEvent` kind, event bus plumbing). Defer.
- **`05`: No 80-char truncation on operator-supplied cancel reasons** (TRIVIAL) — deferred until the UI exposes a free-text cancel-reason input, which it does not today. Defer.
- **`05`: Cancel-on-noop returns 409 `no_subprocess`** (LOW) — UI visibility concern requiring the UI to know the executor type taxonomy; out of v1 scope per spec. Defer.
- **`05`: Dispatch on already-running node creates a BLOCKED task** (TRIVIAL) — documented expected behaviour per spec. No fix needed; no issue strike warranted.
- **Parent `00-agent-dispatcher.md` open issues** (MCP turn-0 startup race, retry semantics, MCP tool-call rate limiting, subscription-auth path, cross-machine dispatch, OpenAPI typed client) — all LOW or deferred architecture items; none are mechanical fixes at round scale.

Severity gate: item 5 is MEDIUM; all others are LOW or TRIVIAL. No HIGH-priority items exist in the subtree. The MEDIUM item (item 5) is doc-only — the right weight for this round. Item 5 is admitted because it is strictly a doc decision with no implementation surface and batches trivially with item 4 on the same sibling doc.

Cross-leaf coupling check: items 2 and 3 both touch `NodeInspector.tsx`; they are combined in one Design subsection below so the implementer treats them as a single pass over that file.

---

## Design

### Batching shape

Five items across two file neighbourhoods: `server/src/dispatcher/` (items 1, 4) and `app/src/components/dag/` + `app/src/lib/` (items 2, 3), plus a pure-doc edit (item 5). No item changes a file another item owns, with one exception: items 2 and 3 both touch `NodeInspector.tsx` — the implementer makes both changes in a single pass over that file so the diff is coherent.

---

### Item 1 — MCP config type verification (`mcpConfig.ts`, `00-agent-dispatcher.md`, `03-claude-code-executor.md`)

**Verification step:** run `claude --mcp-config <test.json>` with the current config shape (`{ mcpServers: { "ledger-runner": { type: "http", url: "http://127.0.0.1:4180/mcp" } } }`) against a running Hono server. Observe whether the MCP transport negotiates successfully. Accept the result:

- **`"type": "http"` accepted:** no code change. Strike the open-issue bullets in `03-claude-code-executor.md` and `00-agent-dispatcher.md`; record the verification evidence (claude version + command + outcome) in this round's Implementation Notes.
- **`"type": "http"` rejected:** change the string in `server/src/dispatcher/executor/mcpConfig.ts:29` to the correct value (most likely `"streamable-http"`, as noted in the spec's confidence note). Update the `mcpConfig.test.ts` assertion string. Strike and forward-point the open-issue bullets.

In both cases, the `00-agent-dispatcher.md` §Open Issues bullet *"`--mcp-config` flag JSON shape... pin the exact format"* is struck with a forward pointer to this round.

Files potentially touched:
- `server/src/dispatcher/executor/mcpConfig.ts` — one-field string change (if type is wrong)
- `server/test/dispatcher/executor/mcpConfig.test.ts` — update string assertion (if type changed)
- `docs/06-agent-dispatcher/03-claude-code-executor.md` — strike confidence note 2 + §Acceptance check §4 note
- `docs/06-agent-dispatcher/00-agent-dispatcher.md` — strike Open Issues bullet on config shape

---

### Item 2 — Dispatch success banner `<Link>` (`NodeInspector.tsx`)

The banner at `NodeInspector.tsx:141–145` renders `dispatchBanner` as a plain string inside a `<div>`. Replace the inner text with a `<Link>` that navigates to the Tasks panel pre-filtered on the full task ID.

The navigation target is the existing `/logs/:taskId` route (`router.tsx:40`), which takes a task ID as a path segment and renders the task's log stream and status. The `/tasks` panel does not accept a `?id=` param for pre-selection — its URL state (`useTaskFilters.ts`) encodes only `status`, `type`, and `q`; the inspector is opened via local `useState`. Using `/logs/:taskId` requires no new URL param and no upstream feature addition, which is the right scope for this round.

Change at `onSuccess` callback (line 165): keep the `setDispatchBanner` call but store the full `data.task.id` alongside the short display text, then render a `<Link>` in the banner `<div>`.

Concrete diff sketch:

```tsx
// state addition (near line 120, alongside existing dispatchBanner state)
const [dispatchedTaskId, setDispatchedTaskId] = useState<string | null>(null);

// onSuccess (replace line 165)
setDispatchBanner(`Dispatched as task ${data.task.id.slice(0, 8)}…`);
setDispatchedTaskId(data.task.id);

// banner render (replace lines 141–145)
{dispatchBanner !== null && (
  <div className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-fg)]">
    {dispatchedTaskId !== null ? (
      <Link to={`/logs/${dispatchedTaskId}`}>{dispatchBanner}</Link>
    ) : (
      dispatchBanner
    )}
  </div>
)}
```

`Link` is already imported from `react-router` in `NodeInspector.tsx` (line 117 uses it). No new import required.

Also reset `dispatchedTaskId` to `null` alongside `dispatchBanner` wherever the banner is cleared (on dialog open and on error path).

Files touched: `app/src/components/dag/NodeInspector.tsx`.

---

### Item 3 — Extract `MutationErrorBody` to `app/src/lib/errors.ts`

Create `app/src/lib/errors.ts`. The existing definition in `useApproveTask.ts` is a **class** (`export class MutationErrorBody extends Error`), not an interface — consumers may use `instanceof MutationErrorBody` checks, which require a class. The extraction preserves the class form:

```ts
/** Shared error-body shape for TanStack Query mutation hooks that call Hono API endpoints. */
export class MutationErrorBody extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`);
  }
}
```

Remove the `MutationErrorBody` class from `app/src/lib/useApproveTask.ts` and replace with `import { MutationErrorBody } from "@/lib/errors"`. Apply the same import substitution in:
- `app/src/lib/useRejectTask.ts`
- `app/src/lib/useCancelTask.ts`
- `app/src/components/dag/NodeInspector.tsx`
- any other file that imports `MutationErrorBody` from `useApproveTask`

The interface shape is unchanged; this is a pure extraction.

Files touched:
- `app/src/lib/errors.ts` (new)
- `app/src/lib/useApproveTask.ts`
- `app/src/lib/useRejectTask.ts`
- `app/src/lib/useCancelTask.ts`
- `app/src/components/dag/NodeInspector.tsx`

---

### Item 4 — Build-time assertion: tool-contract reminder covers all MCP tools (`prompts/shared.test.ts`)

`02-runner-tools` registers five MCP tools: `runner.emit_event`, `runner.complete_task`, `runner.fail_task`, `runner.await_human_review`, `runner.get_task`. Of these, `mcpToolContractReminder()` in `shared.ts` currently mentions four in its fixed text (`emit_event`, `complete_task`, `fail_task`, `await_human_review`); `runner.get_task` appears only in the `issue_triage` persona preamble, not in the shared reminder. The assertion covers the four tools actually present in the reminder. If a future decision adds `runner.get_task` to the reminder text, the `RUNNER_TOOLS` array in the test should be extended at the same time.

Create `server/test/dispatcher/prompts/shared.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mcpToolContractReminder } from "../../../src/dispatcher/prompts/shared.js";

// The four tool names currently mentioned in mcpToolContractReminder() as of 02-runner-tools v1.
// runner.get_task is registered in 02-runner-tools but appears only in the issue_triage preamble,
// not in the shared reminder — omitted here intentionally.
// If a new tool is added to the reminder, add it here too.
const RUNNER_TOOLS = [
  "runner.emit_event",
  "runner.complete_task",
  "runner.fail_task",
  "runner.await_human_review",
] as const;

describe("mcpToolContractReminder", () => {
  it("mentions every canonical runner MCP tool name", () => {
    const reminder = mcpToolContractReminder();
    for (const tool of RUNNER_TOOLS) {
      expect(reminder, `reminder must mention ${tool}`).toContain(tool);
    }
  });
});
```

The test imports `mcpToolContractReminder` directly — no mocking, no fixtures. Fails immediately if the function returns a string that no longer names a tool. The canonical list in the test file is the human-maintained contract; the comment above it instructs the next `02-runner-tools` editor to extend both.

Files touched: `server/test/dispatcher/prompts/shared.test.ts` (new).

---

### Item 5 — PRD §6.2 Mode A forward-decompose lifecycle decision (doc-only)

Two doc edits:

**`docs/00-project.md` §6.2 (lifecycle spec):** Locate the `doc_decompose` task type entry in §6.2 (grep for `doc_decompose` — there is exactly one occurrence). Add one paragraph immediately after that entry recording the decision: when a `doc_decompose` runs against an APPROVED/DRAFT/PLANNED node (Mode A — forward decompose), the template sets the new children to PLANNED status; the **parent's status is unchanged** — the APPROVED state continues to mean "approved to implement this subtree", now as a decomposed set of leaves rather than a single leaf. The operator re-approves each child individually. No intermediate status is introduced.

**`docs/06-agent-dispatcher/04-prompt-templates.md` D12 row:** Append a note to D12: *"Mode A parent-status decision recorded in PRD §6.2 (maintenance round `06-agent-dispatcher/99-maintenance/02-round-2`, 2026-06-12): APPROVED parent keeps APPROVED after forward decompose. Closes the Mode A open issue."*

Strike the Open Issues bullet: *"~~Parent status on forward (Mode A) decompose is undecided (D12 follow-up).~~… → decision recorded in PRD §6.2 by `06-agent-dispatcher/99-maintenance/02-round-2` (2026-06-12)."*

Files touched:
- `docs/00-project.md` (§6.2 — additive paragraph)
- `docs/06-agent-dispatcher/04-prompt-templates.md` (D12 row amendment + Open Issues strikethrough)

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Item 1 verification step happens first in the implementation; code change (if needed) lands before doc strikes | If the type string is wrong, the doc strikes must reference the code fix. Ordering ensures the doc strike is accurate regardless of outcome. |
| D2 | Items 2 and 3 are implemented in a single pass over `NodeInspector.tsx` | Both touch the same file. A split pass would require re-reading and re-diffing; combined pass produces a coherent, reviewable diff. |
| D3 | `MutationErrorBody` extraction (item 3) creates a new file rather than adding to `app/src/lib/types.ts` | `types.ts` re-exports parser + runner types; `MutationErrorBody` is a UI-layer network contract, not a domain type. A dedicated `errors.ts` matches the codebase's convention of not overloading `types.ts` with disparate shapes. |
| D4 | Item 4 assertion uses a hardcoded string list rather than importing the tool registry from `02-runner-tools` | Importing from the MCP server module creates a runtime coupling (initialisation side effects) in a test file. The string list is explicit, reviewable, and makes the human-maintained contract visible at a glance — that visibility is the point. |
| D5 | Mode A parent-status decision (item 5) is recorded as a PRD §6.2 addition, not as a new lifecycle state | PRD §6.2 is the established home for lifecycle semantics. Adding a state would require updating the lifecycle diagram and the `doc_decompose` template; the decision is that APPROVED is the correct state, so no new state is needed — just an explicit call-out. |

---

## Open Issues

*(none — pre-implementation)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Per-item acceptance checks the operator walks in stage 8:

**Item 1 — MCP config type:**

1. `pnpm -C server typecheck`, `pnpm -C server test`, `pnpm -C app typecheck` exit zero. If the type string changed, `mcpConfig.test.ts` asserts the new value without compile error.
2. Open Issues bullet in `03-claude-code-executor.md` struck with forward pointer to this round.
3. Open Issues bullet in `00-agent-dispatcher.md` on config shape struck with forward pointer.
4. Implementation Notes records the `claude` version, exact command, and outcome of the round-trip smoke.

**Item 2 — Dispatch success banner link:**

5. Dispatch an APPROVED node from the DAG panel. The success banner reads "Dispatched as task {short-id}…" and the text is a clickable link. Clicking navigates to `/logs/{full-task-id}`.
6. Open Issues bullet in `05-dispatch-api.md` for the toast surface struck with forward pointer.
7. Implementation Notes (this round) records the link implementation: state field used, navigation target.

**Item 3 — `MutationErrorBody` extraction:**

8. `app/src/lib/errors.ts` exists and exports `MutationErrorBody`. `useApproveTask.ts` no longer defines it (grep for `interface MutationErrorBody` returns only `errors.ts`). `pnpm -C app typecheck` exits zero.
9. Open Issues bullet in `05-dispatch-api.md` for the `MutationErrorBody` home struck with forward pointer.

**Item 4 — Tool-contract reminder assertion:**

10. `server/test/dispatcher/prompts/shared.test.ts` passes as part of `pnpm -C server test`. The test file lists all five canonical tool names.
11. Open Issues bullet in `04-prompt-templates.md` for the reminder manual-sync risk struck with forward pointer.

**Item 5 — Mode A lifecycle decision:**

12. `docs/00-project.md` §6.2 contains an explicit paragraph or callout on Mode A forward-decompose parent status.
13. `docs/06-agent-dispatcher/04-prompt-templates.md` D12 row references the PRD decision. The Mode A Open Issues bullet is struck.

---

## Children

None. This is a leaf node.
