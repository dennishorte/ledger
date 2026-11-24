# When a spirit review is performed

**Status:** test-design

## Part

`docs/01-processes/01-plan/00-plan.md`

## Outcome

**Outcome confirmed:** 2026-11-24

The workflow says when a spirit review is performed.

A spirit review is performed at the outcome, at the requirements, and at the design. It is performed on the shared decisions of a plan that is split into pieces. It is performed before that step advances. At the outcome and at the requirements, that is before the person confirms.

A finding waits for the person's answer before the step advances. When the person says the change fits, the answer stays on the review and the letter decides the pass. When the person amends the outcome or the requirements, the work returns to that step. A spirit review with no finding does not ask the person.

## Decisions

*(not started)*

## Requirements

**Requirements confirmed:** 2026-11-24

**Acceptance.**

- A person can point at the workflow and see that a spirit review is performed at the outcome, at the requirements, and at the design.
- A person can point at the workflow and see that a spirit review is performed on the shared decisions of a plan that is split into pieces.
- A person can point at the workflow and see that a spirit review is performed before that step advances.
- A person can point at the workflow and see that, at the outcome and at the requirements, the spirit review is before the person confirms.
- A person can point at the workflow and see that a finding waits for the person's answer before the step advances.
- A person can point at the workflow and see that, when the person says the change fits, the answer stays on the review and the letter decides the pass.
- A person can point at the workflow and see that, when the person amends the outcome or the requirements, the work returns to that step.
- A person can point at the workflow and see that a spirit review with no finding does not ask the person.

**Constraints.**

- The person confirms the outcome and the requirements. An agent does not amend them.
- The person accepts the finished work.
- A design is accepted before implementation starts.
- A child project is edited only when asked.

**Out of scope.**

- A spirit review at the test design, the tests, the implementation, or the record.
- Changing what a spirit review reads, and changing what a finding is.
- Changing a review that decides a pass.
- Changing the repair of a failed row, or the treatment of a smaller suggestion.
- Changing a decision previously made.
- A child project's work.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The agent is the one who runs the check. A person can point at the same workflow and see the same words.

### A person can point at the workflow and see that a spirit review is performed at the outcome, at the requirements, and at the design.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that a spirit review is performed at the outcome, at the requirements, and at the design. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that a spirit review is performed at the outcome, at the requirements, and at the design. A failed check has no such words to point at, or the workflow does not say that a spirit review is performed at each of those three steps.

### A person can point at the workflow and see that a spirit review is performed on the shared decisions of a plan that is split into pieces.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that a spirit review is performed on the shared decisions of a plan that is split into pieces. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that a spirit review is performed on the shared decisions of a plan that is split into pieces. A failed check has no such words to point at, or the workflow does not say that.

### A person can point at the workflow and see that a spirit review is performed before that step advances.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that a spirit review is performed before that step advances. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that a spirit review is performed before the step advances. A failed check has no such words to point at, or the step advances before the spirit review is performed.

### A person can point at the workflow and see that, at the outcome and at the requirements, the spirit review is before the person confirms.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that, at the outcome and at the requirements, the spirit review is before the person confirms. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that, at the outcome and at the requirements, the spirit review is before the person confirms. A failed check has no such words to point at, or the person confirms before the spirit review.

### A person can point at the workflow and see that a finding waits for the person's answer before the step advances.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that a finding waits for the person's answer before the step advances. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that a finding waits for the person's answer before the step advances. A failed check has no such words to point at, or the step advances while the finding has no answer from the person.

### A person can point at the workflow and see that, when the person says the change fits, the answer stays on the review and the letter decides the pass.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that, when the person says the change fits, the answer stays on the review and the letter decides the pass. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that the answer stays on the review. It says that the letter decides the pass. A failed check has no such words to point at, or the answer does not stay on the review, or something other than the letter decides the pass.

### A person can point at the workflow and see that, when the person amends the outcome or the requirements, the work returns to that step.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that, when the person amends the outcome or the requirements, the work returns to that step. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that, when the person amends the outcome or the requirements, the work returns to that step. A failed check has no such words to point at, or the work stays on the later step after that amendment.

### A person can point at the workflow and see that a spirit review with no finding does not ask the person.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that a spirit review with no finding does not ask the person. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that a spirit review with no finding does not ask the person. A failed check has no such words to point at, or the workflow asks the person when the spirit review has no finding.

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

*(not started)*
