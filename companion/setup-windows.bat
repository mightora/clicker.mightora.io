@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  echo Python is not installed or the Python launcher is unavailable.
  echo Install Python 3.10 or newer from https://www.python.org/downloads/windows/
  echo Tick "Add Python to PATH" during setup, then run this file again.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Creating a private Python environment...
  py -3 -m venv .venv
  if errorlevel 1 goto :error
)
echo Installing the two Clicker dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :error
echo Starting Mightora Clicker...
".venv\Scripts\python.exe" clicker.py
pause
exit /b 0
:error
echo Setup failed. Please copy the error message and report it.
pause
exit /b 1
