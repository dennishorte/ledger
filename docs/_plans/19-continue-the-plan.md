# Continue the plan

**Status:** tests

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

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The agent is the one who runs the check. A person can point at the same writing and see the same words.

### A person can point at the workflow and see that, after a draft that requires a review, the review and the revision loop run before the person is asked.

**Setup.** This piece has written that, after a draft that requires a review, the review and the revision loop run before the person is asked. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that, after a draft that requires a review, the review and the revision loop run before the person is asked. A person can point at the same writing and see the same words.

**Looked at.** The writing says that, after a draft that requires a review, the review and the revision loop run before the person is asked. A failed check would ask the person when the draft is done and leave the review or the revision loop still ahead, or it would lack those words.

### A person can point at the workflow and see that, when that loop finds nothing the person has to resolve, the work continues through the plan without pausing.

**Setup.** This piece has written that, when that loop finds nothing the person has to resolve, the work continues through the plan without pausing. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that, when that loop finds nothing the person has to resolve, the work continues through the plan without pausing. A person can point at the same writing and see the same words.

**Looked at.** The writing says that, when that loop finds nothing the person has to resolve, the work continues through the plan without pausing. A failed check would pause the work there, or would ask the person there, when that loop finds nothing the person has to resolve.

### A person can point at the workflow and see that the person is asked when the finished work is ready to be accepted.

**Setup.** This piece has written that the person is asked when the finished work is ready to be accepted. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that the person is asked when the finished work is ready to be accepted. A person can point at the same writing and see the same words.

**Looked at.** The writing says that the person is asked when the finished work is ready to be accepted. A failed check would lack that ask.

### A person can point at the workflow and see that the person is asked for the input the process already names: confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person.

**Setup.** This piece has written that the person is asked for the input the process already names: confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that the person is asked for confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person. A person can point at the same writing and see the same words.

**Looked at.** The writing says the person is asked for confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person. The observation fails if any one of those named cases is missing.

### A person can point at the workflow and see that the person is not asked because a step ended.

**Setup.** This piece has written that the person is not asked because a step ended. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that the person is not asked because a step ended. A person can point at the same writing and see the same words.

**Looked at.** The writing says that the person is not asked because a step ended. A failed check would ask the person because a step ended, or would lack those words.

### A person can point at the spirit beside the plan page and read: The plan workflow only asks for user input when needed.

**Setup.** This piece has written that sentence on the spirit beside the plan page. The spirit beside the plan page is that writing.

**Action.** The agent points at the spirit beside the plan page. The agent reads: The plan workflow only asks for user input when needed. A person can point at the same writing and see the same words.

**Looked at.** The plan workflow only asks for user input when needed. A failed check would lack that sentence, or would say different words.

## Tests

The test design says the checks run on the writing this piece has produced, and that they do not run on the project from before that writing. That writing does not exist yet, so this piece writes no executable tests. The checks look at the updates this piece writes, and they cannot be run until that writing exists.

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

### Test design review, 2026-11-24

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at the workflow and see that, after a draft that requires a review, the review and the revision loop run before the person is asked. | PASS | Setup at `docs/_plans/19-continue-the-plan.md:62`, action at `:64`, observation at `:66`. The observation is that the writing says the review and the revision loop run before the person is asked. If the check failed, the writing would ask the person when the draft is done and leave the review or the revision loop still ahead, or those words would be absent. The check names no file, function, library, or mechanism. | |
| A2 | A person can point at the workflow and see that, when that loop finds nothing the person has to resolve, the work continues through the plan without pausing. | PASS | Setup at `docs/_plans/19-continue-the-plan.md:70`, action at `:72`, observation at `:74`. The observation is that the writing says the work continues through the plan without pausing when that loop finds nothing the person has to resolve. If the check failed, the writing would show a pause there, or an ask there, at that moment. The check names no file, function, library, or mechanism. | |
| A3 | A person can point at the workflow and see that the person is asked when the finished work is ready to be accepted. | PASS | Setup at `docs/_plans/19-continue-the-plan.md:78`, action at `:80`, observation at `:82`. The observation is that the writing says the person is asked when the finished work is ready to be accepted. If the check failed, that ask would be absent. The check names no file, function, library, or mechanism. | |
| A4 | A person can point at the workflow and see that the person is asked for the input the process already names: confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person. | PASS | Setup at `docs/_plans/19-continue-the-plan.md:86`, action at `:88`, observation at `:90`. The observation is that the writing names confirming the outcome, the requirements, and the shared decisions; answering a spirit finding; amending the outcome or the requirements; and the two cases where a failed row asks the person. If the check failed, any one of those named cases would be missing. The check names no file, function, library, or mechanism. | |
| A5 | A person can point at the workflow and see that the person is not asked because a step ended. | PASS | Setup at `docs/_plans/19-continue-the-plan.md:94`, action at `:96`, observation at `:98`. The observation is that the writing says the person is not asked because a step ended. If the check failed, the writing would ask the person because a step ended, or those words would be absent. The check names no file, function, library, or mechanism. | |
| A6 | A person can point at the spirit beside the plan page and read: The plan workflow only asks for user input when needed. | PASS | Setup at `docs/_plans/19-continue-the-plan.md:102`, action at `:104`, observation at `:106`. The observation is the sentence "The plan workflow only asks for user input when needed" on the spirit beside the plan page. If the check failed, that sentence would be absent, or the words would differ. The check names no file, function, library, or mechanism. | |

