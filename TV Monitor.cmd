@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-tv-monitor.ps1"
if errorlevel 1 pause
