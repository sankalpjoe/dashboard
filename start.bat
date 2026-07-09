@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js not found. Install it from https://nodejs.org/ then re-run.
    pause
    exit /b 1
)

if not exist ".env.local" (
    if exist ".env.example" (
        copy ".env.example" ".env.local" >nul
        echo Created .env.local - add your API keys there. Optional: APIFY_TOKEN enables web tweets.
    )
)

if not exist "frontend\node_modules" (
    echo Installing dependencies - first run may take a few minutes...
    pushd frontend
    call npm install
    popd
)

echo.
echo    1 = Web app      default, opens http://localhost:5174
echo    2 = Desktop app  native window, needs Rust
set /p choice="Choose 1 or 2 [default 1]: "
if "%choice%"=="2" goto desktop

echo.
echo Starting Web app at http://localhost:5174 - press Ctrl+C to stop.
start "" "http://localhost:5174"
cd /d "%~dp0frontend"
call npm run dev
goto keepopen

:desktop
where cargo >nul 2>nul
if errorlevel 1 (
    echo ERROR: Rust not found - the desktop app needs it.
    echo Run rustup-init.exe in this folder, or install from https://rustup.rs
    goto keepopen
)
echo Starting Desktop app - the first run compiles Rust, please be patient...
cd /d "%~dp0"
call npm run desktop:dev
goto keepopen

:keepopen
echo.
echo ==================================================================
echo  If you see errors above, copy them and send them over.
echo  This window will stay open.
echo ==================================================================
pause
endlocal
