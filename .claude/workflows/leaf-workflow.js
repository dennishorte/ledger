export const meta = {
  name: 'leaf-workflow',
  description: 'Drive a leaf node DRAFT→VERIFY and create a human_review gate task (stages 1–8 of leaf-workflow.md)',
  whenToUse: 'Run against any leaf node to take it from DRAFT (or earlier) through operator gate. Resumes from current status automatically.',
  phases: [
    { title: 'Inspect', detail: 'Read current doc status and determine resume point' },
    { title: 'Draft', detail: 'Author spec if NOT_FOUND; skip if DRAFT or further' },
    { title: 'Spec Review', detail: 'Bump DRAFT→SPEC_REVIEW; independent clean-context review' },
    { title: 'Approve', detail: 'Apply mechanical findings; SPEC_REVIEW→APPROVED' },
    { title: 'Implement', detail: 'Isolated worktree; three commits (entry / impl / exit)' },
    { title: 'Post-Impl Gate', detail: 'Optional pause after implementation to review a generated artifact (project-configured)' },
    { title: 'Rebase', detail: 'git fetch + rebase worktree onto the base branch' },
    { title: 'Impl Review', detail: 'Independent clean-context review of rebased diff' },
    { title: 'Fixes', detail: 'Apply mechanical findings; add Implementation Review audit table' },
    { title: 'Gate', detail: 'POST human_review task to the runner' },
  ],
}

// ── Args (globals injected by the Workflow framework) ─────────────────────────
// Accepts: object, JSON string, or plain string (plain string → nodeId).
let _args = {}
if (typeof args === 'string') {
  try { _args = JSON.parse(args) } catch (_) { _args = { nodeId: args } }
} else if (args && typeof args === 'object') {
  _args = args
}

const nodeId = _args.nodeId
let repoPath = _args.repoPath ?? null
const skipSpecReview = _args.skipSpecReview ?? false
const defaultModel = _args.model ?? undefined
const defaultEffort = _args.effort ?? undefined
const resumeAfterGate = _args.resumeAfterGate ?? false
const resumeWorktreePathArg = _args.worktreePath ?? null
const resumeBranchNameArg = _args.branchName ?? null
const resumePostImplReviewTaskId = _args.postImplReviewTaskId ?? null

if (!nodeId) {
  return { status: 'manual-needed', message: 'nodeId is required (e.g. "01-ui/11-new-panel")' }
}

// Wraps agent() so every call in this workflow inherits args.model / args.effort
// unless the call site already pins its own (e.g. a future cheap/expensive override).
async function callAgent(prompt, opts) {
  const merged = Object.assign({}, opts)
  if (defaultModel && merged.model === undefined) merged.model = defaultModel
  if (defaultEffort && merged.effort === undefined) merged.effort = defaultEffort
  return agent(prompt, merged)
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const STATUS_SCHEMA = {
  type: 'object',
  required: ['exists', 'status', 'specReviewDone', 'implReviewDone'],
  additionalProperties: false,
  properties: {
    exists: { type: 'boolean' },
    status: { type: 'string' },
    specReviewDone: { type: 'boolean' },
    implReviewDone: { type: 'boolean' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'matrix', 'findings', 'summaryMarkdown'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string' },
    matrix: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'item', 'verdict', 'evidence'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          item: { type: 'string' },
          verdict: { type: 'string', enum: ['PASS', 'FAIL', 'PARTIAL', 'N/A'] },
          evidence: { type: 'string' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'description', 'fix', 'isMechanical'],
        additionalProperties: false,
        properties: {
          severity: { type: 'string' },
          description: { type: 'string' },
          fix: { type: 'string' },
          isMechanical: { type: 'boolean' },
        },
      },
    },
    summaryMarkdown: { type: 'string' },
  },
}

const IMPL_SCHEMA = {
  type: 'object',
  required: ['worktreePath', 'branchName'],
  properties: {
    worktreePath: { type: 'string' },
    branchName: { type: 'string' },
    typecheckExit: { type: 'number' },
    lintExit: { type: 'number' },
    buildExit: { type: 'number' },
    e2eExit: { type: 'number' },
    e2eSummary: { type: 'string' },
    bundleDelta: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    operatorItems: { type: 'array', items: { type: 'string' } },
  },
}

const REBASE_SCHEMA = {
  type: 'object',
  required: ['success', 'details', 'conflicts'],
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    details: { type: 'string' },
    conflicts: { type: 'array', items: { type: 'string' } },
  },
}

const WORKTREE_SCHEMA = {
  type: 'object',
  required: ['worktreePath', 'branchName'],
  additionalProperties: false,
  properties: {
    worktreePath: { type: ['string', 'null'] },
    branchName: { type: ['string', 'null'] },
  },
}

// Output of the Post-Impl Gate's command-run agent call, used only when
// postImplementationGate.artifactPath is NOT statically configured — the agent
// running the command has to report back where the artifact landed.
const POST_IMPL_GATE_SCHEMA = {
  type: 'object',
  required: ['artifactPath'],
  additionalProperties: false,
  properties: {
    artifactPath: { type: 'string' },
  },
}

// ── Stage 0: Inspect ──────────────────────────────────────────────────────────

phase('Inspect')

// Auto-detect repoPath from git root when not supplied in args
if (!repoPath) {
  const repoResult = await callAgent(
    'Run: git rev-parse --show-toplevel\nReturn the absolute path as a JSON object with key "path".',
    { schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }, label: 'detect-repo', phase: 'Inspect', model: 'sonnet', effort: 'low' }
  )
  repoPath = repoResult.path
}

