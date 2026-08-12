@echo off
echo Starting DevCopilot Backend API Server...
call c:\Users\Admin\Documents\python\venv\Scripts\activate.bat
cd backend
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
pause
