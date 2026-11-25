# Lookup skills

**Status:** coordinating

## Part

`docs/00-project.md`

## Outcome

**Outcome confirmed:** 2026-11-25

**Outcome amended:** 2026-11-25 — A script does the skills setup on a new machine.

**Spirit.** Doing lookups to follow the process is handled efficiently.

A few skills quickly and correctly grab specific types of information when the person asks for work that follows the processes.

- One skill returns the reading set for a part: the pages to read in full, the neighbors whose Offers to read, and where to stop.
- One skill returns where a plan sits: its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.
- One skill returns the spirit chain for a part: each spirit file from that part up through the parts above it, and where a file is absent.
- A script does the skills setup on a new machine.

## Decisions

**Decisions confirmed:** 2026-11-25

D1. Each skill's packet is taken from the project that is open. The reading-set skill and the plan-position skill take theirs from that project's process files. The spirit-chain skill takes its from the spirit files on the walk. The packet quotes those files and points at them.
Binds: the reading set, the plan position, the spirit chain
Reason: The outcome says the skills quickly and correctly grab the information. The spirit says the lookup is handled efficiently. The packet matches the files in the project where the work is happening, and quoting them is one read.

D2. The three skills are personal skills. Each one is a skill of its own, and it loads only when it is named. They apply to projects running Ledger. The process file that states the lookup names that skill there. The reading-set skill is named from `.ledger/process/system-record.md`. The plan-position skill is named from `.ledger/process/plan-workflow.md`. The spirit-chain skill is named from `.ledger/process/review.md`. A skill that is named checks that the open project has the process files, and then returns its packet. A child project is left as it is.
Binds: the reading set, the plan position, the spirit chain
Reason: A personal skill is offered in every project. A project that is not running Ledger has no line that names these skills, so they stay unloaded. A project running Ledger is this project or a child project that has the process files. The line that names the skill tells that project which skill to use for that lookup. Each piece adds that line to its own process file. A child project receives the line with the process files it already receives. A child project is edited only when asked. Each piece chooses its own skill name.

D3. The reading-set skill is the one that says how the reading set is gathered. The plan-position skill uses that gathering for the candidate decisions that come from the record, and it adds the confirmed decisions on the parent plan. The spirit-chain skill gathers the spirit files on its own walk.
Binds: the reading set, the plan position, the spirit chain
Reason: The plan-position packet needs the reading set, and the reading-set skill is the one that gathers it, so the walk is stated once. The spirit chain is a different walk. Each skill owns its own packet.

D4. The repository holds the skills in `scripts/skills/`. Each skill piece adds its own skill there. The script copies that directory into the person's personal skills on the machine where the script is run.
Binds: the reading set, the plan position, the spirit chain, the script
Reason: A personal skill stays on the machine where it was installed. The repository is what arrives on a new machine. The script does the setup by copying the skills into the personal skills folder. `scripts/skills/` is not a place the editor loads by itself, so the skills load from the personal skills folder after the script has run. Each skill piece adds only its own skill. The script piece owns the install script. A child project is edited only when asked.

The reading-set skill and the spirit-chain skill have nothing to wait for, and they can proceed together. The plan-position skill starts after the reading-set skill is accepted, because it uses the reading-set gathering. The script starts after the reading-set skill, the plan-position skill, and the spirit-chain skill are accepted, because it installs those skills. Each skill piece owns its own skill and its own naming line. The script piece owns the install script. The pieces do not share a file.

## Requirements

*(not started)*

## Test design

