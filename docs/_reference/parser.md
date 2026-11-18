# Parser — current-state reference

**Scope:** `packages/parser/` (`@ledger/parser`). Shared, I/O-free library:
document schema, document graph, project-metadata check, and the domain types
the server and the UI both import.
**Last verified:** `350789833f56d18ec77f8d22b7062fafa91640b5` on `main`.
**Owning nodes:** [`02-schema`](../02-schema.md), [`03-project-metadata`](../03-project-metadata.md),
[`04-api-server/02-parser-extraction`](../04-api-server/02-parser-extraction.md),
[`05-task-runner/01-store-schema`](../05-task-runner/01-store-schema.md).
**Regenerate the module map:** `find packages/parser/src -name '*.ts' | sort | while read f; do printf '%5d  %s\n' "$(wc -l < "$f")" "$f"; done`

JSON Schemas the validators compile live in `docs/_schemas/`. The package
imports them with `with { type: "json" }`.

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `src/index.ts` | 59 | Public exports. App and server import from here. |
| `src/coreTypes.ts` | 13 | `NodeId`, `NodeStatus` |
| `src/schema/parseDocNode.ts` | 261 | Markdown → candidate object, or `null` when out of schema scope |
| `src/schema/validateDocNode.ts` | 76 | Ajv check against `document-node.schema.json` |
| `src/schema/types.ts` | 44 | `DocumentNode`, `ChildManifestRow` |
| `src/docs/buildDocGraph.ts` | 353 | `rawDocs` record → `DocNode[]`, plus `idForPath` / `pathForNodeId` |
| `src/docs/types.ts` | 20 | `DocNode` (the graph projection panels render) |
| `src/docs/issues.ts` | 78 | `parseIssueItems(nodeId, markdown)` — finds `## Open Issues` in the whole file |
| `src/project/validateProjectMetadata.ts` | 43 | Ajv check against `project-metadata.schema.json`; applies health default |
| `src/project/types.ts` | 33 | `ProjectMetadata`, `HealthConfig`, `HEALTH_DEFAULTS` |
| `src/runner/types.ts` | 155 | `Task`, `TaskInput`, `LogEvent`, claim and status unions |
| `src/runner/validateTask.ts` | 27 | Ajv vs `task.schema.json` |
| `src/runner/validateTaskInput.ts` | 29 | Ajv vs `task-input.schema.json` |
| `src/runner/validateLogEvent.ts` | 26 | Ajv vs `log-event.schema.json` |
| `src/runner/validateHitlApprove.ts` | 30 | Ajv vs `hitl-approve.schema.json` |
| `src/runner/validateHitlReject.ts` | 41 | Ajv vs `hitl-reject.schema.json` |
| `src/runner/defaultResourceClaims.ts` | 46 | Claim set per dispatcher task type |
| `src/alerts/types.ts` | 27 | `Alert` |

`app/src/lib/types.ts` re-exports the domain types so `@/lib/types` import
sites keep compiling. New shared types go in this package; UI-only types stay
in `app/src/lib/types.ts`.

## 2. Entry points

| Function | Shape |
|---|---|
| `parseDocNode(docsRelPath, markdown)` | Candidate object, or `null` for underscore dirs, `00-project.md`, and any `00-*.md` parent |
| `validateDocNode(candidate)` | `{ ok: true, node: DocumentNode }` or `{ ok: false, errors }` |
| `buildDocGraph(rawDocs)` | `{ nodes, validationErrorPaths, validationErrors }`. Parents and `root` are nodes. A leaf that fails validation stays in the graph with `valid: false` and an entry in `validationErrors`. Parents and `00-project.md` skip validation and are also stored with `valid: false`, and they are not listed in `validationErrors`. A leaf that passes omits `valid` |
| `pathForNodeId(nodes, nodeId)` | Source path for a graph node, used by prompt rendering |
| `idForPath(path)` | Path → node id. `app/server/serverIdForPath.ts` mirrors the same rules for the Vite transcript middleware |
| `validateProjectMetadata(input)` | `{ ok, metadata }` with `health.sizeThresholdTokens` filled (default 12000) |
| `validateTask` / `validateTaskInput` / `validateLogEvent` / `validateHitlApprove` / `validateHitlReject` | Same `{ ok, … }` shape over the matching schema |
| `defaultResourceClaims({ id, type, parentTaskId })` | `ResourceClaim[]`. See the table in §3 |
| `parseIssueItems(nodeId, markdown)` | Open-issue bullets. Searches the whole file for `## Open Issues` and returns `[]` when that heading is absent. `GET /api/health/issues` passes the node id and the file |

No filesystem, no React, no server imports.

