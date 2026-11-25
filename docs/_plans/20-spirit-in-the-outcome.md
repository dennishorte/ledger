# Spirit in the outcome

**Status:** design

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

**Setup.** A spirit review is an account of whether the work fits the intent of its part. The account is of a plan whose outcome states the spirit of that plan. The spirit review is that account.

**Action.** The agent points at the spirit review. The agent reads the account and sees whether it used the spirit of the plan. A person can point at the same account and see the same words.

**Looked at.** The account shows that the spirit of the plan was used in it. A failed check is an account that does not use the spirit of the plan. That account would be the same if the plan's spirit were absent. The use is not the pass. The pass stays with the letter.

## Tests

The test design says the checks run on the writing this piece has produced, and that they do not run on the project from before that writing. This piece writes no executable tests.

The first check points at a plan's outcome. This plan's outcome already states the spirit of the plan before the rest of the outcome. That writing is already present, so that check can be run, and it passes.

The second check was run. The agent pointed at the process and looked for the writing that the plan's spirit can be used to help make sure the plan matches the spirit of the project. That writing is absent. The check fails because that use is lacking.

The third check was run. The agent pointed at the process and looked for the writing that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. That writing is absent. The check fails because that determination is lacking.

The fourth check points at a spirit review, an account of whether the work fits the intent of its part. The spirit review of the requirements in this plan is that account, and it used the spirit of the plan. That account is already present, so that check can be run, and it passes. The use is not the pass. The pass stays with the letter.

## Design

*(not started)*

## Implementation notes

The first check passes because this plan's outcome already states the spirit of the plan before the rest of the outcome. That is behavior this piece already wrote.

The fourth check passes because the spirit review of the requirements already used the spirit of the plan. That is behavior this piece already wrote.

The second check was run. It fails because the process lacks the writing that the plan's spirit can be used to help make sure the plan matches the spirit of the project.

The third check was run. It fails because the process lacks the writing that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated.

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

### Test design review, 2026-11-25

**Disposition:** changes-required

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at a plan's outcome and see the spirit of that plan stated up front. | PASS | Setup at `docs/_plans/20-spirit-in-the-outcome.md:61`: the plan's outcome is the writing this piece produced. Action at `:63`: the agent points at the plan's outcome and reads the spirit before the rest of the outcome. Looked at at `:65`: "The outcome states the spirit of the plan, and that statement comes before the rest of the outcome." A failed check leaves the spirit out of the outcome, or places it after the rest of the outcome. The design names no file, function, library, or mechanism. | |
| A2 | A person can point at the process and see that the plan's spirit can be used to help make sure the plan matches the spirit of the project. | PASS | Setup at `:69`: the process is the writing this piece produced. Action at `:71`: the agent points at the process and reads that the plan's spirit can be used to help make sure the plan matches the spirit of the project. Looked at at `:73`: "The writing says that the plan's spirit can be used to help make sure the plan matches the spirit of the project." A failed check lacks that use, or makes the match without the plan's spirit. The design names no file, function, library, or mechanism. | |
| A3 | A person can point at the process and see that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. | PASS | Setup at `:77`. Action at `:79`: the agent points at the process and reads that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. Looked at at `:81`: "The writing says that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated." A failed check lacks that determination, or makes the determination without the plan's spirit. The words "spirit.md file" are the confirmed check's subject, the words the writing shows. The design names no file for the check to open, no function, no library, and no mechanism. | |
| A4 | A person can point at a spirit review and see that the spirit of the plan was used in it. | FAIL | Setup at `:85`: "This piece has written that a spirit review uses the spirit of the plan. A spirit review is that writing." Action at `:87` points at that writing. Looked at at `:89` expects that writing to show the use. A spirit review that left the plan's spirit unused would leave those words the same. | applied |
| D1 | Spirit review. An account of whether the work fits the intent of its part. | FAIL | The decision is `docs/01-processes/01-plan/00-plan.md:23`. The test design at `:85` says "A spirit review is that writing," the sentence this piece has written. No part of the test design follows the account of whether the work fits the intent of its part. | applied |
| D2 | Letter. The facts that decide the pass. | PASS | The decision is `docs/01-processes/01-plan/00-plan.md:27`. The test design follows it at `:89`: "The use is not the pass. The pass stays with the letter." | |

**Decisions**

Included.

- Spirit review is an account of whether the work fits the intent of its part (`docs/01-processes/01-plan/00-plan.md:23`). This change uses the plan's spirit in the spirit review. The fourth check would be the wrong check if a spirit review were some other kind of writing.
- Letter. The facts that decide the pass (`docs/01-processes/01-plan/00-plan.md:27`). This change uses the plan's spirit in the spirit review. A check that treated that use as the pass would be the wrong check.

