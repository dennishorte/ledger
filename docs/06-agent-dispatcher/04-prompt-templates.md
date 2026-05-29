# Prompt Templates

**Node ID:** `06-agent-dispatcher/04-prompt-templates`
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** VERIFY
**Created:** 2026-05-28
**Last Updated:** 2026-05-29 (IN_PROGRESS → VERIFY — stage-4 implementation complete)

**Dependencies:** `06-agent-dispatcher/02-runner-tools` (the MCP tool surface the templates reference in their tool-contract reminder), `06-agent-dispatcher/03-claude-code-executor` (loose-coupled at the function signature `renderPrompt(task, ctx): string` — sibling leaf running in parallel, no file overlap per parent's §Children carve-up)

---

## Requirements

Ship the **eight per-task-type prompt templates** plus the shared composition helpers that the `ClaudeCodeExecutor` invokes to build the prompt for each dispatched `claude` subprocess. Each template returns the full text that will be piped to claude's stdin: persona preamble, task-doc context, required-reading manifest, success criteria, MCP-tool contract reminder. After this leaf, every dispatched task type is paired with a template that gives the agent a coherent role, the documents it must read, the success bar it must meet, and the MCP tool calls it must make.

This is the **fourth sub-leaf** of `06-agent-dispatcher`, parallelizable with `03-claude-code-executor` per parent's `01 → 02 → {03, 04} → 05` build order. The parent's Children manifest names it: `Eight per-task-type TS prompt templates (implement, spec_review, verify, spec_draft, reverify, doc_refactor, issue_triage, project_status_review) plus a shared.ts helper (persona preamble, MCP-tool contract reminder, required-reading composition); template registry in prompts/index.ts; default resource-claim declarations per type (D11)`.

The carve-up vs `03-claude-code-executor`: this leaf owns `server/src/dispatcher/prompts/`; `03` owns `server/src/dispatcher/executor/`. The single cross-leaf coupling is the exported `renderPrompt(task: Task, ctx: ProjectContext): string` function from `prompts/index.ts` — `03`'s executor calls it once per dispatch. No file overlap; parallel implementation safe per leaf-workflow Known Limitations.

In scope for v1:

1. **`server/src/dispatcher/prompts/` module** with ten files:
   - `index.ts` — the registry: `renderPrompt(task, ctx): string` switches on `task.type`, calls the right template. Also exports `defaultResourceClaims(task): ResourceClaim[]` (item 4 below).
   - `shared.ts` — composition helpers consumed by all eight templates: `personaPreamble(persona: Persona): string`, `mcpToolContractReminder(): string`, `requiredReadingSection(paths: string[]): string`, `taskHeaderBlock(task, ctx): string`.
   - Eight template files, one per task type: `implement.ts`, `specReview.ts`, `verify.ts`, `specDraft.ts`, `reverify.ts`, `docRefactor.ts`, `issueTriage.ts`, `projectStatusReview.ts`. Each exports `default function render(task, ctx): string`.
2. **Persona definitions** — eight personas, one per task type, defined in `shared.ts`'s `personaPreamble`. Each is three to six sentences setting the agent's role for that task type. The personas mirror the operator's playbook from `docs/process/leaf-workflow.md` — the `implement` persona is a code-writer per leaf-workflow stage 4; `spec_review` and `verify` are reviewers per stages 2 and 6; etc. Personas are *content* decisions captured in this leaf rather than spread across templates; templates compose `personaPreamble("implement")` to build the prompt header.
3. **MCP-tool contract reminder** — `shared.ts`'s `mcpToolContractReminder()` returns a fixed three-paragraph block:
   - Paragraph 1: "You are working on task `<task_id>` (shown in the task header at the top of this prompt; also available as the `LEDGER_TASK_ID` env var). The `runner.*` MCP tools require this task_id as their first argument; calls with any other task_id are rejected with `task_not_bound`."
   - Paragraph 2: "Emit `runner.emit_event` for each meaningful step: reasoning summary (kind=`reasoning`), tool_call summary (kind=`tool_call`), artifact written (kind=`artifact`). Do NOT emit `status_change` events — those are managed by the runner."
   - Paragraph 3: "End with exactly one of: `runner.complete_task` (success), `runner.fail_task` (with a verbatim agent-supplied reason; stored on the status_change event), `runner.await_human_review` (with a `review_payload: { summary, diffRef? }` — pauses the task for operator approve/reject via `/api/tasks/:id/approve|reject`)."
4. **`defaultResourceClaims(task): ResourceClaim[]`** in `index.ts`. The default for any doc-node-driven dispatched task is `[{ kind: "node", nodeId: task.id, mode: "write" }]` per parent D11 — the dispatched implementation writes the node's spec doc. Eight templates override or extend the default:
   - `implement` — `[{ kind: "node", nodeId: task.id, mode: "write" }]` (writes the spec doc + the source files; for v1 we only declare the node-level write because the source-file resource-claim surface is not yet defined).
   - `spec_review` — `[{ kind: "node", nodeId: task.id, mode: "read" }]` (review reads the spec; no writes).
   - `verify` — `[{ kind: "node", nodeId: task.id, mode: "read" }, { kind: "node", nodeId: task.parentTaskId, mode: "read" }]` (verification reads spec + parent doc + the implementation diff; for v1 we declare the doc reads only; the second entry is conditional — only included if `task.parentTaskId` is defined).
   - `spec_draft` — `[{ kind: "node", nodeId: task.id, mode: "write" }]` (draft writes the spec).
   - `reverify` — same as `verify`.
   - `doc_refactor` — `[{ kind: "node", nodeId: task.id, mode: "write" }]` (refactor writes the spec).
   - `issue_triage` — `[{ kind: "node", nodeId: task.id, mode: "write" }]` (triage writes the spec's Open Issues section).
   - `project_status_review` — `[{ kind: "node", nodeId: "00-project", mode: "read" }]` (project-status review reads the PRD; no writes).
   `defaultResourceClaims` is what `05-dispatch-api`'s `POST /api/dispatch/:nodeId` endpoint reads to populate the synthesised task's `resourceClaims` field if the operator did not override via the request body.
5. **Required-reading composition** — each template's `requiredReadingSection` call lists the file paths the agent must load. The agent's `Read` tool does the actual reading; the template embeds the list as a bullet block. The list per template:
   - `implement`: `CLAUDE.md`, the task's spec doc, the parent spec doc, dependency-leaf specs (transitive), and the actual source files referenced in the spec's §Design.
   - `spec_review`: `CLAUDE.md`, the spec under review, the parent doc, sibling specs (style benchmark), existing types in `app/src/lib/types.ts` AND `packages/parser/src/runner/types.ts`.
   - `verify`: `CLAUDE.md`, the spec, the parent doc, the worktree's diff (via `git diff main..HEAD` from the worktree path), the source files modified by the implementer.
   - `spec_draft`: `CLAUDE.md`, the parent doc, sibling specs (gold-standard benchmark), the PRD `docs/00-project.md` §6.1 (schema), `docs/process/leaf-workflow.md` (procedure).
   - `reverify`: same as `verify`.
   - `doc_refactor`: `CLAUDE.md`, the spec being refactored, the parent doc, the §Open Issues section's flagged items.
   - `issue_triage`: `CLAUDE.md`, the spec, the parent doc, the events table for the task (via `runner.get_task`).
   - `project_status_review`: `CLAUDE.md`, the PRD, the project's `MEMORY.md` (if present), recent merge-commit messages.
6. **`taskHeaderBlock(task, ctx)`** — three-line block that opens every prompt: "Task ID: `<task.id>`", "Task type: `<task.type>`", "Project root: `<ctx.projectRoot>`". The agent uses these as the literal substitutions for the MCP-tool contract reminder's `<task_id>` placeholder and for any path resolutions. The block is positioned BEFORE the persona preamble so the agent's first read establishes context.
7. **Persona type** — `type Persona = Exclude<TaskType, "noop" | "human_review" | "operator_session" | "agent_task">`. The canonical `TaskType` in `@ledger/parser/runner/types.ts` includes twelve members; only the eight dispatcher types have personas. The `Exclude` keeps TypeScript's exhaustiveness over `Record<Persona, string>` correct — a missing persona entry fails at compile time. Spec Review B3 caught this: the original `Persona = TaskType` would have required four extra `PERSONA_PREAMBLES` entries (for the non-dispatcher types) or would have failed `Record<Persona, string>`'s exhaustiveness check.
8. **Tests** at `server/test/dispatcher/prompts/`:
   - `index.test.ts` — `renderPrompt` returns a non-empty string for each of the eight task types against a sample `Task` + `ProjectContext` fixture; throws on an unknown task type (defensive, even though TypeScript's exhaustiveness check should catch); `defaultResourceClaims` returns the right shape per type.
   - `shared.test.ts` — `personaPreamble("implement")` differs from `personaPreamble("spec_review")` (distinct content per persona); `mcpToolContractReminder()` is stable (snapshot); `requiredReadingSection(paths)` formats correctly with empty + non-empty input; `taskHeaderBlock` includes the three required fields verbatim.
   - One snapshot per template — `implement.snapshot.test.ts` etc., asserting the rendered string against a stored fixture. Snapshots catch unintended prompt drift; updating a template requires updating the snapshot in the same commit. Vitest's built-in inline-snapshot support keeps the snapshots colocated with the test.
9. **Build / typecheck / lint / test green** across the workspace. App bundle delta zero. Server `dist/` delta reported in Implementation Notes against the post-`02-runner-tools` baseline (360K) — actual delta depends on whether `03` lands first or after.

**Out of scope for this child:**

- **The executor that consumes `renderPrompt`.** `03-claude-code-executor`. This leaf exports the function; that leaf calls it.
- **`POST /api/dispatch/:nodeId`'s use of `defaultResourceClaims`.** `05-dispatch-api`. This leaf exports `defaultResourceClaims(task): ResourceClaim[]`; that leaf consumes it to populate the synthesised `TaskInput.resourceClaims` when the operator's request body does not specify claims.
- **Template hot-reload.** D10 of the parent acknowledges TS-function templates trade hot-reload for unit-testability. Restarting the server is the iteration loop for v1. A `--reload-prompts` flag is a future polish item.
- **Multi-language prompts.** All templates are English-only. i18n would require a translation layer; not in scope.
- **Prompts that fetch resources dynamically (e.g., from a docs-API).** The templates compose static strings + fixed file-path lists; the agent loads docs via its `Read` tool. No `runner.read_doc` MCP resource (parent D6).
- **Cost/token budgets per template.** PRD §13 non-goal; no per-template `maxTokens` config.
- **Per-operator prompt customization.** All templates are codebase-canonical. Operators wanting a custom persona fork the template; v1 has no override surface.
- **Prompt-output JSON schemas.** The templates produce free-form text; the agent's behaviour is constrained by the MCP-tool contract (kind=reasoning, kind=tool_call, etc.) rather than by a JSON-Schema-validated response. `--json-schema` flag on `claude` is not used.
- **Few-shot examples in prompts.** v1 templates rely on persona + required-reading + tool-contract reminder. No `Example 1: ...` blocks. Adding examples is straightforward later if observed agent behaviour falls short.
- **`MEMORY.md` integration beyond `project_status_review`'s required reading.** The agent's auto-memory system is separate; this leaf's `project_status_review` template tells the agent to read it. No cross-template memory wiring.
- **Sibling-doc dependency-tree expansion** (the `implement` persona's "dependency-leaf specs (transitive)" item). v1 lists direct dependencies only — the implementer of `implement.ts` extracts `Dependencies:` from the spec's front-matter and emits each as a required-reading path. Transitive resolution would require walking the parser's `DocGraph`; defer to v2 if observed agent confusion warrants it.

---

## Design

### Repository layout after this node

```
ledger/
├── server/
│   └── src/
│       └── dispatcher/
│           ├── index.ts                       # modified — re-export renderPrompt, defaultResourceClaims
│           └── prompts/                       # NEW
│               ├── index.ts                   # NEW — renderPrompt + defaultResourceClaims registry
│               ├── shared.ts                  # NEW — personaPreamble, mcpToolContractReminder, etc.
│               ├── implement.ts               # NEW — implement template
│               ├── specReview.ts              # NEW
│               ├── verify.ts                  # NEW
│               ├── specDraft.ts               # NEW
│               ├── reverify.ts                # NEW
│               ├── docRefactor.ts             # NEW
│               ├── issueTriage.ts             # NEW
│               └── projectStatusReview.ts     # NEW
├── server/test/
│   └── dispatcher/
│       └── prompts/                           # NEW
│           ├── index.test.ts
│           ├── shared.test.ts
│           ├── implement.snapshot.test.ts
│           ├── specReview.snapshot.test.ts
│           ├── verify.snapshot.test.ts
│           ├── specDraft.snapshot.test.ts
│           ├── reverify.snapshot.test.ts
│           ├── docRefactor.snapshot.test.ts
│           ├── issueTriage.snapshot.test.ts
│           └── projectStatusReview.snapshot.test.ts
└── docs/
    └── 06-agent-dispatcher/
        ├── 00-agent-dispatcher.md             # modified — manifest row PLANNED → DRAFT → …
        └── 04-prompt-templates.md             # this spec
```

### `index.ts` — the registry

```ts
// server/src/dispatcher/prompts/index.ts
import type { Task, ResourceClaim } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";
import implement from "./implement.js";
import specReview from "./specReview.js";
import verify from "./verify.js";
import specDraft from "./specDraft.js";
import reverify from "./reverify.js";
import docRefactor from "./docRefactor.js";
import issueTriage from "./issueTriage.js";
import projectStatusReview from "./projectStatusReview.js";

// Spec Review S1: typed Record<Persona, ...> instead of `as const` — this gives us real
// exhaustiveness over the eight dispatcher types. A new dispatcher type added to Persona
// without an entry here fails at compile time.
import type { Persona } from "./shared.js";

const renderers: Record<Persona, (task: Task, ctx: ProjectContext) => string> = {
  implement, spec_review: specReview, verify,
  spec_draft: specDraft, reverify, doc_refactor: docRefactor,
  issue_triage: issueTriage, project_status_review: projectStatusReview,
};

function isPersona(type: Task["type"]): type is Persona {
  return type !== "noop" && type !== "human_review" && type !== "operator_session" && type !== "agent_task";
}

export function renderPrompt(task: Task, ctx: ProjectContext): string {
  if (!isPersona(task.type)) {
    throw new Error(`renderPrompt: no template for non-dispatcher task type "${task.type}"`);
  }
  return renderers[task.type](task, ctx);
}

export function defaultResourceClaims(task: Task): ResourceClaim[] {
  switch (task.type) {
    case "implement":
    case "spec_draft":
    case "doc_refactor":
    case "issue_triage":
      return [{ kind: "node", nodeId: task.id, mode: "write" }];
    case "spec_review":
      return [{ kind: "node", nodeId: task.id, mode: "read" }];
    case "verify":
    case "reverify":
      return [
        { kind: "node", nodeId: task.id, mode: "read" },
        ...(task.parentTaskId ? [{ kind: "node", nodeId: task.parentTaskId, mode: "read" } as const] : []),
      ];
    case "project_status_review":
      return [{ kind: "node", nodeId: "00-project", mode: "read" }];
    default:
      return [];
  }
}
```

The registry's `as const` typing makes `renderers` a record with the exact keys; the `task.type as keyof typeof renderers` cast is the runtime check the throw guards. The throw is defensive (TypeScript's exhaustiveness over `TaskType` would catch a missing key at compile time if `TaskType` ever broadens, but a future task type added by a sibling leaf without updating this registry would surface here at runtime).

### `shared.ts` — composition helpers

```ts
// server/src/dispatcher/prompts/shared.ts
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";

export type Persona = Exclude<Task["type"], "noop" | "human_review" | "operator_session" | "agent_task">;

export function taskHeaderBlock(task: Task, ctx: ProjectContext): string {
  return [
    `Task ID: ${task.id}`,
    `Task type: ${task.type}`,
    `Project root: ${ctx.projectRoot}`,
  ].join("\n");
}

const PERSONA_PREAMBLES: Record<Persona, string> = {
  implement: `You are an implementer in a documentation-driven engineering workflow. The spec document you will read has gone through DRAFT → SPEC_REVIEW → APPROVED — your job is to ship the code it prescribes, exactly. Do not redesign. The Spec Review (YYYY-MM-DD) audit table is the highest-leverage section; those are known risk areas the spec author would otherwise miss. You will run gates yourself (typecheck, lint, test) and report results.`,
  spec_review: `You are an independent spec reviewer. The author cannot reliably check their own work; your job is to give cold, critical judgment. Read the spec under review plus the parent and sibling specs as house-style benchmarks. Verdict, PRD coverage matrix, findings grouped by severity (Blocking / Should-fix / Nit) with concrete suggested fixes. Be specific. Cite file paths and line numbers.`,
  verify: `You are an implementation verifier. The implementer ran in a worktree; you run cold against their diff. Run all gates yourself. Spot-check the implementer's claims against the actual code. Verdict (READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS), findings by severity, deviation assessments. Be terse but specific.`,
  spec_draft: `You are a spec author for a documentation-driven engineering workflow. Your DRAFT is the first commit in a leaf's lifecycle; it will go through SPEC_REVIEW → APPROVED before implementation. Match the depth and tone of the sibling specs you will be pointed at. Tables in Decisions, Open Issues priority-tagged, pseudocode annotated with file paths, explicit out-of-scope bullets.`,
  reverify: `You are a re-verifier. The implementer's work failed an earlier verification (status was bumped VERIFY → ISSUE_OPEN → APPROVED → IN_PROGRESS → VERIFY); now you check that the issues caught are actually resolved. Read the prior Implementation Review audit table for context. Same verdict shape as a fresh verifier.`,
  doc_refactor: `You are a doc refactorer. The spec you will rewrite has accumulated drift between code and documentation, or its §Open Issues section has grown to a size where it's blocking implementer attention. Your job is to bring the spec back into agreement with the code (or vice versa, if the code is wrong) and tighten the Open Issues. Do not change the spec's lifecycle status. Update §Implementation Notes with a "Refactored YYYY-MM-DD" subsection summarizing what changed and why.`,
  issue_triage: `You are an issue triager. Walk the spec's §Open Issues section and the events table for this task (via runner.get_task). Each issue: is it still valid? Is its priority right? Has the codebase changed since it was filed in a way that makes it invalid? Output a revised §Open Issues table with the same rows but updated priorities and resolution status. Mark resolved-but-not-yet-removed issues with "RESOLVED YYYY-MM-DD — <how>".`,
  project_status_review: `You are a project-status reviewer. Read the PRD (docs/00-project.md), the round-2 progress lines in CLAUDE.md, the recent merge commits, and any MEMORY.md. Summarise: current focus (which leaf is mid-lifecycle), blocking dependencies, next-up leaves, drift between PRD §14's manifest and actual lifecycle states. Aim for under 500 words; the operator reads it cold.`,
} as const;

export function personaPreamble(persona: Persona): string {
  return PERSONA_PREAMBLES[persona];
}

export function mcpToolContractReminder(): string {
  return `## MCP tool contract

You are working on a task whose id was passed to you via the LEDGER_TASK_ID environment variable. The runner.* MCP tools you have access to all require this task_id as their first argument; calls with any other task_id are rejected with a "task_not_bound" error.

Emit runner.emit_event for each meaningful step. The event's required shape varies by kind (full schema in docs/_schemas/log-event.schema.json):
  - kind: "reasoning" — { text: string, subkind: "thinking" | "message" }
  - kind: "tool_call" — { callId: string, toolName: string, arguments: object } (a summary of a non-MCP tool call: Read, Edit, Bash, etc.)
  - kind: "artifact" — { artifactKind: "doc_created" | "doc_updated" | "file_written" | "version_committed", path: string } (a file or doc you wrote or modified)
Do NOT emit kind: "status_change" events — the runner manages those transactionally; the validator rejects them with status_change_not_emittable.
Malformed events (missing required fields) are rejected with invalid_event_shape and an ajv error list — fix and retry.

End with exactly one terminal call:
  - runner.complete_task — success
  - runner.fail_task — with an agent-supplied reason string (stored verbatim on the status_change event)
  - runner.await_human_review — with a review_payload { summary: string, diffRef?: string }; the task pauses for the operator to approve or reject via /api/tasks/:id/approve|reject. On approve, a follow-up task may be created; on reject, the rationale is recorded and the task transitions to REJECTED.`;
}

export function requiredReadingSection(paths: string[]): string {
  if (paths.length === 0) return "## Required reading\n\n(no documents required for this task.)";
  return [
    "## Required reading",
    "",
    "Load these files via the Read tool before acting. They establish constraints you must honour:",
    "",
    ...paths.map((p) => `- ${p}`),
  ].join("\n");
}
```

The `PERSONA_PREAMBLES` const is a `Record<Persona, string>` — TypeScript's exhaustiveness check catches a missing persona if a new `TaskType` lands without an entry. The preambles are short on purpose (three to six sentences each) — the agent's behaviour comes from the persona + required reading + tool contract, not from a wall of instruction text.

### Per-template structure (example)

All eight templates follow the same skeleton; `implement.ts` is the reference:

```ts
// server/src/dispatcher/prompts/implement.ts
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";
import {
  taskHeaderBlock, personaPreamble,
  mcpToolContractReminder, requiredReadingSection,
} from "./shared.js";

export default function render(task: Task, ctx: ProjectContext): string {
  const docPath = pathForNodeId(task.id);
  const parentPath = task.parentTaskId ? pathForNodeId(task.parentTaskId) : undefined;
  const requiredReading = [
    "CLAUDE.md",
    docPath,
    ...(parentPath ? [parentPath] : []),
  ];
  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Implementer persona",
    "",
    personaPreamble("implement"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    "1. The spec at " + docPath + " is APPROVED; ship the code it prescribes exactly. Do not redesign.",
    "2. Pay specific attention to the Spec Review (YYYY-MM-DD) audit table — those are known-risk closures.",
    "3. Status bumps: APPROVED → IN_PROGRESS (entry commit, status-only), then IN_PROGRESS → VERIFY (exit commit, code + Implementation Notes).",
    "4. Run all gates yourself: pnpm -C packages/parser build, pnpm -C server build, pnpm typecheck, pnpm lint, pnpm test. All must exit zero.",
    "5. Fill Implementation Notes with: deps pinned, bundle delta, deviations from spec (with rationale), gates run + results, acceptance-check items the headless env cannot verify.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}

// pathForNodeId stubbed here; lives in shared.ts and walks the doc tree.
declare function pathForNodeId(id: string): string;
```

**`pathForNodeId` requires a new parser-side export** (Spec Review S3 caught this — the original spec claimed `nodeIdToSourcePath` "already exists" but it doesn't; the parser only exports `buildDocGraph` and `idForPath` (path → id, the inverse direction)). The implementer adds a new export to `@ledger/parser`:

```ts
// packages/parser/src/docs/buildDocGraph.ts (additive — new exported function)
/**
 * Resolves a NodeId back to its source `docs/` path by walking the DocNode array.
 * O(n) on first call; consumers cache the resulting map if they call frequently.
 * Returns undefined for synthetic-only nodes (no `authored` source file).
 * Counterpart to the existing idForPath() helper.
 */
export function pathForNodeId(nodes: readonly DocNode[], nodeId: NodeId): string | undefined {
  for (const n of nodes) if (n.id === nodeId && n.source) return n.source;
  return undefined;
}
```

Re-export from `packages/parser/src/index.ts`. `shared.ts` then imports `buildDocGraph + pathForNodeId` and resolves at render time. The `ProjectContext` already holds the parsed docs (loaded by `loadProjectContext`), so the templates pass `ctx.docs` (or equivalent) through to `pathForNodeId(ctx.docs, nodeId)`. The exact `ProjectContext` field name is checked at implementation time against the actual `context.ts` shape; if the docs aren't already exposed on context, the implementer adds them.

The cross-package addition is small (~10 LOC + 1 export line + 1 re-export) but is genuinely net-new work for this leaf — flagged in Open Issues so future readers don't repeat the search.

### Persona content — distinguishing notes

The personas differ in their emphasis. Spot-check across the eight:

- `implement` — "ship exactly," "do not redesign," "Spec Review audit table is highest-leverage"
- `spec_review` — "cold judgment," "PRD coverage matrix," "cite file paths and line numbers"
- `verify` — "run gates yourself," "spot-check claims against code," "verdict ladder"
- `spec_draft` — "match sibling depth," "tables in Decisions," "out-of-scope bullets explicit"
- `reverify` — "read the prior audit," "same verdict shape"
- `doc_refactor` — "bring spec and code into agreement," "tighten Open Issues," "no lifecycle status change"
- `issue_triage` — "walk Open Issues," "is each still valid?", "revised table with updated priorities"
- `project_status_review` — "summarise current focus + blockers + drift," "under 500 words"

Each persona maps to an operator-recognisable activity from `docs/process/leaf-workflow.md` or its analogues. The personas exist to give the agent a coherent role frame; the actual behaviour is constrained by the tool contract.

### Acceptance check (manual, end-to-end)

1. `pnpm -C packages/parser build` and `pnpm -C server build` complete clean (no new deps).
2. `renderPrompt(<sample task of each type>, <sample ctx>)` returns a non-empty string of the expected shape (snapshot-tested).
3. `defaultResourceClaims(<sample task of each type>)` returns the prescribed shape per task type.
4. Cross-leaf integration once `03-claude-code-executor` lands: the executor calls `renderPrompt(task, ctx)`, pipes the result to `claude --print --bare --mcp-config <path>`'s stdin, and the agent's first MCP tool call is reasonable for the task type. Verifiable end-to-end through `05-dispatch-api`'s eventual flow; intermediate verification (without `05`) is via the fake-claude fixture from `03`.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test` exit zero across the workspace; snapshots match.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | TS function templates, not a templating language (parent D10 inheritance, restated for in-leaf clarity) | Mustache/Handlebars-style templating encourages logic-in-template. TS functions keep logic in the function body where it's unit-testable without a template-rendering harness. Snapshots catch unintended prompt drift. The cost ("less hot-reload-friendly") is acceptable: prompt iteration is an offline activity (write, restart, dispatch). |
| D2 | One template file per task type (eight files), not one big switch in `index.ts` | Eight small files keep each template under ~80 lines of source. A single switch would push toward 600+ LOC in one file. Single-template editing is the realistic iteration unit; co-locating each template with its own snapshot test is the natural Vitest pattern. |
| D3 | Persona preambles defined as a `Record<Persona, string>` const in `shared.ts`, not as per-template string literals | A central record makes the cross-persona comparison test (`personaPreamble("implement") !== personaPreamble("spec_review")`) trivial; it also forces exhaustiveness (TypeScript catches a new `TaskType` without a corresponding persona). The alternative — string literal inside each template — would spread the persona content across eight files with no compile-time check that all eight exist. |
| D4 | MCP-tool contract reminder is a single fixed function (`mcpToolContractReminder(): string`), not a per-template variation | The contract is identical across all eight templates: which tools to call, how to emit events, which terminal call to make. Variation across personas (e.g., spec_review-specific tool guidance) is content the persona preamble carries, not the tool reminder. Centralising keeps the contract drift-free as `02-runner-tools` ships future tool additions. |
| D5 | `defaultResourceClaims(task)` lives in `index.ts` alongside `renderPrompt`, not in a separate `claims.ts` | The two functions are read together by `05-dispatch-api`'s endpoint (one synthesises the prompt; the other synthesises the claims). Co-locating reduces import noise at the consumer site. The implementation is a switch — small enough to share the file with the renderer registry. |
| D6 | `taskHeaderBlock` is positioned BEFORE the persona preamble in every template | The agent's first read should establish `task.id`, `task.type`, `ctx.projectRoot` — without these the MCP tool calls cannot be made correctly. Persona content references them ("you are working on task <id>"), so the order matters. |
| D7 | `pathForNodeId` lives in `shared.ts`, not as a per-template inline | The path resolution depends on the parser's `nodeIdToSourcePath` index; importing the parser in every template would couple eight files to one external module. Centralising in `shared.ts` reduces coupling and lets the snapshot tests stub the resolution if needed. |
| D8 | Snapshot tests use Vitest's inline-snapshot support, NOT a separate `__snapshots__` directory; fixture inputs use deterministic values (Spec Review S2) | Inline snapshots colocate the expected output with the test code, making prompt drift visible in the same diff as the code change. The alternative (separate snapshot files) creates a two-place edit story for every template tweak. To keep snapshots portable across machines, snapshot tests pin: `task.id = "00000000-0000-0000-0000-000000000001"` (deterministic UUID), `projectRoot = "/project"` (fixed path), and any other non-deterministic input (Created/Last-Updated timestamps in `taskHeaderBlock` if added in v2) gets the same treatment. No `crypto.randomUUID()` or `os.cwd()` in the fixture. Snapshot maintenance is the operator's discipline: rerun `pnpm test -- -u` to update; inspect the diff in code review. |
| D9 | No "few-shot examples" in v1 templates | Persona + required reading + tool contract are the constraints. Few-shot examples would balloon the prompt size, increasing token cost per dispatch and possibly biasing the agent toward example patterns. Add examples only when observed agent behaviour falls short. |
| D10 | English-only; no i18n layer | Single-language v1; i18n is a future feature that requires its own architectural decisions. |
| D11 | `Persona = Exclude<Task["type"], "noop" \| "human_review" \| "operator_session" \| "agent_task">` (the eight dispatcher types only) | The canonical `TaskType` in `@ledger/parser/runner/types.ts` has twelve members; four (`noop`, `human_review`, `operator_session`, `agent_task`) are not dispatched and have no persona. Using bare `Task["type"]` (the original draft choice) would require four extra `PERSONA_PREAMBLES` entries or would silently break `Record<Persona, string>`'s exhaustiveness check — Spec Review B3 caught this. The `Exclude` keeps the exhaustiveness real. |

---

## Open Issues

- **Templates use static path lists, not dynamic dependency resolution.** The `implement` persona's required-reading list mentions "dependency-leaf specs (transitive)" but the v1 implementation embeds direct dependencies only. Transitive resolution would walk the `DocGraph` from `@ledger/parser`. Defer until observed agent confusion warrants. *(Priority: LOW.)*
- **No few-shot examples.** D9 deferred. Add when an agent's behaviour for a specific task type observably misfires. *(Priority: LOW.)*
- **`pathForNodeId` couples templates to the parser's index.** If the parser's index API changes (rename, signature shift), all eight templates fail. The wrapper helper in `shared.ts` is the choke point; type-check catches it. *(Priority: TRIVIAL.)*
- **Persona preambles are codebase-canonical; no operator override.** Parent D11 prescribes operator overrides on `defaultResourceClaims` via the dispatch endpoint's body, but template content has no equivalent override surface. Forking the template is the v1 escape hatch. *(Priority: TRIVIAL.)*
- **Snapshot updates are an operator-discipline item, not automated.** Drift between code and snapshot fails the test; the operator runs `pnpm test -- -u` to update + reviews the diff. A future CI workflow could automate the snapshot update under a PR-comment gate. *(Priority: TRIVIAL.)*
- **MCP tool contract reminder is fixed-string; future tool additions in `02-runner-tools` require manual reminder update.** A future `runner.delegate_subtask` or `runner.pause` tool would need a new paragraph in the reminder. v1 documents this as a follow-up: when a sibling adds tools, update `mcpToolContractReminder()` in the same commit. *(Priority: TRIVIAL.)*
- **`project_status_review` template's "MEMORY.md (if present)" path resolution is unspecified.** MEMORY.md may not exist in every project; the template lists it conditionally. Implementer reads `~/.claude/projects/<project-id>/memory/MEMORY.md` via the operator's claude install. If the file doesn't exist, the agent's Read tool returns an error; the prompt prepares the agent for that case. Verbiage in the template, not a code path. *(Priority: TRIVIAL.)*
- **`ProjectContext.docs: readonly DocNode[]` is publicly exposed but only read via `ctx.resolveDocPath(...)` (Implementation Review N2).** No external consumer reads the raw array yet. Defensible as future-proofing for `05-dispatch-api` which may enumerate nodes; if `05-dispatch-api` lands without using it, the field should be removed at that leaf's COMPLETE boundary. *(Priority: TRIVIAL.)*

---

## Spec Review (2026-05-28)

Independent spec review was run against this DRAFT in a clean Sonnet context. Verdict: **NEEDS_MINOR_REVISIONS** — 3 Blocking (B1, B2, B3), 4 Should-fix (S1–S4), 4 Nits (N1–N4), 6 Confidence notes. PRD coverage matrix returned Addressed across §5/§6.1/§6.2/§7/§10/§11/§14 + parent D10/D11. All findings applied. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `task.parent_task_id` (snake_case) in `defaultResourceClaims` and `implement.ts` would be a TS strict compile error — the canonical `Task` field is `parentTaskId` (camelCase, line 68 of `@ledger/parser/src/runner/types.ts`). The prose Requirements §4 used a third variant `task.parentId`. | All three sites updated to `task.parentTaskId`. Spec is now spelling-consistent across code + prose. |
| B2 | Six of the eight prose claim bullets in Requirements §4 omitted `kind: "node"` — the canonical `ResourceClaim` is a discriminated union (`{ kind: "node" \| "path", ... }`), so omitting `kind` would not satisfy the type. Code block at line 150 was correct; only prose drifted. | All eight bullets aligned with the discriminant: `{ kind: "node", nodeId: ..., mode: ... }`. |
| B3 | `Persona = Task["type"]` would expand to twelve members (the canonical `TaskType` includes `noop`, `human_review`, `operator_session`, `agent_task` beyond the eight dispatcher types). `Record<Persona, string>` with only eight entries would fail TS exhaustiveness. | `Persona = Exclude<Task["type"], "noop" \| "human_review" \| "operator_session" \| "agent_task">` in §Requirements item 7, §Design `shared.ts`, and §Decisions D11. The `Record<Persona, (task, ctx) => string>` typing in `renderers` (S1 fix) now exhausts correctly. |
| S1 | The `renderers` const used `as const` + a runtime cast that defeated TS exhaustiveness — a missing dispatcher persona would silently throw at runtime instead of failing at compile time. | Rewrote as `const renderers: Record<Persona, (task, ctx) => string> = { ... }` with a typed `isPersona(type): type is Persona` narrowing function. Now the registry is exhaustively type-checked at compile time; the runtime guard handles only the non-dispatcher types. |
| S2 | Snapshot tests would be non-portable across machines because the fixture used real UUIDs and machine-specific `projectRoot`. | D8 amended: fixture pins `task.id = "00000000-0000-0000-0000-000000000001"` and `projectRoot = "/project"`; no `crypto.randomUUID()` or `os.cwd()`. Snapshot stability is now spec-prescribed, not implementation-discretion. |
| S3 | `pathForNodeId` claimed to use the parser's `nodeIdToSourcePath` index — which doesn't exist. The parser exports only `buildDocGraph` and `idForPath` (the inverse path → id direction). | §Design's `pathForNodeId` block rewritten: the implementer adds a new `pathForNodeId(nodes, nodeId): string \| undefined` export to `@ledger/parser` (additive, ~10 LOC). The function walks the `DocNode[]` array linearly; consumers cache if they call frequently. Cross-package addition flagged in Open Issues. |
| S4 | `mcpToolContractReminder()` described `kind: "artifact"` as just "a file you wrote or modified" — missing the required `artifactKind` discriminant. An agent following the prompt literally would emit `{ kind: "artifact", path: "..." }` and fail ajv with `invalid_event_shape`. | Reminder paragraph 2 expanded: each kind now lists its required fields verbatim. `reasoning` → `{ text, subkind }`. `tool_call` → `{ callId, toolName, arguments }`. `artifact` → `{ artifactKind, path }`. Also added explanation of what happens on validation failure (`invalid_event_shape` with ajv errors) so the agent knows how to recover. |
| N1 | `mcpToolContractReminder` redundantly told the agent to read `LEDGER_TASK_ID` env var when the task id is already in `taskHeaderBlock` at the top of the prompt. | Paragraph 1 updated to mention both sources: the task header (primary; the agent sees it before reasoning starts) and the env var (backup; subprocess-level fact). |
| N2 | Comment on the registry's `as const` cast claimed TS exhaustiveness would catch missing keys — false, because the cast itself defeated exhaustiveness. | Resolved by S1's typed-`Record` rewrite. The new code is genuinely exhaustive at compile time; no misleading comment remains. |
| N3 | Open Issue had a `D-?` placeholder for the persona-override concern. | Updated to cite parent D11 explicitly, with rationale that template-content overrides have no v1 surface and forking is the escape hatch. |
| N4 | `project_status_review` persona said "Keep the report under 500 words" — not actually enforceable at the prompt layer; misleading as a hard constraint. | Softened to "Aim for under 500 words" — same guidance, accurate framing. |

Reviewer's **Confidence notes** (recorded for the stage-4 implementer):

1. **`Task.parentTaskId` camelCase verified** at `packages/parser/src/runner/types.ts` line 68.
2. **`TaskType` includes 12 members** (`operator_session` and `agent_task` confirmed at lines 37–38).
3. **`nodeIdToSourcePath` does NOT exist** in `@ledger/parser`; only `buildDocGraph` and `idForPath`. The B3 fix introduces the new export.
4. **`artifactKind` required** in `log-event.schema.json` line 77 (`required: ["kind", "artifactKind", "path"]`) and in the TS union. The S4 fix aligns the prompt with the validator.
5. **Snapshot instability** is design-implied; not verified against a running test, but the S2 fixture pinning closes the gap.
6. **`pathForNodeId` is the highest-risk implementation gap** (S3) — architectural, not text. The new parser export is small but cross-package; stage-4 implementer adds it before the prompt templates can compile.

Reviewer's structural assessment: scope matches parent's Children manifest row + parent D10 (TS function templates) + parent D11 (resource-claim defaults). Personas are sufficiently distinct (S-quality assessment, not literal); no persona contradicts itself. Spec internally consistent post-fixes. Ready for APPROVED.

Nothing punted; all 3 blocking + 4 should-fix + 4 nits + 6 confidence notes landed.

---

## Implementation Notes

**v1 — 2026-05-29**

### No new deps

No new `package.json` dependencies. All imports are from `@ledger/parser` (already in workspace), `../../context.js` (existing server module), and `./shared.js` (this leaf). Server `dist/` size: 484K total (cumulative dist size after build; the original 484K figure was misattributed to "03's additions too" but 03 is on a separate branch — the implementation review (2026-05-29) caught this). The pure-prompts-leaf delta is ~10 new compiled TS files at well under 50K. App bundle delta: zero.

### `pathForNodeId` — additive parser export

Added `export function pathForNodeId(nodes: readonly DocNode[], nodeId: NodeId): string | undefined` to `packages/parser/src/docs/buildDocGraph.ts` (O(n) linear scan; consumers cache if they call frequently). Re-exported from `packages/parser/src/index.ts`. Wired in `server/src/context.ts` as `resolveDocPath: (nodeId) => pathForNodeId(docs, nodeId)` where `docs` is the `DocNode[]` loaded at context boot. The `ProjectContext` type gains `docs: DocNode[]` and `resolveDocPath: (nodeId: string) => string | undefined` fields.

### Resolution-time decision (option a)

Templates call `ctx.resolveDocPath(task.id)` at render time (option a — call at registration time vs. curry at registration-time were the two choices per spec). Option (a) was chosen because the `ProjectContext` is passed through to the render call anyway; currying at registration would require a separate factory step with no benefit. All eight templates take `(task: Task, ctx: ProjectContext): string` and call `ctx.resolveDocPath(task.id)` inline.

### Persona type

`Persona = Exclude<Task["type"], "noop" | "human_review" | "operator_session" | "agent_task">` — the eight dispatcher types exactly. `Record<Persona, (task, ctx) => string>` in the `renderers` registry gives compile-time exhaustiveness. `isPersona(type): type is Persona` narrows the runtime path; the throw in `renderPrompt` handles the four excluded types defensively.

### 6 confidence-note re-verifications

1. **`Task.parentTaskId` camelCase** — confirmed at `packages/parser/src/runner/types.ts`; all eight templates and `defaultResourceClaims` use `task.parentTaskId` correctly.
2. **`TaskType` has 12 members including `operator_session` + `agent_task`** — `Persona = Exclude<..., "noop" | "human_review" | "operator_session" | "agent_task">` resolves to 8 members; `Record<Persona, ...>` is exhaustive.
3. **`nodeIdToSourcePath` does not exist** — confirmed; `pathForNodeId` added as a new export. Tests in `packages/parser/test/docs/pathForNodeId.test.ts`.
4. **`artifactKind` required in log-event schema** — `mcpToolContractReminder()` now lists `{ artifactKind, path }` as required for `kind: "artifact"` events. `shared.test.ts` snapshot test covers this via `mcpToolContractReminder().toContain("artifactKind")`.
5. **Snapshot instability closed** — all 8 snapshot tests pin `task.id = "00000000-0000-0000-0000-000000000001"` and `projectRoot = "/project"`; no `crypto.randomUUID()` or `os.cwd()` in fixtures.
6. **`pathForNodeId` cross-package gap** — resolved; the function exists and is tested. The `ProjectContext.resolveDocPath` wrapper is the single choke point; a parser API change fails typecheck in `context.ts` before any template notices.

### Persona quality

All eight preambles are distinct (tested in `shared.test.ts`). Key distinguishers verified:
- `implement`: "ship exactly," "do not redesign," "Spec Review audit table is highest-leverage" — correctly frames an executor persona
- `spec_review`: "cold, critical judgment," "PRD coverage matrix," "cite file paths" — correctly frames an independent reviewer
- `verify`: "run cold against their diff," "spot-check claims," verdict ladder — correctly frames a verifier
- `spec_draft`: "DRAFT is the first commit," "tables in Decisions," "out-of-scope bullets" — correctly frames an author
- `reverify`: "prior audit table for context," "same verdict shape" — correctly frames a re-checker
- `doc_refactor`: "bring spec into agreement," "tighten Open Issues," "no lifecycle status change"
- `issue_triage`: "walk Open Issues," "is each still valid?" — correctly frames a triage agent
- `project_status_review`: "under 500 words," "operator reads it cold" — correctly frames a status summariser

### Deviations from spec

None. All 3 blocking + 4 should-fix fixes from the Spec Review were pre-applied before implementation began. The implementation matches the approved spec exactly.

### Gates

- `pnpm -C packages/parser build` — clean
- `pnpm -C packages/parser test` — 113/113 (10 test files)
- `pnpm -C server build` — clean
- `pnpm -C server typecheck` — clean
- `pnpm -C server lint` — clean (0 errors; 1 pre-existing lint issue in `index.test.ts` `isPersona` arrow functions fixed as part of this leaf)
- `pnpm -C server test` — 268/268 (29 test files; 8 snapshot tests added)
- `pnpm -C app typecheck` — clean
- `pnpm -C app lint` — clean

### Acceptance-check items requiring operator verification

1. **Prompt content quality** — snapshot tests lock the rendered strings but do not evaluate whether the persona framing will produce good agent behaviour in practice. Operator should do a live dispatch (`POST /api/dispatch/:nodeId` on an APPROVED node) after `05-dispatch-api` lands and read the agent's first `reasoning` event to confirm the persona took hold.
2. **`resolveDocPath` returns sensible paths in production** — snapshot tests stub `resolveDocPath: () => undefined`, so the "doc path not found" fallback strings appear in the snapshots (e.g., `"(spec doc for node 00000000-... — resolve via resolveDocPath)"`). In production, `ctx.resolveDocPath(task.id)` will return the actual doc path when the task id matches a doc node id. Operator verifies that dispatched tasks show the real path in the prompt.
3. **`implement` required-reading list transitive deps** — v1 lists only `CLAUDE.md`, the task's spec doc, the parent spec doc, and two type files. If an `implement` agent repeatedly misses a transitive dependency spec, extend the list in `implement.ts` (no template snapshot migration required — just update the snapshot with `-u`).

### Implementation Review (2026-05-29)

Independent implementation review against the rebased worktree branch (`worktree-agent-a4c75927042ea815a`) in clean Sonnet context. Verdict: **READY_WITH_FOLLOWUPS** — all 8 gates PASS (parser build + tests 113/113, server build + typecheck + lint + tests 268/268, app typecheck + lint), every Spec Review (B1–B3 + S1–S4 + N1–N4) closure HONOURED (S4 partial — fixed below), all 6 confidence notes CONFIRMED, all 3 implementer decisions assessed as correct. One real should-fix + two nits applied as documentation cleanup. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | `mcpToolContractReminder()` listed `arguments: object` for `kind: "tool_call"` events, but the canonical `log-event.schema.json` requires `arguments: string` (serialized JSON). An agent following the prompt would emit `arguments` as a JSON object, hit `invalid_event_shape` with ajv's type-mismatch error, and need to reconstruct the event before its first tool_call ever lands. | `shared.ts:66` updated to `arguments: string (serialized JSON of the tool arguments)`. The Spec Review S4 closure now fully aligns the reminder text with the schema. Inline snapshots in all 8 template tests + `shared.test.ts` regenerated via `vitest run -u` — 9 snapshots updated, 268/268 tests pass. |
| N1 | Implementation Notes bundle-delta entry attributed the 484K `server/dist/` size to "the delta includes `03-claude-code-executor`'s additions too, since those landed on the same branch" — but `03-claude-code-executor` is on a separate branch (`worktree-agent-a95b7fdcec9a0e42a`), not this one. | Note corrected to: "484K total (cumulative dist size after build; original figure misattributed to 03's additions but 03 is on a separate branch — the implementation review caught this); pure-prompts-leaf delta is ~10 new compiled TS files at well under 50K". |
| N2 | `ProjectContext.docs: readonly DocNode[]` is exposed publicly but never read outside `context.ts` (every consumer goes through `ctx.resolveDocPath(...)`). Surface widening with no current consumer. | Defensible as future-proofing for `05-dispatch-api` which may enumerate nodes; logged as Open Issue rather than removed. If `05-dispatch-api` lands without using `ctx.docs`, the field should be removed at that leaf's COMPLETE boundary. |

Reviewer's structural observations:

- **`renderers` typed `Record<Persona, ...>`** with `isPersona(type): type is Persona` narrowing function — TypeScript's exhaustiveness check is real. `noUncheckedIndexedAccess` honoured since the lookup happens after type narrowing.
- **No surprising files** — diff matches the spec's §Repository layout exactly.
- **Persona content quality**: all 8 personas distinct (programmatically verified), and each accurately mirrors its operator-playbook stage from `docs/process/leaf-workflow.md`. The `reverify` persona's explicit "read the prior audit table" directive is well-grounded.
- **Persona content vs runtime behaviour**: snapshot tests lock the rendered strings but cannot evaluate whether persona framing produces good agent behaviour live. Operator acceptance check #1 covers this; only fully testable after `05-dispatch-api` lands and a real dispatch happens.

Implementer's decision assessments:

1. **`ProjectContext.docs` + `resolveDocPath` both exposed**: defensible future-proofing; logged as Open Issue N2 for natural cleanup at `05-dispatch-api` COMPLETE if unused.
2. **Option (a) — resolve at render time**: correct. `ctx.resolveDocPath` is an O(n) closure but n is small (tens of doc nodes) and `renderPrompt` is called once per dispatch — not in a hot loop. Currying would add a factory step with no observable benefit.
3. **Snapshot stub `resolveDocPath: () => undefined`**: correct. The stub is deterministic; the templates handle `undefined` via fallback placeholder strings that appear verbatim in inline snapshots. Production wiring returns real paths via `pathForNodeId(docs, ...)`.

Nothing punted on correctness; S1 applied (with snapshot regeneration); N1 + N2 applied as documentation cleanup.

---

## Verification

When this leaf moves from `VERIFY` to `COMPLETE`, the verifier confirms:

1. **Build / typecheck / lint / test.** `pnpm install`, `pnpm -C packages/parser build`, `pnpm -C server build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit zero. Snapshots match. Bundle delta on `app/` is exactly zero. Server `dist/` delta reported in Implementation Notes.
2. **`renderPrompt` covers all eight types.** Each task type returns a non-empty string from `renderPrompt`; the throw fires on an unknown type.
3. **`defaultResourceClaims` returns the prescribed shape per type** — write claim for the four write-types, read claim for spec_review, dual read for verify/reverify, root-PRD read for project_status_review, empty for the noop/human_review types (which are not in `renderers`).
4. **Persona uniqueness.** All eight `personaPreamble()` calls return distinct strings (no copy-paste duplicates).
5. **MCP tool contract reminder is stable** — snapshot test prevents drift.
6. **Snapshot tests exist for all eight templates** — the operator's prompt-update workflow is to re-run with `-u` and inspect the diff.
7. **`renderPrompt` is consumed by `03-claude-code-executor`** — verifiable post-merge when both leaves have landed; the executor's `claudeCode.ts` imports from `./prompts/index.js`.
8. **No regressions.** Existing endpoints + executors + tests continue to pass.
9. **Parent manifest row** updated to `COMPLETE (v1)`; PRD §14 row reflects the right count of complete children (3/5 or 4/5 depending on merge order); CLAUDE.md round-2 dispatcher line synced.

---

## Children

None. This leaf has no further decomposition.
