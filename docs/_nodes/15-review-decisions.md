# Decisions found and considered

**Node ID:** `15-review-decisions`
**Parent:** project root (`docs/00-project.md`)
**Status:** PLANNED
**Created:** 2026-11-17
**Last Updated:** 2026-11-17
**Dependencies:** `14-review-process`

---

## Requirements

**Requirements confirmed:** unconfirmed

**Outcome.** Important decisions are recorded where later work can find them, and the design and review of that work consider those decisions.

**Acceptance.**

**Recording.** Decisions are recorded so they can be found when needed.

- An important decision is recorded where a later change to the work it governs will find it.
- A decision recorded where that later change will not find it stays unfound.

**Design and review.** Design and review steps consider the decisions that work can find.

- Design of a change considers each important decision the change can find.
- A review of a change includes each important decision the change can find.
- The operator does not state a found decision again for the design or the review.
- Design and review of a change leave out an important decision that does not govern that change.
- A decision the project does not treat as important is not required in design or review.
- A review that leaves out an important decision the change can find does not pass.
- A review that passes shows, for each included decision, that the work still follows it, or that the decision was changed in that review.
- A review of a spec and a review of an implementation both consider the decisions the change can find.

**Constraints.**

_(operator)_

**Out of scope.**

_(operator)_

---

## Design

*(not started)*

---

## Decisions

*(not started)*

---

## Open Issues

*(not started)*

---

## Implementation Notes

*(not started)*

---

## Verification

**Recording.** Record an important decision where a later change to the work it governs will find it. Record another decision where a later change to that same work will not find it. Look up what that change can find. The first is found. The second stays unfound.

**Design and review.** Keep the findable decision. Also record an important decision that governs other work, and a decision that is not treated as important. Design a change to the work the first decision governs, then review it once as a spec and once as an implementation. Do not restate the first decision for the design or either review. The design and both reviews consider that decision. They leave out the decision that governs other work, and the decision that is not important. A review that leaves the first decision out does not pass. A review that passes shows that the change still follows it, or that the decision was changed in that review.

---

## Children

None
