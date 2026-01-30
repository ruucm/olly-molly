@echo off
setlocal

REM 1) update
call npx -y olly-molly@latest --update-only

REM 2) olly-molly (pm2)
cd /d "%USERPROFILE%\.olly-molly"
call pm2 start ecosystem.config.js

REM 3) caddy (새 창으로 백그라운드 실행)
start "" /D "%USERPROFILE%\Downloads\caddy" "caddy_windows_amd64.exe" run

REM 4) 모니터 (원하면)
start "" powershell -NoExit -Command "pm2 monit"
