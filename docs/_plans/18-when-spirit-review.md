# When a spirit review is performed

**Status:** design

## Part

`docs/01-processes/01-plan/00-plan.md`

## Outcome

**Outcome confirmed:** 2026-11-24

The workflow says when a spirit review is performed.

A spirit review is performed at the outcome, at the requirements, and at the design. It is performed on the shared decisions of a plan that is split into pieces. It is performed before that step advances. At the outcome and at the requirements, that is before the person confirms.

A finding waits for the person's answer before the step advances. When the person says the change fits, the answer stays on the review and the letter decides the pass. When the person amends the outcome or the requirements, the work returns to that step. A spirit review with no finding does not ask the person.

## Decisions

| | Decision | Reason |
|---|----------|--------|
| D1 | In `.ledger/process/plan-workflow.md`, a Spirit review section says that a spirit review is performed at the outcome, at the requirements, and at the design. It says that a spirit review is performed on the shared decisions of a plan that is split into pieces. It says that the review is performed before that step advances, and that at the outcome and at the requirements this is before the person confirms. The outcome step, the requirements step, the shared-decisions step, and the design step each say the same for that step. | It serves the check that a spirit review is performed at the outcome, at the requirements, and at the design. It serves the check that a spirit review is performed on the shared decisions of a plan that is split into pieces. It serves the check that a spirit review is performed before that step advances. It serves the check that, at the outcome and at the requirements, the spirit review is before the person confirms. |
| D2 | That same section says that a finding waits for the person's answer before the step advances. It says that, when the person says the change fits, the answer stays on the review and the letter decides the pass. It says that, when the person amends the outcome or the requirements, the work returns to that step. It says that a spirit review with no finding does not ask the person. | It serves the check that a finding waits for the person's answer before the step advances. It serves the check that, when the person says the change fits, the answer stays on the review and the letter decides the pass. It serves the check that, when the person amends the outcome or the requirements, the work returns to that step. It serves the check that a spirit review with no finding does not ask the person. |
| D3 | `.ledger/process/review.md` stays as it is. In `.ledger/process/plan-workflow.md`, the paragraphs that decide a pass stay as they are. The sentences for a failed row, and the sentences for the two cases where the person is asked, stay as they are. The confirmation sentences and the acceptance sentence stay as they are. | It serves the check that the letter decides the pass, because those paragraphs still decide it. It serves the check that a finding waits for the person's answer, because a finding is not written into the failed-row sentences. It serves the check that the spirit review at the outcome and at the requirements is before the person confirms, because the person still confirms and an agent does not. |

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

**Looked at.** The workflow says that, when the person says the change fits, the answer stays on the review and the letter decides the pass. A failed check has no such words to point at, or the workflow says that the answer stays on the review and that the letter decides the pass without saying that this is when the person says the change fits.

### A person can point at the workflow and see that, when the person amends the outcome or the requirements, the work returns to that step.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that, when the person amends the outcome or the requirements, the work returns to that step. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that, when the person amends the outcome or the requirements, the work returns to that step. A failed check has no such words to point at, or the work stays on the later step after that amendment.

### A person can point at the workflow and see that a spirit review with no finding does not ask the person.

**Setup.** This piece has written when a spirit review is performed. The workflow is that writing.

**Action.** The agent points at the workflow. The agent reads that a spirit review with no finding does not ask the person. A person can point at the same workflow and see the same words.

**Looked at.** The workflow says that a spirit review with no finding does not ask the person. A failed check has no such words to point at, or the workflow asks the person when the spirit review has no finding.

## Tests

This piece writes no executable tests. The checks look at the updates this piece writes. They cannot be run until that writing exists. The person recorded this on 2026-11-24 and moved the plan to design.

## Design

The writing is `.ledger/process/plan-workflow.md`. The checks are a reading of that writing. `.ledger/process/review.md` stays as it is. The Tests section stays as it is. There is no test branch. This design does not change the tests, the test design, the requirements, or the outcome.

### A person can point at the workflow and see that a spirit review is performed at the outcome, at the requirements, and at the design.

D1 writes a Spirit review section into `.ledger/process/plan-workflow.md`. The section says that a spirit review is performed at the outcome, at the requirements, and at the design. The outcome step says that a spirit review is performed at the outcome. The requirements step says that a spirit review is performed at the requirements. The design step says that a spirit review is performed at the design. Those step sentences sit before the confirmation, or before the review that decides the pass.

A person points at that section and at those steps and reads that a spirit review is performed at each of the three.

### A person can point at the workflow and see that a spirit review is performed on the shared decisions of a plan that is split into pieces.

D1 writes into the Spirit review section that a spirit review is performed on the shared decisions of a plan that is split into pieces. The shared-decisions step says the same. That step is the coordinating section. Its sentence sits before the person confirms the decisions, and before the review that decides the pass.

