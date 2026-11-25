# Plan position

**Status:** tests

## Part

`docs/00-project.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

One skill returns where a plan sits: its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.

## Decisions

*(not started)*

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

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

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
