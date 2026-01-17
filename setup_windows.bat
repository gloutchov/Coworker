@echo off
echo ---------------------------------------------
echo   Setup completo ambiente Windows (Python 3.11)
echo   + Creazione venv
echo   + Installazione requirements
echo   + Avvio del server
echo ---------------------------------------------
echo.

REM vai nella cartella dello script
cd /d "%~dp0/lai"

REM controllo del requirements
IF NOT EXIST requirements_windows_311.txt (
    echo ERRORE: Il file requirements_windows_311.txt non esiste.
    echo Metti il file nella cartella del progetto prima di avviare lo script.
    pause
    exit /b
)

REM rimuovo vecchia venv se esiste
IF EXIST .venv (
    echo Rimuovo la vecchia venv...
    rmdir /s /q .venv
)

echo Creazione della nuova venv con Python 3.11...
py -3.11 -m venv .venv

IF NOT EXIST .venv (
    echo ERRORE: Non e' stato possibile creare la venv.
    echo Controlla che Python 3.11 sia installato correttamente.
    pause
    exit /b
)

echo Attivo la venv...
call .\.venv\Scripts\activate

echo Aggiorno pip...
python -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --upgrade pip

REM where ffmpeg >nul 2>&1
REM IF ERRORLEVEL 1 (
REM    echo WARNING: ffmpeg non trovato. Installalo (es. winget install Gyan.FFmpeg) e assicurati che sia nel PATH.
REM )

echo Installo requirements Windows...
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements_windows_311.txt

echo ---------------------------------------------
echo Installazione completata!
echo ---------------------------------------------
echo Fatto. Puoi chiudere questa finestra.
echo ---------------------------------------------