A person points at that section and at that step and reads that a spirit review is performed on those shared decisions.

### A person can point at the workflow and see that a spirit review is performed before that step advances.

D1 writes into the Spirit review section that the review is performed before that step advances. Each of the four steps says that the spirit review is performed before that step advances. At the shared decisions and at the design, that is before the pass commit. The pass still advances the step.

A person points at that section and at those steps and reads that the spirit review is performed before the step advances.

### A person can point at the workflow and see that, at the outcome and at the requirements, the spirit review is before the person confirms.

D1 writes into the Spirit review section that, at the outcome and at the requirements, the spirit review is before the person confirms. The outcome step and the requirements step each say that. Those sentences sit before the sentence in which the person confirms.

This follows the fact that the person confirms the goal. The confirmation sentences stay. An agent does not confirm. D3 leaves those sentences as they are.

A person points at that section and at those two steps and reads that the spirit review is before the person confirms.

### A person can point at the workflow and see that a finding waits for the person's answer before the step advances.

D2 writes into the Spirit review section that a finding waits for the person's answer before the step advances. The step does not advance while the finding has no answer from the person.

This follows the fact that a failed row is repaired without asking the person, and the fact that the person is asked in two cases. D3 leaves those sentences as they are. A finding is not written into them.

A person points at that section and reads that a finding waits for the person's answer before the step advances.

### A person can point at the workflow and see that, when the person says the change fits, the answer stays on the review and the letter decides the pass.

D2 writes into the Spirit review section that, when the person says the change fits, the answer stays on the review and the letter decides the pass.

This follows the fact that the person accepts the result. The acceptance sentence stays after the implementation review. The spirit review does not accept the finished work. D3 leaves that sentence as it is.

This follows the fact that a design is accepted before implementation starts. The design review's pass still sets the step to implementation. D3 leaves that paragraph as it is.

This follows the fact that a review that decides a pass includes each decision previously made that directly affects this part, leaves out a decision that does not, does not pass when it leaves out one that does, and shows that the work follows each included decision. D3 leaves those review paragraphs as they are. The spirit review does not decide the pass.

A person points at that section and reads that the answer stays on the review and that the letter decides the pass.

### A person can point at the workflow and see that, when the person amends the outcome or the requirements, the work returns to that step.

D2 writes into the Spirit review section that, when the person amends the outcome or the requirements, the work returns to that step. The person amends. An agent does not.

A person points at that section and reads that the work returns to that step.

### A person can point at the workflow and see that a spirit review with no finding does not ask the person.

D2 writes into the Spirit review section that a spirit review with no finding does not ask the person.

A person points at that section and reads that a spirit review with no finding does not ask the person.

The checks are a reading of this writing. This piece writes no executable test. The Tests section stays as it is.

## Implementation notes

*(not started)*

## Reviews

### Test design review, 2026-11-24

**Disposition:** changes-required

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| 1 | A person can point at the workflow and see that a spirit review is performed at the outcome, at the requirements, and at the design. | PASS | Setup `docs/_plans/18-when-spirit-review.md:60`: the writing is the workflow. Action `:62`: the agent reads that a spirit review is performed at the outcome, at the requirements, and at the design. Observation `:64`: the workflow says that. If the check failed, there would be no such words, or the workflow would not say it at each of the three steps. Those lines name no file, function, library, or mechanism. | |
| 2 | A person can point at the workflow and see that a spirit review is performed on the shared decisions of a plan that is split into pieces. | PASS | Setup `:68`: the writing is the workflow. Action `:70`: the agent reads that a spirit review is performed on the shared decisions of a plan that is split into pieces. Observation `:72`: the workflow says that. If the check failed, there would be no such words, or the workflow would not say that. Those lines name no file, function, library, or mechanism. | |
| 3 | A person can point at the workflow and see that a spirit review is performed before that step advances. | PASS | Setup `:76`: the writing is the workflow. Action `:78`: the agent reads that a spirit review is performed before that step advances. Observation `:80`: the workflow says the spirit review is performed before the step advances. If the check failed, there would be no such words, or the step would advance before the spirit review. Those lines name no file, function, library, or mechanism. | |
| 4 | A person can point at the workflow and see that, at the outcome and at the requirements, the spirit review is before the person confirms. | PASS | Setup `:84`: the writing is the workflow. Action `:86`: the agent reads that, at the outcome and at the requirements, the spirit review is before the person confirms. Observation `:88`: the workflow says that. If the check failed, there would be no such words, or the person would confirm before the spirit review. Those lines name no file, function, library, or mechanism. | |
| 5 | A person can point at the workflow and see that a finding waits for the person's answer before the step advances. | PASS | Setup `:92`: the writing is the workflow. Action `:94`: the agent reads that a finding waits for the person's answer before the step advances. Observation `:96`: the workflow says that. If the check failed, there would be no such words, or the step would advance while the finding has no answer from the person. Those lines name no file, function, library, or mechanism. | |
| 6 | A person can point at the workflow and see that, when the person says the change fits, the answer stays on the review and the letter decides the pass. | FAIL | Setup `:100`: the writing is the workflow. Action `:102`: the agent reads the full sentence, including "when the person says the change fits." Observation `:104`: the workflow says the answer stays on the review, and the letter decides the pass. A workflow that says those two things, and does not say they happen when the person says the change fits, meets that observation. The observation would be the same either way. Those lines name no file, function, library, or mechanism. | applied |
| 7 | A person can point at the workflow and see that, when the person amends the outcome or the requirements, the work returns to that step. | PASS | Setup `:108`: the writing is the workflow. Action `:110`: the agent reads that, when the person amends the outcome or the requirements, the work returns to that step. Observation `:112`: the workflow says that. If the check failed, there would be no such words, or the work would stay on the later step after that amendment. Those lines name no file, function, library, or mechanism. | |
| 8 | A person can point at the workflow and see that a spirit review with no finding does not ask the person. | PASS | Setup `:116`: the writing is the workflow. Action `:118`: the agent reads that a spirit review with no finding does not ask the person. Observation `:120`: the workflow says that. If the check failed, there would be no such words, or the workflow would ask the person when the spirit review has no finding. Those lines name no file, function, library, or mechanism. | |

