@echo off
setlocal
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat ( echo [formtxt] backend venv missing, run formtxt.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMTXT_HOST set "FORMTXT_HOST=127.0.0.1"
if not defined FORMTXT_ENGINE_PORT set "FORMTXT_ENGINE_PORT=8210"
uvicorn app.main:app --reload --host %FORMTXT_HOST% --port %FORMTXT_ENGINE_PORT%
