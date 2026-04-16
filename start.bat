@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ====== FreeCode ======
echo.

python --version >nul 2>&1
if errorlevel 1 ( echo ERROR: Python not found. Install Python 3.10+ & pause & exit /b 1 )
node --version >nul 2>&1
if errorlevel 1 ( echo ERROR: Node.js not found. Install Node.js 18+ & pause & exit /b 1 )

if not exist venv (
    echo [setup] Creating Python virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

if not exist venv\Lib\site-packages\websockets (
    echo [setup] Installing Python dependencies...
    pip install -r requirements.txt
    if errorlevel 1 ( echo ERROR: pip install failed & pause & exit /b 1 )
)

if not exist web\node_modules (
    echo [setup] Installing Node dependencies...
    cd web && call npm install && cd ..
    if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )
)

echo Starting FreeCode...
start "FreeCode Backend"  cmd /k "cd /d %CD% && call venv\Scripts\activate && python -m backend.server"
timeout /t 2 /nobreak >nul
start "FreeCode Frontend" cmd /k "cd /d %CD%\web && npm run dev"

echo.
echo  Frontend:  http://localhost:3000
echo  Backend:   ws://localhost:8000
echo.
echo Press any key to close this window (servers keep running)
pause >nul
