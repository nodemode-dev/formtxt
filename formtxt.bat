@echo off
setlocal
set "FORMTXT_CALLER_DIR=%cd%"
cd /d "%~dp0"
set "CMD=%~1"
set "REST="
for /f "tokens=1,*" %%a in ("%*") do set "REST=%%b"
:dispatch
if "%CMD%"=="" set "CMD=boot"
if /i "%CMD%"=="boot" ( call setup\boot_all.bat %REST% & goto :eof )
if /i "%CMD%"=="dev" ( call setup\boot_all.bat %REST% & goto :eof )
if /i "%CMD%"=="install" ( call setup\install_all.bat %REST% & goto :eof )
if /i "%CMD%"=="backend" ( call backend\boot_backend.bat %REST% & goto :eof )
if /i "%CMD%"=="frontend" ( call frontend\boot_frontend.bat %REST% & goto :eof )
if /i "%CMD%"=="build" ( pushd frontend & call npm run build & popd & goto :eof )
if /i "%CMD%"=="cli" ( python setup\catalogue.py %REST% & goto :eof )
if /i "%CMD%"=="mcp" ( python setup\mcp_stdio.py %REST% & goto :eof )
if /i "%CMD%"=="agents" ( python setup\agents.py %REST% & goto :eof )
if /i "%CMD%"=="mcpb" goto :mcpb
if /i "%CMD%"=="install-desktop" ( call setup\install_desktop.bat %REST% & goto :eof )
if /i "%CMD%"=="freeze" ( call setup\freeze_backend.bat %REST% & goto :eof )
if /i "%CMD%"=="desktop" goto :desktop
echo usage: formtxt.bat [boot^|install^|backend^|frontend^|build^|cli^|mcp^|agents^|mcpb^|install-desktop^|freeze^|desktop build]
exit /b 2
:mcpb
set "SUB=check"
set "SUBREST="
for /f "tokens=1,*" %%a in ("%REST%") do (set "SUB=%%a" & set "SUBREST=%%b")
if /i "%SUB%"=="check" ( python setup\mcpb.py --check & goto :eof )
if /i "%SUB%"=="build" ( python setup\mcpb.py --build %SUBREST% & goto :eof )
echo usage: formtxt.bat mcpb check ^| build DIR
exit /b 2
:desktop
set "SUB=build"
set "SUBREST="
for /f "tokens=1,*" %%a in ("%REST%") do (set "SUB=%%a" & set "SUBREST=%%b")
if /i "%SUB%"=="build" ( call setup\desktop_build.bat %SUBREST% & goto :eof )
if /i "%SUB%"=="dev" ( echo [formtxt] desktop dev runs from Git Bash: ./formtxt desktop dev & exit /b 2 )
echo usage: formtxt.bat desktop build [tauri build options]
exit /b 2
