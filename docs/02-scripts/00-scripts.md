# Scripts

## Responsibility

Creates a child project at a given path.
Copies the process files into a child project.

## Parts

None

## Offers

**Project path.** The path of the child project.

A relative project path is taken from the current directory.

**Name.** The title written on the new project's root page and in `CLAUDE.md`.

When no name is given, the name is the last segment of the project path.

**Process file.** A markdown file in this project's `.ledger/process/`.

`scripts/new-project` with a project path creates the child project at that path.

The child project receives `docs/00-project.md`, `CLAUDE.md`, `.gitignore`, and a copy of each process file.

`docs/00-project.md` is titled with the name. Its sections are Responsibility, Parts, Offers, Dependencies, Behavior, Rules, Words, and Checked, and each section is None.

`CLAUDE.md` is titled with the name. It points at `docs/00-project.md`, `.ledger/process/system-record.md`, `.ledger/process/plan-workflow.md`, and `.ledger/process/verification-signoff.md`.

`.gitignore` contains `.DS_Store`.

`scripts/new-project` leaves an existing file as it is.

The absolute project path is added to `.ledger/child-projects`.

A path already listed in `.ledger/child-projects` is listed once.

`scripts/new-project` creates nothing when the project path is missing, `--name` has no value, or an option is unknown.

`scripts/sync-process` with no project path copies each process file into every child project listed in `.ledger/child-projects`.

`scripts/sync-process` with one or more project paths copies each process file into those projects only.

A process file that matches the copy on the child project is left as it is.

A process file that differs is replaced with the file from this project.

A file in the child project's `.ledger/process/` that is not a process file is left in place.

A project path with no directory is skipped, and `scripts/sync-process` fails.

A blank line, and a line that begins with `#`, is not a child project.

`scripts/sync-process` with no project path fails when `.ledger/child-projects` is missing or lists no child project.

## Dependencies

Scripts depends on the process files.

## Behavior

Case: a relative project path.
Setup: the path is not absolute.
Action: `scripts/new-project` or `scripts/sync-process` is run with that path.
Result: a relative project path is taken from the current directory.

Case: a project path and no name.
Setup: `scripts/new-project` is given a project path and no name.
Action: the child project is created.
Result: when no name is given, the name is the last segment of the project path.

Case: a project path.
Setup: the path is given. The directory need not exist.
Action: `scripts/new-project` is run with that path.
Result: `scripts/new-project` with a project path creates the child project at that path.

Case: the files in a new child project.
Setup: the files `scripts/new-project` writes are absent.
Action: `scripts/new-project` is run.
Result: the child project receives `docs/00-project.md`, `CLAUDE.md`, `.gitignore`, and a copy of each process file.

Case: the new root page.
Setup: `scripts/new-project` writes `docs/00-project.md`.
Action: the page is written.
Result: `docs/00-project.md` is titled with the name. Its sections are Responsibility, Parts, Offers, Dependencies, Behavior, Rules, Words, and Checked, and each section is None.

Case: the new briefing.
Setup: `scripts/new-project` writes `CLAUDE.md`.
Action: the briefing is written.
Result: `CLAUDE.md` is titled with the name. It points at `docs/00-project.md`, `.ledger/process/system-record.md`, `.ledger/process/plan-workflow.md`, and `.ledger/process/verification-signoff.md`.

Case: the new gitignore.
Setup: `scripts/new-project` writes `.gitignore`.
Action: the file is written.
Result: `.gitignore` contains `.DS_Store`.

Case: a file that already exists.
Setup: the destination file is already present.
Action: `scripts/new-project` is run again.
Result: `scripts/new-project` leaves an existing file as it is.

Case: a new registry line.
Setup: the absolute project path is not listed in `.ledger/child-projects`.
Action: `scripts/new-project` creates the child project.
Result: the absolute project path is added to `.ledger/child-projects`.

Case: a path already listed.
Setup: the absolute project path is already a line in `.ledger/child-projects`.
Action: `scripts/new-project` is run with that path.
Result: a path already listed in `.ledger/child-projects` is listed once.

Case: a run that cannot start.
Setup: the project path is missing, `--name` has no value, or an option is unknown.
Action: `scripts/new-project` is run.
Result: `scripts/new-project` creates nothing when the project path is missing, `--name` has no value, or an option is unknown.

Case: sync with no path.
Setup: `.ledger/child-projects` lists one or more child projects.
Action: `scripts/sync-process` is run with no path.
Result: `scripts/sync-process` with no project path copies each process file into every child project listed in `.ledger/child-projects`.

Case: sync with paths.
Setup: one or more project paths are given.
Action: `scripts/sync-process` is run with those paths.
Result: `scripts/sync-process` with one or more project paths copies each process file into those projects only.

Case: a matching process file.
Setup: the child's copy of a process file has the same contents as the file here.
Action: `scripts/sync-process` is run for that project.
Result: a process file that matches the copy on the child project is left as it is.

Case: a differing process file.
Setup: the child's copy of a process file differs from the file here.
Action: `scripts/sync-process` is run for that project.
Result: a process file that differs is replaced with the file from this project.

Case: a file only on the child.
Setup: the child's `.ledger/process/` holds a file that is not a process file.
Action: `scripts/sync-process` is run for that project.
Result: a file in the child project's `.ledger/process/` that is not a process file is left in place.

Case: a missing directory.
Setup: a project path names no directory.
Action: `scripts/sync-process` is run with that path.
Result: a project path with no directory is skipped, and `scripts/sync-process` fails.

Case: a registry line that is not a project.
Setup: `.ledger/child-projects` contains a blank line, and a line that begins with `#`.
Action: `scripts/sync-process` is run with no path.
Result: a blank line, and a line that begins with `#`, is not a child project.

Case: no child project to sync.
Setup: `.ledger/child-projects` is missing, or it lists no child project, and no project path is given.
Action: `scripts/sync-process` is run.
Result: `scripts/sync-process` with no project path fails when `.ledger/child-projects` is missing or lists no child project.

## Rules

None

## Words

None

## Checked

None
