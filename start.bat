@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   FREECODE — Agentic Coding Assistant
echo ========================================
echo.

:: Basic checks
python --version >nul 2>&1
if errorlevel 1 ( echo [ERROR] Python not found. & pause & exit /b 1 )
node --version >nul 2>&1
if errorlevel 1 ( echo [ERROR] Node.js not found. & pause & exit /b 1 )

:: Setup
if not exist venv (
    echo [setup] Creating Python virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

if not exist venv\Lib\site-packages\webview (
    echo [setup] Installing Python dependencies...
    pip install -r requirements.txt
)

if not exist frontend\node_modules (
    echo [setup] Installing Node dependencies...
    cd frontend && call npm install && cd ..
)

:: Build and Server Startup
echo [1/4] Building Frontend (production)...
cd frontend
call npm run build > ..\build.log 2>&1
if errorlevel 1 (
    echo [ERROR] Build failed. Check build.log for details.
    cd ..
    pause
    exit /b 1
)

echo [2/4] Starting Backend (silent)...
cd ..
start /b "" venv\Scripts\python.exe -m backend.server > backend.log 2>&1

echo [3/4] Starting Frontend (silent)...
cd frontend
start /b "" cmd /c "npm run start > ..\frontend.log 2>&1"
cd ..

:: Wait for initialization
echo [4/4] Waiting for servers to warm up...
timeout /t 5 /nobreak >nul

:: Launch WebView
echo.
echo Launching GUI...
start "" venv\Scripts\python.exe scripts\run_webview.py

echo.
echo Done! FreeCode is now running in its own window.
echo  - Logs available in backend.log, frontend.log, and build.log
echo.
timeout /t 3 /nobreak >nul
exit
