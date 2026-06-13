export const meta = {
  name: 'leaf-workflow-finish',
  description: 'Promote a VERIFY-ready leaf node to COMPLETE, merge --no-ff with cross-doc sync, and clean up the worktree (stages 9–11 of leaf-workflow.md)',
  whenToUse: 'Run after the human_review gate task has been approved. Accepts nodeId, worktreePath, and branchName from the leaf-workflow return value.',
  phases: [
    { title: 'Inspect', detail: 'Check current status; skip already-completed stages' },
    { title: 'Promote', detail: 'Bump VERIFY→COMPLETE in worktree; commit' },
    { title: 'Merge', detail: 'merge --no-ff --no-commit; cross-doc sync; gates; commit' },
    { title: 'Cleanup', detail: 'git worktree remove + branch delete' },
  ],
}

// ── Args ──────────────────────────────────────────────────────────────────────
// Defensive coercion: named-workflow invocations may deliver args as a JSON
// string instead of an object.
const _args = typeof args === 'string' ? JSON.parse(args) : (args ?? {})

const nodeId = _args.nodeId
const worktreePath = _args.worktreePath
const branchName = _args.branchName
let repoPath = _args.repoPath ?? null

if (!nodeId || !worktreePath || !branchName) {
  return { status: 'manual-needed', message: 'nodeId, worktreePath, and branchName are all required.' }
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const STATUS_SCHEMA = {
  type: 'object',
  required: ['exists', 'status'],
  properties: {
    exists: { type: 'boolean' },
    status: { type: 'string' },
    mergedIntoMain: { type: 'boolean' },
  },
}

// ── Stage 0: Inspect ──────────────────────────────────────────────────────────

phase('Inspect')

// Auto-detect repoPath from main worktree when not supplied in args
if (!repoPath) {
  const repoResult = await agent(
    'Run: git -C "' + worktreePath + '" rev-parse --show-toplevel\nReturn the absolute path as a JSON object with key "path".',
    { schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }, label: 'detect-repo', phase: 'Inspect' }
  )
  repoPath = repoResult.path
}

// Load project config and resolve date in parallel
const [projectCfgResult, dateResult] = await Promise.all([
  agent(
    'Read the file at "' + repoPath + '/.ledger/project.json".\n' +
    'If it does not exist, return { "docs": "docs", "workflow": {} }.\n' +
    'If it exists but has no "workflow" key, return the object with "workflow" set to {}.\n' +
    'Otherwise return the full parsed JSON object.\n' +
    'Return the result as a JSON object.',
    {
      schema: {
        type: 'object',
        properties: {
          docs: { type: 'string' },
          workflow: { type: 'object' },
        },
      },
      label: 'load-config',
      phase: 'Inspect',
    }
  ),
  agent(
    'Run: date +%Y-%m-%d\nReturn the result as a JSON object with key "date".',
    { schema: { type: 'object', required: ['date'], properties: { date: { type: 'string' } } }, label: 'get-date', phase: 'Inspect' }
  ),
])

const projectCfg = projectCfgResult ?? {}
const wf = projectCfg.workflow ?? {}

const docsDir      = projectCfg.docs ?? 'docs'
const rootDoc      = wf.rootDoc ?? '00-project'
const uiPort       = process.env.LEDGER_UI_PORT ?? wf.uiPort ?? 4179
const gateCommands = wf.gates ?? []
const runDate      = dateResult.date

log('Config: docsDir=' + docsDir + ' rootDoc=' + rootDoc + ' gates=' + gateCommands.length + ' date=' + runDate)

// Gate interpolation helper
function renderGates(cmds, dir) {
  return cmds.map(function(g) { return g.command.replace('{dir}', dir) }).join('\n')
}

const specPath = repoPath + '/' + docsDir + '/' + nodeId + '.md'
const nodeParts = nodeId.split('/')
const leafId = nodeParts[nodeParts.length - 1]
const parentPrefix = nodeParts.slice(0, -1).join('/')
const parentDocName = parentPrefix
  ? parentPrefix + '/00-' + parentPrefix.split('/').pop()
  : rootDoc

const docInfo = await agent(
  'Read "' + specPath + '". Return the current lifecycle status from **Status:** header.\n' +
  'Also run: git -C ' + repoPath + ' branch --merged main | grep -q "' + branchName + '" && echo merged || echo not-merged\n' +
  'Return exists (bool), status (string), mergedIntoMain (true if branch is already merged).',
  { schema: STATUS_SCHEMA, label: 'inspect', phase: 'Inspect' }
)

log('Node ' + nodeId + ': status=' + docInfo.status + ', merged=' + docInfo.mergedIntoMain)

if (docInfo.status === 'COMPLETE' && docInfo.mergedIntoMain) {
  log('Already COMPLETE and merged — nothing to do')
  return { nodeId, status: 'already-complete' }
}

