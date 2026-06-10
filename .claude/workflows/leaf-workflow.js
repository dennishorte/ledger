/**
 * leaf-workflow.js — automates leaf-workflow stages 1–8
 *
 * Usage: Workflow tool with name "leaf-workflow"
 * Args: { nodeId, repoPath?, skipSpecReview? }
 */

export const meta = {
  name: 'leaf-workflow',
  description: 'Automate stages 1–8 of the leaf-node implementation workflow: author spec (if needed), spec review, apply fixes + APPROVED transition, implement in isolated worktree, rebase, implementation review, apply fixes, create human_review gate task.',
  phases: [
    {
      id: 'stage-0',
      name: 'Inspect — read current doc status',
    },
    {
      id: 'stage-1',
      name: 'Draft — author spec or confirm existing DRAFT',
    },
    {
      id: 'stage-2',
      name: 'Spec Review — bump DRAFT→SPEC_REVIEW and run independent review',
    },
    {
      id: 'stage-3',
      name: 'Approve — apply mechanical fixes, add audit table, bump SPEC_REVIEW→APPROVED',
    },
    {
      id: 'stage-4',
      name: 'Implement — isolated worktree, three commits (entry/impl/exit)',
    },
    {
      id: 'stage-5',
      name: 'Rebase — git fetch + rebase worktree onto main',
    },
    {
      id: 'stage-6',
      name: 'Impl Review — clean-context review of rebased diff',
    },
    {
      id: 'stage-7',
      name: 'Fixes — apply mechanical impl-review findings, add audit subsection',
    },
    {
      id: 'stage-8',
      name: 'Gate — POST human_review task to the runner',
    },
  ],
};

