@echo off
setlocal
cd /d "%~dp0.."
if not defined FORMTXT_ENGINE_PORT set "FORMTXT_ENGINE_PORT=8210"
start "formtxt engine" cmd /k "cd /d %cd%\backend && boot_backend.bat"
start "formtxt frontend" cmd /k "cd /d %cd%\frontend && boot_frontend.bat"
echo [formtxt] frontend http://localhost:5210 and engine http://127.0.0.1:%FORMTXT_ENGINE_PORT%
