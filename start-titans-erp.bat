@echo off
setlocal
title Titans ERP
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22.13 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies - this only happens the first time...
  call npm install
  if errorlevel 1 goto :failed
)

if not exist "client\dist\index.html" (
  echo Building Titans ERP...
  call npm run build
  if errorlevel 1 goto :failed
)

echo.
echo Starting Titans ERP on http://localhost:4000
echo Login: titanswindows1@gmail.com / Titans@123
echo Close this window to stop the server.
echo.
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:4000"
node --disable-warning=ExperimentalWarning server\index.js
goto :eof

:failed
echo.
echo Something went wrong. See the messages above.
pause
exit /b 1
