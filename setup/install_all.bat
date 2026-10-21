@echo off
setlocal
cd /d "%~dp0.."
echo [formtxt] installing backend
pushd backend
call oc_install.bat %* || ( popd & exit /b 1 )
popd
echo [formtxt] installing frontend
pushd frontend
call oc_install.bat %* || ( popd & exit /b 1 )
popd
echo [formtxt] done. Boot with formtxt.bat