**Decisions.** Included: none.

This plan has no parent decision. Review Offers are none. System record Offers are none. The facts below are the ones on the plan page, the processes page, and the root page. Each check copies an acceptance sentence and looks for that sentence in the writing this piece produces. Setting any one of these facts aside would leave the six setups, the six actions, and the six observations as they are.

Left out from the plan page. The person confirms the goal, and the person accepts the result. Those asks are already the sentences A3 and A4 look for, so the record facts add nothing further for the setup, the action, or the observation to show. A spirit review is performed on the shared decisions of a plan that is split into pieces. A spirit review at the outcome and at the requirements is performed before the person confirms. A spirit review is performed at the outcome, at the requirements, and at the design, and before that step advances. This test design does not say when a spirit review runs. A finding waits for the person's answer before the step advances. A4 looks for the writing to say the person is asked for answering a spirit finding. Setting the wait aside leaves that observation the same. When the person says the change fits, the answer stays on the review and the letter decides the pass. When the person amends the outcome or the requirements, the work returns to that step. A4 looks for the amending ask, and no check looks at where an answer is kept or at a return to a step. A spirit review with no finding does not ask the person. No check treats a review with no finding as an ask. The plan's file is removed once the record states what the goal said would be true. A design is accepted before implementation starts. No check looks at removal of the plan or at the start of implementation. The plan page also names the person, the goal, the result, the plan, a spirit review, a finding, the letter, the outcome, and the requirements, and it says the plan carries one piece of work from a confirmed goal through an accepted result and does not state what is true of the project now. Those names and that boundary do not change what the six checks look at.

Left out from the processes page. A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The next review covers the rows that repair can change. A4 looks for the writing to name the two cases where a failed row asks the person; it does not look at who repairs a row or which rows a later review covers. The person is asked in two cases: the failed row does not determine one edit, or the repair would change the outcome or the requirements. The acceptance sentence names those as "the two cases where a failed row asks the person," and the observation fails when that case is missing. The two descriptions are already what that phrase refers to, and copying them into the observation would add words the acceptance check does not ask a person to point at. A smaller suggestion is a note the confirmed text does not require. The review records it and gives it no verdict. It does not hold the step and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied, the step advances, the suggestions stay for a later change to find, and the person does not have to read them for the step to pass. No acceptance check is about suggestions. A design follows each decision previously made that directly affects this part. That binds the implementation design. This test design does not choose how the writing will be made. A review that decides a pass includes each decision previously made that directly affects this part. A decision that does not directly affect this part is left out. A review that leaves out a decision that directly affects this part does not pass. A review that passes shows that the work follows each included decision. Those bind this review. They do not change the setup, the action, or the observation of a check. The processes page also says it describes the processes that keep a project on track and how to integrate them, that the plan depends on review and on the system record, that review depends on the system record, and it defines the record as the pages that state what is true now. None of that changes what the six checks look at.

Left out from the root page. A child project is edited only when asked. The root keeps a project on course and does not carry out a child project's work. The checks run on the writing this piece has produced, and the acceptance sentences do not mention a child project. The root defines a child project, a design, and an implementation. The test design does not use those definitions to decide a check.

Smaller suggestions: none

Findings: none