Left out. This plan has no parent, so there is no confirmed decision on a parent. Behavior cases on the plan page restate the facts below. Review's Offers and System record's Offers are empty.

- Carries one piece of work from a confirmed goal through an accepted result. The checks decide the four acceptance items.
- Does not state what is true of the project now. The checks read the writing this piece produced. They do not treat a plan as the statement of what is true of the project now.
- Person. The person running the project. Goal. What the person says will be true when a piece of work is done. Result. The finished work. Plan. One piece of work, kept as a file in `docs/_plans/`. Finding. A miss in a spirit review. Outcome. The step in which the person confirms the goal. Requirements. The step in which the checks on the goal are written. The checks use "a person," "a plan's outcome," and "a spirit review" in the sense the confirmed acceptance already uses. These definitions are not what the four checks decide.
- The person confirms the goal. The person accepts the result. The checks do not confirm the goal or accept the result.
- A spirit review is performed on the shared decisions of a plan that is split into pieces. This plan is one piece. The checks do not decide that review.
- A spirit review at the outcome and at the requirements is performed before the person confirms. A spirit review is performed at the outcome, at the requirements, and at the design. A spirit review is performed before that step advances. The checks do not decide when a spirit review is performed.
- A finding waits for the person's answer before the step advances. When the person says the change fits, the answer stays on the review and the letter decides the pass. When the person amends the outcome or the requirements, the work returns to that step. A spirit review with no finding does not ask the person. The checks do not decide findings, amendments, or when the person is asked. The letter's role in the pass is the included decision. Where an answer is written is a different fact.
- After a draft that requires a review, the review and the revision loop run before the person is asked. When that loop finds nothing the person has to resolve, the work continues through the plan without pausing. The person is asked when the finished work is ready to be accepted. The person is not asked because a step ended. These govern when the person is asked as the plan moves. The checks do not decide that.
- The plan's file is removed once the record states what the goal said would be true. The checks do not remove the plan.
- A design is accepted before implementation starts. The checks do not start implementation.
- Describes the processes that keep a project on track. Describes how to integrate those processes into a project. The checks do not decide that responsibility.
- Plan, Review, and System record are parts of Processes. That containment is not what the checks decide.
- Plan depends on Review. Plan depends on System record. Review depends on System record. The checks do not decide dependencies.
- A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The next review covers the rows that repair can change. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. These govern repair of a review. The checks do not decide repair.
- A smaller suggestion is a note the confirmed text does not require. The review records the suggestion, and the suggestion has no verdict. The suggestion does not hold the step, and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass. These govern suggestions on a review. The checks do not decide suggestions.
- A design follows each decision previously made that directly affects this part. This artifact is the test design.
- A review that decides a pass includes each decision previously made that directly affects this part. A decision that does not directly affect this part is left out. A review that leaves out a decision previously made that directly affects this part does not pass. A review that passes shows that the work follows each included decision. These govern this review. They are not what the four checks decide.
- Record. The pages that state what is true of the project now. The checks do not decide what the record is.
- Keeps a project on course when an LLM does the design and the implementation. The checks do not decide that responsibility.
- Does not carry out a child project's work. A child project is edited only when asked. Child project. A project listed in `.ledger/child-projects`. The checks do not edit a child project.
- Processes and Scripts are parts of the root. That containment is not what the checks decide.
- Design. The written account of how a piece of work will be done. Implementation. The carrying out of a design. This step is the test design. The checks do not decide the design or the implementation.

**Smaller suggestions**

None.

**Findings**

- A4. Blocking. Mechanical. The fourth check points at the writing that states the use, and calls that writing a spirit review. A spirit review that left the plan's spirit unused would leave that observation the same.
- D1. Blocking. Mechanical. The test design has no part that follows the decision that a spirit review is an account of whether the work fits the intent of its part. It defines a spirit review as the writing this piece produced.

### Test design review, 2026-11-25

This review covers the rows the repair can change: A4, D1, and D2. A1, A2, and A3 were not edited.

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A4 | A person can point at a spirit review and see that the spirit of the plan was used in it. | PASS | Setup at `docs/_plans/20-spirit-in-the-outcome.md:85`: "A spirit review is an account of whether the work fits the intent of its part. The account is of a plan whose outcome states the spirit of that plan. The spirit review is that account." Action at `:87`: the agent points at the spirit review, reads the account, and sees whether it used the spirit of the plan. Looked at at `:89`: "The account shows that the spirit of the plan was used in it." A failed check is an account that does not use the spirit of the plan. That account would be the same if the plan's spirit were absent. The design names no file, function, library, or mechanism. | |
| D1 | Spirit review. An account of whether the work fits the intent of its part. | PASS | The decision is `docs/01-processes/01-plan/00-plan.md:23`. The test design follows it at `docs/_plans/20-spirit-in-the-outcome.md:85`: "A spirit review is an account of whether the work fits the intent of its part." The action at `:87` points at that account. | |
| D2 | Letter. The facts that decide the pass. | PASS | The decision is `docs/01-processes/01-plan/00-plan.md:27`. The test design follows it at `docs/_plans/20-spirit-in-the-outcome.md:89`: "The use is not the pass. The pass stays with the letter." | |

