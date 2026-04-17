#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "====== FreeCode ======"
echo ""

# ── Ports (non-default to avoid conflicts) ─────────────────────────────────
FC_BACKEND_PORT=47820
FC_FRONTEND_PORT=47821

PYTHON=$(command -v python3 || command -v python)
[ -z "$PYTHON" ] && echo "ERROR: Python 3 not found." && exit 1
command -v node &>/dev/null || { echo "ERROR: Node.js not found."; exit 1; }

if [ ! -d venv ]; then
    echo "[setup] Creating Python virtual environment..."
    $PYTHON -m venv venv
fi

if   [ -f venv/bin/activate ];     then source venv/bin/activate
elif [ -f venv/Scripts/activate ]; then source venv/Scripts/activate
else echo "ERROR: Could not activate venv." && exit 1
fi

# Use the virtual environment Python for the rest of this script.
PYTHON=$(command -v python)

if ! "$PYTHON" -c "import websockets, webview, qtpy, PyQt6.QtWebEngineCore" &>/dev/null; then
    echo "[setup] Installing Python dependencies..."
    "$PYTHON" -m pip install -q -r requirements.txt || exit 1
fi

if [ ! -d frontend/node_modules ]; then
    echo "[setup] Installing Node dependencies..."
    cd frontend && npm install --silent >/dev/null 2>&1 || exit 1
    cd ..
fi

if [ ! -d frontend/.next ]; then
    echo "[setup] Building frontend..."
    (cd frontend && npm run build) || exit 1
fi

# Write .env.local so NEXT_PUBLIC vars are baked into the production build
cat > frontend/.env.local <<EOF
NEXT_PUBLIC_BACKEND_URL=ws://localhost:${FC_BACKEND_PORT}
NEXT_PUBLIC_FRONTEND_PORT=${FC_FRONTEND_PORT}
EOF

# Cleanup any previous instances on our ports
fuser -k ${FC_BACKEND_PORT}/tcp 2>/dev/null || true
fuser -k ${FC_FRONTEND_PORT}/tcp 2>/dev/null || true

cleanup() {
    echo ""; echo "Stopping FreeCode..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
}
trap cleanup SIGINT SIGTERM

# Create logs directory
mkdir -p logs

echo "Starting FreeCode..."

export FC_BACKEND_PORT
"$PYTHON" -m backend.server > logs/backend.log 2>&1 &
BACKEND_PID=$!
sleep 2

(cd frontend && npm start -- -p ${FC_FRONTEND_PORT}) > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

echo ""
echo "Launching FreeCode window..."
"$PYTHON" scripts/run_webview.py

cleanup
exit 0
