@echo off
setlocal
cd /d "%~dp0..\frontend"
if not exist node_modules ( echo [formtxt] frontend packages missing, run formtxt.bat install & exit /b 1 )
call npm run build || exit /b 1
echo [formtxt] window built into frontend\dist
