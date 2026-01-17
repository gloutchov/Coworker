#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/lai"

# Vai nella cartella dove si trova lo script
cd "$PROJECT_DIR"

# Attiva il virtualenv
if [ -d ".venv311" ]; then
  source .venv311/bin/activate
else
  echo "Virtualenv .venv311 non trovato. Esco."
  read -p "Premi Invio per uscire..."
  exit 1
fi

echo "Avvio del server LLM locale su http://127.0.0.1:8001 ..."

# Avvia il server FastAPI con uvicorn in background (senza reload per maggiore stabilita)
python -m uvicorn server:app --host 127.0.0.1 --port 8001 --log-level info & SERVER_PID=$!

# aspetta un attimo per vedere se crasha subito
sleep 3

# controlla se il processo è ancora vivo
if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
  echo "Errore: il server non è in esecuzione."
  echo "Probabile errore Python (controlla il terminale lanciando uvicorn a mano)."
  read -p "Premi Invio per uscire..."
  exit 1
fi

# Apri la pagina index.html nel browser predefinito
echo "Apro index.html nel browser..."
open app/index.html
# open http://127.0.0.1:8001

echo
echo "Server avviato (PID $SERVER_PID)."
echo "Per fermarlo, puoi chiudere il Terminale, oppure..."
echo "digitare CTRL+C per 2 volte."
echo
echo "Attendi. Caricamento informazioni..."

read -p "Premi un tasto per chiudere"
