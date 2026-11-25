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

The change this review read is the requirements above. A person can point at the packet for a part and see each spirit file from that part up through the parts above it, and where a file is absent. The packet shows the quoted lines and the places they were taken from. The skill loads when it is named, stays unloaded until then, and stays unloaded for a project that is not running Ledger. The packet comes back only after the skill checks that the open project has the process files. The packet is taken from the spirit files on the walk in the project that is open. This skill gathers that walk itself. It is a personal skill. A child project is left as it is. This piece adds only its own skill and its own naming line.

The part this change changes is the part named in the Part line. This review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and that spirit.

The intent this review read is that spirit. The change fits it. A packet a person can point at, taken from the spirit files on the walk, raises the quality of the agent's work and leaves the person with less hunting to do. The spirit file stays as it is. Findings: none.
