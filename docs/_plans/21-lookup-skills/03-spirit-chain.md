# Spirit chain

**Status:** design

## Part

`docs/00-project.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

One skill returns the spirit chain for a part: each spirit file from that part up through the parts above it, and where a file is absent.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | The skill's name is `spirit-chain`. Its file is `scripts/skills/spirit-chain/SKILL.md`. Its front matter sets `disable-model-invocation: true`. Its description says to use it when the process file that states this lookup names this skill. | This serves "A person can name the skill and see that it loads, and can see that it stays unloaded until it is named." The skill loads when it is named, and it stays unloaded until then. It serves "A person can point at a project that is not running Ledger and see that the skill stays unloaded," because a project that does not name the skill leaves it unloaded. The parent's D2 is met because the skill is a personal skill and it loads only when it is named. The parent's D4 is met because this piece adds only this skill, in the place the setup copies from. |
| D2 | One sentence is added after the walk in the Spirit review section of `.ledger/process/review.md`, after "It does not read the record page.": "The spirit chain is gathered by the skill `spirit-chain`." Every other line in that file stays as it is. This piece does not edit a child project. | This serves "A person can name the skill and see that it loads, and can see that it stays unloaded until it is named," because the instruction that states the lookup names the skill. It serves "A person can point at a project that is not running Ledger and see that the skill stays unloaded," because that project has no such instruction. The parent's D2 is met because the process file that states the lookup names the skill, and a child project is left as it is. The child keeps its own docs and its own copy of the process files, and it receives the sentence with the process files it already keeps. |
| D3 | The skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When that check fails, it returns no packet. | This serves "A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check." The parent's D2 is met because a named skill checks for the process files and then returns its packet. |
| D4 | The packet is what the walk in that Spirit review section yields for the named part, in the project that is open. The walk goes from that part up through the parts above it. This skill gathers that walk itself. For each part on the walk, the packet includes the spirit file beside that part's page, or shows that the file is absent. Each present spirit file is quoted, and the packet points at the place those lines were taken from. The place is a spirit file on that walk in the open project. The line in the packet is the line at that place. | This serves "A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent." It serves "A person can point at the packet and see the quoted lines and the places they were taken from." The parent's D1 is met because the packet is taken from the spirit files on the walk in the project that is open, and it quotes those files and points at them. The parent's D3 is met because this skill gathers the spirit files on its own walk. |

## Requirements

**Requirements confirmed:** 2026-11-25

**Acceptance.**

- A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent.
- A person can point at the packet and see the quoted lines and the places they were taken from.
- A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.
- A person can point at a project that is not running Ledger and see that the skill stays unloaded.
- A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

**Constraints.**

- The packet is taken from the spirit files on the walk in the project that is open.
- This skill gathers the spirit files on its own walk.
- The skill is a personal skill, and it loads only when it is named.
- A child project is left as it is.
- This piece adds only its own skill and its own naming line.

**Out of scope.**

- The reading set.
- Where a plan sits.
- The install script.
- The record pages as the packet.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The packet is taken from the spirit files on the walk in the project that is open. This skill gathers those spirit files on its own walk. The packet quotes those files and points at them. The instruction that states this lookup names this skill. The skill is a personal skill, and it loads only when it is named. A skill that is named checks that the open project has the process files, and then returns its packet. This piece adds only its own skill, in the place the setup copies from, and only its own naming line. A child project is left as it is. The child keeps its own docs and its own copy of the process files. The naming line is added in this project, and the child receives it with the process files it already keeps.

### A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent.

**Setup.** This piece has written the skill that gathers the spirit files on its own walk. A project running Ledger is open. A part of that project is named. On the walk from that part up through the parts above it, a spirit file is present at one place and absent at another.

**Action.** The agent asks that skill for the spirit chain of that part. A person can ask for the same part and read the same packet.

**Looked at.** Each spirit file from that part up through the parts above it, and each place on that walk where a spirit file is absent. Those are in the packet. They are taken from the spirit files on the walk in the project that is open, and this skill gathered that walk itself. They are the spirit chain of the named part. A failed check is missing a spirit file that is on that walk, missing a place where a spirit file is absent, the chain taken from somewhere other than the spirit files on the walk in the open project, the chain gathered by another skill's walk, or the chain for a different part or a different project.

### A person can point at the packet and see the quoted lines and the places they were taken from.

**Setup.** The packet from the check above is in hand. The project that is open is the same project.

**Action.** The agent points at each quoted line and at the place it names. A person can point at the same line and the same place.

**Looked at.** The quoted line and the place it was taken from. The place is a spirit file on the walk in the project that is open. The line in the packet is the line at that place. A failed check has a line with no place, a place that is not a spirit file on that walk in the open project, or a line that is not the line at that place.

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

**Action.** The agent names the skill in each project and asks for the spirit chain of a part. A person can name the skill and ask in the same way.

**Looked at.** The packet comes back for the project that has the process files, and only after that check. No packet comes back for the project that does not have them. A failed check returns a packet before the check, or returns a packet for the project that lacks the process files.

## Tests

The test design says the checks run on the writing this piece has produced, and that they do not run on the project from before that writing. This piece writes no executable tests. The writing is not produced yet. The runs below look for that writing and find it absent. Each check fails because the behavior is not implemented yet. These runs are not a reading of the project from before that writing treated as the finished skill.

The packet these runs looked for is the one taken from the spirit files on the walk in the project that is open. This skill would gather that walk itself, and the packet would quote those files and point at them. The instruction that states this lookup would name this skill. The skill would be a personal skill, and it would load only when it is named. A named skill would check that the open project has the process files, and then return its packet. This piece would add only its own skill, in the place the setup copies from, and only its own naming line. A child project was left as it is. The child keeps its own docs and its own copy of the process files. The child receives the naming line with the process files it already receives. This run adds no skill and no naming line.

The first check was run. A project running Ledger is open. The part named is Scripts. On the walk from that part up through the parts above it, a spirit file is absent at that part and present at the part above it. The agent looked for the skill that gathers the spirit files on its own walk and asked for the spirit chain of that part. That skill is not written, and no packet came back. The check fails because the spirit files on that walk, and the place where a spirit file is absent, are not in a packet. The chain was not taken from the spirit files on the walk in the open project, and this skill did not gather the walk.

The second check was run. No packet came back from the check above, so the agent had no quoted line to point at and no place a line was taken from. The check fails because the quoted line and its place are absent.

The third check was run. The skill is not written, and no instruction that states this lookup names it. A project running Ledger is open. The agent worked without naming the skill, and it stayed unloaded. The agent then named the skill, and it stayed unloaded. The check fails because the skill is still unloaded after it is named.

The fourth check was run. The skill is not written. A project that is not running Ledger was open, and nothing in that project names the skill. The agent worked in that project. Nothing loaded, because the skill this piece writes is absent. The test design says the check is not a reading of the project from before that writing. This result is not a pass. The check fails because the written skill the setup requires is absent, so the run cannot show that written skill staying unloaded.

The fifth check was run. This project is open and has the process files. Another project was open and does not have them. The agent named the skill in each project and asked for the spirit chain of Scripts. No packet came back for the project that has the process files, and no packet came back for the project that lacks them. The check fails because the project that has the process files returned no packet after the check. The behavior is not implemented yet.

## Design

The writing is the file `scripts/skills/spirit-chain/SKILL.md` and one new sentence in `.ledger/process/review.md`. The checks are a reading of that writing. This piece writes no executable test. A child project is left as it is.

### A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent.

D4 says the packet is what the walk in the Spirit review section yields for the named part, in the project that is open. The walk goes from that part up through the parts above it. This skill gathers that walk itself. For each part on the walk, the packet includes the spirit file beside that part's page, or shows that the file is absent. Those are taken from the spirit files on the walk in the open project. A person points at those in the packet.

### A person can point at the packet and see the quoted lines and the places they were taken from.

D4 says each present spirit file is quoted, and the packet points at the place those lines were taken from. The place is a spirit file on the walk in the open project. The line in the packet is the line at that place. A person points at the quoted line and at the place.

### A person can name the skill and see that it loads, and can see that it stays unloaded until it is named.

D1 names the skill `spirit-chain` and sets `disable-model-invocation: true` in `scripts/skills/spirit-chain/SKILL.md`. The skill stays unloaded until it is named, and it loads when it is named. D2 adds the sentence "The spirit chain is gathered by the skill `spirit-chain`." after the walk in the Spirit review section of `.ledger/process/review.md`. That sentence is the instruction that names the skill. Every other line in that file stays as it is.

### A person can point at a project that is not running Ledger and see that the skill stays unloaded.

D1 leaves the skill unloaded when it is not named. D2 puts the naming sentence only in this project's process file. A project that is not running Ledger has no such sentence, so nothing there names the skill, and the skill stays unloaded.

### A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check.

D3 says the skill returns no packet until it has checked that the open project has the process files under `.ledger/process/`. When the check fails, it returns no packet. When the check passes, D4 returns the packet.

### What this piece adds

D1 adds only `scripts/skills/spirit-chain/SKILL.md`. D2 adds only the one sentence in `.ledger/process/review.md`. This piece does not edit a child project. The child keeps its own docs and its own copy of the process files. The child receives the sentence with the process files it already keeps.

The checks are a reading of this writing. This piece writes no executable test.

## Implementation notes

The first check was run. It fails because no skill gathers the spirit files on its own walk, and no packet came back for Scripts.

The second check was run. It fails because that packet is absent, so there is no quoted line and no place.

The third check was run. It fails because the skill stays unloaded after it is named. No instruction names it.

The fourth check was run. It fails because the skill this piece writes is absent. The unloaded result is the project from before that writing, and the test design does not count that as a pass.

The fifth check was run. It fails because the project that has the process files returned no packet. The project that lacks them also returned no packet.

A child project was left as it is. The child receives the naming line with the process files it already receives. This run adds no skill and no naming line.

## Reviews

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the requirements above. A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent. The packet shows the quoted lines and the places they were taken from. The skill loads when it is named, stays unloaded until then, and stays unloaded for a project that is not running Ledger. The packet comes back only after the skill checks that the open project has the process files. The packet is taken from the spirit files on the walk in the project that is open. This skill gathers that walk itself. It is a personal skill. A child project is left as it is. This piece adds only its own skill and its own naming line.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit.

The intent this review read is that spirit. The change fits it. A packet a person can point at, taken from the spirit files on the walk, raises the quality of the agent's work and leaves the person with less hunting to do. The spirit file stays as it is. Findings: none.

### Test design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent. | PASS | Setup (`03-spirit-chain.md:56`): the skill is written, a project running Ledger is open, a part is named, and on the walk a spirit file is present at one place and absent at another. Action (`:58`): the agent asks that skill for the spirit chain of that part. Looked at (`:60`): each spirit file on that walk, and each place where a spirit file is absent, are in the packet. A failure is missing a spirit file that is on that walk, missing a place where a spirit file is absent, or the chain for a different part or a different project. The check names no file, function, library, or mechanism. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | Setup (`:64`): the packet from the check above is in hand, and the open project is the same project. Action (`:66`): the agent points at each quoted line and at the place it names. Looked at (`:68`): the place is a spirit file on the walk in the open project, and the line in the packet is the line at that place. A failure is a line with no place, a place that is not a spirit file on that walk in the open project, or a line that is not the line at that place. The check names no file, function, library, or mechanism. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | Setup (`:72`): the skill is written, it has not been named, a project running Ledger is open, and the instruction that states this lookup names this skill. Action (`:74`): the agent works without naming the skill, then names it. Looked at (`:76`): it is unloaded before it is named and loaded after it is named. A failure has it loaded before it is named, or still unloaded after it is named. The check names no file, function, library, or mechanism. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | Setup (`:80`): a project that is not running Ledger is open, and nothing in that project names the skill. Action (`:82`): the agent works in that project. Looked at (`:84`): the skill stays unloaded. A failure has the skill loaded in that project. The check names no file, function, library, or mechanism. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | Setup (`:88`): one open project has the process files, and another does not. Action (`:90`): the agent names the skill in each project and asks for the spirit chain of a part. Looked at (`:92`): the packet comes back for the project that has the process files, and only after that check; no packet comes back for the project that does not. A failure returns a packet before the check, or returns a packet for the project that lacks the process files. The check names no file, function, library, or mechanism. | |
| D1 | Each skill's packet is taken from the project that is open. The spirit-chain skill takes its from the spirit files on the walk. The packet quotes those files and points at them. | PASS | The opening (`:52`) says the packet is taken from the spirit files on the walk in the project that is open, and that the packet quotes those files and points at them. The first check (`:60`) looks at that chain taken from those spirit files, and a failure is a chain taken from somewhere else. The second check (`:68`) looks at the quoted line and its place in a spirit file on that walk, and a failure is a place that is not such a file, or a line that is not the line at that place. | |
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states this lookup names it, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is, and the child receives the naming line with the process files it already keeps. | PASS | The opening (`:52`) says the skill is a personal skill and loads only when it is named, the instruction that states this lookup names this skill, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is, and the child receives the naming line with the process files it already keeps. The third check (`:76`) looks at unloaded before the name and loaded after. The fourth check (`:84`) looks at the skill staying unloaded in a project that is not running Ledger. The fifth check (`:92`) looks at the packet coming back only after the process-files check. | |
| D3 | This skill gathers the spirit files on its own walk. | PASS | The opening (`:52`) says this skill gathers those spirit files on its own walk. The first check's setup (`:56`) uses the skill that gathers the spirit files on its own walk. Its looked-at (`:60`) says this skill gathered that walk itself, and a failure is the chain gathered by another skill's walk. | |
| D4 | This piece adds its own skill in the place the setup copies from, and only its own skill. | PASS | The opening (`:52`): "This piece adds only its own skill, in the place the setup copies from, and only its own naming line." | |
| P1 | A child project is edited only when asked. | PASS | The opening (`:52`): "A child project is left as it is." The naming line is added in this project, and the child receives it with the process files it already keeps. | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | The opening (`:52`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.

### Tests review, 2026-11-25

**Disposition:** changes-required

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent. | PASS | The first check (`03-spirit-chain.md:100`) opens a project running Ledger, names Scripts, and sets the walk so a spirit file is absent at that part and present at the part above it. It asks the skill that gathers the spirit files on its own walk. No packet comes back. The check fails because the spirit files on that walk and the place where a spirit file is absent are not in a packet, the chain was not taken from the spirit files on the walk in the open project, and this skill did not gather the walk. The note (`:116`) records the same failure. That is the packet the test design names, and it is missing, so the run does not pass. The run names no file, function, library, or mechanism. | |
| A2 | A person can point at the packet and see the quoted lines and the places they were taken from. | PASS | The second check (`:102`) has no packet from the check above, so there is no quoted line to point at and no place a line was taken from. It fails because the quoted line and its place are absent. The note (`:118`) records that failure. The test design names a quoted line that is the line at a spirit file on the walk in the open project. That line and that place are missing, so the run does not pass. The run names no file, function, library, or mechanism. | |
| A3 | A person can name the skill and see that it loads, and can see that it stays unloaded until it is named. | PASS | The third check (`:104`) works in a project running Ledger without naming the skill, and it stays unloaded. After the skill is named, it stays unloaded. No instruction that states this lookup names it. The check fails because the skill is still unloaded after it is named. The note (`:120`) records that failure. The test design names a skill that is loaded after it is named. That behavior is missing, so the run does not pass. The run names no file, function, library, or mechanism. | |
| A4 | A person can point at a project that is not running Ledger and see that the skill stays unloaded. | PASS | The fourth check (`:106`) works in a project that is not running Ledger, and nothing in that project names the skill. Nothing loaded, because the skill this piece writes is absent. The run says this result is not a pass, and the check fails because that written skill is absent, so the run cannot show that written skill staying unloaded. The note (`:122`) says the unloaded result is the project from before that writing, and the test design does not count that as a pass. The run does not pass while the written skill is missing. The run names no file, function, library, or mechanism. | |
| A5 | A person can point at the skill's check that the open project has the process files, and see that the packet comes back only after that check. | PASS | The fifth check (`:108`) names the skill in this project, which has the process files, and in another project, which does not, and asks for the spirit chain of Scripts. No packet comes back for either project. The check fails because the project that has the process files returned no packet after the check. The note (`:124`) records that failure. The test design names a packet that comes back only after that check, and no packet for the project that lacks the process files. The packet is missing, so the run does not pass. The run names no file, function, library, or mechanism. | |
| D1 | The spirit-chain skill's packet is taken from the project that is open, from the spirit files on the walk. The packet quotes those files and points at them. | PASS | The Tests section (`:98`) says the packet these runs looked for is taken from the spirit files on the walk in the project that is open, and that the packet would quote those files and point at them. The first check (`:100`) fails because the chain was not taken from the spirit files on the walk in the open project. The second check (`:102`) fails because the quoted line and its place are absent. | |
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states this lookup names it, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is, and the child receives the naming line with the process files it already receives. | FAIL | Personal skill, load only when named, the naming instruction, the process-files check, and leaving the child as it is are in the Tests section (`:98`, `:104`, `:106`, `:108`). No part of the Tests section or the Implementation notes says the child receives the naming line with the process files it already receives. The child sentences there are "A child project was left as it is," "The child keeps its own docs and its own copy of the process files," and "This run adds no skill and no naming line" (`:98`, `:126`). | applied |
| D3 | This skill gathers the spirit files on its own walk. | PASS | The Tests section (`:98`) says this skill would gather that walk itself. The first check (`:100`) looks for the skill that gathers the spirit files on its own walk, and fails because this skill did not gather the walk. The note (`:116`) records that no skill gathers the spirit files on its own walk. | |
| D4 | This piece adds its own skill in the place the setup copies from, and only its own skill. | PASS | The Tests section (`:98`): "This piece would add only its own skill, in the place the setup copies from, and only its own naming line." The same paragraph says this run adds no skill and no naming line. | |
| P1 | A child project is edited only when asked. | PASS | The Tests section (`:98`) and the note (`:126`): "A child project was left as it is." The run adds no skill and no naming line. | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | The Tests section (`:98`): "The child keeps its own docs and its own copy of the process files." | |

Findings:

D2. The tests follow the personal skill, the load only when it is named, the instruction that names it, the process-files check before the packet, and leaving the child as it is. They have no part that follows the clause that the child receives the naming line with the process files it already receives. Evidence: `03-spirit-chain.md:98` and `:126` say the child was left as it is, keeps its own docs and its own copy of the process files, and that this run adds no skill and no naming line.

### Tests review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| D2 | This skill is a personal skill, it loads only when it is named, the instruction that states this lookup names it, a named skill checks that the open project has the process files and then returns its packet, a child project is left as it is, and the child receives the naming line with the process files it already receives. | PASS | The Tests section (`03-spirit-chain.md:98`) says "The instruction that states this lookup would name this skill. The skill would be a personal skill, and it would load only when it is named. A named skill would check that the open project has the process files, and then return its packet." It says "A child project was left as it is" and "The child receives the naming line with the process files it already receives." The third check (`:104`) stays unloaded before the skill is named and after it is named, because no instruction names it. The fifth check (`:108`) names the skill and gets no packet for the project that has the process files. The note (`:126`) says "A child project was left as it is. The child receives the naming line with the process files it already receives." | |
| D4 | This piece adds its own skill in the place the setup copies from, and only its own skill. | PASS | The Tests section (`03-spirit-chain.md:98`): "This piece would add only its own skill, in the place the setup copies from, and only its own naming line." The same paragraph says "This run adds no skill and no naming line." The sentence added in that paragraph says the child receives the naming line with the process files it already receives. | |
| P1 | A child project is edited only when asked. | PASS | The Tests section (`03-spirit-chain.md:98`) and the note (`:126`) say "A child project was left as it is" and "This run adds no skill and no naming line." Both say the child receives the naming line with the process files it already receives. | |
| P2 | A child project keeps its own docs and its own copy of the process files. | PASS | The Tests section (`03-spirit-chain.md:98`): "The child keeps its own docs and its own copy of the process files. The child receives the naming line with the process files it already receives." | |

Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the design above. The skill is `spirit-chain`, in `scripts/skills/spirit-chain/SKILL.md`, and it loads only when it is named. One sentence after the walk in `.ledger/process/review.md` names that skill. The skill returns no packet until it has checked that the open project has the process files. The packet is the spirit files on the walk from the named part up through the parts above it, quoting those files and showing where a file is absent. This piece adds only that skill and that sentence. A child project is left as it is.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit. This review used the plan's spirit: "Doing lookups to follow the process is handled efficiently."

The intent this review read is that spirit. The change fits it. A packet a person can point at, taken from the spirit files on the walk, raises the quality of the agent's work and leaves the person with less hunting to do. The plan's spirit is that lookup handled in one named skill. The spirit file stays as it is. Findings: none.
