@echo off
rem Memaze launcher for Windows - double-click this file.
rem Extra options are passed through, e.g.:  memaze.bat --host 0.0.0.0
setlocal
cd /d "%~dp0"
title Memaze

where py >nul 2>nul
if not errorlevel 1 (
    py -3 serve.py %*
) else (
    python serve.py %*
)

if errorlevel 1 (
    echo.
    echo   Memaze stopped with an error - see the message above.
    echo   If Python is missing: install Python 3.8 or newer from https://www.python.org/downloads/
    echo   and tick "Add python.exe to PATH" during setup, then double-click memaze.bat again.
    echo.
    pause
)
endlocal
