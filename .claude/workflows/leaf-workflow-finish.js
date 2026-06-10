/**
 * leaf-workflow-finish.js — automates leaf-workflow stages 9–11
 *
 * Usage: Workflow tool with name "leaf-workflow-finish"
 * Args: { nodeId, worktreePath, branchName, repoPath? }
 *
 * Call after the human_review gate task has been approved.
 */

export const meta = {
  name: 'leaf-workflow-finish',
  description: 'Automate stages 9–11 of the leaf-node implementation workflow: promote VERIFY→COMPLETE in the worktree, merge --no-ff with cross-doc sync (CLAUDE.md + PRD §14), worktree cleanup.',
  phases: [
    {
      id: 'stage-9',
      name: 'Promote — bump VERIFY→COMPLETE (v1, DATE) in spec + parent manifest',
    },
    {
      id: 'stage-10',
      name: 'Merge — merge --no-ff --no-commit, apply cross-doc sync, run gates, commit',
    },
    {
      id: 'stage-11',
      name: 'Cleanup — remove worktree and delete branch',
    },
  ],
};

export default async function leafWorkflowFinish(args, { agent, phase }) {
  const nodeId = args.nodeId;
  const worktreePath = args.worktreePath;
  const branchName = args.branchName;
  const repoPath = args.repoPath || '/Users/dennis/code/ledger';

  if (!nodeId) {
    return { status: 'manual-needed', message: 'nodeId is required' };
  }
  if (!worktreePath) {
    return { status: 'manual-needed', message: 'worktreePath is required' };
  }
  if (!branchName) {
    return { status: 'manual-needed', message: 'branchName is required' };
  }

  const specPath = repoPath + '/docs/' + nodeId + '.md';
  const nodeParts = nodeId.split('/');
  const leafId = nodeParts[nodeParts.length - 1];
  const parentPrefix = nodeParts.slice(0, -1).join('/');
  const parentDocName = parentPrefix ? parentPrefix + '/00-' + parentPrefix.split('/').pop() : '00-project';

  // ── Stage 9: Promote ──────────────────────────────────────────────────────

  await phase('stage-9', async () => {
    await agent(
      'In the worktree at "' + worktreePath + '":\n\n' +
      '1. In "' + specPath + '":\n' +
      '   - Change **Status:** VERIFY to **Status:** COMPLETE (v1, TODAY_DATE)\n' +
      '   - If the spec contains a sample-tree picture (ASCII table showing node status), ' +
      '     update its row to reflect COMPLETE status.\n\n' +
      '2. In the parent doc "' + repoPath + '/docs/' + parentDocName + '.md":\n' +
      '   - Update the children manifest row for ' + nodeId + ' to show COMPLETE (v1, TODAY_DATE)\n\n' +
      '3. Commit in the worktree:\n' +
      '   git commit -m "docs(' + leafId + '): VERIFY → COMPLETE"\n\n' +
      'Only these status bumps go in this commit — no other changes.'
    );
  });

  // ── Stage 10: Merge ───────────────────────────────────────────────────────

  await phase('stage-10', async () => {
    await agent(
      'Merge the worktree branch into main with cross-doc sync.\n\n' +
      'Step 1 — Start the merge (no-commit so we can edit files first):\n' +
      '  git -C ' + repoPath + ' merge --no-ff --no-commit ' + branchName + '\n\n' +
      'Step 2 — Apply cross-doc sync BEFORE committing:\n' +
      '  a) In "' + repoPath + '/CLAUDE.md":\n' +
      '     - Find the project-state summary line that describes ' + nodeId + '\n' +
      '       (look for the node name / workflow-scripts context in the backend build-order paragraph)\n' +
      '     - Update it to reflect COMPLETE (v1, TODAY_DATE)\n\n' +
      '  b) In "' + repoPath + '/docs/00-project.md" §14 manifest:\n' +
      '     - Update the ' + nodeId + ' row Status column to COMPLETE (v1, TODAY_DATE) with a brief description\n\n' +
      '  c) Check any sibling specs that have a sample-tree picture showing ' + nodeId + ' — update their rows too.\n\n' +
      'Step 3 — Run gates:\n' +
      '  pnpm -C ' + repoPath + '/app typecheck\n' +
      '  pnpm -C ' + repoPath + '/app lint\n' +
      '  pnpm -C ' + repoPath + '/app build\n\n' +
      'Step 4 — If gates pass, commit:\n' +
      '  git -C ' + repoPath + ' commit -m "Merge ' + branchName + ': ' + nodeId + ' → COMPLETE + doc sync"\n\n' +
      'If any gate fails, report the failure and do not commit.'
    );
  });

  // ── Stage 11: Cleanup ─────────────────────────────────────────────────────

  await phase('stage-11', async () => {
    await agent(
      'Clean up the worktree and branch.\n\n' +
      'Run:\n' +
      '  git -C ' + repoPath + ' worktree remove -f ' + worktreePath + '\n' +
      '  git -C ' + repoPath + ' branch -d ' + branchName + '\n\n' +
      'The -f flag is needed because Claude Code worktrees may be locked.\n' +
      'The lowercase -d refuses to delete if not fully merged — a safety net; if it fails, report why.'
    );
  });

  // ── Final return ──────────────────────────────────────────────────────────

  return {
    nodeId,
    status: 'COMPLETE',
    message: nodeId + ' promoted to COMPLETE, merged into main, and worktree cleaned up.',
  };
}
