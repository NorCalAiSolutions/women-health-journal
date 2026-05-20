@echo off
start "WHJC API" cmd /k call "%~dp0start-api.cmd"
start "WHJC WEB" cmd /k call "%~dp0start-web.cmd"
echo Started Women Health Journal Companion dev servers.
echo Web: http://localhost:3000
echo API: http://localhost:4000
