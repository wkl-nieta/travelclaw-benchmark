# travelclaw-benchmark

General-purpose benchmark for [travelclaw](https://github.com/talesofai/travelclaw) — tests any branch or PR by running N rounds of `suggest → gen`, generating an HTML report, and serving it via a public Cloudflare tunnel.

## Usage

```bash
./bench.sh [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--repo <owner/repo>` | `talesofai/travelclaw` | GitHub repo to test |
| `--branch <branch>` | `compact` | Branch or PR ref |
| `--rounds <n>` | `10` | Number of suggest→gen rounds |
| `--char <name>` | from SOUL.md | Character name |
| `--pic <uuid>` | from SOUL.md | Portrait picture UUID |
| `--out <dir>` | `/tmp/tcbench` | Output directory |
| `--no-tunnel` | — | Skip tunnel, local only |
| `--no-open` | — | Don't auto-open browser |

## Examples

```bash
# Default: 10 rounds on compact branch
./bench.sh

# Test a specific branch with 20 rounds
./bench.sh --branch main --rounds 20

# Test a PR branch with explicit character
./bench.sh --branch my-feature-branch --char "可莉" --rounds 5

# No tunnel, just generate report
./bench.sh --no-tunnel
```

## What it does

1. **Clones/updates** the target repo+branch to `/tmp/tcbench-target-*`
2. **Runs** N rounds of `travel suggest → travel gen` via the branch's own `travel.js`
3. **Generates** an HTML report with stats + all generated images
4. **Serves** the report on `localhost:8787` + opens a Cloudflare tunnel → public URL

## Requirements

- Node.js
- `cloudflared` — for public tunnel (`brew install cloudflare/cloudflare/cloudflared`)
- `NETA_TOKEN` in `~/.openclaw/workspace/.env` or `~/developer/clawhouse/.env`
- `SOUL.md` in default location, or pass `--char` + `--pic` explicitly

## Output

```
/tmp/tcbench/
├── results_<branch>_<timestamp>.json   # raw results
├── report_<branch>_<timestamp>.html    # full report with images
└── serve/index.html                    # latest report (served via tunnel)
```

## CI / automated use

```bash
# Run without tunnel, capture report path
./bench.sh --branch compact --rounds 5 --no-tunnel --no-open
ls /tmp/tcbench/report_*.html
```
