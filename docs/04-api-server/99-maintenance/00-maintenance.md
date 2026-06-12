# API Server Maintenance Rounds

**Node ID:** `04-api-server/99-maintenance`
**Node Kind:** maintenance-container
**Parent:** `04-api-server` (`docs/04-api-server/00-api-server.md`)
**Status:** APPROVED
**Created:** 2026-06-12

---

## Requirements

Container for batched fixes to accumulated Open Issues across the `04-api-server` subtree's COMPLETE leaves. The mechanism and rationale are defined once in `.ledger/process/maintenance-round.md`; this doc holds the rounds manifest and nothing else procedural.

Each round is a leaf that runs the full DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE lifecycle. Rounds are operator-triggered when a curated punch list of MEDIUM/LOW/TRIVIAL items across siblings reaches round-worth size (≥2 items from ≥2 siblings). HIGH-priority issues route through `leaf-workflow.md` §8b on the originating leaf, never a round.

### Out of scope

- Procedural definition of the round workflow — owned by `.ledger/process/maintenance-round.md`.
- Cross-subtree maintenance — each subtree owns its own `99-maintenance/`. The `04-api-server` rounds touch only files within the `04-api-server` source tree (`server/src/`, `packages/parser/src/`, `app/src/components/dag/useDocGraph.ts`, `app/src/components/docs/useDocSource.ts`, `app/src/components/health/useHealthData.ts`, and related test files).
- Re-cycling a completed round through ISSUE_OPEN — new findings go into the next round (per playbook §1 "Where rounds live").

---

## Design

This doc is a thin container. Every round is a sibling under this directory with its own complete spec. The children manifest below grows by one row per round and never shrinks — completed rounds stay visible as durable provenance.

Round numbering is sequential (`01-ui-hook-migration`, `02-round-2`, …). Per-round Status mirrors the round doc's own header.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | This parent doc starts at `APPROVED` and stays there permanently. | No implementation work belongs to the parent; it is a structural container. The lifecycle gates apply to each round, not the container. Per PRD §6.2, a `maintenance-container` is exempt from the parent-completion predicate — `APPROVED` is its steady operating state, not a pre-implementation stall, and it does not block its parent (`04-api-server`) from reaching or remaining at `COMPLETE`. |
| D2 | Rounds are numbered with two-digit zero-padded prefixes with a descriptive slug (`01-ui-hook-migration`, `02-...`). | Descriptive slugs communicate the round's theme without reading the doc. Zero-padded prefix keeps `ls` output sorted. |

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
| `04-api-server/99-maintenance/01-ui-hook-migration` | Migrate useDocSource and useHealthData from build-time glob to live API | `04-api-server/03-server-package` COMPLETE | DRAFT |
