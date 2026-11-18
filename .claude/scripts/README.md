# Agent scripts

Small wrappers around recurring project operations. Allowlist entries live
in `.claude/settings.json`.

| Script | One-line |
|---|---|
| `sync-process [<path> ...]` | Copy `.ledger/process/*.md` to every registered child (or the named ones). Reports `ok` or `sync`. |
| `new-project <path> [--name NAME]` | Scaffold a child project: `docs/00-project.md`, `CLAUDE.md`, and a copy of the playbooks. Idempotent. |
| `lines <file> <start> [end]` | Print a numbered line range. |
| `doc-status [prefix]` | Table of node → lifecycle status under `docs/_nodes/`. |

Invoke as `.claude/scripts/<name>`.
