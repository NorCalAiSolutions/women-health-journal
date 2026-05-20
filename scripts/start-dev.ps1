$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")

Start-Process powershell.exe -WorkingDirectory $root -ArgumentList @(
  "-NoExit",
  "-Command",
  "npm.cmd run dev -w @whjc/api"
)

Start-Process powershell.exe -WorkingDirectory $root -ArgumentList @(
  "-NoExit",
  "-Command",
  "npm.cmd run dev -w @whjc/web"
)

Write-Host "Started API and web dev servers in separate PowerShell windows."
Write-Host "Web: http://localhost:3000"
Write-Host "API: http://localhost:4000"
