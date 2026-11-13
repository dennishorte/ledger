# Review Process

**Node ID:** `14-review-process`
**Parent:** project root (`docs/00-project.md`)
**Status:** PLANNED
**Created:** 2026-11-13
**Last Updated:** 2026-11-13
**Dependencies:** `11-workflow-scripts`, `06-agent-dispatcher/04-prompt-templates`

---

## Requirements

**Requirements confirmed:** unconfirmed

**Outcome.** Spec review and implementation review are specified once, and the places that specify them agree.

**Acceptance.**

- The playbook, the workflow script, and the reviewer prompts judge a review the same way. Comparing them shows one definition. None of them carries its own list of verdict words.
- Both reviews follow the same steps. The review is written into the node before the status changes. A fix the review fully specifies is applied. The node advances only when every row passed.
- When a row is only partly met, both reviews stop for the operator, and the operator's decision is written on that row. When a row fails, the work is changed and that review runs again.
- The spec review still checks the design against the confirmed requirements. The implementation review still checks the code against the approved spec, including the build, lint, types, and tests.
- Review records already written on finished nodes keep the words they were written with.

**Constraints.**

- The operator's sign-off is still what marks a node complete.
- The operator may still skip spec review on a small spec they trust. Implementation review still cannot be skipped.
- No new lifecycle status.
- An amendment that adds an outcome still goes back through spec review.

**Out of scope.**

- Reviewing finished nodes again under the new rules.
- A task-runner gate that refuses to complete a node when no independent review ran.
- Changing how requirements are confirmed before design.

## Design

*(not started)*

## Decisions

*(not started)*

## Open Issues

*(not started)*

## Implementation Notes

*(not started)*

## Verification

The same checks as Acceptance.

- The playbook, the workflow script, and the reviewer prompts judge a review the same way. Comparing them shows one definition. None of them carries its own list of verdict words.
- Both reviews follow the same steps. The review is written into the node before the status changes. A fix the review fully specifies is applied. The node advances only when every row passed.
- When a row is only partly met, both reviews stop for the operator, and the operator's decision is written on that row. When a row fails, the work is changed and that review runs again.
- The spec review still checks the design against the confirmed requirements. The implementation review still checks the code against the approved spec, including the build, lint, types, and tests.
- Review records already written on finished nodes keep the words they were written with.

## Children

None.
