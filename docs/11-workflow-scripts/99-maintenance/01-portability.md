# Workflow Scripts — Cross-project portability

**Node ID:** `11-workflow-scripts/99-maintenance/01-portability`
**Parent:** `11-workflow-scripts/99-maintenance`
**Status:** IN_PROGRESS
**Created:** 2026-06-13
**Last Updated:** 2026-06-13
**Dependencies:** `.ledger/project.json` (extended with `workflow` config block), `docs/_schemas/project-metadata.schema.json`, `.claude/workflows/leaf-workflow.js`, `.claude/workflows/leaf-workflow-finish.js`

---

## Requirements

### In scope

Audit findings from an Opus review of `leaf-workflow.js` when run from a foreign project (e.g. worldgen). All three blocking, all seven should-fix, and selected nit issues are addressed.

**Blocking**

- R-B1: Gate commands (`pnpm -C {repoPath}/app typecheck/lint/build`) are hardcoded, breaking any project without an `app/` directory. Replace with config-driven gate list read from `.ledger/project.json`.
- R-B2: E2E gate (`pnpm -C {repoPath}/e2e test`) is hardcoded. Separate it as an optional `e2eGate` entry in project config; omit entirely when absent.
- R-B3: Stage 8 posts the human_review gate via `<repoPath>/.claude/scripts/api-curl`, which may not exist in foreign projects. Fall back to raw `curl` when the wrapper is absent; derive the API base URL from config/env rather than a hardcoded port.

**Should-fix**

- R-S1: Parent-doc naming (`00-<name>`) reconstructed by string convention. Make `rootDoc` configurable in project config so the root fallback is not hardcoded to `00-project`.
- R-S2: `docs/` prefix is baked into ~15 literal `git add docs/...` strings inside agent prompts, separate from `specPath`. Read `docsDir` from `project.json.docs` (key already exists) and interpolate throughout.
- R-S3: `http://localhost:4179` is hardcoded in the operator log at Stage 8. Derive `uiBaseUrl` from `LEDGER_UI_PORT` env or project config.
- R-S4: Stage 2 spec reviewer is told to read `app/src/lib/types.ts`. Make the types entrypoint optional via `workflow.typesEntrypoint`; omit the bullet when absent.
- R-S5: TS/JS-specific discipline rules (`no any`, `no console.log`, `no TypeScript in .js`) are hardcoded in Stage 4 implement and Stage 6 impl-review prompts. Remove them; the prompts already reference `CLAUDE.md` which is the authoritative source for language-specific rules.
- R-S6: Commit prefixes `docs()/impl()/review()` are ledger conventions. Document them as ledger-specific in Implementation Notes (low implementation effort; full parameterisation deferred to a future round).
- R-S7 (correctness bug — project-independent): Stage 6 impl-review runs gates against `repoPath/app` (main checkout) instead of `worktreePath/app`. The reviewer cites gate evidence from the wrong tree. Fix to use `worktreePath`.

**Nit**

- R-N2: `TODAY_DATE` placeholder relies on the agent substituting the real date. Resolve the date via an agent call (`date +%Y-%m-%d`) in the Inspect phase and interpolate the result — same pattern as the existing `repoPath` auto-detection agent.
- R-N1 and R-N3: `git fetch` no-remote noise (already guarded by `|| true`) and PRD section-number hardcoding — accepted as-is; no change.

**Sync**

- R-SYNC: After the project-copy scripts are updated, sync both to `~/.claude/workflows/` so the global copies (used by projects without a local `.claude/workflows/`) stay current.

### Out of scope

- Commit-prefix parameterisation (R-S6 full implementation) — deferred.
- Automatic detection of project language/toolchain beyond what `.ledger/project.json` declares.
- Modifications to `leaf-workflow-finish.js` beyond gate-command parameterisation and config loading.

---

## Design

### Config extension: `.ledger/project.json`

Add a `workflow` key. Ledger's own config becomes the canonical example:

```json
{
  "schemaVersion": 1,
  "name": "Ledger",
  "docs": "docs",
  "agent": "claude-code",
  "workflow": {
    "rootDoc": "00-project",
    "typesEntrypoint": "app/src/lib/types.ts",
    "apiPort": 4180,
    "uiPort": 4179,
    "gates": [
      { "label": "typecheck", "command": "pnpm -C {dir}/app typecheck" },
      { "label": "lint",      "command": "pnpm -C {dir}/app lint" },
      { "label": "build",     "command": "pnpm -C {dir}/app build" }
    ],
    "e2eGate": "pnpm -C {dir}/e2e test"
  }
}
```

- `{dir}` is the placeholder replaced by the script with the appropriate path (worktree or repo root) at each stage.
- `e2eGate` is a separate optional key; omitted → E2E stage is skipped with `e2eExit: -1`.
- `LEDGER_PORT` / `LEDGER_UI_PORT` env vars override `apiPort` / `uiPort` when set.
- All `workflow.*` keys are optional; the script falls back to safe defaults when any key is absent.

### Config loading in Inspect phase

After `repoPath` is detected, run two additional parallel agents in the Inspect phase:

1. **Config agent** — reads `<repoPath>/.ledger/project.json`, returns the `workflow` block (or `{}` if absent/missing key). Schema-validated so the script gets a typed object.
2. **Date agent** — runs `date +%Y-%m-%d`, returns `{ "date": "YYYY-MM-DD" }`. Resolves R-N2 without using `new Date()` (forbidden in workflow scripts).

Derive all config constants immediately after:

