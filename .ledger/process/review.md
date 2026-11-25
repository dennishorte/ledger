# Review

How a reviewer carries out a review from `plan-workflow.md`. That file names the rows for each step. `verification-signoff.md` is the matrix, the verdicts, and the only definition of `pass`.

The artifact is the work the step produced. A coordinating review reads the outcome, the decisions, and the order. A later review reads the test design, the tests, the design, or the implementation.

## The session

The author does not review. The review runs in a fresh session.

The session is given the artifact, the confirmed text the rows check against, and the rows for this step. The reviewer answers from the artifact. A verdict, a repair, or an account of the artifact does not answer a row.

## Earning a row

The reviewer answers every row for this step.

The evidence is a place in the artifact, a run and its result, or a quoted clause. It shows the thing the row asks about. A PASS cites that evidence. Evidence that does not show the question is a FAIL.

A thing the row requires and the artifact lacks is a FAIL. The evidence names the lack.

A check the reviewer could not run is N/A. The reason names the check that was not run. A row answered without using the artifact is FAIL.

The reviewer looks for a further defect. It is one the confirmed text already requires, and one that none of this step's rows asks about. That defect is a new row. The row states the question, the verdict, and the evidence. The reviewer adds no obligation. The person amends the outcome or the requirements, as `plan-workflow.md` says.

A note on wording, style, or another approach is part of the review when it is why a row fails. A smaller suggestion is a note the confirmed text does not require. The review records the suggestion in that review, outside the matrix, and the suggestion has no verdict. The suggestion does not hold the step, and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass.

## The defect

The reviewer writes the matrix into the plan's Reviews section. The reviewer does not change the artifact.

A failure names the row, what is wrong, and the evidence. The finding stops there. It contains no repair.

## Using the artifact

`plan-workflow.md` names the rows. This is the evidence that earns each one.

**Coordinating.** A sub-outcome row points at that piece in the parent outcome, and states the boundary that lets a person finish the piece alone. A decision row points at each piece the decision binds. An order row points at the dependency and states which piece finishes first, and why. An included decision is a decision previously made that directly affects this part. The evidence points at the part of the artifact that follows that decision. The row fails when that part is absent. A decision that does not directly affect this part is left out.

**Test design.** An acceptance-check row points at the setup, the action, and the observation in the test design. The evidence states what in the observation would differ if the check failed. The row fails when the observation would be the same either way. An included decision is a decision previously made that directly affects this part. The evidence points at the part of the artifact that follows that decision. The row fails when that part is absent. A decision that does not directly affect this part is left out.

**Tests.** The evidence for a test-design row is the run of that test. It states how the run is the missing behavior the test design named, or points at the note that explains behavior already present. The row fails when the test would pass with that behavior missing. An included decision is a decision previously made that directly affects this part. The evidence points at the part of the artifact that follows that decision. The row fails when that part is absent. A decision that does not directly affect this part is left out.

**Design.** An acceptance-check row points at the part of the design that serves it. A choice points at the check it serves. A decision row points at the part of the design that follows the decision. The row for unchanged tests points at the diff against the reviewed tests. An included decision is a decision previously made that directly affects this part. The evidence points at the part of the artifact that follows that decision. The row fails when that part is absent. A decision that does not directly affect this part is left out.

**Implementation.** The evidence for a test row is a passing run of that test. The unchanged-tests row and the unchanged-design row point at the diff against the reviewed versions. A decision row points at the part of the implementation that follows the decision. An included decision is a decision previously made that directly affects this part. The evidence points at the part of the artifact that follows that decision. The row fails when that part is absent. A decision that does not directly affect this part is left out.

## Spirit review

A spirit review is a written account. It reads the change, the spirit of the part that change changes, and the spirits of the parts above it. It does not read the record pages.

The review walks from the part the change changes up through the parts above it. It reads `spirit.md` beside the page of each part on that walk, when that file is beside the page. It does not read the record page.

The spirit chain is gathered by the skill `spirit-chain`.

A spirit review uses the spirit of the plan. The plan's spirit can be used to help make sure the plan matches the spirit of the project, and to help determine whether a spirit.md file needs to be created or updated. That use is not the pass. The letter decides the pass.

The review shows the change it read. It shows the spirit of the part that change changes, when it read that spirit. It shows the spirits of the parts above that part, when it read those spirits. What it shows it read is the change and the spirits it read. The record pages are not among what it shows it read.

The letter decides the pass. The letter is the facts on the record pages. The pass shows that the letter decided it. Finished work is still checked against the record. The spirit review does not decide the pass. The review does not accept finished work.

A spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent. The finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit.

A spirit review with no finding does not ask the person for an answer.
