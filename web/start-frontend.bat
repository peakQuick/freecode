@echo off
REM Start the Next.js frontend

cd /d "%~dp0"

echo Starting Gemma-Fun Frontend...
echo.
echo The app will open at http://localhost:3000
echo Make sure the backend is running (start-backend.bat)
echo.

npm run dev

pause
