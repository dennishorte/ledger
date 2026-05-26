# UI Maintenance Rounds

**Node ID:** `01-ui/99-maintenance`
**Parent:** `01-ui`
**Status:** APPROVED
**Created:** 2026-05-26
**Last Updated:** 2026-05-26

---

## Requirements

Container for batched fixes to accumulated Open Issues across the `01-ui` subtree's COMPLETE leaves. The mechanism and rationale are defined once in [`docs/process/maintenance-round.md`](../../process/maintenance-round.md); this doc holds the rounds manifest and nothing else procedural.

Each round is a leaf that runs the full DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE lifecycle. Rounds are operator-triggered when a curated punch list of MEDIUM/LOW/TRIVIAL items across siblings reaches round-worth size (≥2 items from ≥2 siblings). HIGH-priority issues route through `leaf-workflow.md` §8b on the originating leaf, never a round.

### Out of scope

- Procedural definition of the round workflow — owned by `docs/process/maintenance-round.md`.
- Cross-subtree maintenance — each subtree owns its own `99-maintenance/`. The `01-ui` rounds touch only files under the `01-ui` source tree (`app/src/components/{dag,docs,tasks,logs,health,...}/`, `app/src/lib/`, `app/src/styles/`, and panel routes).
- Re-cycling a completed round through ISSUE_OPEN — new findings go into the next round (per playbook §1 "Where rounds live").

---

## Design

This doc is a thin container. Every round is a sibling under this directory with its own complete spec. The children manifest below grows by one row per round and never shrinks — completed rounds stay visible as durable provenance.

Round numbering is sequential (`01-round-1`, `02-round-2`, …). Per-round Status mirrors the round doc's own header.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | This parent doc starts at `APPROVED` rather than `DRAFT`. | No implementation work belongs to the parent; it is a structural container. The lifecycle gates apply to each round, not the container. |
| D2 | Rounds are numbered with two-digit zero-padded prefixes (`01-round-1`, `02-round-2`). | Matches sibling naming convention across the rest of `docs/`, keeps `ls` output sorted, and reserves room for ≥10 rounds before the format needs revisiting. |

---

## Open Issues

*(none — this doc is a container, not an implementation node)*

---

## Implementation Notes

*(none — no implementation work attaches to the container)*

---

## Verification

*(none — verification belongs to each round)*

---

## Children

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-round-1` | First maintenance round across `01-ui` COMPLETE leaves | sibling COMPLETE leaves under `01-ui` | DRAFT (2026-05-26) |
