# Transcript-Ingestion Decoupling

**Node ID:** `09-transcript-decouple`
**Parent:** project root (`docs/00-project.md`)
**Status:** DRAFT
**Created:** 2026-06-07
**Last Updated:** 2026-06-07

**Dependencies:** `06-agent-dispatcher`, `01-ui/10-orchestration`

---

> **DRAFT for a decision.** This spec exists to resolve the PRD §11 **"Transcript ingestion couples the orchestration data layer to one agent runtime"** issue (MEDIUM). The §Decisions section poses the path fork (A/B/C) with a recommendation; the §Requirements/§Design below are written for the **recommended path (B)** and should be re-scoped if the operator picks A or C. Do not implement until APPROVED on a chosen path.

## Background — where the coupling lives

The orchestration data layer has two sources today (`01-ui/10-orchestration`, made dual-source in `05-task-runner/05-ui-hook-migration`):

- **Runner** — `/api/tasks` (+ `/stream`), served by the Hono `@ledger/server`. Canonical `Task` / `LogEvent` shape (`@ledger/parser/runner/types.ts`). Covers dispatched tasks (`06-agent-dispatcher`).
- **Transcript** — `/api/transcripts*`, served by a **Vite dev-middleware bootstrap** in `app/server/` (`middleware.ts`, `transcriptScan.ts`, `transcriptParse.ts`, `transcriptStatus.ts`, `deriveTask.ts`). It parses **Claude Code session JSONL** and maps it to the same `Task`/`LogEvent` shape. Covers operator sessions and agent transcripts that never went through dispatch.

The UI hooks (`useTaskList`, `useTask`, `useLogStream`) merge both, discriminating by `id.includes(":")` (transcript ids are `session:<uuid>` / `agent:<id>`; runner ids are bare UUIDv4).

**The coupling:** `app/server/transcriptParse.ts` understands exactly one runtime's on-disk format (Claude Code JSONL). The data layer's knowledge of "what an agent did" is welded to that format. Any second runtime (a different agent, or the MCP-native dispatch shape) has no path in. The runner half is already runtime-agnostic; the transcript half is not.

