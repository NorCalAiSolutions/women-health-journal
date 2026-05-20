@echo off
cd /d "%~dp0.."
echo Starting WHJC API server from:
cd
echo.
echo Node:
node -v
echo NPM:
npm -v
echo.
npm.cmd run dev -w @whjc/api
echo.
echo API server command exited with code %ERRORLEVEL%.
pause
