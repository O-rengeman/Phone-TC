@echo off
title Phone-TC Local Dev Server

echo ===================================================
echo  Phone-TC Local Development Server Start Script
echo ===================================================
echo.

:: Go to project directory
cd /d "C:\Users\ababg\Documents\antigravity\Phone-TC-main"

:: Install dependencies if node_modules does not exist
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Starting development server...
echo Please access: https://localhost:5173
echo.

:: Run development server
call npm run dev

pause
