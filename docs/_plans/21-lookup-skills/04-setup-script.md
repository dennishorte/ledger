# Setup script

**Status:** implementation

## Part

`docs/02-scripts/00-scripts.md`

## Parent

`docs/_plans/21-lookup-skills.md`

## Outcome

**Outcome confirmed:** 2026-11-25

A script does the skills setup on a new machine.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | The script is `scripts/setup-skills`. It copies each skill in `scripts/skills/` into `~/.cursor/skills/` on the machine where it is run. `~/.cursor/skills/` is the person's personal skills. The skills there are the copy of the skills the repository holds in `scripts/skills/`. | This serves "A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run." It serves "A person can run the script and see those skills set up in the person's personal skills." The parent's D4 is met because the repository holds the skills in `scripts/skills/`, and the script copies them into the person's personal skills. They are set up in that folder, which is where a personal skill loads. |
| D2 | This piece adds only `scripts/setup-skills`. It does not edit a child project. It does not create a child project. It does not copy the process files. Every other script stays as it is. | This serves both checks by keeping the copy to the install script. The parent's D4 is met because the script piece owns the install script. A child project is left as it is. The child keeps its own docs and its own copy of the process files. |

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

The test design says the checks run on the writing this piece has produced, and that they do not run on the project from before that writing. This piece writes no executable tests. The writing is not produced yet. The runs below look for that writing and find it absent. Each check fails because the behavior is not implemented yet. These runs are not a reading of the project from before that writing treated as the finished script.

The script these runs looked for copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. This piece would add only the install script. A child project was left as it is. The child keeps its own docs and its own copy of the process files. This run does not create a child project, and it does not copy the process files into a child project. This run adds no script.

The first check was run. The repository holds the skills. The agent looked for the install script this piece writes and read what it copies, and where. That script is not written. No script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. The check fails because there is no such copy.

The second check was run. The agent looked for the script to run it on the machine. That script is not written, so it was not run. The skills the repository holds are not set up in the person's personal skills by this run. The check fails because those skills are absent from that setup. The behavior is not implemented yet.

## Design

The writing is the script `scripts/setup-skills`. The checks are a reading of that script, and a run of it. This piece writes no other script. A child project is left as it is.

### A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run.

D1 says `scripts/setup-skills` copies each skill in `scripts/skills/` into `~/.cursor/skills/` on the machine where it is run. `~/.cursor/skills/` is the person's personal skills. A person points at that copy in the script.

### A person can run the script and see those skills set up in the person's personal skills.

D1 says the run copies those skills into `~/.cursor/skills/`. The skills there are the copy of the skills the repository holds in `scripts/skills/`. A person runs the script and points at those skills.

### What this piece adds

D2 adds only `scripts/setup-skills`. It does not edit a child project. It does not create a child project. It does not copy the process files. Every other script stays as it is. The child keeps its own docs and its own copy of the process files.

## Implementation notes

The first check was run. It fails because the install script is not written, so nothing copies the directory the repository holds the skills in into the person's personal skills.

The second check was run. It fails because that script is not written, so it was not run, and the skills are not set up by this run.

A child project was left as it is. The child keeps its own docs and its own copy of the process files. This run adds no script.

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

