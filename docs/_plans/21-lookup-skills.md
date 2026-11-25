# Lookup skills

**Status:** coordinating

## Part

`docs/01-processes/00-processes.md`

## Outcome

**Outcome confirmed:** 2026-11-25

**Spirit.** Doing lookups to follow the process is handled efficiently.

A few skills quickly and correctly grab specific types of information when the person asks for work that follows the processes.

- One skill returns the reading set for a part: the pages to read in full, the neighbors whose Offers to read, and where to stop.
- One skill returns where a plan sits: its status, what is already confirmed, the next action, whether the person is asked, the review rows for this step, and the candidate decisions previously made.
- One skill returns the spirit chain for a part: each spirit file from that part up through the parts above it, and where a file is absent.

## Decisions

*(not started)*

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
