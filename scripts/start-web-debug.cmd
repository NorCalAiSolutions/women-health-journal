@echo off
cd /d "%~dp0.."
echo Starting WHJC web server from:
cd
echo.
echo Node:
node -v
echo NPM:
npm -v
echo.
npm.cmd run dev -w @whjc/web
echo.
echo Web server command exited with code %ERRORLEVEL%.
pause