// Load project config and resolve date in parallel
const [projectCfgResult, dateResult] = await Promise.all([
  callAgent(
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
      model: 'sonnet', effort: 'low',
    }
  ),
  callAgent(
    'Run: date +%Y-%m-%d\nReturn the result as a JSON object with key "date".',
    { schema: { type: 'object', required: ['date'], properties: { date: { type: 'string' } } }, label: 'get-date', phase: 'Inspect', model: 'sonnet', effort: 'low' }
  ),
])

const projectCfg = projectCfgResult ?? {}
const wf = projectCfg.workflow ?? {}

const docsDir      = projectCfg.docs ?? 'docs'
const rootDoc      = wf.rootDoc ?? '00-project'
const apiPort      = wf.apiPort
const uiPort       = wf.uiPort ?? 4179

if (!apiPort) {
  return { status: 'manual-needed', message: 'API port not configured: set LEDGER_PORT env var or add "workflow.apiPort" to .ledger/project.json' }
}

const apiBaseUrl   = 'http://localhost:' + apiPort
const uiBaseUrl    = 'http://localhost:' + uiPort
const gateCommands = wf.gates ?? []
const worktreeSetup = wf.worktreeSetup ?? []
const e2eCommand   = wf.e2eGate ?? null
const postImplementationGateCommand = wf.postImplementationGate ?? null
const typesPath    = wf.typesEntrypoint ? repoPath + '/' + wf.typesEntrypoint : null
const baseBranch   = wf.baseBranch ?? 'main'
const runDate      = dateResult.date

log('Config: docsDir=' + docsDir + ' rootDoc=' + rootDoc + ' baseBranch=' + baseBranch + ' gates=' + gateCommands.length + ' setup=' + worktreeSetup.length + ' e2e=' + (e2eCommand ? 'yes' : 'no') + ' postImplGate=' + (postImplementationGateCommand ? 'yes' : 'no') + ' date=' + runDate)

// Divergence preflight: warn if local baseBranch is ahead of its remote.
// This workflow branches worktrees from local baseBranch and is itself unaffected,
// but the harness's isolation:'worktree' agents fork from origin/baseBranch — so
// when the local branch is ahead, any such agent works against a stale tree and its
// branch must not be merged back. Surface the condition; degrade silently if no remote.
const divergence = await callAgent(
  'Run: git -C ' + repoPath + ' rev-parse --verify --quiet origin/' + baseBranch + ' >/dev/null 2>&1 && echo has-remote || echo no-remote\n' +
  'If the output is "no-remote", return { hasRemote: false, ahead: 0 }.\n' +
  'If "has-remote", run: git -C ' + repoPath + ' rev-list --count origin/' + baseBranch + '..' + baseBranch + '\n' +
  '  and return { hasRemote: true, ahead: <the integer that command prints> }.',
  { schema: { type: 'object', required: ['hasRemote', 'ahead'], additionalProperties: false, properties: { hasRemote: { type: 'boolean' }, ahead: { type: 'number' } } }, label: 'check-divergence', phase: 'Inspect', model: 'sonnet', effort: 'low' }
)
if (divergence.hasRemote && divergence.ahead > 0) {
  log('⚠ local ' + baseBranch + ' is ' + divergence.ahead + ' commit(s) ahead of origin/' + baseBranch +
      '. Harness isolation:\'worktree\' agents fork from origin/' + baseBranch + ' and will be STALE — ' +
      'use a named worktree or run in-place for any write work. (This workflow is unaffected: it branches from local ' + baseBranch + '.)')
}

// Derive doc paths from config
const nodeParts = nodeId.split('/')
const leafId = nodeParts[nodeParts.length - 1]
const parentPrefix = nodeParts.slice(0, -1).join('/')
const parentDocName = parentPrefix
  ? parentPrefix + '/00-' + parentPrefix.split('/').pop()
  : rootDoc

const specPath = repoPath + '/' + docsDir + '/' + nodeId + '.md'
const apiCurlPath = repoPath + '/.claude/scripts/api-curl'

// Command interpolation: {dir} -> worktree path, {repo} -> repo root.
// replaceAll (not replace) so multi-token commands (e.g. symlinks) substitute every occurrence.
function renderCmd(cmd, dir) {
  return cmd.replaceAll('{dir}', dir).replaceAll('{repo}', repoPath)
}
function renderGates(cmds, dir) {
  return cmds.map(function(g) { return renderCmd(g.command, dir) }).join('\n')
}
// Post-Impl Gate commands additionally support {nodeId}.
function renderPostImplCmd(cmd, dir) {
  return renderCmd(cmd, dir).replaceAll('{nodeId}', nodeId)
}

