@echo off
title Phone-TC Dev Server
echo ==========================================
echo  Phone-TC Local Development Server
echo ==========================================
echo.
echo Starting Vite server...
echo.

cd /d "%~dp0"
call npm run dev

pause
