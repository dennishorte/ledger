# Spirit chain

**Status:** test-design

## Part

`docs/00-project.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

One skill returns the spirit chain for a part: each spirit file from that part up through the parts above it, and where a file is absent.

## Decisions

*(not started)*

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

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

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