### Tests review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run. | PASS | The first check (`04-setup-script.md:71`) was run. The repository holds the skills. The agent looked for the install script this piece writes and read what it copies, and where. That script is not written. No script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. The check fails because there is no such copy. The note (`:81`) records that the install script is not written, so nothing copies that directory into the person's personal skills. The test design names that copy, and a failure is no such copy. The copy is missing, so the run fails because the behavior is not implemented yet. The run would not pass with that copy missing. The install script is the script the test design names. The run names no other file, function, library, or mechanism. | |
| A2 | A person can run the script and see those skills set up in the person's personal skills. | PASS | The second check (`04-setup-script.md:73`) looked for the script to run it on the machine. That script is not written, so it was not run. The skills the repository holds are not set up in the person's personal skills by this run. The check fails because those skills are absent from that setup. The behavior is not implemented yet. The note (`:83`) records that the script was not run and the skills are not set up by this run. The test design names those skills set up on that machine as the copy of the directory the repository holds them in, and a failure leaves them absent. They are absent, so the run fails. The run would not pass with that setup missing. The run names no file, function, library, or mechanism the test design did not name. | |
| D4 | The script copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run. The script piece owns the install script. A child project is edited only when asked. | PASS | The Tests section (`04-setup-script.md:69`) says the script these runs looked for copies the directory the repository holds the skills in into the person's personal skills on the machine where the script is run, "This piece would add only the install script," and "A child project was left as it is." The first check (`:71`) fails because there is no such copy. The second check (`:73`) fails because those skills are absent from that setup. The note (`:85`) says a child project was left as it is and this run adds no script. | |
| P1 | A child project is edited only when asked. | PASS | The Tests section (`04-setup-script.md:69`) and the note (`:85`): "A child project was left as it is." The same lines say this run adds no script. | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | The Tests section (`04-setup-script.md:69`) and the note (`:85`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.

### Spirit review, 2026-11-25

This review does not decide the pass.

The change this review read is the design above, and the Decisions table. The script is `scripts/setup-skills`. It copies each skill in `scripts/skills/` into `~/.cursor/skills/` on the machine where it is run. `~/.cursor/skills/` is the person's personal skills. The skills there are the copy of the skills the repository holds in `scripts/skills/`. This piece adds only `scripts/setup-skills`. It does not edit a child project. It does not create a child project. It does not copy the process files. Every other script stays as it is. The child keeps its own docs and its own copy of the process files.

The part this change changes is the part named in the Part line. There is no spirit file beside that page. Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit. This review used the plan's spirit: "Doing lookups to follow the process is handled efficiently."

The intent this review read is that spirit. The change fits it. The script copies the skills into the person's personal skills on the machine where it is run, so the person sets them up by running the script and the quality of the agent's work is there after a change of machine. The plan's spirit is that those lookups are handled efficiently. This piece is the copy that puts the skills in the place a personal skill loads. It adds only that script, and a child project is left as it is. No spirit file needs to be created or updated. The spirit file this review read stays as it is. Findings: none.

### Design review, 2026-11-25

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the script and see that it copies the skills the repository holds into the person's personal skills on the machine where the script is run. | PASS | The design for that check (`04-setup-script.md:84`): `scripts/setup-skills` copies each skill in `scripts/skills/` into `~/.cursor/skills/` on the machine where it is run, and `~/.cursor/skills/` is the person's personal skills. "A person points at that copy in the script." | |
| A2 | A person can run the script and see those skills set up in the person's personal skills. | PASS | The design for that check (`04-setup-script.md:88`): the run copies those skills into `~/.cursor/skills/`. "The skills there are the copy of the skills the repository holds in `scripts/skills/`." "A person runs the script and points at those skills." | |
| C1 | The script is `scripts/setup-skills`. It copies each skill in `scripts/skills/` into `~/.cursor/skills/` on the machine where it is run. `~/.cursor/skills/` is the person's personal skills. The skills there are the copy of the skills the repository holds in `scripts/skills/`. | PASS | The choice serves both checks (`04-setup-script.md:23`). The design for the pointing check (`:84`) is that copy in the script. The design for the running check (`:88`) is that same copy set up in `~/.cursor/skills/`. | |
| C2 | This piece adds only `scripts/setup-skills`. It does not edit a child project. It does not create a child project. It does not copy the process files. Every other script stays as it is. | PASS | The choice serves both checks by keeping the copy to the install script (`04-setup-script.md:24`). The design (`:80`) says the checks are a reading of `scripts/setup-skills` and a run of it, and "This piece writes no other script." The pointing check (`:84`) and the running check (`:88`) are that script. | |
| T1 | The tests are unchanged since their review. | PASS | `git diff 0b0ad8afc6a0aa8640e21484ee56982978e170fd -- docs/_plans/21-lookup-skills/04-setup-script.md` leaves the text from `## Tests` through the line before `## Design` the same as in that commit. There is no test branch. | |
| D4 | The repository holds the skills in `scripts/skills/`. The script copies that directory into the person's personal skills on the machine where the script is run. The script piece owns the install script. A child project is edited only when asked. | PASS | D1 (`04-setup-script.md:23`) and the design (`:84`, `:88`): the script copies each skill in `scripts/skills/` into `~/.cursor/skills/` on the machine where it is run, that folder is the person's personal skills, and the skills there are the copy of the skills the repository holds in `scripts/skills/`. D2 (`:24`) and the design (`:80`, `:92`): this piece adds only `scripts/setup-skills`, and it does not edit a child project. The design (`:80`) says a child project is left as it is. | |
| P1 | A child project is edited only when asked. | PASS | D2 (`04-setup-script.md:24`) and the design (`:80`, `:92`): "It does not edit a child project." The design (`:80`) says "A child project is left as it is." | |
| P2 | A child project keeps its own docs and its own copy of the files in `.ledger/process/`. | PASS | D2 (`04-setup-script.md:24`) and the design (`:92`): "The child keeps its own docs and its own copy of the process files." | |

Findings: none.
