# Continue the plan

**Status:** test-design

## Part

`docs/01-processes/01-plan/00-plan.md`

## Outcome

**Outcome confirmed:** 2026-11-24

After a draft that requires a review, the review and the revision loop run before the person is asked. When that loop finds nothing the person has to resolve, the work continues through the plan without pausing. The person is asked when the plan is completed, and when the work needs their input. The person is not asked because a step ended.

The plan is completed when the finished work is ready to be accepted. The work needs their input in the cases the process already names: confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person. A step ending is not one of those cases.

The plan part keeps its own spirit, in `spirit.md` beside its page. The spirits above it do not already say this intent. The spirit is: The plan workflow only asks for user input when needed.

## Decisions

*(not started)*

## Requirements

**Requirements confirmed:** 2026-11-24

**Acceptance.**

- A person can point at the workflow and see that, after a draft that requires a review, the review and the revision loop run before the person is asked.
- A person can point at the workflow and see that, when that loop finds nothing the person has to resolve, the work continues through the plan without pausing.
- A person can point at the workflow and see that the person is asked when the finished work is ready to be accepted.
- A person can point at the workflow and see that the person is asked for the input the process already names: confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person.
- A person can point at the workflow and see that the person is not asked because a step ended.
- A person can point at the spirit beside the plan page and read: The plan workflow only asks for user input when needed.

**Constraints.**

- The person confirms the outcome, the requirements, and the shared decisions. An agent does not amend the outcome or the requirements.
- The person accepts the finished work.
- A finding waits for the person's answer before the step advances.
- A failed row is repaired without asking the person, except in the two cases already named.
- A design is accepted before implementation starts.
- A child project is edited only when asked.
- The root spirit and the processes spirit stay as they are.
- A spirit review with no finding does not ask the person.

**Out of scope.**

- Changing which rows a review uses.
- Changing the two cases where a failed row asks the person.
- Changing when a spirit review is performed.
- Changing the root spirit or the processes spirit.
- Removing the person's confirmation of the outcome, the requirements, or the shared decisions.
- A child project's work.

## Test design

*(not started)*

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

### Spirit review, 2026-11-24

This review does not decide the pass.

The change this review read is the outcome above. After a draft that requires a review, the review and the revision loop run before the person is asked. When that loop finds nothing the person has to resolve, the work continues through the plan without pausing. The person is asked when the finished work is ready to be accepted, and in the cases the process already names. The person is not asked because a step ended.

The part this change changes is the part named in the Part line. This review read a spirit where `spirit.md` is beside the page. That file is not beside the page of that part, so this account has no spirit of that part to show.

Above that part, this review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits them. The review still runs, and it runs before the person is asked, so the work is still checked. The person is still asked for the decisions that are already theirs, and when the finished work is ready to be accepted. The person is not asked because a step ended, which is load this system exists to take off them. A decision previously made stays in force. Findings: none.

### Spirit review, 2026-11-24

This review does not decide the pass.

The change this review read is the outcome above, including the plan part's own spirit. After a draft that requires a review, the review and the revision loop run before the person is asked. When that loop finds nothing the person has to resolve, the work continues through the plan without pausing. The person is asked when the finished work is ready to be accepted, and in the cases the process already names. The person is not asked because a step ended. The plan part keeps its own spirit, because the spirits above it do not already say that intent.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/01-plan/spirit.md`: "The plan workflow only asks for user input when needed."

Above that part, this review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The plan part's spirit is a more specific statement of the root spirit, and the spirits above do not already say it, so it is kept beside the plan page. The change fits. The review still runs before the person is asked. The person is still asked for the input the process already names, and when the finished work is ready to be accepted. The person is not asked because a step ended. A decision previously made stays in force. Findings: none.

### Spirit review, 2026-11-24

This review does not decide the pass.

The change this review read is the requirements. After a draft that requires a review, the review and the revision loop run before the person is asked. When that loop finds nothing the person has to resolve, the work continues without pausing. The person is asked when the finished work is ready to be accepted, and for the input the process already names. The person is not asked because a step ended. The spirit beside the plan page says that the plan workflow only asks for user input when needed. The confirmations, the acceptance, the finding's wait, the failed-row repair, and the two cases stay. The root spirit and the processes spirit stay.

The part this change changes is the part named in the Part line. This review read `docs/01-processes/01-plan/spirit.md`: "The plan workflow only asks for user input when needed."

Above that part, this review read `docs/01-processes/spirit.md`: "Designs and reviews respect the decisions previously made that directly affect this part."

Above that part, this review read `docs/spirit.md`: "The Ledger system reduces the burden on a human managing a project by increasing the quality of the work performed by LLM agents."

What this review read is this change and those spirits.

The intent this review read is those spirits. The change fits. The requirements ask the person for the input already named, and when the work is ready to be accepted, and they do not ask because a step ended. The review still runs before the person is asked. The decisions previously made stay in the constraints. Findings: none.