export default async function leafWorkflow(args, { agent, phase }) {
  const nodeId = args.nodeId;
  const repoPath = args.repoPath || '/Users/dennis/code/ledger';
  const skipSpecReview = args.skipSpecReview || false;

  if (!nodeId) {
    return { status: 'manual-needed', message: 'nodeId is required' };
  }

  const specPath = repoPath + '/docs/' + nodeId + '.md';
  const nodeParts = nodeId.split('/');
  const leafId = nodeParts[nodeParts.length - 1];
  const parentPrefix = nodeParts.slice(0, -1).join('/');
  const parentDocName = parentPrefix ? parentPrefix + '/00-' + parentPrefix.split('/').pop() : '00-project';

  // ── Schemas ──────────────────────────────────────────────────────────────

  const STATUS_SCHEMA = {
    type: 'object',
    properties: {
      exists: { type: 'boolean' },
      status: { type: 'string' },
      specReviewDone: { type: 'boolean' },
      implReviewDone: { type: 'boolean' },
    },
    required: ['exists', 'status', 'specReviewDone', 'implReviewDone'],
    additionalProperties: false,
  };

  const REVIEW_SCHEMA = {
    type: 'object',
    properties: {
      verdict: { type: 'string' },
      matrix: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            item: { type: 'string' },
            verdict: { type: 'string', enum: ['PASS', 'FAIL', 'PARTIAL', 'N/A'] },
            evidence: { type: 'string' },
          },
          required: ['id', 'item', 'verdict', 'evidence'],
          additionalProperties: false,
        },
      },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string' },
            description: { type: 'string' },
            fix: { type: 'string' },
            isMechanical: { type: 'boolean' },
          },
          required: ['severity', 'description', 'fix', 'isMechanical'],
          additionalProperties: false,
        },
      },
      summaryMarkdown: { type: 'string' },
    },
    required: ['verdict', 'matrix', 'findings', 'summaryMarkdown'],
    additionalProperties: false,
  };

  const IMPL_SCHEMA = {
    type: 'object',
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
    required: ['worktreePath', 'branchName', 'typecheckExit', 'lintExit', 'buildExit', 'e2eExit', 'e2eSummary', 'bundleDelta', 'filesChanged', 'operatorItems'],
    additionalProperties: false,
  };

  const REBASE_SCHEMA = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      details: { type: 'string' },
      conflicts: { type: 'array', items: { type: 'string' } },
    },
    required: ['success', 'details', 'conflicts'],
    additionalProperties: false,
  };

  const WORKTREE_SCHEMA = {
    type: 'object',
    properties: {
      worktreePath: { type: ['string', 'null'] },
      branchName: { type: ['string', 'null'] },
    },
    required: ['worktreePath', 'branchName'],
    additionalProperties: false,
  };

  // ── Stage 0: Inspect ─────────────────────────────────────────────────────

  let docStatus;
  await phase('stage-0', async () => {
    docStatus = await agent(
      'Read the file at "' + specPath + '". ' +
      'If the file does not exist, return { exists: false, status: "NOT_FOUND", specReviewDone: false, implReviewDone: false }. ' +
      'If it exists, read the **Status:** line to get the current lifecycle status. ' +
      'Return specReviewDone: true if the doc contains a "## Spec Review" section. ' +
      'Return implReviewDone: true if the Implementation Notes section contains an "### Implementation Review" subsection.',
      { schema: STATUS_SCHEMA }
    );
  });

  // Derive boolean stage-skip flags from lifecycle state
  const currentStatus = docStatus.status;

  if (currentStatus === 'COMPLETE') {
    return { nodeId, status: 'already-complete' };
  }

  const runDraft = currentStatus === 'NOT_FOUND';
  const runSpecReview = (currentStatus === 'NOT_FOUND' || currentStatus === 'DRAFT') && !skipSpecReview;
  const runApprove = currentStatus === 'NOT_FOUND' || currentStatus === 'DRAFT' || currentStatus === 'SPEC_REVIEW';
  const runImpl = currentStatus === 'NOT_FOUND' || currentStatus === 'DRAFT' || currentStatus === 'SPEC_REVIEW' || currentStatus === 'APPROVED';
  const runRebase = runImpl || currentStatus === 'IN_PROGRESS';
  const runImplReview = runRebase || currentStatus === 'VERIFY';
  const runFixes = runImplReview;
  const runGate = true; // always create the gate task unless already COMPLETE

  // ── Worktree location (needed for IN_PROGRESS/VERIFY re-entry) ───────────

  let worktreePath = null;
  let branchName = null;

  if (currentStatus === 'IN_PROGRESS' || currentStatus === 'VERIFY') {
    const worktreeInfo = await agent(
      'Run: git -C ' + repoPath + ' worktree list --porcelain\n' +
      'Run: git -C ' + repoPath + ' branch --list "feat/' + leafId + '"\n' +
      'Identify the worktree associated with branch feat/' + leafId + '. ' +
      'Return the worktreePath (the path to the worktree directory) and branchName ("feat/' + leafId + '"). ' +
      'If not found, return null for both.',
      { schema: WORKTREE_SCHEMA }
    );
    worktreePath = worktreeInfo.worktreePath;
    branchName = worktreeInfo.branchName;
  }

  // ── Stage 1: Draft ────────────────────────────────────────────────────────

  await phase('stage-1', async () => {
    if (!runDraft) {
      return; // existing DRAFT or further along
    }
    await agent(
      'Author a new spec doc at "' + specPath + '" for node "' + nodeId + '".\n\n' +
      'Required sections in this order (per leaf-workflow.md §1 and PRD §6.1):\n' +
      '1. Front-matter: **Node ID:** `' + nodeId + '`, **Parent:** `' + parentDocName + '`, **Status:** DRAFT, **Created:** (today), **Last Updated:** (today), **Dependencies:** (list any)\n' +
      '2. Requirements (in-scope bullets + explicit out-of-scope bullets)\n' +
      '3. Design (data contracts, components & files, interaction model, acceptance checks)\n' +
      '4. Decisions (numbered D1…Dn table with Rationale)\n' +
      '5. Open Issues (priority-tagged HIGH/MEDIUM/LOW/TRIVIAL)\n' +
      '6. Implementation Notes: `*(none yet — pre-implementation)*`\n' +
      '7. Verification (acceptance checks; name E2E files if UI/API surface exists)\n' +
      '8. Children: None.\n\n' +
      'Add the new node to the parent doc children manifest at "' + repoPath + '/docs/' + parentDocName + '.md". ' +
      'Commit both files: git commit -m "docs(' + leafId + '): DRAFT spec"'
    );
  });

  // ── Stage 2: Spec Review ─────────────────────────────────────────────────

  let specReview = null;

  await phase('stage-2', async () => {
    if (!runSpecReview) {
      if (skipSpecReview) {
        specReview = {
          verdict: 'LGTM',
          matrix: [],
          findings: [],
          summaryMarkdown: 'Spec review skipped by operator (skipSpecReview: true).',
        };
      }
      return;
    }

    // 2a: bump status DRAFT → SPEC_REVIEW (transition commit)
    await agent(
      'In the file "' + specPath + '", change **Status:** DRAFT to **Status:** SPEC_REVIEW. ' +
      'Also update the parent doc "' + repoPath + '/docs/' + parentDocName + '.md" manifest row for ' + nodeId + ' to show SPEC_REVIEW. ' +
      'Commit both: git commit -m "docs(' + leafId + '): DRAFT → SPEC_REVIEW"'
    );

    // 2b: independent review agent (clean context)
    specReview = await agent(
      'You are an independent spec reviewer in a fresh context. Read these files:\n' +
      '- "' + specPath + '" (the spec to review)\n' +
      '- "' + repoPath + '/docs/00-project.md" §§1–6 (PRD)\n' +
      '- "' + repoPath + '/docs/' + parentDocName + '.md" (parent doc)\n' +
      '- "' + repoPath + '/.ledger/process/verification-signoff.md" (review format)\n' +
      '- "' + repoPath + '/CLAUDE.md" (project constraints)\n' +
      '- "' + repoPath + '/app/src/lib/types.ts" (existing types — check if spec adds vs reuses)\n\n' +
      'Evaluation criteria:\n' +
      '- Schema compliance (all PRD §6.1 required sections present in order)\n' +
      '- PRD coverage (spec addresses relevant PRD §§)\n' +
      '- Dependency declaration (all deps named in front-matter)\n' +
      '- Type additions vs existing types (no duplication)\n' +
      '- MVP scoping (out-of-scope bullets explicit)\n' +
      '- Internal consistency (Design matches Requirements, Decisions match Design)\n' +
      '- House-style alignment (matches depth of sibling specs)\n\n' +
      'Return REVIEW_SCHEMA. Per verification-signoff.md:\n' +
      '- One matrix row per PRD-coverage item and per Requirements bullet\n' +
      '- PASS requires concrete evidence; "looks correct" is FAIL\n' +
      '- Verdict is derived from matrix: any FAIL → NEEDS_MAJOR_REVISIONS or NEEDS_MINOR_REVISIONS; ' +
      'no FAIL + PARTIAL → READY_WITH_FOLLOWUPS; all PASS/N/A → LGTM\n' +
      '- Valid spec-review verdicts: LGTM | NEEDS_MINOR_REVISIONS | NEEDS_MAJOR_REVISIONS | READY_WITH_FOLLOWUPS | NEEDS_REVISIONS',
      { schema: REVIEW_SCHEMA }
    );
  });

  // ── Stage 3: Approve ──────────────────────────────────────────────────────

  await phase('stage-3', async () => {
    if (!runApprove) {
      return;
    }

    const findings = specReview ? specReview.findings : [];
    const mechanicalFindings = findings.filter(function(f) { return f.isMechanical; });

    await agent(
      'Apply the following mechanical spec-review findings to "' + specPath + '":\n' +
      JSON.stringify(mechanicalFindings, null, 2) + '\n\n' +
      'Then add a "## Spec Review (TODAY_DATE)" section between "## Open Issues" and "## Implementation Notes" containing the full sign-off matrix:\n' +
      '| # | Finding | Resolution |\n' +
      '|---|---------|------------|\n' +
      '(one row per finding from the review; mechanical findings say "applied"; skipped findings say the reason)\n\n' +
      'Bump **Status:** to APPROVED. Update the parent doc "' + repoPath + '/docs/' + parentDocName + '.md" manifest row to APPROVED. ' +
      'Commit: git commit -m "docs(' + leafId + '): SPEC_REVIEW → APPROVED"'
    );
  });

  // ── Stage 4: Implement ────────────────────────────────────────────────────

  let implResult = null;

  await phase('stage-4', async () => {
    if (!runImpl) {
      return;
    }

    const branchToCreate = 'feat/' + leafId;

    implResult = await agent(
      'You are the implementing agent for node "' + nodeId + '".\n\n' +
      'SOURCE OF TRUTH: Read "' + specPath + '" thoroughly, especially the Spec Review audit table.\n' +
      'CLAUDE.md constraints: Read "' + repoPath + '/CLAUDE.md".\n\n' +
      'PROCESS (three commits):\n\n' +
      '4a. ENTRY COMMIT:\n' +
      '  - Create a git worktree: git -C ' + repoPath + ' worktree add .claude/worktrees/feat-' + leafId + ' -b ' + branchToCreate + '\n' +
      '  - In the worktree, bump **Status:** APPROVED → IN_PROGRESS in "' + specPath + '" and the parent manifest row.\n' +
      '  - Commit: git commit -m "impl(' + leafId + '): APPROVED → IN_PROGRESS"\n' +
      '  - Nothing else in this commit.\n\n' +
      '4b. IMPLEMENTATION:\n' +
      '  - Implement per the spec. No TypeScript in .js files. No `any`. No `console.log`. No dead code.\n' +
      '  - Run: pnpm -C ' + repoPath + '/app typecheck\n' +
      '  - Run: pnpm -C ' + repoPath + '/app lint\n' +
      '  - Run: pnpm -C ' + repoPath + '/app build\n' +
      '  - If the spec\'s Verification section says E2E is N/A, record e2eExit: -1 and note in e2eSummary.\n' +
      '  - Otherwise: pnpm -C ' + repoPath + '/e2e test\n' +
      '  - Fill Implementation Notes with: deps, decisions, bundle delta, deviations.\n\n' +
      '4c. EXIT COMMIT:\n' +
      '  - Bump **Status:** IN_PROGRESS → VERIFY in spec + parent manifest.\n' +
      '  - Commit everything (code + Implementation Notes + status bump): git commit -m "impl(' + leafId + '): IN_PROGRESS → VERIFY"\n\n' +
      'Return your worktreePath (output of `pwd` inside the worktree) and branchName (output of `git branch --show-current`).',
      {
        isolation: 'worktree',
        schema: IMPL_SCHEMA,
      }
    );

    worktreePath = implResult.worktreePath;
    branchName = implResult.branchName;
  });

  // If impl didn't run but we had a re-entry path, ensure we have the worktree info
  if (!worktreePath || !branchName) {
    if (implResult) {
      worktreePath = implResult.worktreePath;
      branchName = implResult.branchName;
    } else {
      branchName = 'feat/' + leafId;
    }
  }

  // ── Stage 5: Rebase ───────────────────────────────────────────────────────

  let rebaseResult = null;

  await phase('stage-5', async () => {
    if (!runRebase || !worktreePath) {
      return;
    }

    rebaseResult = await agent(
      'Rebase the worktree branch onto main:\n' +
      '  git -C ' + repoPath + ' fetch\n' +
      '  git -C ' + worktreePath + ' rebase main\n\n' +
      'If the rebase succeeds:\n' +
      '  - Run: pnpm -C ' + repoPath + '/app typecheck\n' +
      '  - Run: pnpm -C ' + repoPath + '/app build\n' +
      '  - Return { success: true, details: "rebase clean; typecheck and build pass", conflicts: [] }\n\n' +
      'If the rebase has conflicts:\n' +
      '  - Do NOT run git rebase --abort\n' +
      '  - List conflicting files\n' +
      '  - Return { success: false, details: "conflict description", conflicts: ["file1", "file2", ...] }',
      { schema: REBASE_SCHEMA }
    );
  });

  if (rebaseResult && !rebaseResult.success) {
    return {
      nodeId,
      status: 'rebase-conflict',
      worktreePath,
      branchName,
      conflicts: rebaseResult.conflicts,
    };
  }

  // ── Stage 6: Impl Review ──────────────────────────────────────────────────

  let implReview = null;

  await phase('stage-6', async () => {
    if (!runImplReview || !worktreePath) {
      return;
    }

    implReview = await agent(
      'You are an independent implementation reviewer in a fresh context.\n\n' +
      'Read:\n' +
      '- "' + specPath + '" (the spec including Spec Review audit table)\n' +
      '- git diff output: run `git -C ' + worktreePath + ' diff main..HEAD` and read the full diff\n' +
      '- "' + repoPath + '/.ledger/process/verification-signoff.md" (review format)\n' +
      '- "' + repoPath + '/CLAUDE.md" (project constraints)\n\n' +
      'Run these gates and record exit codes as evidence:\n' +
      '  pnpm -C ' + repoPath + '/app build\n' +
      '  pnpm -C ' + repoPath + '/app lint\n' +
      '  pnpm -C ' + repoPath + '/app typecheck\n\n' +
      'Evaluation criteria:\n' +
      '- Spec conformance (especially Spec Review closure items)\n' +
      '- Code discipline: no TypeScript annotations in .js files, no `any`, no `console.log`, no dead code\n' +
      '- Schema correctness: `meta` is a pure literal; all `agent()` calls use `schema:` where structure is needed\n' +
      '- Stage coverage: all 11 stages present and match leaf-workflow.md intent\n' +
      '- Prompts match leaf-workflow.md: correct commit messages, lifecycle transitions, reviewer briefing\n' +
      '- Build/lint/typecheck exit codes (include as evidence)\n' +
      '- E2E coverage per spec Verification section\n\n' +
      'Return REVIEW_SCHEMA. Per verification-signoff.md:\n' +
      '- One row per Requirements bullet AND per Acceptance-check item\n' +
      '- PASS requires file:line or gate exit or named test; "looks correct" is FAIL\n' +
      '- Valid impl-review verdicts: READY_FOR_COMPLETE | NEEDS_REVISIONS | NEEDS_MINOR_REVISIONS | NEEDS_MAJOR_REVISIONS',
      { schema: REVIEW_SCHEMA }
    );
  });

  // ── Stage 7: Fixes ────────────────────────────────────────────────────────

  await phase('stage-7', async () => {
    if (!runFixes || !implReview || !worktreePath) {
      return;
    }

    const mechanicalFindings = implReview.findings.filter(function(f) { return f.isMechanical; });
    const nonMechanical = implReview.findings.filter(function(f) {
      return !f.isMechanical && (f.severity === 'FAIL' || f.severity === 'PARTIAL' || f.severity === 'Blocking' || f.severity === 'Should-fix');
    });

    if (nonMechanical.length > 0) {
      return {
        status: 'manual-needed',
        message: 'Non-mechanical impl-review findings require operator resolution',
        findings: nonMechanical,
      };
    }

    await agent(
      'In the worktree at "' + worktreePath + '", apply these mechanical impl-review findings:\n' +
      JSON.stringify(mechanicalFindings, null, 2) + '\n\n' +
      'Add a "### Implementation Review (TODAY_DATE)" subsection to the Implementation Notes section of "' + specPath + '" with the full sign-off matrix:\n' +
      '| # | Item | Verdict | Evidence |\n' +
      '|---|------|---------|----------|\n' +
      '(one row per matrix entry from the review)\n\n' +
      'If the implementation deviated from the spec in an operator-approved way, update the spec in the same commit.\n' +
      'Commit in the worktree: git commit -m "review(' + leafId + '): apply impl-review fixes"'
    );
  });

  // ── Stage 8: Gate ─────────────────────────────────────────────────────────

  let humanReviewTaskId = null;

  await phase('stage-8', async () => {
    if (!runGate) {
      return;
    }

    const taskPayload = JSON.stringify({
      type: 'human_review',
      payload: {
        label: 'Operator verification: ' + nodeId,
        nodeId: nodeId,
        worktreePath: worktreePath,
        branchName: branchName,
      },
    });

    const gateResult = await agent(
      'POST to the task runner API to create a human_review gate task.\n' +
      'Run: ' + repoPath + '/.claude/scripts/api-curl -X POST -H "Content-Type: application/json" -d \'' + taskPayload + '\' /api/tasks\n' +
      'Parse the JSON response and return the task id field as a string.',
      { schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
    );

    humanReviewTaskId = gateResult.id;
  });

  // ── Final return ──────────────────────────────────────────────────────────

  return {
    nodeId,
    status: 'awaiting-operator',
    worktreePath,
    branchName,
    humanReviewTaskId,
    implReviewVerdict: implReview ? implReview.verdict : null,
    blockingFindings: implReview ? implReview.findings.filter(function(f) { return !f.isMechanical; }) : [],
    nextStep: 'Run leaf-workflow-finish once you approve the human_review task',
    finishWorkflow: 'leaf-workflow-finish',
  };
}
