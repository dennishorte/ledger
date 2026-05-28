# Agent scripts

Small wrappers around recurring project operations. Each one exists because
the raw shell form was prompting Claude for permission on every invocation;
wrapping the operation lets a single narrow allowlist entry cover all uses.

Allowlist entries live in `.claude/settings.json`.

| Script | Replaces | One-line |
|---|---|---|
| `api-curl [opts] /api/<path> [opts]` | raw `curl http://localhost:4180/api/...` for any local API call | thin curl passthrough restricted to localhost. `-j`/`--json` adds `-sS` + pipes through jq (the common GET-and-pretty case). `--via-ui` swaps port from API (4180) → Vite (4179) for endpoints served by Vite middleware (e.g. `/api/transcripts/*`). Absolute URLs rejected. |
| `ui-curl [opts] /<path> [opts]` | raw `curl http://localhost:4179/...` for any UI-route request | sibling of `api-curl` targeting the Vite UI on 4179 (`LEDGER_UI_PORT`). Accepts any route Vite serves (`/`, `/tasks`, `/dag`, `/logs/<id>`, `/assets/...`). `-j`/`--json` works for routes that happen to return JSON. Absolute URLs rejected. |
| `lines <file> <start> [end]` | `sed -n 'X,Yp' file` | print a numbered line range |
| `wait-ready [timeout]` | nested `until curl … ; do sleep 0.5; done` | block until UI :4179 AND API :4180 are 200 |
| `kill-port <port>` | `lsof -iTCP:PORT -sTCP:LISTEN -t \| xargs kill` | kill listeners only (won't kill a browser client) |
| `doc-status [prefix]` | grep `**Status:**` across `docs/**.md` | table of node → lifecycle status |
| `node-info {id\|path\|ls}` | `node -e "import('@ledger/parser')…"` | resolve doc paths ↔ node ids via the parser |
| `clean` | `rm -rf packages/parser/dist server/dist …` | remove TS build artifacts |

All scripts use absolute repo paths internally, so they work from any cwd
(including worktrees). Invoke as `.claude/scripts/<name>` to match the
allowlist patterns.