Two facts bound the decision:
1. The transcript path is **dev-middleware only** — it does not exist in the built `@ledger/server`. Production already runs runner-only.
2. The transcript path is the **only** surface for non-dispatched activity (the operator's own `claude` sessions, agent transcripts). Removing it with nothing in its place is a visibility loss, not a no-op.

## Requirements

*Written for the recommended path B (adapter boundary); re-scope if the operator picks A or C in D0.*

1. **Introduce a runtime-agnostic ingestion-adapter interface.** Define `IngestionAdapter` — `listTasks()` / `getTask(id)` / `streamEvents(id)` returning the canonical `Task` / `LogEvent` shape. The data layer depends on this interface, not on any runtime's wire format.
2. **Reframe the Claude Code transcript parser as one adapter** (`claudeCodeTranscriptAdapter`) implementing that interface. No behaviour change to what it produces — only the seam moves.
3. **The merge layer composes adapters, not hard-coded sources.** `useTaskList` etc. consume an adapter registry (runner adapter + transcript adapter), so a third adapter is additive. The `id.includes(":")` discriminant is replaced by adapter-owned id namespacing.
4. **No visibility regression.** Everything visible today (dispatched runner tasks + operator-session/agent transcripts) stays visible.
5. **Document the boundary as the §7.2 migration seam** — the point at which a future runtime (or runner-native ingestion, path C) plugs in.

### Out of scope (v1 of this node)

- **Runner-native ingestion of operator sessions** (path C — importing transcripts into the runner's SQLite tables or emitting them via MCP). The adapter boundary is the *enabler* for C; doing C is a separate, larger node.
- **Removing the transcript parser** (path A — rejected; see D1).
- **A second concrete adapter.** None exists yet; building one speculatively violates YAGNI. The boundary is justified by the *existing* coupling, not a hypothetical runtime.
- **Moving the transcript middleware out of Vite dev-middleware into `@ledger/server`.** Orthogonal; tracked separately if production needs transcript visibility.

## Design

*Path B (adapter boundary).*

```
                 ┌────────────────────────────┐
  UI hooks  ───▶ │   IngestionAdapter[]        │   (registry; order = merge precedence)
 (useTaskList,   │  ┌──────────────────────┐   │
  useTask,       │  │ runnerAdapter        │──▶│  /api/tasks (Hono)        — runtime-agnostic
  useLogStream)  │  │ claudeCodeAdapter    │──▶│  /api/transcripts (Vite)  — Claude Code JSONL
                 │  └──────────────────────┘   │
                 └────────────────────────────┘
                  one canonical Task/LogEvent shape out
```

- **`app/src/lib/ingestion/types.ts`** — `IngestionAdapter` interface + `AdapterId` namespacing.
- **`app/src/lib/ingestion/runnerAdapter.ts`** — wraps the existing `/api/tasks` fetches.
- **`app/src/lib/ingestion/claudeCodeAdapter.ts`** — wraps the existing `/api/transcripts` fetches (the `app/server/` parser is unchanged; this is the client seam).
- **`app/src/lib/ingestion/registry.ts`** — ordered adapter list; `mergeTasks` becomes adapter-agnostic (precedence by registry order, not the runner-wins special case).
- `useTaskList` / `useTask` / `useLogStream` refactor to iterate the registry. The `id.includes(":")` discriminant moves into each adapter's `owns(id)` predicate.

Net effect: the data layer no longer names "transcript" or "Claude Code" in its control flow — it iterates adapters. The Claude-Code-specific knowledge is isolated to one adapter file plus the (unchanged) `app/server/` parser.

### Manual acceptance check

1. Tasks panel shows the same merged set as before (runner + transcript), no regression.
2. A transcript-only task still opens its log stream; a runner task still opens its SSE stream.
3. Grep `app/src/lib` (excluding `ingestion/claudeCodeAdapter.ts`): no remaining `includes(":")` runtime discriminant or `/api/transcripts` literal outside the adapter.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| **D0** | **The path fork — choose before implementing.** | Three ways to resolve the §11 coupling: |
| D0-A | **Drop the transcript source.** UI = runner-only. | Smallest (delete `app/server/` ingestion + the transcript branch). **Rejected** — it removes the *only* surface for operator-session/agent visibility with nothing in its place; a visibility regression, not a decouple. The coupling is real but deletion is not the fix. |
| D0-B | **Adapter boundary (recommended).** Put the Claude Code parser behind a runtime-agnostic `IngestionAdapter` interface; the data layer depends on the interface. | Directly resolves the §11 complaint ("data layer coupled to one runtime") at modest, UI-only cost. Keeps all visibility. Makes a second runtime additive. Does **not** require the heavier runner-native migration. The minimal change that actually decouples. |
| D0-C | **Runner-native ingestion.** Operator sessions / agent transcripts become first-class runner tasks (boot-time import into SQLite, or MCP emission); UI reads only `/api/tasks`; the transcript parser becomes a one-shot importer behind the runner. | The §7.2 end-state (UI reads the API server; one data path). **Deferred, not rejected** — larger (server + runner + importer), and B is its prerequisite seam. Promote to a follow-up node once B lands and a real need (production transcript visibility, or a second runtime) justifies the cost. |
| D1 | Recommend **B**, with C as the documented eventual target | B is the smallest change that resolves the stated issue without data loss; C is the right end-state but unjustified cost today (single runtime, dev-only transcript path). A loses data for no architectural gain. |
| D2 | The `app/server/` Claude Code parser is **not rewritten** under B — only re-seamed on the client | The coupling the §11 issue names is the *data layer's dependency* on one format, not the parser's existence. Isolating it behind one adapter satisfies the requirement; rewriting the parser is wasted motion. |

## Open Issues

- **Adapter boundary risks over-abstraction with only one non-runner adapter (YAGNI).** Mitigated by keeping the interface minimal (3 methods) and justified by the *existing* coupling, not a hypothetical second runtime. If C lands soon, B's interface may need revision — accept that. *(Priority: LOW)*
- **Production still has no transcript visibility** (the parser is Vite-dev-middleware only). Out of scope here; surfaces if/when production operators need to see non-dispatched activity. *(Priority: LOW)*

## Implementation Notes

*(none yet — pre-implementation; awaiting operator approval of the path in D0)*

## Verification

Before COMPLETE the verifier confirms (path B): the `IngestionAdapter` interface is the only contract the data-layer hooks depend on; the Claude Code parser is reachable solely through `claudeCodeAdapter`; no `includes(":")` / `/api/transcripts` literal survives outside that adapter (acceptance check 3); no visibility regression (checks 1–2); all workspace gates green; and the operator walks the Tasks/Logs panels confirming the merged set is unchanged.

## Children

None.
