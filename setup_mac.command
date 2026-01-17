#!/bin/bash

echo "---------------------------------------------"
echo "   Setup completo ambiente Mac (Python 3.11)"
echo "      + Installazione llama_cpp con METAL     "
echo "      + Installazione requirements Mac        "
echo "      + Avvio del server                      "
echo "---------------------------------------------"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/lai"

# Vai nella cartella dove si trova lo script
cd "$PROJECT_DIR"

# Controllo requirements
if [ ! -f "requirements_mac_311.txt" ]; then
    echo "❌ ERRORE: Il file requirements_mac_311.txt non esiste."
    echo "Mettilo nella cartella del progetto prima di lanciare questo script."
    exit 1
fi

# Rimuovo vecchia venv se esiste
if [ -d ".venv311" ]; then
    echo "⚠️  Rimuovo vecchia venv .venv311..."
    rm -rf .venv311
fi

echo "✔ Creo la nuova venv con Python 3.11"
python3.11 -m venv .venv311

echo "✔ Attivo la venv"
source .venv311/bin/activate

echo "✔ Aggiorno pip"
pip install --upgrade pip

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "⚠️  ffmpeg non trovato. Installalo con:"
    echo "   brew install ffmpeg"
fi

echo "✔ Installo requirements (versione compatibile macOS 3.11)"
pip install -r requirements_mac_311.txt

echo "✔ Installo llama_cpp_python ottimizzato per Metal..."
CMAKE_ARGS="-DLLAMA_ACCELERATE=on -DLLAMA_METAL=on" \
pip install llama_cpp_python==0.3.16 --force-reinstall --upgrade --no-cache-dir

echo "✔ Installazione completata!"

echo "---------------------------------------------"
echo "Installazione completata!"
echo "---------------------------------------------"
echo "Fatto. Puoi chiudere questa finestra."
echo "---------------------------------------------"