**Decisions.** None included. This plan has no parent. The Offers of Review and of System record are none.

Left out. Ignoring any of these would not make this test design wrong.

- The person confirms the goal. The person accepts the result. Both are on `docs/01-processes/01-plan/00-plan.md`. The checks read the workflow. They do not confirm a goal, and they do not accept a result.
- A design is accepted before implementation starts. The plan file is removed once the record states what the goal said would be true. Same page. The checks do not start implementation, and they do not remove a plan.
- A plan does not state what is true of the project now. A plan is one piece of work, kept as a file in `docs/_plans/`. Same page. The checks observe the writing this piece produces. They do not state a current fact, and they do not depend on where the plan file is kept.
- A child project is edited only when asked. This project does not carry out a child project's work. Both are on `docs/00-project.md`. The checks do not edit a child project.
- Design is the written account of how a piece of work will be done. Implementation is the carrying out of a design. Same page. The checks use "design" as a step the acceptance names. They do not choose how that account is written or carried out.
- On `docs/01-processes/00-processes.md`: a failed row is repaired without asking the person; an agent who did not write the review makes the edit the row determines; the next review covers the rows that repair can change; the person is asked when the failed row does not determine one edit, or when the repair would change the outcome or the requirements. A smaller suggestion is a note the confirmed text does not require. It is recorded with no verdict. It does not hold the step. When a failed row is repaired, the repair also makes each suggestion that names one edit, and the review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied, the step advances, the suggestions stay on the review, and the person does not have to read them for the step to pass. Those facts govern a review that decides a pass, and the notes on that review. This test design checks the words about a spirit review. It does not repair a row, and it does not record a suggestion.
- On the same page: a design follows each decision previously made that directly affects this part. A review that decides a pass includes each such decision. A decision that does not directly affect this part is left out. A review that leaves out one that does does not pass. A review that passes shows that the work follows each included decision. This artifact is the test design. Those facts govern the design, and they govern this review. They do not require a passage in the test design. This review follows them by the rows above and by this note.

Smaller suggestions: none.

Findings:

Row 6 fails. The observation at `docs/_plans/18-when-spirit-review.md:104` is that the answer stays on the review and that the letter decides the pass. A workflow that says those two things, and does not say they happen when the person says the change fits, produces that same observation. The action at `:102` reads the full sentence. The observation does not treat the missing condition as a difference.

### Test design review, 2026-11-24

**Disposition:** pass

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| 6 | A person can point at the workflow and see that, when the person says the change fits, the answer stays on the review and the letter decides the pass. | PASS | Setup `docs/_plans/18-when-spirit-review.md:100`: the writing is the workflow. Action `:102`: the agent reads that, when the person says the change fits, the answer stays on the review and the letter decides the pass. Observation `:104`: the workflow says that full sentence. If the check failed, there would be no such words, or the workflow would say that the answer stays on the review and that the letter decides the pass without saying that this is when the person says the change fits. A workflow that says those two things without that condition does not meet the observation. Those lines name no file, function, library, or mechanism. | |

This review covers the repaired row.

**Decisions.** None included. This plan has no parent. The Offers of Review and of System record are none. The repaired observation would not be wrong if a decision the earlier review left out were ignored.

Smaller suggestions: none.
