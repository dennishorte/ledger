---
name: plan-position
description: Returns where a named plan sits in the open Ledger project. The packet states its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. Use when the process file that states this lookup names this skill.
disable-model-invocation: true
---

# Plan position

The open project is the project whose files are in the current workspace.

If that project has no process files under `.ledger/process/`, return no packet.

Read this procedure in the open project's `.ledger/process/plan-workflow.md`. Apply it to the named plan.

Return a packet that states six things:

- its status
- what is already confirmed
- the next action
- whether the person is asked
- the review rows for this step
- the candidate decisions previously made

The candidate decisions that come from the record are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan. This skill does not say how the reading set is gathered. It does not judge whether a decision directly affects the part.

Each of those six quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place.

Return no packet until the check for process files has passed.
