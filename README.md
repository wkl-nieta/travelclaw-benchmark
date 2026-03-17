# travelclaw-benchmark

General-purpose benchmark for [travelclaw](https://github.com/talesofai/travelclaw) — tests any branch or PR by running N rounds of `suggest → gen`, generating an HTML report, and serving it via a public Cloudflare tunnel.

**Quick start (5 rounds recommended):**
```bash
./bench.sh --rounds 5
```

> 💡 **Agent tip:** If a round fails, patch the issue and re-run. The benchmark is designed to be run iteratively — keep running until all rounds pass. Image generation failures (~10–20%) are expected and normal due to server-side content moderation; they are not bugs in the code.

---

## Usage

```bash
./bench.sh [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--repo <owner/repo>` | `talesofai/travelclaw` | GitHub repo to test |
| `--branch <branch>` | `compact` | Branch or PR ref |
| `--rounds <n>` | `10` | Number of suggest→gen rounds (start with 5) |
| `--char <name>` | from SOUL.md | Character name |
| `--pic <uuid>` | from SOUL.md | Portrait picture UUID |
| `--out <dir>` | `/tmp/tcbench` | Output directory |
| `--no-tunnel` | — | Skip tunnel, local only |
| `--no-open` | — | Don't auto-open browser |

## Examples

```bash
# Recommended starting point: 5 rounds on compact branch
./bench.sh --rounds 5

# Default: 10 rounds
./bench.sh

# Test a specific branch
./bench.sh --branch main --rounds 10

# Test a PR branch with explicit character
./bench.sh --branch my-feature-branch --char "可莉" --rounds 5

# No tunnel, just generate report
./bench.sh --no-tunnel
```

## What it does

1. **Clones/updates** the target repo+branch to `/tmp/tcbench-target-*`
2. **Reads** character from SOUL.md (or `--char` / `--pic` flags)
3. **Runs** N rounds of `travel suggest → travel gen` via the branch's own `travel.js`
4. **Generates** an HTML report with stats + all generated images
5. **Serves** the report on `localhost:8787` + opens a Cloudflare tunnel → public URL

## Understanding results

| Result | Meaning |
|--------|---------|
| `suggest SUCCESS` | Destination picked from `scenes.json` (ref) or live API |
| `gen SUCCESS` | Image generated and URL returned |
| `gen FAILURE` | Server-side generation failed — **normal, not a code bug** (~10–20% rate) |
| `gen TIMEOUT` | Generation exceeded 3 min — retry or check token |
| `soul ERROR` | SOUL.md missing or wrong field name — fix before retrying |

**Image generation failures are expected.** The Neta platform occasionally rejects prompts due to content moderation or server load. A 70–90% success rate across 10 rounds is healthy. If success rate drops below 50%, investigate the prompt/vtoken construction.

## Agent workflow — auto-patch until it works

When running as an agent benchmark, follow this loop:

```
1. Run ./bench.sh --rounds 5
2. Check results:
   - soul ERROR → fix SOUL.md field names or run adopt
   - suggest ERROR → check NETA_TOKEN
   - gen FAILURE > 50% → inspect stderr vtokens/TCP logs, patch travel.js
   - gen FAILURE ≤ 30% → acceptable, continue
3. If code changes made → commit patch → re-run
4. Repeat until ≥ 70% success rate on 5 rounds
5. Then run full 10 rounds for final report
```

## Requirements

- Node.js
- `NETA_TOKEN` in `~/.openclaw/workspace/.env` or `~/developer/clawhouse/.env`
- `SOUL.md` in default location, or pass `--char` + `--pic` explicitly
- `cloudflared` — for public tunnel (see setup below; falls back gracefully if missing)

## Cloudflare tunnel setup

The tunnel serves your HTML report publicly via a random `*.trycloudflare.com` URL.
**No account, no login, no admin rights needed** — just a single static binary.

### Option A — Homebrew (macOS, if you have it)

```bash
brew install cloudflare/cloudflare/cloudflared
```

### Option B — Direct binary download (no install, lowest permissions)

Download the binary once into `/tmp` or `~/bin` — the benchmark auto-detects both paths.

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64 \
  -o /tmp/cloudflared && chmod +x /tmp/cloudflared
```

**macOS (Intel):**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64 \
  -o /tmp/cloudflared && chmod +x /tmp/cloudflared
```

**Linux (amd64):**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /tmp/cloudflared && chmod +x /tmp/cloudflared
```

> `/tmp/cloudflared` is picked up automatically by `bench.sh` — no PATH change needed.
> To persist across reboots, use `~/bin/cloudflared` instead.

### Why this is safe

- **No account required** — uses Cloudflare's free Quick Tunnels, anonymous and ephemeral
- **No system modification** — binary lives in `/tmp` or `~/bin`, never touches system dirs
- **Outbound-only** — opens a single outbound HTTPS connection to Cloudflare; no inbound ports opened on your machine
- **Read-only traffic** — tunnel only serves the static HTML report
- **URL is random and temporary** — new URL per run, expires when the process stops

## SOUL.md compatibility

`travel.js soul` accepts both field name variants:

```markdown
- **名字**: 可莉          ← standard format
- **角色名**: 纳西妲       ← alternate format (also supported)
```

Character names with parenthetical suffixes are automatically cleaned:
- `纳西妲 (小吉祥草王)` → searches TCP as `纳西妲`
- `可莉（龙虾化）` → searches TCP as `可莉`

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

## Tested against

| Repo/Branch | Rounds | Success Rate | Avg Gen |
|-------------|--------|-------------|---------|
| [talesofai/travelclaw@compact](https://github.com/talesofai/travelclaw/tree/compact) | 10 | 90% | 58s |
