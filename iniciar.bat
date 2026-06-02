@echo off
echo.
echo   🍋 Tierra Prometida Trading — JARVIS Dashboard
echo   ─────────────────────────────────────────────
echo.

:: Backend Express en background
echo   [1/2] Iniciando backend (puerto 3001)...
start "TP-Backend" /min cmd /k "cd /d "%~dp0backend" && node server.js"
timeout /t 2 /nobreak >nul

:: Frontend Vite
echo   [2/2] Iniciando frontend (puerto 5173)...
echo.
echo   Abre http://localhost:5173 en el navegador
echo   ─────────────────────────────────────────────
echo.
cd /d "%~dp0"
npx vite
