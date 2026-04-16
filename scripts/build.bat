@echo off
setlocal
cd /d "%~dp0.."

echo.
echo ========================================
echo   FREECODE — Production Build
echo ========================================
echo.

if not exist "web\package.json" (
    echo [ERROR] web folder not found!
    pause & exit /b 1
)

echo [1/3] Installing frontend dependencies...
cd web && call npm install --quiet && cd ..

echo [2/3] Installing backend dependencies...
python -m pip install -q -r requirements.txt

echo [3/3] Building production bundle...
cd web && call npm run build && cd ..

echo.
echo ========================================
echo   BUILD COMPLETE — run scripts\run.bat
echo ========================================
echo.
pause
