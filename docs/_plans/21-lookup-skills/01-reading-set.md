# Reading set

**Status:** accepted

## Part

`docs/00-project.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

One skill returns the reading set for a part: the pages to read in full, the neighbors whose Offers to read, and where to stop.

**Accepted:** 2026-11-25

The person accepts the finished work.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | The skill's name is `reading-set`. Its file is `scripts/skills/reading-set/SKILL.md`. Its front matter sets `disable-model-invocation: true`. | This serves "A person can name the skill and see that it loads, and can see that it stays unloaded until it is named." The skill loads when it is named, and it stays unloaded until then. It serves "A person can point at a project that is not running Ledger and see that the skill stays unloaded," because a project that does not name the skill leaves it unloaded. The parent's D2 is met because the skill is a personal skill and it loads only when it is named. The parent's D4 is met because this piece adds only this skill, in the place the setup copies from. |
| D2 | One sentence is added at the end of "What a reader reads" in `.ledger/process/system-record.md`: "The reading set is gathered by the skill `reading-set`." Every other line in that file stays as it is. This piece does not edit a child project. | This serves "A person can name the skill and see that it loads, and can see that it stays unloaded until it is named," because the instruction that states the gathering names the skill. It serves "A person can point at a project that is not running Ledger and see that the skill stays unloaded," because that project has no such instruction. The parent's D2 is met because the process file that states the lookup names the skill, and a child project is left as it is. The child keeps its own docs and its own copy of the process files, and it receives the sentence with the process files it already keeps. |
| D3 | The skill returns no packet until it has checked that the open project has the process files. When that check fails, it returns no packet. | This serves "A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check." The parent's D2 is met because a named skill checks for the process files and then returns its packet. |
| D4 | The packet is what "What a reader reads" in the open project's `.ledger/process/system-record.md` yields for the named part. It states the pages to read in full, the neighbors whose Offers to read, and where to stop. Each of those quotes the line it rests on and points at that place in the process files. | This serves "A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop." It serves "A person can point at the packet and see the quoted lines and the places they were taken from." The parent's D1 is met because the packet is taken from the open project's process files, and it quotes those files and points at them. The parent's D3 is met because this skill is the one that says how the reading set is gathered. |

## Requirements

**Requirements confirmed:** 2026-11-25

**Acceptance.**

- A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop.
- A person can point at the packet and see the quoted lines and the places they were taken from.
- A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.
- A person can point at a project that is not running Ledger and see that the skill stays unloaded.
- A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

**Constraints.**

- The packet is taken from the project that is open.
- This skill is the one that says how the reading set is gathered.
- The skill is a personal skill, and it loads only when it is named.
- A child project is left as it is.
- This piece adds only its own skill and its own naming line.

**Out of scope.**

- Where a plan sits.
- The spirit chain.
- The install script.
- The judgment of whether a decision directly affects the part.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The packet is taken from the project that is open. This skill takes its packet from that project's process files. The packet quotes those files and points at them. This skill is the one that says how the reading set is gathered, and the instruction that states that gathering names this skill. The skill loads only when it is named. This piece adds only its own skill, in the place the setup copies from. A child project is left as it is. The child keeps its own docs and its own copy of the process files. The naming line is added in this project, and the child receives it with the process files it already keeps.

### A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop.

**Setup.** This piece has written the skill that gathers the reading set. A project running Ledger is open. A part of that project is named.

**Action.** The agent asks that skill for the reading set of that part. A person can ask for the same part and read the same packet.

**Looked at.** The pages to read in full, the neighbors whose Offers to read, and where to stop. Those three are in the packet, they are taken from that project's process files, and they are the reading set of the named part in the project that is open. A failed check is missing one of the three, the three are taken from somewhere other than those process files, or the three are for a different part or a different project.

### A person can point at the packet and see the quoted lines and the places they were taken from.

**Setup.** The packet from the check above is in hand. The project that is open is the same project.

**Action.** The agent points at each quoted line and at the place it names. A person can point at the same line and the same place.

**Looked at.** The quoted line and the place it was taken from. The place is in that project's process files. The line in the packet is the line at that place in the project that is open. A failed check has a line with no place, a place outside those process files, or a line that is not the line at that place.

### A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.

**Setup.** This piece has written the skill. The skill has not been named. A project running Ledger is open.

**Action.** The agent works in that project without naming the skill, and then names the skill. A person can do the same.

**Looked at.** Before the skill is named, it is unloaded. After it is named, it is loaded. A failed check has the skill loaded before it is named, or still unloaded after it is named.

### A person can point at a project that is not running Ledger and see that the skill stays unloaded.

**Setup.** This piece has written the skill. A project that is not running Ledger is open. Nothing in that project names the skill.

**Action.** The agent works in that project. A person can work in the same project.

**Looked at.** The skill stays unloaded. A failed check has the skill loaded in that project.

### A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

**Setup.** This piece has written the skill. One project that is open has the process files. Another project that is open does not.

**Action.** The agent names the skill in each project and asks for the reading set of a part. A person can name the skill and ask in the same way.

**Looked at.** The packet comes back for the project that has the process files, and only after that check. No packet comes back for the project that does not have them. A failed check returns a packet before the check, or returns a packet for the project that lacks the process files.

## Tests

This piece writes no executable tests. The checks in the test design are a reading of the writing this piece produces. The person recorded this on 2026-11-25 and moved the plan to design.

## Design

The writing is the file `scripts/skills/reading-set/SKILL.md` and one new sentence in `.ledger/process/system-record.md`. The checks are a reading of that writing. This piece writes no executable test. A child project is left as it is.

### A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop.

D4 says the packet is what "What a reader reads" in the open project's `.ledger/process/system-record.md` yields for the named part. The packet states the pages to read in full, the neighbors whose Offers to read, and where to stop. Those three are taken from that project's process files. A person points at those three in the packet.

### A person can point at the packet and see the quoted lines and the places they were taken from.

D4 says each of those three quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place. A person points at the quoted line and at the place.

### A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.

D1 names the skill `reading-set` and sets `disable-model-invocation: true` in `scripts/skills/reading-set/SKILL.md`. The skill stays unloaded until it is named, and it loads when it is named. D2 adds the sentence "The reading set is gathered by the skill `reading-set`." at the end of "What a reader reads" in `.ledger/process/system-record.md`. That sentence is the instruction that names the skill. Every other line in that file stays as it is.

### A person can point at a project that is not running Ledger and see that the skill stays unloaded.

D1 leaves the skill unloaded when it is not named. D2 puts the naming sentence only in this project's process file. A project that is not running Ledger has no such sentence, so nothing there names the skill, and the skill stays unloaded.

### A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

D3 says the skill returns no packet until it has checked that the open project has the process files. When the check fails, it returns no packet. When the check passes, D4 returns the packet.

### What this piece adds

D1 adds only `scripts/skills/reading-set/SKILL.md`. D2 adds only the one sentence in `.ledger/process/system-record.md`. This piece does not edit a child project. The child keeps its own docs and its own copy of the process files. The child receives the sentence with the process files it already keeps.

The checks are a reading of this writing. This piece writes no executable test.

## Implementation notes

The writing is `scripts/skills/reading-set/SKILL.md` and one sentence at the end of "What a reader reads" in `.ledger/process/system-record.md`: "The reading set is gathered by the skill `reading-set`." The checks are a reading of that writing. The implementation review on 2026-11-25 passed.

## Reviews

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the requirements above. A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop. The packet shows the quoted lines and the places they were taken from. The skill loads when it is named, stays unloaded until then, and stays unloaded for a project that is not running Ledger. The packet comes back only after the skill checks that the open project has the process files. The packet is taken from the project that is open. This skill is the one that says how the reading set is gathered. It is a personal skill. A child project is left as it is. This piece adds only its own skill and its own naming line.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit.

The intent this review read is that spirit. The change fits it. A packet a person can point at, taken from the open project, raises the quality of the agent's work and leaves the person with less hunting to do. The spirit file stays as it is. Findings: none.

### Test design review, 2026-11-25

**Disposition:** changes-required

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop. | PASS | Setup: the skill is written, a project running Ledger is open, and a part is named. Action: the agent asks that skill for the reading set of that part, and a person can ask for the same part and read the same packet. Looked at: those three are in the packet, and they are the reading set of the named part in the open project. A failure is missing one of the three, or the three belong to a different part or a different project. The check names no file, function, library, or mechanism. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | Setup: the packet from the check above is in hand, and the open project is the same project. Action: the agent points at each quoted line and at the place it names. Looked at: the line in the packet is the line at that place in the open project. A failure is a line with no place, or a line that is not the line at that place. The check names no file, function, library, or mechanism. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | Setup: the skill is written, it has not been named, and a project running Ledger is open. Action: the agent works without naming the skill, then names it. Looked at: it is unloaded before it is named and loaded after it is named. A failure has it loaded before it is named, or still unloaded after it is named. The check names no file, function, library, or mechanism. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | Setup: a project that is not running Ledger is open, and nothing in that project names the skill. Action: the agent works in that project. Looked at: the skill stays unloaded. A failure has the skill loaded in that project. The check names no file, function, library, or mechanism. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | Setup: one open project has the process files, and another does not. Action: the agent names the skill in each project and asks for the reading set of a part. Looked at: the packet comes back for the project that has the process files, and only after that check. A failure returns a packet before the check, or returns a packet for the project that lacks the process files. The check names no file, function, library, or mechanism. | |
| D1 | The packet is taken from the project that is open. This skill takes its packet from that project's process files. The packet quotes those files and points at them. | FAIL | The open project is followed. Quoting and pointing are followed. No part of the test design says the packet is taken from that project's process files, or that the quoted place is in those files. The process files are named only as a check that runs before the packet comes back. | |
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states the gathering names it, a named skill checks that the open project has the process files and then returns its packet, and a child project is left as it is. | PASS | The instruction that states the gathering names this skill. The skill loads only when it is named. A child project is left as it is. The load check looks at unloaded before the name and loaded after it. The process-files check looks at the packet coming back only after that check. | |
| D3 | This skill is the one that says how the reading set is gathered. | PASS | "This skill is the one that says how the reading set is gathered." The setup uses the skill that gathers the reading set. | |
| D4 | This piece adds its own skill in the place the setup copies from. | PASS | "This piece adds only its own skill, in the place the setup copies from." | |
| P1 | A child project is edited only when asked. | PASS | "A child project is left as it is." The naming line is added in this project, and the child receives it with the process files it already keeps. | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | "The child keeps its own docs and its own copy of the process files." | |

Findings:

D1. The test design follows the open project, and it follows quoting a line and pointing at its place. It has no part that follows the clause that this skill's packet is taken from that project's process files. Evidence: the opening ties the packet to the open project. The first check's looked-at ties the three parts of the packet to the open project. The second check's looked-at ties the quoted line to a place in the open project. The fifth check ties the process files to a check that runs before the packet comes back.

### Test design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop. | PASS | Setup: the skill is written, a project running Ledger is open, and a part is named. Action: the agent asks that skill for the reading set of that part. Looked at: those three are in the packet, taken from that project's process files, and they are the reading set of the named part in the open project. A failure is missing one of the three, the three taken from somewhere other than those process files, or the three for a different part or a different project. The check names no file, function, library, or mechanism. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | Setup: the packet from the check above is in hand, and the open project is the same project. Action: the agent points at each quoted line and at the place it names. Looked at: the place is in that project's process files, and the line in the packet is the line at that place in the open project. A failure is a line with no place, a place outside those process files, or a line that is not the line at that place. The check names no file, function, library, or mechanism. | |
| D1 | Each skill's packet is taken from the project that is open. The reading-set skill takes its packet from that project's process files. The packet quotes those files and points at them. | PASS | The opening says the packet is taken from the open project, this skill takes it from that project's process files, and the packet quotes those files and points at them. The first check looks at the three items taken from those process files, and a failure is the three taken from somewhere else. The second check looks at the quoted place in those process files, and a failure is a place outside them. | |
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states the gathering names it, a named skill checks that the open project has the process files and then returns its packet, and a child project is left as it is. | PASS | The opening says the instruction that states the gathering names this skill, the skill loads only when it is named, and a child project is left as it is. The third check looks at unloaded before the name and loaded after. The fourth check looks at the skill staying unloaded in a project that is not running Ledger. The fifth check looks at the packet coming back only after the process-files check. | |
| D3 | This skill is the one that says how the reading set is gathered. | PASS | "This skill is the one that says how the reading set is gathered." The setup uses the skill that gathers the reading set. | |
| D4 | This piece adds its own skill in the place the setup copies from. | PASS | "This piece adds only its own skill, in the place the setup copies from." | |
| P1 | A child project is edited only when asked. | PASS | "A child project is left as it is." The naming line is added in this project, and the child receives it with the process files it already keeps. | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | "The child keeps its own docs and its own copy of the process files." | |

Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the design above. The skill is `reading-set`, in `scripts/skills/reading-set/SKILL.md`, and it loads only when it is named. One sentence at the end of "What a reader reads" in `.ledger/process/system-record.md` names that skill. The skill returns no packet until it has checked that the open project has the process files. The packet is what "What a reader reads" in the open project's process file yields for the named part, with the quoted lines and the places they were taken from. This piece adds only that skill and that sentence. A child project is left as it is.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit.

The intent this review read is that spirit. The change fits it. A packet a person can point at, taken from the open project's process files, raises the quality of the agent's work and leaves the person with less hunting to do. The spirit file stays as it is. Findings: none.

### Design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop. | PASS | D4 and the design for that check: the packet is what "What a reader reads" in the open project's `.ledger/process/system-record.md` yields for the named part, and it states those three, taken from that project's process files. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | D4: each of those three quotes the line it rests on and points at that place in the open project's process files. The line in the packet is the line at that place. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | D1 names the skill `reading-set` and sets `disable-model-invocation: true`. The skill stays unloaded until it is named, and it loads when it is named. D2's sentence is the instruction that names the skill. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | D1 leaves the skill unloaded when it is not named. D2 puts the naming sentence only in this project's process file. A project that is not running Ledger has no such sentence. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | D3 returns no packet until the skill has checked that the open project has the process files, and returns no packet when that check fails. When the check passes, D4 returns the packet. | |
| C1 | The skill is named `reading-set`, its file is `scripts/skills/reading-set/SKILL.md`, and its front matter sets `disable-model-invocation: true`. | PASS | The choice serves the load checks. The front matter is what leaves the skill unloaded until it is named, and what leaves it unloaded when a project does not name it. | |
| C2 | One sentence is added at the end of "What a reader reads": "The reading set is gathered by the skill `reading-set`." Every other line stays. This piece does not edit a child project. | PASS | The choice serves the load checks. That sentence is the instruction that names the skill. A project that is not running Ledger has no such sentence. | |
| C3 | The skill returns no packet until it has checked that the open project has the process files. When that check fails, it returns no packet. | PASS | The choice serves the process-files check. | |
| C4 | The packet is what "What a reader reads" in the open project's process file yields for the named part. It states the three items. Each quotes the line it rests on and points at that place. | PASS | The choice serves the packet check and the quote check. | |
| T1 | The tests are unchanged since their review. | PASS | There is no tests-review matrix and no test branch. The Tests section is the person's record that this piece writes no executable tests. The design does not change that section. | |
| PD1 | The reading-set packet is taken from the open project's process files. The packet quotes those files and points at them. | PASS | D4: the packet is what "What a reader reads" in the open project's process file yields, and each item quotes the line it rests on and points at that place. | |
| PD2 | This skill is a personal skill, it loads only when it is named, it is named from `.ledger/process/system-record.md`, a named skill checks that the open project has the process files and then returns its packet, and a child project is left as it is. | PASS | D1 puts the skill in `scripts/skills/` and loads it only when it is named. D2 names it from `.ledger/process/system-record.md` and does not edit a child project. D3 returns no packet until the process-files check. | |
| PD3 | The reading-set skill is the one that says how the reading set is gathered. | PASS | D4 says this skill is the one that says how the reading set is gathered. D2's sentence is "The reading set is gathered by the skill `reading-set`." | |
| PD4 | This piece adds its own skill in `scripts/skills/`, the place the setup copies from. | PASS | D1's file is `scripts/skills/reading-set/SKILL.md`. The design adds only that file and the one naming sentence. | |
| P1 | A child project is edited only when asked. | PASS | "This piece does not edit a child project." | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | "The child keeps its own docs and its own copy of the process files. The child receives the sentence with the process files it already keeps." | |

Findings: none.

### Implementation review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a part and see the pages to read in full, the neighbors whose Offers to read, and where to stop. | PASS | `scripts/skills/reading-set/SKILL.md` reads "What a reader reads" in the open project's `.ledger/process/system-record.md` and applies it to the named part. The packet states the pages to read in full, the neighbors whose Offers to read, and where to stop. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | The skill says each of those three quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | The skill is named `reading-set`. `disable-model-invocation: true` leaves it unloaded until it is named. `.ledger/process/system-record.md` names it: "The reading set is gathered by the skill `reading-set`." | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | The skill stays unloaded when it is not named. The naming sentence is only in this project's process file. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | The skill returns no packet when the open project has no process files under `.ledger/process/`. The packet instructions come after that check. | |
| T1 | The tests are unchanged since their review. | PASS | The Tests section is still the person's record that this piece writes no executable tests. There is no test branch. The writing adds no executable test. | |
| G1 | The design is unchanged since its review. | PASS | The Decisions table and the Design section are still the reviewed text. The writing is the skill file, the one sentence, the process-files check, and the packet from "What a reader reads." | |
| PD1 | The reading-set packet is taken from the open project's process files. The packet quotes those files and points at them. | PASS | The skill takes the packet from "What a reader reads" in the open project's `.ledger/process/system-record.md`, and it quotes those files and points at the place. | |
| PD2 | This skill is a personal skill, it loads only when it is named, it is named from `.ledger/process/system-record.md`, a named skill checks that the open project has the process files and then returns its packet, and a child project is left as it is. | PASS | The skill file is `scripts/skills/reading-set/SKILL.md`. It loads only when named. The process file names it. It returns no packet until the process-files check. The sentence is only in this project's process file. | |
| PD3 | The reading-set skill is the one that says how the reading set is gathered. | PASS | The process file says the reading set is gathered by `reading-set`. The skill says to apply "What a reader reads" to the named part and return the three items. | |
| PD4 | This piece adds its own skill in `scripts/skills/`, the place the setup copies from. | PASS | The only file under `scripts/skills/` is `scripts/skills/reading-set/SKILL.md`. The other addition is the naming sentence. | |
| P1 | A child project is edited only when asked. | PASS | The writing is the skill in this repo and the sentence in this project's process file. | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | The sentence is added only in this project's `.ledger/process/system-record.md`. | |

Findings: none.
