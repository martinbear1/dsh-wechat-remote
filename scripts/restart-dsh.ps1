# Harness Remote DSH restart helper (ASCII for Windows PowerShell 5 compatibility).
# Stops only the process listening on port 3080, then starts dsh web in background.
# Usage: powershell -ExecutionPolicy Bypass -File restart-dsh.ps1

Write-Host '[1/2] Stopping the DSH process listening on port 3080...'
Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Write-Host '[2/2] Starting dsh web in the background...'
Start-Process -WindowStyle Hidden cmd -ArgumentList '/c dsh web'
Start-Sleep -Seconds 8
Write-Host 'Done. Open http://127.0.0.1:3080 and check the WeChat connection button.'
