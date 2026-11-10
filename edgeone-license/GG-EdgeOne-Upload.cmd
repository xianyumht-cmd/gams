@echo off
setlocal
echo GG EdgeOne private runtime uploader
echo This uses the local PowerShell script. Do not share your Token or license key.
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0scripts\GG-EdgeOne-Upload.ps1"
echo.
echo Press any key to close this window.
pause >nul
