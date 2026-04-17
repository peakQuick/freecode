@echo off
setlocal
cd /d "%~dp0.."

echo.
echo ========================================
echo   FREECODE — Production Build
echo ========================================
echo.

if not exist "frontend\package.json" (
    echo [ERROR] frontend folder not found!
    pause & exit /b 1
)

set FC_BACKEND_PORT=47820
set FC_FRONTEND_PORT=47821

echo [1/3] Installing frontend dependencies...
cd frontend && call npm install --quiet --silent >nul 2>&1 && cd ..

echo NEXT_PUBLIC_BACKEND_URL=ws://localhost:%FC_BACKEND_PORT%> frontend\.env.local
echo NEXT_PUBLIC_FRONTEND_PORT=%FC_FRONTEND_PORT%>> frontend\.env.local

echo [2/3] Installing backend dependencies...
python -m pip install -q -r requirements.txt

echo [3/3] Building production bundle...
cd frontend && call npm run build && cd ..

echo.
echo ========================================
echo   BUILD COMPLETE — run scripts\run.bat
echo ========================================
echo.
pause
