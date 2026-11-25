# Spirit in the outcome

**Status:** test-design

## Part

`docs/01-processes/01-plan/00-plan.md`

## Outcome

**Outcome confirmed:** 2026-11-24

**Spirit.** Plans have a spirit of their own to guide their execution.

A plan states the spirit of the plan up front in the outcome section. That statement can be used to help make sure the plan matches the spirit of the project, and to help determine whether a spirit.md file needs to be created or updated. The spirit of the plan is also used in the spirit review.

## Decisions

*(not started)*

## Requirements

**Requirements confirmed:** 2026-11-25

**Acceptance.**

- A person can point at a plan's outcome and see the spirit of that plan stated up front.
- A person can point at the process and see that the plan's spirit can be used to help make sure the plan matches the spirit of the project.
- A person can point at the process and see that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated.
- A person can point at a spirit review and see that the spirit of the plan was used in it.

**Constraints.**

- The person confirms the outcome, the requirements, and the shared decisions. An agent does not amend the outcome or the requirements.
- The person accepts the finished work.
- A spirit review is performed at the outcome, at the requirements, and at the design, before that step advances. At the outcome and at the requirements, that is before the person confirms.
- A finding waits for the person's answer before the step advances.
- When the person says the change fits, the answer stays on the review and the letter decides the pass.
- A spirit review with no finding does not ask the person.
- The spirit review does not decide the pass.
- A design is accepted before implementation starts.
- A child project is edited only when asked.
- The root spirit and the processes spirit stay as they are.
- A review follows each decision previously made that directly affects this part.

**Out of scope.**

- Changing when a spirit review is performed.
- Changing that the letter decides the pass.
- Changing the root spirit or the processes spirit.
- Removing the person's confirmation of the outcome, the requirements, or the shared decisions.
- Changing when the person is asked.
- A child project's work.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The agent is the one who runs the check. A person can point at the same writing and see the same words.

### A person can point at a plan's outcome and see the spirit of that plan stated up front.

**Setup.** This piece has written that a plan's outcome states the spirit of that plan up front. The plan's outcome is that writing.

**Action.** The agent points at the plan's outcome. The agent reads the spirit of that plan, and reads it before the rest of the outcome. A person can point at the same writing and see the same words.

**Looked at.** The outcome states the spirit of the plan, and that statement comes before the rest of the outcome. A failed check would leave the spirit out of the outcome, or would place it after the rest of the outcome.

### A person can point at the process and see that the plan's spirit can be used to help make sure the plan matches the spirit of the project.

**Setup.** This piece has written that the plan's spirit can be used to help make sure the plan matches the spirit of the project. The process is that writing.

**Action.** The agent points at the process. The agent reads that the plan's spirit can be used to help make sure the plan matches the spirit of the project. A person can point at the same writing and see the same words.

**Looked at.** The writing says that the plan's spirit can be used to help make sure the plan matches the spirit of the project. A failed check would lack that use, or would make the match without the plan's spirit.

### A person can point at the process and see that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated.

**Setup.** This piece has written that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. The process is that writing.

**Action.** The agent points at the process. The agent reads that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. A person can point at the same writing and see the same words.

**Looked at.** The writing says that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. A failed check would lack that determination, or would make the determination without the plan's spirit.

### A person can point at a spirit review and see that the spirit of the plan was used in it.

**Setup.** This piece has written that a spirit review uses the spirit of the plan. A spirit review is that writing.

**Action.** The agent points at a spirit review. The agent reads that the review used the spirit of the plan. A person can point at the same writing and see the same words.

**Looked at.** The review shows that the spirit of the plan was used in it. A failed check would be a spirit review that does not use the spirit of the plan. The use is not the pass. The pass stays with the letter.

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

### Spirit review, 2026-11-24

This review does not decide the pass.

The change this review read is the outcome above. A plan states the spirit of the plan up front in the outcome section. That statement can be used to help make sure the plan matches the spirit of the project, and to help determine whether a spirit.md file needs to be created or updated.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/01-plan/spirit.md`: "The plan workflow only asks for user input when needed."

Above that part, this review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. The spirit is stated in the outcome, which the person already confirms, so the workflow does not add an ask. The statement is there so the work can be checked against the project's intent, which is the quality this system exists to raise. A decision previously made stays in force. Findings: none.

### Spirit review, 2026-11-24

This review does not decide the pass.

The change this review read is the outcome above. Plans have a spirit of their own to guide their execution. A plan states the spirit of the plan up front in the outcome section. That statement can be used to help make sure the plan matches the spirit of the project, and to help determine whether a spirit.md file needs to be created or updated. The spirit of the plan is also used in the spirit review.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/01-plan/spirit.md`: "The plan workflow only asks for user input when needed."

Above that part, this review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. The plan's spirit guides its execution by being used in the spirit review, which already happens, so the workflow does not add an ask. The review still holds the work to the spirits of the part and of the project. A decision previously made stays in force. Findings: none.

### Spirit review, 2026-11-24

This review does not decide the pass.

The change this review read is the requirements. A person can point at a plan's outcome and see the spirit stated up front. A person can point at the process and see that the plan's spirit can be used to help make sure the plan matches the spirit of the project, and to help determine whether a spirit.md file needs to be created or updated. A person can point at a spirit review and see that the spirit of the plan was used in it. The confirmations, the acceptance, and the finding's wait stay. The spirit review still does not decide the pass. The root spirit and the processes spirit stay. A review still follows each decision previously made that directly affects this part.

This review also read the spirit of this plan, from the outcome: "Plans have a spirit of their own to guide their execution."

The part this change changes is the part named in the Part line. This review read `docs/01-processes/01-plan/spirit.md`: "The plan workflow only asks for user input when needed."

Above that part, this review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change, the spirit of this plan, and those spirits.

The intent this review read is the spirit of this plan and those spirits. The change fits them. The requirements use the plan's spirit to guide the work: it is stated up front, and a spirit review uses it. They do not add an ask. The letter still decides the pass. A decision previously made stays in force. Findings: none.
