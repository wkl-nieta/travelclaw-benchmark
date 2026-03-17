#!/bin/bash
# bench.sh — travelclaw benchmark runner
#
# Usage:
#   ./bench.sh [options]
#
# Options:
#   --repo    <owner/repo>   GitHub repo to benchmark (default: talesofai/travelclaw)
#   --branch  <branch>       Branch or PR ref to test (default: compact)
#   --rounds  <n>            Number of suggest→gen rounds (default: 10)
#   --char    <name>         Character name (default: read from SOUL.md)
#   --pic     <uuid>         Portrait UUID (default: read from SOUL.md)
#   --out     <dir>          Output directory (default: /tmp/tcbench)
#   --no-tunnel              Skip tunnel, just open locally
#   --no-open                Don't auto-open browser
#
# Examples:
#   ./bench.sh
#   ./bench.sh --branch main --rounds 20
#   ./bench.sh --repo talesofai/travelclaw --branch compact --char "可莉"

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REPO="talesofai/travelclaw"
BRANCH="compact"
ROUNDS=10
CHAR=""
PIC=""
OUT_DIR="/tmp/tcbench"
TUNNEL=true
AUTO_OPEN=true

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)     REPO="$2";   shift 2;;
    --branch)   BRANCH="$2"; shift 2;;
    --rounds)   ROUNDS="$2"; shift 2;;
    --char)     CHAR="$2";   shift 2;;
    --pic)      PIC="$2";    shift 2;;
    --out)      OUT_DIR="$2"; shift 2;;
    --no-tunnel) TUNNEL=false; shift;;
    --no-open)  AUTO_OPEN=false; shift;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

BENCH_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="/tmp/tcbench-target-$(echo $REPO | tr '/' '-')-${BRANCH}"
RESULTS_JSON="${OUT_DIR}/results_${BRANCH}_$(date +%Y%m%d_%H%M%S).json"
REPORT_HTML="${OUT_DIR}/report_${BRANCH}_$(date +%Y%m%d_%H%M%S).html"
SERVE_DIR="${OUT_DIR}/serve"

mkdir -p "$OUT_DIR" "$SERVE_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         travelclaw benchmark runner          ║"
echo "╚══════════════════════════════════════════════╝"
echo "  repo:    https://github.com/${REPO}"
echo "  branch:  ${BRANCH}"
echo "  rounds:  ${ROUNDS}"
echo ""

# ── Step 1: Clone / update target repo ───────────────────────────────────────
echo "📦 Setting up target: ${REPO}@${BRANCH}"

if [ -d "${TARGET_DIR}/.git" ]; then
  echo "  Updating existing clone..."
  git -C "$TARGET_DIR" fetch origin
  git -C "$TARGET_DIR" checkout "$BRANCH" 2>/dev/null || git -C "$TARGET_DIR" checkout -b "$BRANCH" origin/"$BRANCH"
  git -C "$TARGET_DIR" pull origin "$BRANCH" --ff-only 2>/dev/null || true
else
  echo "  Cloning..."
  git clone --branch "$BRANCH" --depth 1 "https://github.com/${REPO}.git" "$TARGET_DIR"
fi

TRAVEL_JS="${TARGET_DIR}/travel.js"
if [ ! -f "$TRAVEL_JS" ]; then
  echo "❌ travel.js not found in ${TARGET_DIR}"
  echo "   Checked: ${TRAVEL_JS}"
  exit 1
fi
echo "  ✓ travel.js found"

# ── Step 2: Copy NETA_TOKEN env if needed ─────────────────────────────────────
for envfile in "$HOME/.openclaw/workspace/.env" "$HOME/developer/clawhouse/.env"; do
  if [ -f "$envfile" ] && grep -q "NETA_TOKEN" "$envfile"; then
    cp "$envfile" "${TARGET_DIR}/.env" 2>/dev/null || true
    break
  fi
done

# ── Step 3: Run benchmark ─────────────────────────────────────────────────────
echo ""
echo "🏃 Running ${ROUNDS} rounds..."

CHAR_ARG=""
PIC_ARG=""
[ -n "$CHAR" ] && CHAR_ARG="--char \"${CHAR}\""
[ -n "$PIC"  ] && PIC_ARG="--pic \"${PIC}\""

node "${BENCH_DIR}/lib/run.mjs" \
  --travel "$TRAVEL_JS" \
  --rounds "$ROUNDS" \
  --out "$RESULTS_JSON" \
  ${CHAR:+--char "$CHAR"} \
  ${PIC:+--pic "$PIC"}

# ── Step 4: Generate HTML report ─────────────────────────────────────────────
echo ""
echo "📊 Generating report..."

node "${BENCH_DIR}/lib/report.mjs" \
  --results "$RESULTS_JSON" \
  --out "$REPORT_HTML" \
  --repo "$REPO" \
  --branch "$BRANCH" \
  ${CHAR:+--char "$CHAR"}

# Copy to serve dir as index.html (always latest)
cp "$REPORT_HTML" "${SERVE_DIR}/index.html"
echo "  ✓ Report: ${REPORT_HTML}"

# ── Step 5: Serve + tunnel ────────────────────────────────────────────────────
if [ "$AUTO_OPEN" = true ]; then
  open "$REPORT_HTML" 2>/dev/null || true
fi

if [ "$TUNNEL" = true ]; then
  echo ""
  echo "🌐 Starting tunnel..."

  # Kill any existing cloudflared tunnels on port 8787
  pkill -f "cloudflared.*8787" 2>/dev/null || true
  sleep 1

  # Start Python HTTP server in background
  pkill -f "python3.*8787" 2>/dev/null || true
  python3 -m http.server 8787 --directory "$SERVE_DIR" > /dev/null 2>&1 &
  HTTP_PID=$!
  sleep 1

  # Start cloudflared tunnel, capture URL
  TUNNEL_LOG="${OUT_DIR}/tunnel.log"
  cloudflared tunnel --url http://localhost:8787 > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  # Wait for URL to appear
  echo "  Waiting for tunnel URL..."
  TUNNEL_URL=""
  for i in $(seq 1 20); do
    TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
  done

  if [ -n "$TUNNEL_URL" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║  ✅ Benchmark complete!                       ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "  🔗 Public URL: ${TUNNEL_URL}"
    echo "  📄 Local:      ${REPORT_HTML}"
    echo "  📋 Results:    ${RESULTS_JSON}"
    echo ""
    echo "  (Ctrl+C to stop tunnel)"
    wait $TUNNEL_PID
  else
    echo "  ⚠️  Tunnel URL not found — serving locally only"
    echo "  📄 Report: ${REPORT_HTML}"
    kill $HTTP_PID 2>/dev/null || true
  fi
else
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║  ✅ Benchmark complete!                       ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "  📄 Report:   ${REPORT_HTML}"
  echo "  📋 Results:  ${RESULTS_JSON}"
fi
