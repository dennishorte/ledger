---
name: spirit-chain
description: Returns the spirit chain for a named part in the open Ledger project. The packet states each spirit file from that part up through the parts above it, and where a file is absent. Use when the process file that states this lookup names this skill.
disable-model-invocation: true
---

# Spirit chain

The open project is the project whose files are in the current workspace.

If that project has no process files under `.ledger/process/`, return no packet.

Read the walk in the Spirit review section of the open project's `.ledger/process/review.md`. Apply that walk to the named part. Gather that walk in this skill.

Return a packet that, for each part on the walk from that part up through the parts above it, includes the spirit file beside that part's page, or shows that the file is absent.

Each present spirit file is quoted, and the packet points at the place those lines were taken from. The place is a spirit file on that walk in the open project. The line in the packet is the line at that place.

Return no packet until the check for process files has passed.
