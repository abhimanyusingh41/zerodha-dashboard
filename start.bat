@echo off
echo Starting Zerodha Dashboard on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
py -m uvicorn main:app --host 0.0.0.0 --port 8000