## 3. Data contracts

**`NodeStatus`** (`coreTypes.ts`): `DRAFT`, `SPEC_REVIEW`, `APPROVED`,
`IN_PROGRESS`, `VERIFY`, `COMPLETE`, `ISSUE_OPEN`, `PLANNED`, `DEFERRED`,
`DEPRECATED`.

**`DocumentNode`** is the validated leaf. Required sections, from
`docs/_schemas/document-node.schema.json`: Requirements, Design, Decisions,
Open Issues, Implementation Notes, Verification, Children. Extra section keys
are allowed (dated audit sections). `children[]` rows are
`{ relId, title, dependsOn, status }`.

**`DocNode`** is what the graph and the UI hold: `id`, `parentId`, `title`,
`status`, `dependsOn`, `authored`, optional `source`, optional `valid`.
A parent id is the directory path (`01-ui`), and the root doc is `"root"`
(`buildDocGraph.ts` `pathKeyToNodeId`). `parseDocNode` returns `null` for
those same paths, so they are never schema-validated leaves.

**`TaskType`** (`runner/types.ts`): `spec_draft`, `spec_review`, `implement`,
`verify`, `doc_refactor`, `doc_decompose`, `issue_triage`, `human_review`,
`reverify`, `project_status_review`, `operator_session`, `agent_task`, `noop`.

**`TaskStatus`:** `PENDING`, `RUNNING`, `BLOCKED`, `AWAITING_HUMAN_REVIEW`,
`COMPLETE`, `FAILED`, `CANCELLED`.

**`TaskSource`:** `agent_generated`, `operator_injected`, `daemon_triggered`.
The scanner does not enqueue tasks ([`07-health-daemon`](../07-health-daemon.md));
`daemon_triggered` remains in the union.

**`ResourceClaim`:** `{ kind: "node", nodeId, mode: "read" | "write" }` or
`{ kind: "path", path, mode }`.

**`LogEvent.kind`:** `reasoning`, `tool_call`, `tool_result`, `artifact`,
`status_change`, `error`, `subprocess_killed`. `status_change.from` is
optional (absent on the creation event).

**`TaskInput`** is the body of `POST /api/tasks`. `transcriptPath` is absent
on purpose; only the transcript bootstrap sets it, and that path builds a
`Task` directly.

**Default claims** (`defaultResourceClaims.ts`). `id` here is the node id
when dispatch calls it, and the task id when a caller passes a task:

| Type | Claims |
|---|---|
| `implement`, `spec_draft`, `doc_refactor`, `doc_decompose`, `issue_triage` | write on `id` |
| `spec_review` | read on `id` |
| `verify`, `reverify` | read on `id`, plus read on `parentTaskId` when set |
| `project_status_review` | read on `00-project` |
| `noop`, `human_review`, `operator_session`, `agent_task` | none |

**`ProjectMetadata`** returned to callers: `{ schemaVersion: 1, name, docs, agent, health: { sizeThresholdTokens } }`.
The JSON schema also accepts a `workflow` object (`project-metadata.schema.json`).
`validateProjectMetadata` copies only the five fields above, so the server's
`ProjectMetadata` does not carry `workflow`. The workflow scripts read
`.ledger/project.json` themselves. See [`workflow.md`](workflow.md).

**`Alert`:** `{ seq, taskId, taskTitle, taskType, kind: "task_failed", severity: "critical", reason, at }`.

## 4. Runtime state surfaces

None. Every export is a pure function or a type. Ajv compilers are module
singletons built at import time.

## 5. Invariants

- Underscore-prefixed directory segments are omitted from both the schema walk
  and the graph walk. The same predicate is copied in `app/server/serverIdForPath.ts`.
  [`13-reference-layer`](../13-reference-layer.md) D6.
- Schema version on documents and on project metadata is the constant `1`.
- `HEALTH_DEFAULTS.sizeThresholdTokens` is `12000` (`project/types.ts`). The
  scanner uses the value after this default is applied.
- Two reads of the same node do not conflict. A write claim conflicts with
  either mode on the same `(kind, target)`. The comparison lives in the
  server (`server/src/runner/conflict.ts`); the claim shape lives here.
- Runner task ids are bare UUIDs. Transcript ids contain a colon. The UI
  predicate is `isRunnerTaskId` in `app/src/lib/types.ts`.

## 6. Active migration

`09-transcript-decouple` is DRAFT. `Task.transcriptPath` and the transcript
task shape still exist so the UI can merge Claude Code JSONL beside runner
rows. The target is one ingestion boundary; the types have not moved.
See [`ui.md`](ui.md) §6 and [`09-transcript-decouple`](../09-transcript-decouple.md).
