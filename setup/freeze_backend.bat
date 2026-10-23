@echo off
setlocal
cd /d "%~dp0.."
set "ROOT=%cd%"
if not exist backend\venv\Scripts\activate.bat ( echo [formtxt] backend venv missing, run formtxt.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
python -c "import PyInstaller" 2>nul || ( echo [formtxt] PyInstaller missing, run setup\install_desktop.bat & exit /b 1 )
if not exist frontend\dist\index.html call setup\build_frontend.bat || exit /b 1
if not exist frontend\node_modules\wordnet-db\dict ( echo [formtxt] frontend\node_modules is missing the font and dictionary data, run formtxt.bat install & exit /b 1 )
for /f "tokens=2" %%T in ('rustc -vV ^| findstr /b "host:"') do set "TRIPLE=%%T"
if "%TRIPLE%"=="" ( echo [formtxt] rustc not found, install Rust from https://rustup.rs & exit /b 1 )
cd backend
if exist build\pyinstaller rmdir /s /q build\pyinstaller
if exist dist-engine rmdir /s /q dist-engine
pyinstaller --noconfirm --clean --onefile --name formtxt-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller ^
  --add-data "%ROOT%\frontend\dist;frontend_dist" ^
  --add-data "%ROOT%\frontend\node_modules\@fontsource;fonts" ^
  --add-data "%ROOT%\frontend\node_modules\wordnet-db\dict;wordnet" ^
  --add-data "%ROOT%\backend\app\services\proofing\data;app\services\proofing\data" ^
  --collect-submodules app --collect-submodules uvicorn ^
  --collect-all docx --collect-submodules reportlab --collect-all pdfplumber --collect-all pypdfium2 ^
  --collect-all rapidocr_onnxruntime --collect-all onnxruntime --collect-data openpyxl ^
  --collect-submodules keyring --hidden-import olefile ^
  "%ROOT%\backend\formtxt_engine.py" || exit /b 1
if not exist "%ROOT%\src-tauri\binaries" mkdir "%ROOT%\src-tauri\binaries"
copy /y dist-engine\formtxt-engine.exe "%ROOT%\src-tauri\binaries\formtxt-engine-%TRIPLE%.exe" >nul || exit /b 1
"%ROOT%\src-tauri\binaries\formtxt-engine-%TRIPLE%.exe" --selfcheck || exit /b 1
echo [formtxt] sidecar ready: src-tauri\binaries\formtxt-engine-%TRIPLE%.exe
