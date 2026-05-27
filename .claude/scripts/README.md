# Agent scripts

Small wrappers around recurring project operations. Each one exists because
the raw shell form was prompting Claude for permission on every invocation;
wrapping the operation lets a single narrow allowlist entry cover all uses.

Allowlist entries live in `.claude/settings.json`.

| Script | Replaces | One-line |
|---|---|---|
| `api <path>` | `curl http://127.0.0.1:4180/api/...` (+ `jq`/`python -m json.tool`) | GET a local API endpoint, pretty-print JSON |
| `lines <file> <start> [end]` | `sed -n 'X,Yp' file` | print a numbered line range |
| `wait-ready [timeout]` | nested `until curl … ; do sleep 0.5; done` | block until UI :4179 AND API :4180 are 200 |
| `kill-port <port>` | `lsof -iTCP:PORT -sTCP:LISTEN -t \| xargs kill` | kill listeners only (won't kill a browser client) |
| `doc-status [prefix]` | grep `**Status:**` across `docs/**.md` | table of node → lifecycle status |
| `node-info {id\|path\|ls}` | `node -e "import('@ledger/parser')…"` | resolve doc paths ↔ node ids via the parser |
| `clean` | `rm -rf packages/parser/dist server/dist …` | remove TS build artifacts |

All scripts use absolute repo paths internally, so they work from any cwd
(including worktrees). Invoke as `.claude/scripts/<name>` to match the
allowlist patterns.
