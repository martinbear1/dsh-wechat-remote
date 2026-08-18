@echo off
rem Harness Remote 微信版 · 重启 DSH 脚本（随插件安装）
rem 按 3080 端口精确停掉旧 DSH，再后台启动 dsh web —— 不误伤其他 Node 程序。
chcp 65001 >nul
echo [1/2] 停止旧 DSH（端口 3080）...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
echo [2/2] 后台启动 dsh web ...
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden cmd -ArgumentList '/c dsh web'"
timeout /t 8 /nobreak >nul
echo.
echo 完成！浏览器打开 http://127.0.0.1:3080
echo 侧边栏底部应有「微信连接」按钮。
echo 本窗口可以关闭。
pause
