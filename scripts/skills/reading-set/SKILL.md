---
name: reading-set
description: Returns the reading set for a named part in the open Ledger project. The packet states the pages to read in full, the neighbors whose Offers to read, and where to stop, quoting the open project's process files. Use when the process file that states this lookup names this skill.
disable-model-invocation: true
---

# Reading set

The open project is the project whose files are in the current workspace.

If that project has no process files under `.ledger/process/`, return no packet.

Read "What a reader reads" in the open project's `.ledger/process/system-record.md`. Apply that section to the named part.

Return a packet that states three things:

- the pages to read in full
- the neighbors whose Offers to read
- where to stop

Each of those quotes the line it rests on and points at that place in the process files. The place is in the open project's process files. The line in the packet is the line at that place.

Return no packet until the check for process files has passed.