// Runs postImplementationGate.command for one round in the given worktree, then
// POSTs a human_review task pointing at the resulting artifact. Shared by the
// normal-flow first round (after 4b) and the reject-loop's next round (R5b).
async function runPostImplGate(round, wtPath, brName) {
  const gateCmd = renderPostImplCmd(postImplementationGateCommand.command, wtPath)
  const configuredArtifactPath = postImplementationGateCommand.artifactPath
    ? renderPostImplCmd(postImplementationGateCommand.artifactPath, wtPath)
    : null

  let artifactPath
  if (configuredArtifactPath) {
    await callAgent(
      'Run this command inside the implementation worktree at "' + wtPath + '":\n  ' + gateCmd + '\n' +
      'Return "done".',
      { label: 'post-impl-gate-run-r' + round, phase: 'Post-Impl Gate' }
    )
    artifactPath = configuredArtifactPath
  } else {
    const gateRunResult = await callAgent(
      'Run this command inside the implementation worktree at "' + wtPath + '":\n  ' + gateCmd + '\n' +
      'Report the absolute path to the artifact the command produced.',
      { schema: POST_IMPL_GATE_SCHEMA, label: 'post-impl-gate-run-r' + round, phase: 'Post-Impl Gate' }
    )
    artifactPath = gateRunResult.artifactPath
  }

  const taskPayload = JSON.stringify({
    type: 'human_review',
    nodeId: nodeId,
    title: 'Operator gate: ' + nodeId + ' post-implementation artifact ready for review (round ' + round + ')',
    input: {
      nodeId: nodeId,
      worktreePath: wtPath,
      branchName: brName,
      artifactPath: artifactPath,
      round: round,
      nextStep: 'Open the artifact, then approve or reject (with a reason). Either way, resume with { resumeAfterGate: true, worktreePath, branchName, postImplReviewTaskId }.',
    },
  })

  const gateResult = await callAgent(
    'Create a human_review task in the Ledger task runner.\n\n' +
    'Check if "' + apiCurlPath + '" exists with: test -f "' + apiCurlPath + '" && echo exists || echo missing\n\n' +
    'If it exists, run:\n' +
    '  ' + apiCurlPath + ' -X POST /api/tasks -H \'Content-Type: application/json\' -d \'' + taskPayload + '\'\n\n' +
    'If it is missing, fall back to raw curl:\n' +
    '  curl -sS -X POST ' + apiBaseUrl + '/api/tasks -H \'Content-Type: application/json\' -d \'' + taskPayload + '\'\n\n' +
    'Return the id field from the response JSON. If the server is unreachable, return "server-offline".',
    { schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, label: 'create-post-impl-gate-r' + round, phase: 'Post-Impl Gate', model: 'sonnet', effort: 'low' }
  )

  return { postImplReviewTaskId: gateResult.id, artifactPath: artifactPath }
}

let worktreePath = null
let branchName = null
let docStatus = null
let currentStatus = null

// ── Resume-after-gate branch (bypasses Stages 0–4b: the worktree already exists) ──

if (resumeAfterGate) {
  phase('Post-Impl Gate')

  if (!resumeWorktreePathArg || !resumeBranchNameArg || !resumePostImplReviewTaskId) {
    return { status: 'manual-needed', message: 'resumeAfterGate requires worktreePath, branchName, and postImplReviewTaskId' }
  }

  const gateTask = await callAgent(
    'Fetch the current state of task "' + resumePostImplReviewTaskId + '".\n\n' +
    'Check if "' + apiCurlPath + '" exists with: test -f "' + apiCurlPath + '" && echo exists || echo missing\n\n' +
    'If it exists, run:\n' +
    '  ' + apiCurlPath + ' /api/tasks/' + resumePostImplReviewTaskId + '\n\n' +
    'If it is missing, fall back to raw curl:\n' +
    '  curl -sS ' + apiBaseUrl + '/api/tasks/' + resumePostImplReviewTaskId + '\n\n' +
    'The response is shaped { task, events }. Return:\n' +
    '  status: task.status (one of PENDING, RUNNING, BLOCKED, AWAITING_HUMAN_REVIEW, COMPLETE, FAILED, CANCELLED)\n' +
    '  round: task.input.round (the round number this task was created for; default 1 if absent)\n' +
    '  rationale: if task.status is "FAILED", find the entry in the events array with kind "error" and ' +
    'message "rejected_with_details", and return its "stack" field (the full rejection rationale text). ' +
    'Otherwise return "".\n' +
    'If the server is unreachable, return { status: "server-offline", round: 1, rationale: "" }.',
    {
      schema: {
        type: 'object',
        required: ['status', 'round', 'rationale'],
        additionalProperties: false,
        properties: { status: { type: 'string' }, round: { type: 'number' }, rationale: { type: 'string' } },
      },
      label: 'check-post-impl-gate',
      phase: 'Post-Impl Gate',
      model: 'sonnet', effort: 'low',
    }
  )

  log('Post-Impl Gate task ' + resumePostImplReviewTaskId + ': status=' + gateTask.status + ' round=' + gateTask.round)

  if (gateTask.status === 'COMPLETE') {
    // Approved — land the deferred Stage 4c exit commit, then proceed to Stage 5 onward
    // exactly as if no gate were configured.
    await callAgent(
      'In the worktree at "' + resumeWorktreePathArg + '", the post-implementation gate for node "' + nodeId +
      '" (round ' + gateTask.round + ') was approved. Land the deferred Stage 4c exit commit:\n' +
      '  In "' + resumeWorktreePathArg + '/' + docsDir + '/' + nodeId + '.md", note under Implementation Notes ' +
      'that the post-implementation gate was approved (round ' + gateTask.round + ').\n' +
      '  Bump **Status:** IN_PROGRESS → VERIFY in the spec and the parent manifest row at "' +
      resumeWorktreePathArg + '/' + docsDir + '/' + parentDocName + '.md".\n' +
      '  git -C ' + resumeWorktreePathArg + ' add -A\n' +
      '  git -C ' + resumeWorktreePathArg + ' commit -m "impl(' + leafId + '): IN_PROGRESS → VERIFY"\n' +
      'Return "done".',
      { label: 'post-impl-gate-deferred-exit-commit', phase: 'Post-Impl Gate' }
    )

    worktreePath = resumeWorktreePathArg
    branchName = resumeBranchNameArg
    currentStatus = 'IN_PROGRESS'
    docStatus = { exists: true, status: 'IN_PROGRESS', specReviewDone: true, implReviewDone: false }
  } else if (gateTask.status === 'FAILED') {
    // Rejected — patch agent in the same worktree, re-run the gate command, new round's task.
    if (!postImplementationGateCommand) {
      return {
        status: 'manual-needed',
        message: 'Task ' + resumePostImplReviewTaskId + ' was rejected but workflow.postImplementationGate is not configured — cannot re-run the gate command.',
      }
    }

    await callAgent(
      'You are a patch agent continuing implementation for node "' + nodeId + '" in the existing worktree at "' +
      resumeWorktreePathArg + '" (do NOT create a new worktree or branch — this is a continuation of the same implementation, not a fresh dispatch).\n\n' +
      'The post-implementation gate artifact for round ' + gateTask.round + ' was REJECTED by the operator with this rationale:\n\n' +
      '"""\n' + gateTask.rationale + '\n"""\n\n' +
      'Read "' + specPath + '" for context. Address the feedback in the worktree, then commit:\n' +
      '  git -C ' + resumeWorktreePathArg + ' add -A\n' +
      '  git -C ' + resumeWorktreePathArg + ' commit -m "fix(' + leafId + '): address post-impl gate feedback (round ' + gateTask.round + ')"\n' +
      'Return "done".',
      { label: 'post-impl-gate-patch', phase: 'Post-Impl Gate' }
    )

    const nextRound = gateTask.round + 1
    const nextGate = await runPostImplGate(nextRound, resumeWorktreePathArg, resumeBranchNameArg)

    log('Post-Impl Gate: round ' + nextRound + ' task ' + nextGate.postImplReviewTaskId + ' artifact ' + nextGate.artifactPath)

    return {
      nodeId,
      status: 'awaiting-post-impl-approval',
      worktreePath: resumeWorktreePathArg,
      branchName: resumeBranchNameArg,
      postImplReviewTaskId: nextGate.postImplReviewTaskId,
      artifactPath: nextGate.artifactPath,
      round: nextRound,
      nextStep: 'Open the artifact, then approve or reject (with a reason) the human_review task. Either way, resume with resumeAfterGate: true.',
      resumeCommand: 'Workflow({ scriptPath: "' + repoPath + '/.claude/workflows/leaf-workflow.js", args: { nodeId: "' + nodeId + '", resumeAfterGate: true, worktreePath: "' + resumeWorktreePathArg + '", branchName: "' + resumeBranchNameArg + '", postImplReviewTaskId: "' + nextGate.postImplReviewTaskId + '" } })',
    }
  } else {
    return { status: 'manual-needed', message: 'postImplReviewTaskId ' + resumePostImplReviewTaskId + ' is not yet decided' }
  }
}

