@echo off
setlocal
set "URL=http://localhost:5174"

echo Launching Intelligence Dashboard in standalone mode...

:: Try to find Google Chrome
set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" --app=%URL% --window-size=1280,800
    exit /b
)

:: Try to find Microsoft Edge (Fallback)
set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_PATH%" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_PATH%" (
    start "" "%EDGE_PATH%" --app=%URL% --window-size=1280,800
    exit /b
)

:: Fallback to default browser if neither is found at standard paths
echo Chrome/Edge not found at standard paths. Launching in default browser...
start %URL%

endlocal
