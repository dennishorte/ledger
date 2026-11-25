# Setup script

**Status:** test-design

## Part

`docs/02-scripts/00-scripts.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

A script does the skills setup on a new machine.

## Decisions

*(not started)*

## Requirements

**Requirements confirmed:** 2026-11-25

**Acceptance.**

- A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run.
- A person can run the script and see those skills set up in the person's personal skills.

**Constraints.**

- The repository holds the skills in `scripts/skills/`. The script copies that directory into the person's personal skills.
- This piece adds only the install script.
- A child project is left as it is.

**Out of scope.**

- What a skill returns.
- The naming lines in the process files.
- Creating a child project.
- Copying the process files into a child project.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. This piece adds only the install script. A child project is left as it is. The child keeps its own docs and its own copy of the process files. This piece does not create a child project, and it does not copy the process files into a child project.

### A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run.

**Setup.** This piece has written the script. The repository holds the skills.

**Action.** The agent points at the script and reads what it copies, and where it copies them. A person can point at the same script.

**Looked at.** The script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. A failed check copies from somewhere else, copies to somewhere other than the person's personal skills on that machine, or has no such copy.

### A person can run the script and see those skills set up in the person's personal skills.

**Setup.** This piece has written the script. The repository holds the skills. Those skills are not yet set up in the person's personal skills from this run.

**Action.** The agent runs the script on the machine. A person can run the same script.

**Looked at.** The skills the repository holds are set up in the person's personal skills on that machine. They are the copy of the directory the repository holds them in. A failed check leaves them absent, or sets up skills that are not the ones the repository holds.

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the requirements above. A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run. A person can run the script and see those skills set up in the person's personal skills. The repository holds the skills in `scripts/skills/`. The script copies that directory into the person's personal skills. This piece adds only the install script. A child project is left as it is. What a skill returns, the naming lines in the process files, creating a child project, and copying the process files into a child project are out of scope.

The part this change changes is the part named in the Part line. There is no spirit file beside that page. Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit. This review used the plan's spirit: "Doing lookups to follow the process is handled efficiently."

The intent this review read is that spirit. The change fits it. The script copies the skills onto the machine where it is run, so the person sets them up by running the script and the quality of the agent's work is there after a change of machine. The plan's spirit is that those lookups are handled efficiently. This piece is the copy that puts the skills in place. It adds only the install script, and a child project is left as it is. No spirit file needs to be created or updated. The spirit file this review read stays as it is. Findings: none.

### Test design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run. | PASS | Setup (`04-setup-script.md:51`): this piece has written the script, and the repository holds the skills. Action (`:53`): the agent points at the script and reads what it copies, and where it copies them. Looked at (`:55`): the script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. A failure copies from somewhere else, copies to somewhere other than the person's personal skills on that machine, or has no such copy. The check names no file, function, library, or mechanism. | |
| A2 | A person can run the script and see those skills set up in the person's personal skills. | PASS | Setup (`:59`): this piece has written the script, the repository holds the skills, and those skills are not yet set up in the person's personal skills from this run. Action (`:61`): the agent runs the script on the machine. Looked at (`:63`): the skills the repository holds are set up in the person's personal skills on that machine, and they are the copy of the directory the repository holds them in. A failure leaves them absent, or sets up skills that are not the ones the repository holds. The check names no file, function, library, or mechanism. | |
| D4 | The script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. The script piece owns the install script. A child project is edited only when asked. | PASS | The opening (`:47`) says the script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run, "This piece adds only the install script," and "A child project is left as it is." The first check (`:55`) looks at that copy, and a failure copies from somewhere else, copies to somewhere else, or has no such copy. The second check (`:63`) looks at those skills set up as the copy of that directory. | |
| P1 | A child project is edited only when asked. | PASS | The opening (`:47`): "A child project is left as it is." | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | The opening (`:47`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.