*(not started)*

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the outcome above. The facts a process step needs come back as a small packet from the process files, and those files stay the only copy of the rules. A few skills quickly and correctly grab specific types of information when the person asks for work that follows the processes. One returns the reading set for a part. One returns where a plan sits. One returns the spirit chain for a part.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. A correct packet raises the quality of the agent's work and leaves the person with less missed lookup to catch. The packet for where a plan sits includes the candidate decisions previously made, so a design or a review can respect them. The plan's spirit keeps that packet taken from the process files. Those two spirit files already say this. They need no change. A part added later for these skills would need a spirit of its own, because neither spirit above says that the process files stay the only copy of the rules. Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the outcome above. Doing lookups to follow the process is handled efficiently. A few skills quickly and correctly grab specific types of information when the person asks for work that follows the processes. One returns the reading set for a part. One returns where a plan sits. One returns the spirit chain for a part.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. Handling the lookups efficiently raises the quality of the agent's work and leaves the person with less hunting to do. The skill that returns where a plan sits still brings the candidate decisions previously made, so a design or a review can respect them. The spirit files read above do not say that doing lookups to follow the process is handled efficiently, and this outcome does not change what those parts intend, so those files stay as they are. A part added later for these skills would need a spirit of its own, because neither spirit above says that. Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the decisions above. Each skill's packet is taken from the project that is open, quoted and pointed at. The skills are personal skills, and a child project is left as it is. The reading-set skill is the one that gathers the reading set. The plan-position skill uses that gathering and adds the parent plan's confirmed decisions. The spirit-chain skill gathers its own walk. The reading-set skill finishes first. The plan-position skill waits for it. The spirit-chain skill can proceed with the reading-set skill.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. A packet taken from the open project raises the quality of the agent's work and leaves the person with less hunting to do. Leaving a child project as it is follows the decision that a child project is edited only when asked. The plan-position skill still brings the candidate decisions previously made, and the reading-set walk is stated once, so a design or a review can respect those decisions. The plan's spirit is that the lookup is handled efficiently: one read, one statement of the reading-set walk, and the spirit-chain skill proceeds without waiting. The spirit files read above stay as they are. This change adds no part. Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the decisions above. Each skill's packet is taken from the project that is open, quoted and pointed at. The skills are personal skills. They apply to projects running Ledger. A child project is left as it is. The reading-set skill is the one that gathers the reading set. The plan-position skill uses that gathering and adds the parent plan's confirmed decisions. The spirit-chain skill gathers its own walk. The reading-set skill finishes first. The plan-position skill waits for it. The spirit-chain skill can proceed with the reading-set skill.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. The skills serve the work of a project running Ledger, which is where this system raises the quality of the agent's work. Leaving a child project as it is follows the decision that a child project is edited only when asked. The plan-position skill still brings the candidate decisions previously made, and the reading-set walk is stated once. The plan's spirit is that the lookup is handled efficiently, in the projects where the process is in use. The spirit files read above stay as they are. This change adds no part. Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the decisions above. Each skill's packet is taken from the project that is open, quoted and pointed at. The skills are personal skills. Each one loads only when it is named. The reading-set skill is named from `.ledger/process/system-record.md`. The plan-position skill is named from `.ledger/process/plan-workflow.md`. The spirit-chain skill is named from `.ledger/process/review.md`. A named skill checks that the open project has the process files, and then returns its packet. A child project is left as it is. The reading-set skill is the one that gathers the reading set. The plan-position skill uses that gathering and adds the parent plan's confirmed decisions. The spirit-chain skill gathers its own walk. The reading-set skill finishes first. The plan-position skill waits for it. The spirit-chain skill can proceed with the reading-set skill. Each piece owns its own skill and its own naming line.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. A project running Ledger names the skill at the lookup, which raises the quality of the agent's work there. A project that is not running Ledger has no such line, so the skill stays unloaded. Leaving a child project as it is follows the decision that a child project is edited only when asked. The child receives the naming line with the process files it already receives. The plan-position skill still brings the candidate decisions previously made, and the reading-set walk is stated once. The plan's spirit is that the lookup is handled efficiently: the skill loads when the lookup needs it, and each lookup is named once. The spirit files read above stay as they are. This change adds no part. Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the outcome above. Doing lookups to follow the process is handled efficiently. A few skills quickly and correctly grab specific types of information when the person asks for work that follows the processes. One returns the reading set for a part. One returns where a plan sits. One returns the spirit chain for a part. A script does the skills setup on a new machine. The part this work changes is the whole project.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit.

The intent this review read is that spirit. The change fits it. The skills raise the quality of the agent's work when a lookup is needed. The script sets those skills up on a new machine, so that quality is there after the environment changes. The spirit file stays as it is. Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the decisions above. Each skill's packet is taken from the project that is open, quoted and pointed at. The skills are personal skills and load only when named, from the process file for that lookup. The reading-set skill gathers the reading set. The plan-position skill uses that gathering. The spirit-chain skill gathers its own walk. The repository holds the skills in `scripts/skills/`. The script copies that directory into the person's personal skills after the three skills are accepted. A child project is left as it is.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit.

The intent this review read is that spirit. The change fits it. The skills make the lookup efficient, and the script puts those skills on a new machine, so the quality of the agent's work survives a change of environment. A child project is edited only when asked, and the script installs the skills for the person. The spirit file stays as it is. This change adds no part. Findings: none.
