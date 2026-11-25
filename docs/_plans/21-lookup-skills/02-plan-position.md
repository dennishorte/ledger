# Plan position

**Status:** implementation

## Part

`docs/00-project.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

One skill returns where a plan sits: its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | The skill's name is `plan-position`. Its file is `scripts/skills/plan-position/SKILL.md`. Its front matter sets `disable-model-invocation: true`. Its description says to use it when the process file that states this lookup names this skill. | This serves "A person can name the skill and see that it loads, and can see that it stays unloaded until it is named." The skill loads when it is named, and it stays unloaded until then. It serves "A person can point at a project that is not running Ledger and see that the skill stays unloaded," because a project that does not name the skill leaves it unloaded. The parent's D2 is met because the skill is a personal skill and it loads only when it is named. The parent's D4 is met because this piece adds only this skill, in the place the setup copies from. |
| D2 | One sentence is added at the end of the opening of `.ledger/process/plan-workflow.md`, after "The row lists in this file are what that matrix covers for each step.": "Where a plan sits is gathered by the skill `plan-position`." Every other line in that file stays as it is. This piece does not edit a child project. | This serves "A person can name the skill and see that it loads, and can see that it stays unloaded until it is named," because the instruction that states the lookup names the skill. It serves "A person can point at a project that is not running Ledger and see that the skill stays unloaded," because that project has no such instruction. The parent's D2 is met because the process file that states the lookup names the skill, and a child project is left as it is. The child keeps its own docs and its own copy of the process files, and it receives the sentence with the process files it already keeps. |
| D3 | The skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When that check fails, it returns no packet. | This serves "A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check." The parent's D2 is met because a named skill checks for the process files and then returns its packet. |
| D4 | The packet is what this procedure in the open project's `.ledger/process/plan-workflow.md` yields for the named plan. It states the plan's status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. The candidate decisions that come from the record are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan. This skill does not say how the reading set is gathered, and it does not judge whether a decision directly affects the part. Each of those six quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place. | This serves "A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made." It serves "A person can point at the packet and see the quoted lines and the places they were taken from." The parent's D1 is met because the packet is taken from the process files in the project that is open, and it quotes those files and points at them. The parent's D3 is met because the record candidates use the reading-set gathering, and the packet adds the confirmed decisions on the parent plan. |

## Requirements

**Requirements confirmed:** 2026-11-25

**Acceptance.**

- A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.
- A person can point at the packet and see the quoted lines and the places they were taken from.
- A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.
- A person can point at a project that is not running Ledger and see that the skill stays unloaded.
- A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

**Constraints.**

- The packet is taken from the process files in the project that is open.
- The candidate decisions that come from the record use the reading-set gathering, and the packet adds the confirmed decisions on the parent plan.
- The skill is a personal skill, and it loads only when it is named.
- A child project is left as it is.
- This piece adds only its own skill and its own naming line.

**Out of scope.**

- How the reading set is gathered.
- The spirit chain.
- The install script.
- The judgment of whether a decision directly affects the part.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The packet is taken from the process files in the project that is open. The packet quotes those files and points at them. The candidate decisions that come from the record use the reading-set gathering, and the packet adds the confirmed decisions on the parent plan. The instruction that states this lookup names this skill. The skill is a personal skill, and it loads only when it is named. A skill that is named checks that the open project has the process files, and then returns its packet. This piece adds only its own skill, in the place the setup copies from, and only its own naming line. A child project is left as it is. The child keeps its own docs and its own copy of the process files. The child receives the naming line with the process files it already receives. The naming line is added in this project.

### A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.

**Setup.** This piece has written the skill. A project running Ledger is open. A plan is named. That plan has a status, something already confirmed, a next action, and review rows for this step, and it is known whether the person is asked. The part that plan changes has a candidate decision in the record. The plan has a parent, and that parent has a confirmed decision.

**Action.** The agent asks that skill where that plan sits. A person can ask for the same plan and read the same packet.

**Looked at.** The status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. Those are in the packet. They are taken from the process files in the project that is open. The candidate decisions that come from the record are the reading-set gathering for that part. The confirmed decisions on the parent plan are in the packet. They are where the named plan sits. A failed check is missing one of those, the packet taken from somewhere other than those process files, the record candidates gathered some other way, the parent plan's confirmed decisions absent, or the packet for a different plan or a different project.

### A person can point at the packet and see the quoted lines and the places they were taken from.

**Setup.** The packet from the check above is in hand. The project that is open is the same project.

**Action.** The agent points at each quoted line and at the place it names. A person can point at the same line and the same place.

**Looked at.** The quoted line and the place it was taken from. The place is in the process files in the project that is open. The line in the packet is the line at that place. A failed check has a line with no place, a place outside those process files, or a line that is not the line at that place.

### A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.

**Setup.** This piece has written the skill. The skill has not been named. A project running Ledger is open. The instruction that states this lookup names this skill.

**Action.** The agent works in that project without naming the skill, and then names the skill. A person can do the same.

**Looked at.** Before the skill is named, it is unloaded. After it is named, it is loaded. A failed check has the skill loaded before it is named, or still unloaded after it is named.

### A person can point at a project that is not running Ledger and see that the skill stays unloaded.

**Setup.** This piece has written the skill. A project that is not running Ledger is open. Nothing in that project names the skill.

**Action.** The agent works in that project. A person can work in the same project.

**Looked at.** The skill stays unloaded. A failed check has the skill loaded in that project.

### A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

**Setup.** This piece has written the skill. One project that is open has the process files. Another project that is open does not.

**Action.** The agent names the skill in each project and asks where a plan sits. A person can name the skill and ask in the same way.

**Looked at.** The packet comes back for the project that has the process files, and only after that check. No packet comes back for the project that does not have them. A failed check returns a packet before the check, or returns a packet for the project that lacks the process files.

## Tests

The test design says the checks run on the writing this piece has produced, and that they do not run on the project from before that writing. This piece writes no executable tests. The writing is not produced yet. The runs below look for that writing and find it absent. Each check fails because the behavior is not implemented yet. These runs are not a reading of the project from before that writing treated as the finished skill.

The packet these runs looked for is the one taken from the process files in the project that is open. The packet would quote those files and point at them. The candidate decisions that come from the record would use the reading-set gathering, and the packet would add the confirmed decisions on the parent plan. The instruction that states this lookup would name this skill. The skill would be a personal skill, and it would load only when it is named. A named skill would check that the open project has the process files, and then return its packet. This piece would add only its own skill, in the place the setup copies from, and only its own naming line. A child project was left as it is. The child keeps its own docs and its own copy of the process files. The child receives the naming line with the process files it already receives. This run adds no skill and no naming line.

The first check was run. A project running Ledger is open. The plan named is this plan, Plan position. It has a status, the outcome and the requirements are already confirmed, the next action is this tests step, the person is not asked because this step ended, and the review rows for this step are the tests rows. The part this plan changes has a candidate decision in the record. The parent plan has a confirmed decision. The agent looked for the skill and asked where that plan sits. That skill is not written, and no packet came back. The check fails because the status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made are not in a packet. The packet was not taken from the process files in the open project. The record candidates were not the reading-set gathering, and the parent plan's confirmed decisions were not in a packet.

The second check was run. No packet came back from the check above, so the agent had no quoted line to point at and no place a line was taken from. The check fails because the quoted line and its place are absent.

The third check was run. The skill is not written, and no instruction that states this lookup names it. A project running Ledger is open. The agent worked without naming the skill, and it stayed unloaded. The agent then named the skill, and it stayed unloaded. The check fails because the skill is still unloaded after it is named.

The fourth check was run. The skill is not written. A project that is not running Ledger was open, and nothing in that project names the skill. The agent worked in that project. Nothing loaded, because the skill this piece writes is absent. The test design says the check is not a reading of the project from before that writing. This result is not a pass. The check fails because the written skill the setup requires is absent, so the run cannot show that written skill staying unloaded.

The fifth check was run. This project is open and has the process files. Another project was open and does not have them. The agent named the skill in each project and asked where Plan position sits. No packet came back for the project that has the process files, and no packet came back for the project that lacks them. The check fails because the project that has the process files returned no packet after the check. The behavior is not implemented yet.

## Design

The writing is the file `scripts/skills/plan-position/SKILL.md` and one new sentence in `.ledger/process/plan-workflow.md`. The checks are a reading of that writing. This piece writes no executable test. A child project is left as it is.

### A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.

D4 says the packet is what this procedure in the open project's `.ledger/process/plan-workflow.md` yields for the named plan. It states the status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. The candidate decisions that come from the record are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan. This skill does not say how the reading set is gathered, and it does not judge whether a decision directly affects the part. Those are taken from the process files in the open project. A person points at those six in the packet.

### A person can point at the packet and see the quoted lines and the places they were taken from.

D4 says each of those six quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place. A person points at the quoted line and at the place.

### A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.

D1 names the skill `plan-position` and sets `disable-model-invocation: true` in `scripts/skills/plan-position/SKILL.md`. The skill stays unloaded until it is named, and it loads when it is named. D2 adds the sentence "Where a plan sits is gathered by the skill `plan-position`." at the end of the opening of `.ledger/process/plan-workflow.md`. That sentence is the instruction that names the skill. Every other line in that file stays as it is.

### A person can point at a project that is not running Ledger and see that the skill stays unloaded.

D1 leaves the skill unloaded when it is not named. D2 puts the naming sentence only in this project's process file. A project that is not running Ledger has no such sentence, so nothing there names the skill, and the skill stays unloaded.

### A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

D3 says the skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When the check fails, it returns no packet. When the check passes, D4 returns the packet.

### What this piece adds

D1 adds only `scripts/skills/plan-position/SKILL.md`. D2 adds only the one sentence in `.ledger/process/plan-workflow.md`. This piece does not edit a child project. The child keeps its own docs and its own copy of the process files. The child receives the sentence with the process files it already keeps.

The checks are a reading of this writing. This piece writes no executable test.

## Implementation notes

The writing is `scripts/skills/plan-position/SKILL.md` and one sentence at the end of the opening of `.ledger/process/plan-workflow.md`: "Where a plan sits is gathered by the skill `plan-position`." The checks are a reading of that writing.

The first check was read against that writing. The skill applies the procedure in the open project's process file to the named plan. The packet states the status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. The record candidates are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan.

The second check was read against that writing. Each of those six quotes the line it rests on and points at that place in the process files. The line in the packet is the line at that place.

The third check was read against that writing. The skill is named `plan-position`. `disable-model-invocation: true` leaves it unloaded until it is named. The process file names it.

The fourth check was read against that writing. The skill stays unloaded when it is not named. The naming sentence is only in this project's process file.

The fifth check was read against that writing. The skill returns no packet when the open project has no process files under `.ledger/process/`. The packet instructions come after that check.

A child project was left as it is. The child receives the naming line with the process files it already receives. This writing adds only this skill and that one sentence.

## Reviews

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the requirements above. A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. The packet shows the quoted lines and the places they were taken from. The skill loads when it is named, stays unloaded until then, and stays unloaded for a project that is not running Ledger. The packet comes back only after the skill checks that the open project has the process files. The packet is taken from the process files in the project that is open. The candidate decisions that come from the record use the reading-set gathering, and the packet adds the confirmed decisions on the parent plan. The skill is a personal skill. A child project is left as it is. This piece adds only its own skill and its own naming line. How the reading set is gathered, the spirit chain, the install script, and the judgment of whether a decision directly affects the part are out of scope.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit. This review used the plan's spirit: "Doing lookups to follow the process is handled efficiently."

The intent this review read is that spirit. The change fits it. A packet a person can point at, taken from the process files in the open project, raises the quality of the agent's work and leaves the person with less hunting to do. The plan's spirit is that lookup handled in one named skill. The spirit file stays as it is. Findings: none.

### Test design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. | PASS | Setup (`02-plan-position.md:56`): the skill is written, a project running Ledger is open, a plan is named, and that plan has a status, something already confirmed, a next action, review rows for this step, and a known answer for whether the person is asked. The part has a candidate decision in the record, and the parent has a confirmed decision. Action (`:58`): the agent asks that skill where that plan sits. Looked at (`:60`): those six are in the packet, and they are where the named plan sits. A failure is missing one of those, or the packet is for a different plan or a different project. The check names no file, function, library, or mechanism. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | Setup (`:64`): the packet from the check above is in hand, and the open project is the same project. Action (`:66`): the agent points at each quoted line and at the place it names. Looked at (`:68`): the place is in the process files in the open project, and the line in the packet is the line at that place. A failure is a line with no place, a place outside those process files, or a line that is not the line at that place. The check names no file, function, library, or mechanism. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | Setup (`:72`): the skill is written, it has not been named, a project running Ledger is open, and the instruction that states this lookup names this skill. Action (`:74`): the agent works without naming the skill, then names it. Looked at (`:76`): it is unloaded before it is named and loaded after it is named. A failure has it loaded before it is named, or still unloaded after it is named. The check names no file, function, library, or mechanism. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | Setup (`:80`): a project that is not running Ledger is open, and nothing in that project names the skill. Action (`:82`): the agent works in that project. Looked at (`:84`): the skill stays unloaded. A failure has the skill loaded in that project. The check names no file, function, library, or mechanism. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | Setup (`:88`): one open project has the process files, and another does not. Action (`:90`): the agent names the skill in each project and asks where a plan sits. Looked at (`:92`): the packet comes back for the project that has the process files, and only after that check; no packet comes back for the project that does not. A failure returns a packet before the check, or returns a packet for the project that lacks the process files. The check names no file, function, library, or mechanism. | |
| D1 | The plan-position packet is taken from the process files in the project that is open. The packet quotes those files and points at them. | PASS | The opening (`:52`) says the packet is taken from the process files in the project that is open, and that the packet quotes those files and points at them. The first check (`:60`) looks at the six items taken from those process files, and a failure is the packet taken from somewhere else. The second check (`:68`) looks at the quoted place in those process files, and a failure is a place outside them, or a line that is not the line at that place. | |
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states this lookup names it, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is and is edited only when asked, and the child receives the naming line with the process files it already receives. | PASS | The opening (`:52`) says the skill is a personal skill and loads only when it is named, the instruction that states this lookup names this skill, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is, the naming line is added in this project, and the child receives the naming line with the process files it already receives. The third check (`:76`) looks at unloaded before the name and loaded after. The fourth check (`:84`) looks at the skill staying unloaded in a project that is not running Ledger. The fifth check (`:92`) looks at the packet coming back only after the process-files check. | |
| D3 | This skill uses the reading-set gathering for the candidate decisions that come from the record, and it adds the confirmed decisions on the parent plan. | PASS | The opening (`:52`) says the candidate decisions that come from the record use the reading-set gathering, and the packet adds the confirmed decisions on the parent plan. The first check's setup (`:56`) gives the part a candidate decision in the record and the parent a confirmed decision. Its looked-at (`:60`) says the record candidates are the reading-set gathering for that part, and that the parent's confirmed decisions are in the packet. A failure is the record candidates gathered some other way, or the parent plan's confirmed decisions absent. | |
| D4 | This piece adds its own skill in the place the setup copies from, and only its own skill and its own naming line. | PASS | The opening (`:52`): "This piece adds only its own skill, in the place the setup copies from, and only its own naming line." | |
| P1 | A child project is edited only when asked. | PASS | The opening (`:52`): "A child project is left as it is." The naming line is added in this project, and the child receives it with the process files it already receives. | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | The opening (`:52`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.

### Tests review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. | PASS | The first check (`02-plan-position.md:100`) opens a project running Ledger and names Plan position. That plan has a status, the outcome and the requirements are already confirmed, the next action is this tests step, the person is not asked, and the review rows for this step are the tests rows. The part has a candidate decision in the record, and the parent has a confirmed decision. The agent asks where that plan sits. The skill is not written, and no packet comes back. The check fails because those six are not in a packet, the packet was not taken from the process files in the open project, the record candidates were not the reading-set gathering, and the parent plan's confirmed decisions were not in a packet. The note (`:116`) records that no skill returns where the plan sits and no packet came back for Plan position. That is the packet the test design names, and it is missing, so the run fails. The run names no file, function, library, or mechanism. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | The second check (`02-plan-position.md:102`) has no packet from the check above, so there is no quoted line to point at and no place a line was taken from. It fails because the quoted line and its place are absent. The note (`:118`) records that failure. The test design names a quoted line that is the line at its place in the process files of the open project. That line and that place are missing, so the run fails. The run names no file, function, library, or mechanism. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | The third check (`02-plan-position.md:104`) works in a project running Ledger without naming the skill, and it stays unloaded. After the skill is named, it stays unloaded. No instruction that states this lookup names it. The check fails because the skill is still unloaded after it is named. The note (`:120`) records that failure. The test design names a skill that is loaded after it is named. That behavior is missing, so the run fails. The run names no file, function, library, or mechanism. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | The fourth check (`02-plan-position.md:106`) works in a project that is not running Ledger, and nothing in that project names the skill. Nothing loaded, because the skill this piece writes is absent. The run says this result is not a pass, and the check fails because that written skill is absent, so the run cannot show that written skill staying unloaded. The note (`:122`) says the unloaded result is the project from before that writing, and the test design does not count that as a pass. The run fails while the written skill is missing. The run names no file, function, library, or mechanism. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | The fifth check (`02-plan-position.md:108`) names the skill in this project, which has the process files, and in another project, which does not, and asks where Plan position sits. No packet comes back for either project. The check fails because the project that has the process files returned no packet after the check. The note (`:124`) records that failure and that the project that lacks the process files also returned no packet. The test design names a packet that comes back only after that check, and no packet for the project that lacks the process files. The packet is missing, so the run fails. The run names no file, function, library, or mechanism. | |
| D1 | The plan-position packet is taken from the project that is open, from that project's process files. The packet quotes those files and points at them. | PASS | The Tests section (`02-plan-position.md:98`) says the packet these runs looked for is taken from the process files in the project that is open, and that the packet would quote those files and point at them. The first check (`:100`) fails because the packet was not taken from the process files in the open project. The second check (`:102`) fails because the quoted line and its place are absent. | |
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states this lookup names it, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is, and the child receives the naming line with the process files it already receives. A child project is edited only when asked. | PASS | The Tests section (`02-plan-position.md:98`) says the instruction that states this lookup would name this skill, the skill would be a personal skill and would load only when it is named, and a named skill would check that the open project has the process files and then return its packet. It says "A child project was left as it is" and "The child receives the naming line with the process files it already receives." The third check (`:104`) stays unloaded before the skill is named and after it is named, because no instruction names it. The fifth check (`:108`) names the skill and gets no packet for the project that has the process files. The note (`:126`) says the child was left as it is, the child receives the naming line with the process files it already receives, and this run adds no skill and no naming line. | |
| D3 | This skill uses the reading-set gathering for the candidate decisions that come from the record, and it adds the confirmed decisions on the parent plan. | PASS | The Tests section (`02-plan-position.md:98`) says the candidate decisions that come from the record would use the reading-set gathering, and the packet would add the confirmed decisions on the parent plan. The first check (`:100`) gives the part a candidate decision in the record and the parent a confirmed decision, and fails because the record candidates were not the reading-set gathering and the parent plan's confirmed decisions were not in a packet. | |
| D4 | This piece adds its own skill in the place the setup copies from, and only its own skill. | PASS | The Tests section (`02-plan-position.md:98`): "This piece would add only its own skill, in the place the setup copies from, and only its own naming line." The same paragraph says "This run adds no skill and no naming line." | |
| P1 | A child project is edited only when asked. | PASS | The Tests section (`02-plan-position.md:98`) and the note (`:126`): "A child project was left as it is." The run adds no skill and no naming line. | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | The Tests section (`02-plan-position.md:98`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the design above. One skill, `plan-position`, in `scripts/skills/plan-position/SKILL.md`, loads only when it is named. Its front matter sets `disable-model-invocation: true`. One sentence at the end of the opening of `.ledger/process/plan-workflow.md` names that skill: "Where a plan sits is gathered by the skill `plan-position`." Every other line in that file stays as it is. The skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When that check fails, it returns no packet. The packet is what that procedure in the open project's `.ledger/process/plan-workflow.md` yields for the named plan. It states the plan's status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. The candidate decisions that come from the record are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan. This skill does not say how the reading set is gathered, and it does not judge whether a decision directly affects the part. Each of those six quotes the line it rests on and points at that place in the open project's process files. The line in the packet is the line at that place. This piece adds only that skill and that sentence. A child project is left as it is. The child keeps its own docs and its own copy of the process files. The child receives the sentence with the process files it already keeps.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit. This review used the plan's spirit: "Doing lookups to follow the process is handled efficiently."

The intent this review read is that spirit. The change fits it. The skill returns where the named plan sits, taken from the open project's own procedure, and each item quotes the line it rests on. That raises the quality of the agent's work and leaves the person with less hunting through the process. The skill stays unloaded until it is named, and it returns no packet for a project that lacks the process files, so a lookup that does not apply is not carried. The plan's spirit is that lookup handled in one named skill and one naming sentence. The spirit file stays as it is. Findings: none.

### Design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. | PASS | The design for that check (`02-plan-position.md:121`): "It states the status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made." D4 (`:26`) says the packet is what the procedure in the open project's `.ledger/process/plan-workflow.md` yields for the named plan, and it states those six. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | The design for that check (`02-plan-position.md:125`): "D4 says each of those six quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place." | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | The design for that check (`02-plan-position.md:129`): D1 names the skill `plan-position` and sets `disable-model-invocation: true`, so it stays unloaded until it is named and loads when it is named. D2's sentence, "Where a plan sits is gathered by the skill `plan-position`.", is the instruction that names the skill. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | The design for that check (`02-plan-position.md:133`): "D1 leaves the skill unloaded when it is not named. D2 puts the naming sentence only in this project's process file. A project that is not running Ledger has no such sentence, so nothing there names the skill, and the skill stays unloaded." | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | The design for that check (`02-plan-position.md:137`): "D3 says the skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When the check fails, it returns no packet. When the check passes, D4 returns the packet." | |
| C1 | The skill's name is `plan-position`. Its file is `scripts/skills/plan-position/SKILL.md`. Its front matter sets `disable-model-invocation: true`. Its description says to use it when the process file that states this lookup names this skill. | PASS | The choice serves the load check and the non-Ledger check (`02-plan-position.md:23`). The name and `disable-model-invocation: true` are what the load check's design uses (`:129`). The same unloading when the skill is not named is what the non-Ledger check's design uses (`:133`). | |
| C2 | One sentence is added at the end of the opening of `.ledger/process/plan-workflow.md`: "Where a plan sits is gathered by the skill `plan-position`." Every other line in that file stays as it is. This piece does not edit a child project. | PASS | The choice serves the load check and the non-Ledger check (`02-plan-position.md:24`). That sentence is the instruction that names the skill (`:129`). A project that is not running Ledger has no such sentence (`:133`). | |
| C3 | The skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When that check fails, it returns no packet. | PASS | The choice serves the process-files check (`02-plan-position.md:25`). The design for that check (`:137`) returns no packet until the check, and returns the packet only when the check passes. | |
| C4 | The packet is what the procedure in the open project's `.ledger/process/plan-workflow.md` yields for the named plan. It states the six items. The record candidates are the facts the reading-set gathering returns, and the packet adds the confirmed decisions on the parent plan. Each of the six quotes the line it rests on and points at that place. | PASS | The choice serves the packet check and the quote check (`02-plan-position.md:26`). The design for the packet check (`:121`) states those six, the reading-set facts, and the parent plan's confirmed decisions. The design for the quote check (`:125`) quotes each line and points at its place in the open project's process files. | |
| T1 | The tests are unchanged since their review. | PASS | `git diff 18f010a2687fc879c5107af8717573e023093488 -- docs/_plans/21-lookup-skills/02-plan-position.md` changes Status, the Decisions table, the Design section, and appends a spirit review. The text from `## Tests` through the line before `## Design` is the same as in that commit. There is no test branch. | |
| PD1 | The plan-position packet is taken from the project that is open, from that project's process files. The packet quotes those files and points at them. | PASS | D4 (`02-plan-position.md:26`): the packet is what the procedure in the open project's `.ledger/process/plan-workflow.md` yields, and "Each of those six quotes the line it rests on and points at that place in the process files. The place is in the open project's process files." The design repeats that at `:121` and `:125`. | |
| PD2 | This skill is a personal skill, it loads only when it is named, and it is named from `.ledger/process/plan-workflow.md`. A named skill checks that the open project has the process files, and then returns its packet. A child project is left as it is. The child receives the naming line with the process files it already receives. A child project is edited only when asked. | PASS | D1 (`02-plan-position.md:23`) puts the skill in `scripts/skills/plan-position/SKILL.md`, sets `disable-model-invocation: true`, and says the skill is a personal skill that loads only when it is named. D2 (`:24`) names it with one sentence in `.ledger/process/plan-workflow.md` and does not edit a child project. D3 (`:25`) returns no packet until the process-files check, and the design (`:137`) returns the packet when that check passes. The design (`:141`) says the child receives the sentence with the process files it already keeps, and that this piece does not edit a child project. | |
| PD3 | This skill uses the reading-set gathering for the candidate decisions that come from the record, and it adds the confirmed decisions on the parent plan. | PASS | D4 (`02-plan-position.md:26`): "The candidate decisions that come from the record are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan." The design (`:121`) says the same, and "This skill does not say how the reading set is gathered." | |
| PD4 | This piece adds its own skill in `scripts/skills/`, the place the setup copies from, and only its own skill. | PASS | D1 (`02-plan-position.md:23`) adds `scripts/skills/plan-position/SKILL.md` and says this piece adds only this skill, in the place the setup copies from. The design (`:141`) adds only that file and the one naming sentence in `.ledger/process/plan-workflow.md`. | |
| P1 | A child project is edited only when asked. | PASS | D2 (`02-plan-position.md:24`) and the design (`:117`, `:141`): "This piece does not edit a child project." The design also says "A child project is left as it is." | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | D2 (`02-plan-position.md:24`) and the design (`:141`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.

### Implementation review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a plan and see its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. | PASS | A reading of `scripts/skills/plan-position/SKILL.md:13` applies the procedure in the open project's `.ledger/process/plan-workflow.md` to the named plan. `:15-22` state the status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made. `:24` takes the record candidates as the facts the reading-set gathering returns for the part the plan names, and adds the confirmed decisions on the parent plan. `:26` takes the place from the open project's process files. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | `scripts/skills/plan-position/SKILL.md:26`: "Each of those six quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place." | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | `scripts/skills/plan-position/SKILL.md:2` names the skill `plan-position`. `:3` says to use it when the process file that states this lookup names this skill. `:4` sets `disable-model-invocation: true`, so it stays unloaded until it is named and loads when it is named. `.ledger/process/plan-workflow.md:9` names it: "Where a plan sits is gathered by the skill `plan-position`." | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | `scripts/skills/plan-position/SKILL.md:4` sets `disable-model-invocation: true`, so the skill stays unloaded when it is not named. The naming sentence is `.ledger/process/plan-workflow.md:9`. `git diff 0e1f4a45c248672d090058854adac2b9327f7096 -- .ledger/process/plan-workflow.md` adds that sentence and leaves every other line as it is. A project that is not running Ledger has no such sentence. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | `scripts/skills/plan-position/SKILL.md:11`: "If that project has no process files under `.ledger/process/`, return no packet." The packet is stated at `:15-26`, after that check. `:28`: "Return no packet until the check for process files has passed." | |
| T1 | The tests are unchanged since their review. | PASS | `git diff 18f010a2687fc879c5107af8717573e023093488 -- docs/_plans/21-lookup-skills/02-plan-position.md` changes Status from `tests` to `implementation`, replaces the Decisions and Design stubs, replaces the Implementation notes, and appends reviews. The text from `## Tests` through the line before `## Design` is the same as in that commit. | |
| G1 | The design is unchanged since its review. | PASS | `git diff 0e1f4a45c248672d090058854adac2b9327f7096 -- docs/_plans/21-lookup-skills/02-plan-position.md` changes `**Status:**` from `design` to `implementation` and replaces the Implementation notes. The Decisions table and the Design section are the same text as in that commit. | |
| PD1 | The packet is taken from the project that is open, from that project's process files. The packet quotes those files and points at them. | PASS | `scripts/skills/plan-position/SKILL.md:9` takes the open project as the current workspace. `:13` reads the procedure in that project's `.ledger/process/plan-workflow.md` and applies it to the named plan. `:26` quotes each of the six, points at that place in the open project's process files, and the line in the packet is the line at that place. | |
| PD2 | This skill is a personal skill, it loads only when it is named, and it is named from `.ledger/process/plan-workflow.md`. A named skill checks that the open project has the process files, and then returns its packet. A child project is left as it is. The child receives the naming line with the process files it already receives. | PASS | The skill is `scripts/skills/plan-position/SKILL.md`. `:4` sets `disable-model-invocation: true`. `:3` says to use it when the process file that states this lookup names this skill. `.ledger/process/plan-workflow.md:9` names it. `:11` returns no packet when the process files are absent, `:15-26` state the packet after that check, and `:28` returns no packet until the check has passed. Commit `8f6f8ae` writes that skill, that sentence in this project's process file, and the Implementation notes. `02-plan-position.md:159`: "A child project was left as it is. The child receives the naming line with the process files it already receives." | |
| PD3 | This skill uses the reading-set gathering for the candidate decisions that come from the record, and it adds the confirmed decisions on the parent plan. | PASS | `scripts/skills/plan-position/SKILL.md:24`: "The candidate decisions that come from the record are the facts the reading-set gathering returns for the part the plan names. The packet adds the confirmed decisions on the parent plan." | |
| PD4 | This piece adds its own skill in `scripts/skills/`, and only its own skill. | PASS | Commit `8f6f8ae` adds `scripts/skills/plan-position/SKILL.md`. At `0e1f4a45` the files under `scripts/skills/` are `scripts/skills/reading-set/SKILL.md` and `scripts/skills/spirit-chain/SKILL.md`. The files that commit writes besides the skill are the naming sentence in `.ledger/process/plan-workflow.md` and the Implementation notes. | |
| P1 | A child project is edited only when asked. | PASS | Commit `8f6f8ae` writes `scripts/skills/plan-position/SKILL.md` and the sentence in this project's `.ledger/process/plan-workflow.md`. `git diff --name-only 0e1f4a45c248672d090058854adac2b9327f7096 HEAD` is those two files and `docs/_plans/21-lookup-skills/02-plan-position.md`. `02-plan-position.md:159`: "A child project was left as it is." | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | The naming sentence is `.ledger/process/plan-workflow.md:9` in this project. `02-plan-position.md:159`: "The child receives the naming line with the process files it already receives." | |

Findings: none.
