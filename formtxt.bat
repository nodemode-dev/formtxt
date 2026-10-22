@echo off
setlocal
set "FORMTXT_CALLER_DIR=%cd%"
cd /d "%~dp0"
set "CMD=%~1"
set "REST="
:collect
shift
if "%~1"=="" goto :dispatch
set REST=%REST% %1
goto :collect
:dispatch
if "%CMD%"=="" set "CMD=boot"
if /i "%CMD%"=="boot" ( call setup\boot_all.bat %REST% & goto :eof )
if /i "%CMD%"=="dev" ( call setup\boot_all.bat %REST% & goto :eof )
if /i "%CMD%"=="install" ( call setup\install_all.bat %REST% & goto :eof )
if /i "%CMD%"=="backend" ( call backend\boot_backend.bat %REST% & goto :eof )
if /i "%CMD%"=="frontend" ( call frontend\boot_frontend.bat %REST% & goto :eof )
if /i "%CMD%"=="build" ( pushd frontend & call npm run build & popd & goto :eof )
if /i "%CMD%"=="cli" ( python setup\catalogue.py %REST% & goto :eof )
if /i "%CMD%"=="install-desktop" ( call setup\install_desktop.bat %REST% & goto :eof )
if /i "%CMD%"=="freeze" ( call setup\freeze_backend.bat %REST% & goto :eof )
if /i "%CMD%"=="desktop" ( call setup\desktop_build.bat %REST% & goto :eof )
echo usage: formtxt.bat [boot^|install^|backend^|frontend^|build^|cli^|install-desktop^|freeze^|desktop]
exit /b 2
