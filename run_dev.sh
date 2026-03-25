#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MAMC Surge Simulator — Local Development Launcher
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "  ★  MAMC SURGE SIMULATOR — DEV LAUNCH"
echo "  Defense Health Agency · LSCO Planning Tool"
echo ""

# ── Backend ────────────────────────────────────────────────────────────────
echo "[1/2] Starting FastAPI backend on http://localhost:8000 ..."
cd backend
pip install -q -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# ── Wait for backend ────────────────────────────────────────────────────────
echo "      Waiting for backend to be ready..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "      Backend ready."
    break
  fi
  sleep 1
done

# ── Frontend ────────────────────────────────────────────────────────────────
echo "[2/2] Starting React frontend on http://localhost:3000 ..."
cd frontend
npm install --legacy-peer-deps --silent
REACT_APP_API_URL="" npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "  ✓  Dashboard:  http://localhost:3000"
echo "  ✓  API Docs:   http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop both services."
echo ""

# Trap Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
