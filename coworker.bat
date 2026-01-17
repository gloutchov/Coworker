@echo off
REM Vai nella cartella dove si trova questo batch
cd /d "%~dp0/lai"

:: Impostazione variabili d'ambiente
set "COWORKER_HOME=%~dp0"
REM set "PATH=%PATH%;%COWORKER_HOME%/tools/ffmpeg/bin"

echo Avvio del server LLM locale...

REM Avvia il server in una nuova finestra di cmd
call .venv\Scripts\activate.bat
start "LLM Server" cmd /k python -m uvicorn server:app --host 127.0.0.1 --port 8001 --log-level info

REM Attendi qualche secondo per dare il tempo al modello di caricarsi
timeout /t 5 /nobreak >nul

echo Apro la pagina index.html nel browser predefinito...
start "" "%cd%\app\index.html"
REM start "" http://127.0.0.1:8001

echo
echo "Server avviato."
echo "Per fermarlo, puoi chiudere il Terminale, oppure..."
echo "digitare CTRL+C per 2 volte."
echo
echo "Attendi. Caricamento informazioni..."
