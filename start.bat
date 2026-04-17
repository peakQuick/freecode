@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   FREECODE - Agentic Coding Assistant
echo ========================================
echo.

:: -- Ports --
set FC_BACKEND_PORT=47820
set FC_FRONTEND_PORT=47821

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
    pip install -r requirements.txt >nul 2>&1
)

if not exist frontend\node_modules (
    echo [setup] Installing Node dependencies...
    cd frontend && call npm install --silent >nul 2>&1 && cd ..
)

:: Write .env.local so NEXT_PUBLIC vars are baked into the build
echo NEXT_PUBLIC_BACKEND_URL=ws://localhost:%FC_BACKEND_PORT%> frontend\.env.local
echo NEXT_PUBLIC_FRONTEND_PORT=%FC_FRONTEND_PORT%>> frontend\.env.local

:: Create logs directory
if not exist logs mkdir logs

:: Build frontend
echo [1/4] Building Frontend (production)...
cd frontend
call npm run build > ..\logs\build.log 2>&1
if errorlevel 1 (
    echo [ERROR] Build failed. Check logs/build.log for details.
    cd ..
    pause
    exit /b 1
)
cd ..

:: Hand off to PowerShell for process management (avoids cmd pipe-escaping issues)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run_services.ps1" ^
    -BackendPort %FC_BACKEND_PORT% ^
    -FrontendPort %FC_FRONTEND_PORT%

echo.
echo Done! FreeCode is running.
echo   UI:      http://localhost:%FC_FRONTEND_PORT%
echo   Backend: ws://localhost:%FC_BACKEND_PORT%
echo   Logs:    logs/backend.log, logs/frontend.log, logs/build.log
echo.
timeout /t 3 /nobreak >nul
exit
