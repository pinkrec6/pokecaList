@echo off
cd /d "%~dp0"
python -X utf8 server.py --port 8787
pause
