# Setup script

**Status:** requirements

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

**Requirements confirmed:** unconfirmed

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

The change this review read is the requirements above. A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run. A person can run the script and see those skills set up in the person's personal skills. The repository holds the skills in `scripts/skills/`. The script copies that directory into the person's personal skills. This piece adds only the install script. A child project is left as it is. What a skill returns, the naming lines in the process files, creating a child project, and copying the process files into a child project are out of scope.

The part this change changes is the part named in the Part line. There is no spirit file beside that page. Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit. This review used the plan's spirit: "Doing lookups to follow the process is handled efficiently."

The intent this review read is that spirit. The change fits it. The script copies the skills onto the machine where it is run, so the person sets them up by running the script and the quality of the agent's work is there after a change of machine. The plan's spirit is that those lookups are handled efficiently. This piece is the copy that puts the skills in place. It adds only the install script, and a child project is left as it is. No spirit file needs to be created or updated. The spirit file this review read stays as it is. Findings: none.