**Smaller suggestions**

None.

**Findings**

None.

### Tests review, 2026-11-25

**Disposition:** changes-required

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A1 | A person can point at a plan's outcome and see the spirit of that plan stated up front. | PASS | The run is `docs/_plans/20-spirit-in-the-outcome.md:95`: the check points at this plan's outcome, that outcome states the spirit of the plan before the rest of the outcome, and the check passes. Implementation notes at `:109` explain the behavior this piece already wrote. The outcome at `:13` is "**Spirit.** Plans have a spirit of their own to guide their execution." The rest of the outcome follows at `:15`. A run that left the spirit out, or placed it after that rest, would not pass. The test design names no file. | |
| A2 | A person can point at the process and see that the plan's spirit can be used to help make sure the plan matches the spirit of the project. | FAIL | The tests section at `:97` says the second check cannot be run because that writing is not produced yet. The test design at `:73` says a failed check lacks that use, or makes the match without the plan's spirit. The tests section has no run with that result. Implementation notes at `:113` say the check fails, and that sentence does not show the run. `.ledger/process/plan-workflow.md` and `.ledger/process/review.md` do not say that the plan's spirit can be used to help make sure the plan matches the spirit of the project. That lack is a result the check can reach. | applied |
| A3 | A person can point at the process and see that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. | FAIL | The tests section at `:99` says the third check cannot be run because that writing is not produced yet. The test design at `:81` says a failed check lacks that determination, or makes the determination without the plan's spirit. The tests section has no run with that result. Implementation notes at `:113` say the check fails, and that sentence does not show the run. `.ledger/process/plan-workflow.md` and `.ledger/process/review.md` do not say that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. That lack is a result the check can reach. | applied |
| A4 | A person can point at a spirit review and see that the spirit of the plan was used in it. | PASS | The run is `:101`: the check points at the spirit review of the requirements, "an account of whether the work fits the intent of its part," and that account used the spirit of the plan. The check passes. "The use is not the pass. The pass stays with the letter." Implementation notes at `:111` explain the behavior this piece already wrote. The account at `:155` reads the plan's spirit, "Plans have a spirit of their own to guide their execution," and at `:165` the intent it read is that spirit. A run whose account did not use the plan's spirit would not pass. The test design names no file. | |
| D1 | Spirit review. An account of whether the work fits the intent of its part. | PASS | The decision is `docs/01-processes/01-plan/00-plan.md:23`. The tests note follows it at `docs/_plans/20-spirit-in-the-outcome.md:101`: "an account of whether the work fits the intent of its part." The fourth check points at that account. | |
| D2 | Letter. The facts that decide the pass. | PASS | The decision is `docs/01-processes/01-plan/00-plan.md:27`. The tests note follows it at `docs/_plans/20-spirit-in-the-outcome.md:101`: "The use is not the pass. The pass stays with the letter." | |

**Decisions**

Included.

- Spirit review is an account of whether the work fits the intent of its part (`docs/01-processes/01-plan/00-plan.md:23`). The fourth check points at a spirit review. The tests note would be pointing at the wrong kind of account if a spirit review were some other kind of writing.
- Letter. The facts that decide the pass (`docs/01-processes/01-plan/00-plan.md:27`). The fourth check records a pass because the account used the plan's spirit. The tests note would be treating that use as the pass if the letter were not what decides the pass.

Left out. This plan has no parent, so there is no confirmed decision on a parent. Behavior cases on the plan page, the processes page, and the project page restate the facts below. Review's Offers and System record's Offers are empty.

