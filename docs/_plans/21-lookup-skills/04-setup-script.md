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

*(not started)*
