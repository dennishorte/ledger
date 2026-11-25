# Plan position

**Status:** test-design

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