if (!resumeAfterGate) {
  docStatus = await callAgent(
    'Read the file at "' + specPath + '". ' +
    'If it does not exist, return { exists: false, status: "NOT_FOUND", specReviewDone: false, implReviewDone: false }. ' +
    'If it exists, read the **Status:** line for the lifecycle status, ' +
    'return specReviewDone: true if a "## Spec Review" section exists, ' +
    'implReviewDone: true if Implementation Notes contains an "### Implementation Review" subsection.',
    { schema: STATUS_SCHEMA, label: 'inspect', phase: 'Inspect' }
  )

  currentStatus = docStatus.status

  log('Node ' + nodeId + ': status=' + currentStatus)

  if (currentStatus === 'COMPLETE') {
    log('Already COMPLETE — nothing to do')
    return { nodeId, status: 'already-complete' }
  }
}

// Derive stage-skip flags from lifecycle state
// PLANNED is treated as pre-DRAFT (doc exists, spec not yet reviewed/approved)
const runDraft = currentStatus === 'NOT_FOUND'
const runSpecReview = (currentStatus === 'NOT_FOUND' || currentStatus === 'DRAFT' || currentStatus === 'PLANNED') &&
  !skipSpecReview && !docStatus.specReviewDone
const runApprove = currentStatus === 'NOT_FOUND' || currentStatus === 'DRAFT' || currentStatus === 'PLANNED' ||
  currentStatus === 'SPEC_REVIEW'
const runImpl = runApprove || currentStatus === 'APPROVED'
const runRebase = runImpl || currentStatus === 'IN_PROGRESS'
const runImplReview = runRebase || (currentStatus === 'VERIFY' && !docStatus.implReviewDone)
const runFixes = runImplReview

// ── Worktree recovery (IN_PROGRESS / VERIFY re-entry) ─────────────────────────
// Skipped when resuming after a post-impl gate: worktreePath/branchName are already
// known from the resume args, so there is nothing to search for.

if (!resumeAfterGate && (currentStatus === 'IN_PROGRESS' || currentStatus === 'VERIFY')) {
  phase('Inspect')
  const wtInfo = await callAgent(
    'Run: git -C ' + repoPath + ' worktree list --porcelain\n' +
    'Run: git -C ' + repoPath + ' branch --list "*' + leafId + '*"\n' +
    'Identify the worktree for branch matching "' + leafId + '". ' +
    'Return worktreePath and branchName; use null for both if not found.',
    { schema: WORKTREE_SCHEMA, label: 'find-worktree', phase: 'Inspect', model: 'sonnet', effort: 'low' }
  )
  worktreePath = wtInfo.worktreePath
  branchName = wtInfo.branchName
  if (!worktreePath) {
    log('WARNING: no worktree found for ' + nodeId + ' (status: ' + currentStatus + ') — stages 5–8 will need manual completion')
    return {
      nodeId,
      status: 'manual-needed',
      message: 'Node is in ' + currentStatus + ' but no worktree was found. Run stages 5–8 manually per .ledger/process/leaf-workflow.md.',
    }
  }
}

