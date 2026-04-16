#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "====== FreeCode ======"
echo ""

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

if ! pip show websockets &>/dev/null; then
    echo "[setup] Installing Python dependencies..."
    pip install -r requirements.txt || exit 1
fi

if [ ! -d frontend/node_modules ]; then
    echo "[setup] Installing Node dependencies..."
    cd frontend && npm install || exit 1
    cd ..
fi

cleanup() {
    echo ""; echo "Stopping FreeCode..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

echo "Starting FreeCode..."
$PYTHON -m backend.server &
BACKEND_PID=$!
sleep 2
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   ws://localhost:8000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

wait $BACKEND_PID $FRONTEND_PID