```js
const docsDir      = projectCfg.docs ?? 'docs'
const rootDoc      = wf.rootDoc ?? '00-project'
const apiPort      = process.env.LEDGER_PORT  ?? wf.apiPort ?? 4180
const uiPort       = process.env.LEDGER_UI_PORT ?? wf.uiPort ?? 4179
const apiBaseUrl   = 'http://localhost:' + apiPort
const uiBaseUrl    = 'http://localhost:' + uiPort
const gateCommands = wf.gates ?? []
const e2eCommand   = wf.e2eGate ?? null
const typesPath    = wf.typesEntrypoint ? repoPath + '/' + wf.typesEntrypoint : null
const runDate      = dateResult.date
```

### Gate interpolation helper

A simple inline function (not a named export — stays at script scope):

```js
function renderGates(cmds, dir) {
  return cmds.map(function(g) { return g.command.replace('{dir}', dir) }).join('\n')
}
```

Used in every stage that runs gates:
- Stage 4 implement: `renderGates(gateCommands, '<worktree path from pwd>')` — note the implementing agent itself runs in the worktree so the literal string instructs it to substitute its cwd.
- Stage 5 rebase: `renderGates(gateCommands, worktreePath)`
- Stage 6 impl-review: `renderGates(gateCommands, worktreePath)` ← fixes R-S7
- Stage 7 fixes: `renderGates(gateCommands, worktreePath)`
- `leaf-workflow-finish` Stage 3 merge: `renderGates(gateCommands, repoPath)` (correct — validates the merged main tree)

### Stage 8 gate posting (B3)

```js
const apiCurlPath = repoPath + '/.claude/scripts/api-curl'
// Agent prompt: check if <apiCurlPath> exists with `test -f`; if yes, use it;
// if no, fall back to: curl -sS -X POST <apiBaseUrl>/api/tasks -H 'Content-Type: application/json' -d '<payload>'
```

The agent is given both forms in the prompt so it can branch on presence without the script needing to call Bash directly.

### Files changed

| File | Nature of change |
|------|-----------------|
| `.ledger/project.json` | Add `workflow` config block |
| `docs/_schemas/project-metadata.schema.json` | Add optional `workflow` object definition (all sub-keys optional; `additionalProperties: false` preserved) |
| `.claude/workflows/leaf-workflow.js` | Config loading; gate parameterisation; S7 fix; B3 api-curl fallback; N2 date; S3/S4/S5 prompt cleanup |
| `.claude/workflows/leaf-workflow-finish.js` | Config loading; gate parameterisation in Stage 3 |
| `~/.claude/workflows/leaf-workflow.js` | Sync via `cp` |
| `~/.claude/workflows/leaf-workflow-finish.js` | Sync via `cp` |

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Extend `.ledger/project.json` rather than a new file | The key already exists and has a `docs` field the script will consume. Adding `workflow` is additive and keeps project config in one place. |
| D2 | `{dir}` placeholder in gate commands (not `{repoPath}`) | Each stage needs a different directory (worktree vs repo root). A generic `{dir}` lets the script inject the right path per stage. |
| D3 | `e2eGate` as a separate optional key | E2E presence is binary (have it or don't). A separate key makes omission explicit and avoids a `{ label: "e2e", optional: true }` flag on an item inside the `gates` array. |
| D4 | Date resolved via agent call in Inspect phase | `new Date()` and `Date.now()` are forbidden in workflow scripts (breaks resume). An agent call matches the existing `repoPath` auto-detection pattern and is deterministic. |
| D5 | R-S6 (commit prefixes) deferred | Parameterising commit prefixes requires thread-and-replace across all prompt strings; mechanical but verbose. The value is low for current users. Deferred to a future maintenance round. |
| D6 | Sync global copies via `cp` at the end of Stage 10 merge | Global `~/.claude/workflows/` is the fallback for projects without a project-local copy. Syncing on every merge keeps them current without a separate manual step. |

---

## Open Issues

*(none)*

---

## Spec Review (2026-06-13)

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `project-metadata.schema.json` has `additionalProperties: false` and no `workflow` property — adding the `workflow` key to `.ledger/project.json` without updating the schema breaks schema validation on server load. | applied — `docs/_schemas/project-metadata.schema.json` added to Dependencies and Files Changed; schema update (optional `workflow` object, all sub-keys optional) included in Files Changed. |
| N1 | No acceptance check for the absent-`project.json` fallback path (all `workflow.*` keys absent or file missing). | applied — A8 added to Verification. |

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Acceptance checks:

1. **Config loading** — with a minimal `.ledger/project.json` containing `"workflow": { "gates": [] }`, the script runs through Inspect without error and logs "0 gates configured".
2. **repoPath auto-detect** — invoke `/leaf-workflow` with only `nodeId` (no `repoPath`); Inspect phase logs the correct repo root.
3. **PLANNED status flow** — invoke on a PLANNED node; `runSpecReview` and `runApprove` are true, `runDraft` is false.
4. **S7 gate paths** — Stage 6 prompt text references `worktreePath` not `repoPath` for gate commands (code inspection of the prompt strings).
5. **B3 api-curl fallback** — temporarily rename `.claude/scripts/api-curl`; Stage 8 falls back to raw curl and the human_review gate task is created successfully.
6. **Gate port override** — set `LEDGER_PORT=9999`; Stage 8 POSTs to `http://localhost:9999/api/tasks`.
7. **Global copy sync** — after merge, `diff ~/.claude/workflows/leaf-workflow.js .claude/workflows/leaf-workflow.js` exits 0.
8. **Absent workflow key** — with `.ledger/project.json` containing no `workflow` key (or the file entirely absent), Inspect completes without error and all defaults (`rootDoc=00-project`, `docsDir=docs`, `apiPort=4180`, `uiPort=4179`, `gateCommands=[]`, `e2eCommand=null`) are in effect.

E2E: No new Playwright tests required — this node modifies workflow scripts only; no UI or API surface changes.

---

## Children

None.
