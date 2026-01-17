import os
import tempfile
import urllib3
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import CORS_ALLOWED_ORIGINS, SERVER_HOST, SERVER_PORT, BASE_DIR
from modules.db import init_db
from modules.config.routes import router as config_router
from modules.config.preferences import load_user_preferences
from modules.audio.transcriber import transcribe_audio_file
from modules.llm.routes import router as llm_router
from modules.mcp.routes import router as mcp_router
from modules.rag.routes import router as rag_router
from modules.notepad.routes import router as notepad_router
from modules.tts.routes import router as tts_router
from modules.graphics.routes import router as graphics_router

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Inizializzazione del Middleware
app = FastAPI(title="LLM Locale – Demo (refactored)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers modulari
app.include_router(config_router, prefix="/api")
app.include_router(llm_router, prefix="/api")
app.include_router(mcp_router, prefix="/api")
app.include_router(rag_router, prefix="/api")
app.include_router(notepad_router, prefix="/api")
app.include_router(tts_router, prefix="/api")
app.include_router(graphics_router, prefix="/api")

@app.on_event("startup")
def on_startup():
    init_db()
    print("[STARTUP] DB inizializzato.")
    prefs = load_user_preferences()
    print(f"[STARTUP] Preferenze utente caricate: {prefs}")


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    # Salva il file audio in un percorso temporaneo
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        temp_path = tmp.name

    try:
        result = transcribe_audio_file(temp_path)

        if not result:
            raise HTTPException(status_code=500, detail="Errore durante la trascrizione.")

        return {
            "language": "unknown",
            "text": result.get("text", ""),
            "segments": result.get("segments", [])
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore durante la trascrizione: {e}")
    finally:
        # Assicura che il file temporaneo venga sempre cancellato
        try:
            os.remove(temp_path)
        except OSError:
            pass

# Mount della SPA frontend (deve essere l'ultima cosa)
app.mount("/", StaticFiles(directory=BASE_DIR / "app", html=True), name="app")


if __name__ == "__main__":
    print("=" * 80)
    print(f"Avvio del server su http://{SERVER_HOST}:{SERVER_PORT}")
    print("Per terminare, premere CTRL+C")
    print("=" * 80)
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT)
