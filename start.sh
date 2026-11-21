#!/bin/bash
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Clean up any stale background processes on port 8000, 8001, 5173
fuser -k 8000/tcp 8001/tcp 5173/tcp 2>/dev/null || true
pkill -f "server.py" 2>/dev/null || true
pkill -f "live_sensei.py" 2>/dev/null || true

# 1. Build Frontend Distribution if missing or stale
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
  echo "📦 Building frontend distribution (npm run build)..."
  cd "$ROOT_DIR/frontend"
  npm run build
  cd "$ROOT_DIR"
fi

# Ensure static audio directory exists
mkdir -p "$ROOT_DIR/static/audio"

echo ""
echo "🌸 Starting Nihongo Sensei Unified Server (FastAPI + Uvicorn)..."
python3 server.py 8000 &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "🛑 Shutting down Nihongo Sensei..."
  kill $SERVER_PID 2>/dev/null || true
  fuser -k 8000/tcp 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

sleep 1

echo ""
echo "=================================================="
echo "🌸 Nihongo Sensei Unified Server is LIVE!"
echo "👉 Web App Interface:      http://localhost:8000"
echo "👉 Backend REST API:        http://localhost:8000/api"
echo "👉 Live Sensei WebSocket:  ws://localhost:8000/api/live/session"
echo "👉 Static / Lazy Audio:    http://localhost:8000/static/audio"
echo "=================================================="
echo "Press Ctrl+C to stop the server."
wait
