#!/bin/bash

echo "---------------------------------------------"
echo " Installazione di llama_cpp_python con METAL "
echo "---------------------------------------------"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/lai"

# Vai nella cartella dove si trova lo script
cd "$PROJECT_DIR"

# Controllo venv
if [ ! -d ".venv311" ]; then
    echo "❌ ERRORE: La cartella .venv311 non esiste."
    echo "Crea la venv prima con:"
    echo "python3.11 -m venv .venv311"
    exit 1
fi

echo "✔ Attivo l'ambiente virtuale .venv311"
source .venv311/bin/activate

echo "✔ Aggiorno pip"
pip install --upgrade pip

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "⚠️  ffmpeg non trovato. Installalo con:"
    echo "   brew install ffmpeg"
fi

echo "✔ Installo l'ultima versione di llama_cpp_python ottimizzata per Metal..."
CMAKE_ARGS="-DLLAMA_ACCELERATE=on -DLLAMA_METAL=on" \
pip install llama_cpp_python --force-reinstall --upgrade --no-cache-dir

echo "✔ Ripristino numpy compatibile e riallineo i requirements..."
pip install "numpy==1.26.4"
pip install -r requirements_mac_311.txt

echo "---------------------------------------------"
echo " Installazione completata!"
echo " Ora puoi avviare il server normalmente."
echo "---------------------------------------------"
