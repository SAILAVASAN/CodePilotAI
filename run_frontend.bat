@echo off
echo Starting DevCopilot Frontend Dev Server...
set PATH=C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.18.0-win-x64;%PATH%
cd frontend
if not exist node_modules (
    echo Installing frontend dependencies...
    call npm install
)
call npm run dev
pause
