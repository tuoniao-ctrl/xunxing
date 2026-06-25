@echo off
REM ============================================
REM  寻星 - 隧道地址更新脚本
REM  当网站打不开时运行此脚本
REM ============================================

cd /d "%~dp0"

echo [1/3] 获取当前隧道地址...
for /f "tokens=3" %%a in ('grep "lhr.life tunneled" logs\tunnel-out.log ^| tail -1') do set TUNNEL_URL=%%a
echo 当前隧道: https://%TUNNEL_URL%

if "%TUNNEL_URL%"=="" (
    echo ❌ 未能获取隧道地址，请检查 PM2 状态
    pause
    exit /b 1
)

echo [2/3] 更新前端代码...
powershell -Command "(Get-Content public\app.js) -replace 'const TUNNEL_URL = .*;', 'const TUNNEL_URL = ''https://%TUNNEL_URL%'';' | Set-Content public\app.js"
powershell -Command "(Get-Content public\admin.html) -replace 'const TUNNEL_URL = .*;', 'const TUNNEL_URL = ''https://%TUNNEL_URL%'';' | Set-Content public\admin.html"

echo [3/3] 重启服务...
call pm2 restart all

echo.
echo ================================================
echo  ✅ 更新完成！
echo  🌐 本地访问: http://localhost:3000
echo  🔗 公网地址: https://%TUNNEL_URL%
echo  ☁️ CloudStudio: https://dffdd3de3653422d8c5174c540531e23.app.codebuddy.work
echo.
echo  💡 提示: CloudStudio 页面上点 ⚙ 按钮可手动更新后端地址
echo ================================================
pause