const runPromote = docInfo.status === 'VERIFY'
const runMerge = !docInfo.mergedIntoMain

// ── Stage 9: Promote ──────────────────────────────────────────────────────────

if (runPromote) {
  phase('Promote')
  await agent(
    'In the worktree at "' + worktreePath + '", promote node "' + nodeId + '" to COMPLETE.\n\n' +
    'Single commit:\n' +
    '1. In "' + worktreePath + '/' + docsDir + '/' + nodeId + '.md":\n' +
    '   - Change **Status:** VERIFY to **Status:** COMPLETE (v1, ' + runDate + ')\n' +
    '   - If there is a sample-tree table, update the row for ' + nodeId + ' to [COMPLETE]\n\n' +
    '2. In "' + worktreePath + '/' + docsDir + '/' + parentDocName + '.md":\n' +
    '   - Update the children manifest row for ' + nodeId + ' to COMPLETE (v1, ' + runDate + ')\n\n' +
    '3. git -C ' + worktreePath + ' add -A\n' +
    '4. git -C ' + worktreePath + ' commit -m "docs(' + leafId + '): VERIFY → COMPLETE (v1, ' + runDate + ')"\n\n' +
    'Only status bumps in this commit — no other changes.',
    { label: 'promote', phase: 'Promote' }
  )
} else {
  log('Promote not needed (status=' + docInfo.status + ')')
}

// ── Stage 10: Merge ───────────────────────────────────────────────────────────

if (runMerge) {
  phase('Merge')

  const mergeGates = gateCommands.length > 0
    ? 'Step 3 — Run gates (must all pass before commit):\n' +
      renderGates(gateCommands, repoPath) + '\n\n'
    : 'Step 3 — No gates configured; skip gate run.\n\n'

  await agent(
    'Merge the worktree branch into main with cross-doc sync for node "' + nodeId + '".\n\n' +
    'Step 1 — Start the merge (no-commit to allow cross-doc edits first):\n' +
    '  git -C ' + repoPath + ' merge --no-ff --no-commit ' + branchName + '\n\n' +
    'Step 2 — Apply cross-doc sync BEFORE committing:\n' +
    '  a) In "' + repoPath + '/CLAUDE.md":\n' +
    '     Find any line referencing "' + nodeId + '" or "' + leafId + '" and update it to COMPLETE (v1, ' + runDate + ').\n' +
    '     If no such line exists, skip this step.\n\n' +
    '  b) In "' + repoPath + '/' + docsDir + '/' + rootDoc + '.md":\n' +
    '     Find the ' + nodeId + ' row in any manifest/table and update the Status column to COMPLETE (v1, ' + runDate + ').\n\n' +
    '  c) Check any sibling spec with a sample-tree picture that shows ' + nodeId + ' — update those rows too.\n\n' +
    mergeGates +
    'Step 4 — If all gates pass:\n' +
    '  git -C ' + repoPath + ' commit -m "Merge ' + branchName + ': ' + nodeId + ' → COMPLETE + doc sync"\n\n' +
    'If any gate fails, report the failure and do NOT commit.\n\n' +
    'Step 5 — Copy updated workflow scripts to global location:\n' +
    '  cp "' + repoPath + '/.claude/workflows/leaf-workflow.js" ~/.claude/workflows/leaf-workflow.js\n' +
    '  cp "' + repoPath + '/.claude/workflows/leaf-workflow-finish.js" ~/.claude/workflows/leaf-workflow-finish.js',
    { label: 'merge', phase: 'Merge' }
  )
} else {
  log('Merge not needed (already merged)')
}

// ── Stage 11: Cleanup ─────────────────────────────────────────────────────────

phase('Cleanup')
await agent(
  'Clean up the worktree and branch for node "' + nodeId + '".\n\n' +
  'Steps:\n' +
  '1. Check if any dev server is pointing at ' + worktreePath + ':\n' +
  '   lsof -iTCP:' + uiPort + ' -sTCP:LISTEN -t 2>/dev/null || true\n' +
  '   Only kill if the process is serving from the worktree path.\n\n' +
  '2. Remove the worktree (double -f because Claude Code locks worktrees):\n' +
  '   git -C ' + repoPath + ' worktree remove -f -f ' + worktreePath + '\n\n' +
  '3. Delete the branch (lowercase -d as a safety net — refuses if not fully merged):\n' +
  '   git -C ' + repoPath + ' branch -d ' + branchName + '\n\n' +
  'Return which steps succeeded and which (if any) failed with the error.',
  { label: 'cleanup', phase: 'Cleanup' }
)

return {
  nodeId,
  status: 'COMPLETE',
  message: nodeId + ' is COMPLETE (v1). Branch ' + branchName + ' merged into main and cleaned up.',
}