- Carries one piece of work from a confirmed goal through an accepted result. The tests note records the four checks.
- Does not state what is true of the project now. The tests note reads the writing this piece produced. It makes no claim that the plan states what is true of the project now.
- Person. The person running the project. Goal. What the person says will be true when a piece of work is done. Result. The finished work. Plan. One piece of work, kept as a file in `docs/_plans/`. Finding. A miss in a spirit review. Outcome. The step in which the person confirms the goal. Requirements. The step in which the checks on the goal are written. The tests note uses "a plan's outcome" and "a spirit review" in the sense the test design already uses. These definitions are not claims the tests note would get wrong.
- The person confirms the goal. The person accepts the result. The tests note does not confirm the goal or accept the result.
- A spirit review is performed on the shared decisions of a plan that is split into pieces. This plan is one piece. The tests note makes no claim about that review.
- A spirit review at the outcome and at the requirements is performed before the person confirms. A spirit review is performed at the outcome, at the requirements, and at the design. A spirit review is performed before that step advances. The tests note makes no claim about when a spirit review is performed.
- A finding waits for the person's answer before the step advances. When the person says the change fits, the answer stays on the review and the letter decides the pass. When the person amends the outcome or the requirements, the work returns to that step. A spirit review with no finding does not ask the person. The tests note makes no claim about findings, amendments, or when the person is asked. The letter's role in the pass is the included decision. Where an answer is written is a different fact.
- After a draft that requires a review, the review and the revision loop run before the person is asked. When that loop finds nothing the person has to resolve, the work continues through the plan without pausing. The person is asked when the finished work is ready to be accepted. The person is not asked because a step ended. These govern when the person is asked as the plan moves. The tests note makes no claim about that.
- The plan's file is removed once the record states what the goal said would be true. The tests note does not remove the plan.
- A design is accepted before implementation starts. The tests note does not start implementation.
- Describes the processes that keep a project on track. Describes how to integrate those processes into a project. The tests note makes no claim about that responsibility.
- Plan, Review, and System record are parts of Processes. That containment is not a claim the tests note makes.
- Plan depends on Review. Plan depends on System record. Review depends on System record. The tests note makes no claim about dependencies.
- A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The next review covers the rows that repair can change. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. These govern repair of a review. The tests note makes no claim about repair.
- A smaller suggestion is a note the confirmed text does not require. The review records the suggestion, and the suggestion has no verdict. The suggestion does not hold the step, and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass. These govern suggestions on a review. The tests note makes no claim about suggestions.
- A design follows each decision previously made that directly affects this part. This artifact is the tests note.
- A review that decides a pass includes each decision previously made that directly affects this part. A decision that does not directly affect this part is left out. A review that leaves out a decision previously made that directly affects this part does not pass. A review that passes shows that the work follows each included decision. These govern this review. The tests note makes no claim about them.
- Record. The pages that state what is true of the project now. The tests note makes no claim about what the record is.
- Keeps a project on course when an LLM does the design and the implementation. The tests note makes no claim about that responsibility.
- Does not carry out a child project's work. A child project is edited only when asked. Child project. A project listed in `.ledger/child-projects`. The tests note does not edit a child project.
- Processes and Scripts are parts of the root. That containment is not a claim the tests note makes.
- Design. The written account of how a piece of work will be done. Implementation. The carrying out of a design. This step is the tests note. The tests note makes no claim about the design or the implementation.

**Smaller suggestions**

None.

**Findings**

- A2. Blocking. Mechanical. The tests section says the second check cannot be run because the process writing is not produced yet. A failed check lacks the use, or makes the match without the plan's spirit. The tests section has no run with that result. The implementation notes say the check fails, and that sentence does not show the run.
- A3. Blocking. Mechanical. The tests section says the third check cannot be run because the process writing is not produced yet. A failed check lacks the determination, or makes the determination without the plan's spirit. The tests section has no run with that result. The implementation notes say the check fails, and that sentence does not show the run.

### Tests review, 2026-11-25

This review covers the rows the repair can change: A2 and A3. A1, A4, D1, and D2 were not edited.

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| A2 | A person can point at the process and see that the plan's spirit can be used to help make sure the plan matches the spirit of the project. | PASS | The run is `docs/_plans/20-spirit-in-the-outcome.md:97`. The agent pointed at the process and looked for the writing that the plan's spirit can be used to help make sure the plan matches the spirit of the project. That writing is absent. The check fails because that use is lacking. Implementation notes at `:113` record the same run and the same lack. The test design at `:73` names that lack as a failed check. `.ledger/process/plan-workflow.md` and `.ledger/process/review.md` do not contain that writing: `plan-workflow.md:33` states when a spirit review is performed, and `review.md:51` states that a review reads `spirit.md` beside the page. The check fails for that lack, behavior not implemented yet. The test names the process and names no file. A run that found the use would not fail. A match made without the plan's spirit would still lack this writing, so the check would fail. | |
| A3 | A person can point at the process and see that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. | PASS | The run is `docs/_plans/20-spirit-in-the-outcome.md:99`. The agent pointed at the process and looked for the writing that the plan's spirit can be used to help determine whether a spirit.md file needs to be created or updated. That writing is absent. The check fails because that determination is lacking. Implementation notes at `:115` record the same run and the same lack. The test design at `:81` names that lack as a failed check. `.ledger/process/plan-workflow.md:33` and `.ledger/process/review.md:51` do not state that determination. The check fails for that lack, behavior not implemented yet. The test names the process and names no file. A run that found the determination would not fail. A determination made without the plan's spirit would still lack this writing, so the check would fail. | |

**Smaller suggestions**

None.

**Findings**

None.

