# Agent Dispatcher — Maintenance Container

**Node ID:** `06-agent-dispatcher/99-maintenance`
**Node Kind:** maintenance-container
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** APPROVED
**Created:** 2026-06-12

This container holds maintenance rounds for the `06-agent-dispatcher` subtree. Per the maintenance-round playbook, this node carries `APPROVED` as its permanent operating state — it never advances past `APPROVED` and never re-cycles. The `06-agent-dispatcher` subtree parent may advance to and remain at `COMPLETE` regardless of this container's state.

---

## Children

| ID | Title | Status |
|----|-------|--------|
| `06-agent-dispatcher/99-maintenance/01-round-1` | SIGKILL escalation after SIGTERM on cancel | COMPLETE |
| `06-agent-dispatcher/99-maintenance/02-round-2` | Dispatcher–executor trivial polish (MCP config type, dispatch banner link, MutationErrorBody extraction, tool-contract reminder assertion, Mode A lifecycle decision) | COMPLETE |
