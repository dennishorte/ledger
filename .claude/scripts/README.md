# Agent scripts

Small wrappers around recurring project operations. Each one exists because
the raw shell form was prompting Claude for permission on every invocation;
wrapping the operation lets a single narrow allowlist entry cover all uses.

Allowlist entries live in `.claude/settings.json`.

| Script | Replaces | One-line |
|---|---|---|
| `sync-process [<path> ...]` | manual per-project cp | push `.ledger/process/` updates to all registered child projects (or named ones). Reports `ok` (already current) vs `sync` (updated). |
| `new-project <path> --api-port N [--name NAME]` | manual `mkdir` + file authoring | scaffold a new ledger-managed project: creates `docs/00-project.md` template, `.ledger/project.json`, and a `dev.sh` that launches the API on the given port. Idempotent — existing files are skipped, not overwritten. |
| `api-curl [opts] /api/<path> [opts]` | raw `curl http://localhost:4180/api/...` for any local API call | thin curl passthrough restricted to localhost. `-j`/`--json` adds `-sS` + pipes through jq (the common GET-and-pretty case). Absolute URLs rejected. |
| `lines <file> <start> [end]` | `sed -n 'X,Yp' file` | print a numbered line range |
| `wait-ready [timeout]` | nested `until curl … ; do sleep 0.5; done` | block until the API (`LEDGER_PORT`, default 4180) answers 200 on `/api/_health` |
| `kill-port <port>` | `lsof -iTCP:PORT -sTCP:LISTEN -t \| xargs kill` | kill listeners only (won't kill a browser client) |
| `doc-status [prefix]` | grep `**Status:**` across `docs/**.md` | table of node → lifecycle status |
| `node-info {id\|path\|ls}` | `node -e "import('@ledger/parser')…"` | resolve doc paths ↔ node ids via the parser |
| `clean` | `rm -rf packages/parser/dist server/dist …` | remove TS build artifacts |

All scripts use absolute repo paths internally, so they work from any cwd
(including worktrees). Invoke as `.claude/scripts/<name>` to match the
allowlist patterns.