// ── Stage 1: Draft ────────────────────────────────────────────────────────────

if (runDraft) {
  phase('Draft')
  await callAgent(
    'Author a new spec doc at "' + specPath + '" for node "' + nodeId + '".\n\n' +
    'Read before writing:\n' +
    '- "' + repoPath + '/' + docsDir + '/' + rootDoc + '.md" §§1–6 (PRD schema and lifecycle)\n' +
    '- Parent doc: "' + repoPath + '/' + docsDir + '/' + parentDocName + '.md" (if it exists)\n' +
    '- A recently modified sibling .md in the same directory (house style)\n\n' +
    'Required sections per PRD §6.1 in this order:\n' +
    '1. Front-matter: Node ID, Parent, Status: DRAFT, Created, Last Updated, Dependencies\n' +
    '2. Requirements (in-scope bullets + explicit out-of-scope bullets)\n' +
    '3. Design (data contracts, files, components, acceptance checks)\n' +
    '4. Decisions (D1…Dn numbered table with Rationale)\n' +
    '5. Open Issues (priority-tagged HIGH/MEDIUM/LOW/TRIVIAL)\n' +
    '6. Implementation Notes: `*(none yet — pre-implementation)*`\n' +
    '7. Verification (acceptance checks; name E2E files if UI/API surface exists)\n' +
    '8. Children: None\n\n' +
    'After writing, add this node to the parent manifest at "' + repoPath + '/' + docsDir + '/' + parentDocName + '.md".\n' +
    'Commit: git -C ' + repoPath + ' add ' + docsDir + '/' + nodeId + '.md ' + docsDir + '/' + parentDocName + '.md\n' +
    '        git -C ' + repoPath + ' commit -m "docs(' + leafId + '): DRAFT spec"',
    { label: 'draft', phase: 'Draft' }
  )
} else {
  log('Status ' + currentStatus + ' — skipping Draft stage')
}

// ── Stage 2: Spec Review ──────────────────────────────────────────────────────

let specReview = null

if (skipSpecReview) {
  specReview = { verdict: 'LGTM', matrix: [], findings: [], summaryMarkdown: 'Skipped (skipSpecReview: true).' }
  log('Spec review skipped per skipSpecReview=true')
} else if (runSpecReview) {
  phase('Spec Review')

  // Bump DRAFT → SPEC_REVIEW transition commit
  await callAgent(
    'In "' + specPath + '", change **Status:** to SPEC_REVIEW.\n' +
    'Update the parent manifest row for ' + nodeId + ' to SPEC_REVIEW in "' + repoPath + '/' + docsDir + '/' + parentDocName + '.md".\n' +
    'git -C ' + repoPath + ' add ' + docsDir + '/' + nodeId + '.md ' + docsDir + '/' + parentDocName + '.md\n' +
    'git -C ' + repoPath + ' commit -m "docs(' + leafId + '): DRAFT → SPEC_REVIEW"\n' +
    'Return "done".',
    { label: 'bump-spec-review', phase: 'Spec Review', model: 'sonnet', effort: 'low' }
  )

  // Independent review — clean context
  const typesLine = typesPath ? '- "' + typesPath + '" (existing types)\n' : ''
  specReview = await callAgent(
    'You are an independent spec reviewer in a fresh context. Read these files:\n' +
    '- "' + specPath + '" (spec under review)\n' +
    '- "' + repoPath + '/' + docsDir + '/' + rootDoc + '.md" §§1–6 (PRD)\n' +
    '- "' + repoPath + '/' + docsDir + '/' + parentDocName + '.md" (parent doc)\n' +
    '- "' + repoPath + '/.ledger/process/verification-signoff.md" (review format)\n' +
    '- "' + repoPath + '/CLAUDE.md" (constraints)\n' +
    typesLine +
    '\nEvaluation criteria: schema compliance, PRD coverage, dependency declaration, type additions vs existing, MVP scoping, internal consistency, house-style.\n\n' +
    'Return REVIEW_SCHEMA per verification-signoff.md.\n' +
    'One matrix row per PRD-coverage item and per Requirements bullet.\n' +
    'Every PASS needs concrete evidence (file:line or section ref). "Looks correct" is FAIL.\n' +
    'Verdict derived from matrix: any FAIL → NEEDS_MAJOR_REVISIONS or NEEDS_MINOR_REVISIONS; no FAIL + PARTIAL → NEEDS_MINOR_REVISIONS; all PASS/N/A → LGTM.',
    { schema: REVIEW_SCHEMA, label: 'spec-review', phase: 'Spec Review' }
  )

  log('Spec review verdict: ' + specReview.verdict)
  const specBlockers = specReview.findings.filter(function(f) { return f.severity === 'Blocking' })
  if (specBlockers.length > 0) {
    log('WARNING: ' + specBlockers.length + ' blocking spec-review finding(s)')
  }
} else {
  log('Spec review not needed (status=' + currentStatus + ', specReviewDone=' + docStatus.specReviewDone + ')')
}

// ── Stage 3: Approve ──────────────────────────────────────────────────────────

