@echo off
setlocal

cd /d "%~dp0"

if not exist "webui\dist\index.html" (
  echo [ERROR] Missing webui\dist\index.html. Build the React UI first.
  exit /b 1
)

py -3 -m pip install --upgrade pip
if errorlevel 1 exit /b 1

py -3 -m pip install -r requirements.txt pyinstaller
if errorlevel 1 exit /b 1

py -3 -m PyInstaller --noconfirm kodaukovui.spec
if errorlevel 1 exit /b 1

echo.
echo Build completed: dist\KoDauKoVui\KoDauKoVui.exe

