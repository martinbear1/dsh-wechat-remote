# Harness Remote 微信版 · 重启 DSH 脚本（PowerShell 版，随插件安装）
# 按 3080 端口精确停掉旧 DSH，再后台启动 dsh web —— 不误伤其他 Node 程序。
# 用法：powershell -ExecutionPolicy Bypass -File restart-dsh.ps1

Write-Host '[1/2] 停止旧 DSH（端口 3080）...'
Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Write-Host '[2/2] 后台启动 dsh web ...'
Start-Process -WindowStyle Hidden cmd -ArgumentList '/c dsh web'
Start-Sleep -Seconds 8
Write-Host '完成！浏览器打开 http://127.0.0.1:3080（侧边栏底部应有「微信连接」按钮）。'