if (runApprove) {
  phase('Approve')
  const mechanicalFindings = specReview ? specReview.findings.filter(function(f) { return f.isMechanical }) : []
  await callAgent(
    'Apply these mechanical spec-review findings to "' + specPath + '":\n' +
    JSON.stringify(mechanicalFindings, null, 2) + '\n\n' +
    'Add a "## Spec Review (' + runDate + ')" section BETWEEN "## Open Issues" and "## Implementation Notes":\n' +
    '| # | Finding | Resolution |\n' +
    '|---|---------|------------|\n' +
    '(one row per finding; mechanical → "applied"; skipped → reason)\n\n' +
    'Bump **Status:** to APPROVED. Update the parent manifest row in "' + repoPath + '/' + docsDir + '/' + parentDocName + '.md" to APPROVED.\n' +
    'git -C ' + repoPath + ' add ' + docsDir + '/' + nodeId + '.md ' + docsDir + '/' + parentDocName + '.md\n' +
    'git -C ' + repoPath + ' commit -m "docs(' + leafId + '): SPEC_REVIEW → APPROVED"',
    { label: 'approve', phase: 'Approve' }
  )
} else {
  log('Approve not needed (status=' + currentStatus + ')')
}

// ── Stage 4: Implement ────────────────────────────────────────────────────────

if (runImpl) {
  phase('Implement')

  // Deterministic worktree location owned by the agent (not by isolation: 'worktree').
  // Using a named worktree here instead of isolation: 'worktree' prevents the framework
  // from auto-deleting the worktree when the workflow exits early (e.g. rebase-conflict).
  const implWorktreePath = repoPath + '/.claude/worktrees/impl-' + leafId
  const implBranchName = 'worktree-impl-' + leafId

  const gatesText = gateCommands.length > 0
    ? '  Run gates and record exit codes:\n' +
      gateCommands.map(function(g) { return '    ' + renderCmd(g.command, implWorktreePath) }).join('\n') + '\n'
    : '  No gates configured (gateCommands=[]).\n'

  const setupText = worktreeSetup.length > 0
    ? '  After creating the worktree (or confirming it exists), run these project setup steps so gates can pass in the worktree:\n' +
      worktreeSetup.map(function(s) { return '    ' + renderCmd(s.command, implWorktreePath) }).join('\n') + '\n' +
      '  These are idempotent (ln -sf etc.); re-running on an existing worktree is safe. Do NOT commit anything they produce.\n'
    : ''

  const e2eText = e2eCommand
    ? '  E2E: if spec Verification says E2E is N/A, set e2eExit: -1 with note. Otherwise: ' + renderCmd(e2eCommand, implWorktreePath) + '\n'
    : '  E2E: not configured — set e2eExit: -1.\n'

  // When a post-implementation gate is configured, the implementer stops after 4b — the
  // IN_PROGRESS → VERIFY exit commit (4c) is deferred until the operator approves the gate
  // artifact (11-workflow-scripts/01-post-implementation-gate R2/D6). When no gate is
  // configured, 4c happens immediately in this same agent turn exactly as before (R8: byte-
  // identical behavior for projects — including ledger itself — that don't set the config).
  const fourCText = postImplementationGateCommand
    ? '\n4c. EXIT COMMIT — DEFERRED:\n' +
      '  A post-implementation gate is configured for this project (workflow.postImplementationGate).\n' +
      '  Fill Implementation Notes: deps added, decisions, bundle delta, gate results, deviations.\n' +
      '  Do NOT bump **Status:** yet — it stays IN_PROGRESS. Commit the implementation + notes:\n' +
      '  git -C ' + implWorktreePath + ' add -A\n' +
      '  git -C ' + implWorktreePath + ' commit -m "impl(' + leafId + '): implementation complete, pending post-impl gate"\n' +
      '  The IN_PROGRESS → VERIFY transition (4c proper) lands later, once the operator approves\n' +
      '  the post-implementation gate artifact — that is the orchestrator\'s job, not yours.\n\n' +
      'Return worktreePath: "' + implWorktreePath + '" and branchName: "' + implBranchName + '", plus gate exit codes.'
    : '\n4c. EXIT COMMIT:\n' +
      '  Fill Implementation Notes: deps added, decisions, bundle delta, gate results, deviations.\n' +
      '  Bump **Status:** IN_PROGRESS → VERIFY in spec + parent manifest.\n' +
      '  git -C ' + implWorktreePath + ' add -A\n' +
      '  git -C ' + implWorktreePath + ' commit -m "impl(' + leafId + '): IN_PROGRESS → VERIFY"\n\n' +
      'Return worktreePath: "' + implWorktreePath + '" and branchName: "' + implBranchName + '", plus gate exit codes.'

  const implResult = await callAgent(
    'You are the implementing agent for node "' + nodeId + '".\n' +
    'Source of truth: read "' + specPath + '" in full before touching any file.\n' +
    'Constraints: read "' + repoPath + '/CLAUDE.md" — these apply without exception.\n\n' +
    'First, set up an isolated worktree (do NOT work on ' + baseBranch + ' directly):\n' +
    '  Check if "' + implWorktreePath + '" already exists (test -d "' + implWorktreePath + '").\n' +
    '  If it does NOT exist, create it:\n' +
    '    git -C ' + repoPath + ' worktree add -b ' + implBranchName + ' ' + implWorktreePath + ' ' + baseBranch + '\n' +
    '  If it already exists, work in it as-is (it may have prior partial work).\n' +
    setupText +
    'All subsequent work happens inside "' + implWorktreePath + '".\n\n' +
    'Three commits:\n\n' +
    '4a. ENTRY COMMIT:\n' +
    '  Bump **Status:** APPROVED → IN_PROGRESS in "' + implWorktreePath + '/' + docsDir + '/' + nodeId + '.md" and the parent manifest row.\n' +
    '  git -C ' + implWorktreePath + ' add ' + docsDir + '/' + nodeId + '.md ' + docsDir + '/' + parentDocName + '.md\n' +
    '  git -C ' + implWorktreePath + ' commit -m "impl(' + leafId + '): APPROVED → IN_PROGRESS"\n' +
    '  Nothing else in this commit.\n\n' +
    '4b. IMPLEMENTATION:\n' +
    '  Implement per the spec.\n' +
    gatesText +
    e2eText +
    fourCText,
    { schema: IMPL_SCHEMA, label: 'implement', phase: 'Implement' }
  )

  if (!implResult) {
    log('ERROR: implementation agent returned null')
    return { nodeId, status: 'manual-needed', message: 'Implementation agent failed or made no changes.' }
  }

  worktreePath = implResult.worktreePath
  branchName = implResult.branchName
  log('Worktree: ' + worktreePath + ' on ' + branchName)

  if (gateCommands.length > 0) {
    log('Gates: ' + gateCommands.map(function(g) { return g.label + '=' + (implResult[g.label + 'Exit'] ?? '?') }).join(' '))
    const anyGateFailed = gateCommands.some(function(g) { return implResult[g.label + 'Exit'] !== 0 })
    if (anyGateFailed) {
      log('WARNING: one or more gates failed — reviewer will flag')
    }
  }

  // ── Post-Impl Gate (4b½) ──────────────────────────────────────────────────
  // Inserted between 4b and 4c: run the configured command, create a human_review
  // task pointing at the artifact, and return early. 4c does not land until the
  // operator approves — see the resume-after-gate branch above.
  if (postImplementationGateCommand) {
    phase('Post-Impl Gate')

    const round1 = await runPostImplGate(1, worktreePath, branchName)

    log('Post-Impl Gate: round 1 task ' + round1.postImplReviewTaskId + ' artifact ' + round1.artifactPath)

    return {
      nodeId,
      status: 'awaiting-post-impl-approval',
      worktreePath,
      branchName,
      postImplReviewTaskId: round1.postImplReviewTaskId,
      artifactPath: round1.artifactPath,
      round: 1,
      nextStep: 'Open the artifact, then approve or reject (with a reason) the human_review task. Either way, resume with resumeAfterGate: true.',
      resumeCommand: 'Workflow({ scriptPath: "' + repoPath + '/.claude/workflows/leaf-workflow.js", args: { nodeId: "' + nodeId + '", resumeAfterGate: true, worktreePath: "' + worktreePath + '", branchName: "' + branchName + '", postImplReviewTaskId: "' + round1.postImplReviewTaskId + '" } })',
    }
  }
} else {
  log('Implement not needed (status=' + currentStatus + ')')
}

