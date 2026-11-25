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
