@echo off
chcp 65001 > nul
title Phone-TC Local Dev Server

echo ===================================================
echo  Phone-TC ローカル開発サーバー起動スクリプト
echo ===================================================
echo.

:: プロジェクトディレクトリへ移動
cd /d "C:\Users\ababg\Documents\antigravity\Phone-TC-main"

:: node_modules が存在しない場合は npm install を実行
if not exist "node_modules\" (
    echo [INFO] node_modules が見つかりません。依存関係をインストールしています...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install に失敗しました。
        pause
        exit /b 1
    )
)

echo.
echo [INFO] 開発サーバーを起動します...
echo サーバー起動後、ブラウザで https://localhost:5173 にアクセスしてください。
echo (※ @vitejs/plugin-basic-ssl が有効なため、https:// になります)
echo.

:: 開発サーバーを起動
call npm run dev

pause