if (!worktreePath || !branchName) {
  log('ERROR: no worktree path available after impl stage')
  return { nodeId, status: 'manual-needed', message: 'No worktree found. Run stages 5–8 manually.' }
}

// ── Stage 5: Rebase ───────────────────────────────────────────────────────────

if (runRebase) {
  phase('Rebase')

  const rebaseGates = gateCommands.length > 0
    ? '  - Run:\n' + renderGates(gateCommands, worktreePath).split('\n').map(function(c) { return '    ' + c }).join('\n') + '\n'
    : '  - No gates configured; skip gate run.\n'

  const rebaseResult = await callAgent(
    'Rebase the implementation worktree for node "' + nodeId + '" onto current ' + baseBranch + '.\n\n' +
    'Steps:\n' +
    '1. git -C ' + repoPath + ' fetch --quiet 2>/dev/null || true\n' +
    '2. git -C ' + worktreePath + ' rebase ' + baseBranch + '\n\n' +
    'If the rebase succeeds:\n' +
    rebaseGates +
    '  - Return { success: true, details: "rebase clean", conflicts: [] }\n\n' +
    'If there are conflicts:\n' +
    '  - Do NOT run git rebase --abort (preserve state for operator)\n' +
    '  - Run: git -C ' + worktreePath + ' diff --name-only --diff-filter=U\n' +
    '  - Return { success: false, details: "conflict description", conflicts: [<files from above>] }',
    { schema: REBASE_SCHEMA, label: 'rebase', phase: 'Rebase' }
  )

  log('Rebase: success=' + rebaseResult.success)

  if (!rebaseResult.success) {
    return {
      nodeId,
      status: 'rebase-conflict',
      worktreePath,
      branchName,
      conflicts: rebaseResult.conflicts,
      message: 'Rebase conflicts — resolve manually, then run leaf-workflow-finish.',
    }
  }
} else {
  log('Rebase not needed (status=' + currentStatus + ')')
}

// ── Stage 6: Implementation Review ───────────────────────────────────────────

let implReview = null

