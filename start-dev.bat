@echo off
chcp 65001 > nul
title LTC SYNC PRO Dev Server
echo ==========================================
echo  LTC SYNC PRO Local Development Server
echo ==========================================
echo.
echo Starting Vite server (accessible from local network)...
echo.

cd /d "%~dp0"
call npm run dev -- --host

pause