if (runImplReview) {
  phase('Impl Review')

  const implReviewGates = gateCommands.length > 0
    ? 'Run gates and record exit codes as evidence:\n' +
      renderGates(gateCommands, worktreePath) + '\n\n'
    : 'No gates configured — omit gate evidence from review.\n\n'

  implReview = await callAgent(
    'You are an independent implementation reviewer in a fresh context.\n\n' +
    'Required reading (ALL before forming any judgement):\n' +
    '1. "' + specPath + '" — spec including Spec Review audit table\n' +
    '2. Run: git -C ' + worktreePath + ' diff ' + baseBranch + '..HEAD — read the full diff\n' +
    '3. "' + repoPath + '/.ledger/process/verification-signoff.md" — review format\n' +
    '4. "' + repoPath + '/CLAUDE.md" — hard constraints\n\n' +
    implReviewGates +
    'Evaluation criteria (leaf-workflow.md stage 6):\n' +
    '- Spec conformance (Spec Review closures addressed?)\n' +
    '- Schema correctness: meta is a pure literal; agent() calls use schema: where structure is needed\n' +
    '- Stage coverage and commit messages match leaf-workflow.md intent\n' +
    '- Build/lint/typecheck exit codes cited as evidence\n' +
    '- E2E coverage per spec Verification section\n\n' +
    'Return REVIEW_SCHEMA. One row per Requirements bullet AND per Acceptance-check item.\n' +
    'PASS requires file:line or gate exit code. "Looks correct" is FAIL.\n' +
    'Verdict: READY_FOR_COMPLETE | NEEDS_REVISIONS | NEEDS_MINOR_REVISIONS | NEEDS_MAJOR_REVISIONS',
    { schema: REVIEW_SCHEMA, label: 'impl-review', phase: 'Impl Review' }
  )

  log('Impl review verdict: ' + implReview.verdict)
  log(
    'Blocking: ' + implReview.findings.filter(function(f) { return f.severity === 'Blocking' }).length +
    '  Should-fix: ' + implReview.findings.filter(function(f) { return f.severity === 'Should-fix' }).length +
    '  Nit: ' + implReview.findings.filter(function(f) { return f.severity === 'Nit' }).length
  )
} else {
  log('Impl review not needed (status=' + currentStatus + ', implReviewDone=' + docStatus.implReviewDone + ')')
}

// ── Stage 7: Fixes ────────────────────────────────────────────────────────────

if (runFixes && implReview) {
  phase('Fixes')

  const nonMechanical = implReview.findings.filter(function(f) {
    return !f.isMechanical &&
      (f.severity === 'Blocking' || f.severity === 'Should-fix' || f.severity === 'FAIL' || f.severity === 'PARTIAL')
  })

  // Non-mechanical blocking findings require operator resolution before proceeding
  if (nonMechanical.length > 0) {
    log('Non-mechanical findings require operator resolution (' + nonMechanical.length + ' items)')
    return {
      nodeId,
      status: 'manual-needed',
      worktreePath,
      branchName,
      message: 'Non-mechanical implementation review findings require operator resolution before the gate can be created.',
      findings: nonMechanical,
    }
  }

  const mechanicalFindings = implReview.findings.filter(function(f) { return f.isMechanical })

  const fixGates = gateCommands.length > 0
    ? 'If any code was changed, re-run:\n' +
      renderGates(gateCommands, worktreePath) + '\n\n'
    : ''

  await callAgent(
    'Apply these mechanical implementation review findings in the worktree at "' + worktreePath + '":\n' +
    JSON.stringify(mechanicalFindings, null, 2) + '\n\n' +
    'Add a "### Implementation Review (' + runDate + ')" subsection to Implementation Notes in "' +
    worktreePath + '/' + docsDir + '/' + nodeId + '.md":\n\n' +
    '**Verdict:** ' + implReview.verdict + '\n\n' +
    '| # | Item | Verdict | Evidence |\n' +
    '|---|------|---------|----------|\n' +
    '(one row per sign-off matrix entry)\n\n' +
    '**Applied:** list isMechanical fixes\n' +
    '**Skipped:** list any skipped findings with reason\n\n' +
    fixGates +
    'git -C ' + worktreePath + ' add -A\n' +
    'git -C ' + worktreePath + ' commit -m "review(' + leafId + '): apply impl-review fixes + audit"',
    { label: 'apply-fixes', phase: 'Fixes' }
  )
} else {
  log('Fixes not needed (runFixes=' + runFixes + ', implReview=' + !!implReview + ')')
}

// ── Stage 8: Gate ─────────────────────────────────────────────────────────────

phase('Gate')
const taskPayload = JSON.stringify({
  type: 'human_review',
  nodeId: nodeId,
  title: 'Operator gate: ' + nodeId + ' implementation ready for verification',
  input: {
    nodeId: nodeId,
    worktreePath: worktreePath,
    branchName: branchName,
    nextStep: 'Walk browser acceptance items, then approve or reject.',
  },
})

const gateResult = await callAgent(
  'Create a human_review task in the Ledger task runner.\n\n' +
  'Check if "' + apiCurlPath + '" exists with: test -f "' + apiCurlPath + '" && echo exists || echo missing\n\n' +
  'If it exists, run:\n' +
  '  ' + apiCurlPath + ' -X POST /api/tasks -H \'Content-Type: application/json\' -d \'' + taskPayload + '\'\n\n' +
  'If it is missing, fall back to raw curl:\n' +
  '  curl -sS -X POST ' + apiBaseUrl + '/api/tasks -H \'Content-Type: application/json\' -d \'' + taskPayload + '\'\n\n' +
  'Return the id field from the response JSON. If the server is unreachable, return "server-offline".',
  { schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, label: 'create-gate', phase: 'Gate', model: 'sonnet', effort: 'low' }
)

const humanReviewTaskId = gateResult.id
log('Gate task: ' + humanReviewTaskId)
log('Open ' + uiBaseUrl + ' → Tasks to approve/reject')

return {
  nodeId,
  status: 'awaiting-operator',
  worktreePath,
  branchName,
  humanReviewTaskId,
  implReviewVerdict: implReview ? implReview.verdict : 'skipped',
  nextStep: 'Walk acceptance checks, then approve/reject the human_review task in the Tasks panel.',
  finishWorkflow: 'Workflow({ name: "leaf-workflow-finish", args: { nodeId: "' + nodeId + '", worktreePath: "' + worktreePath + '", branchName: "' + branchName + '" } })',
}
