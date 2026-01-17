# Repository Guidelines

## Project Structure & Module Organization
- `server.py` starts the FastAPI app; shared settings live in `config.py`.
- Backend features live in `modules/` (config/preferences, LLM, RAG, DB, audio, TTS, web search, MCP, notepad, graphics, providers, utils).
- Frontend assets are static in `app/` with feature helpers in `app/js/`.
- Data and models: drop ingest files into `documents/` (overrideable via preferences), reference corpora in `txt/`, and keep large model assets in `models/` (overrideable via preferences; avoid committing new binaries).

## Architecture Overview
- `app/` calls `/api/*` routes (API base lives in `app/app.js`); `server.py` mounts feature routers and serves the SPA.
- Preferences live in `modules/config/` and are exposed via `/api/config` and `/api/config/user`.
- Custom LLM model catalog: `/api/config/llm-models` (POST/DELETE) persists models in the DB; `/api/config/llm-models/files` lists local `.gguf` files for the guided UI.
- Chat flow: `/api/chat` (local/external LLM), `/api/chat-web` (Wikipedia search + LLM), `/api/chats` CRUD + `/api/ask-chats` for RAG over saved chats.
- RAG flow: uploads land in `documents/` -> `/api/reindex` or `/api/reindex-file` builds `rag_index.db` -> `/api/ask` queries the index; `/api/docs-list`, `/api/rag-docs`, `/api/rag-docs-delete`, `/api/rag-status`, `/api/doc-file/{filename}` support the UI.
- Temp-doc flow: `/api/temp-doc/upload`, `/api/temp-doc/ask`, `/api/temp-doc/{id}` enable ephemeral document Q&A/graphics.
- Audio flow: `/api/transcribe` and `/api/tts/from-text` + `/api/tts/from-file` rely on local model assets and `ffmpeg` on `PATH`.
- Graphics flow: `/api/graphics` generates SVG/Mermaid/PlantUML markup, validates it, and renders SVG to PNG when possible.
- `llm_model_graphics_id` (Config → Modelli LLM → Graphics) lets you pin a specific local model for `/api/graphics` even if chat uses another one.
- OCR flow: in Chat AI, images selected via "Scegli il file" can be sent with OCR; in Chat Documenti, image files can be OCR-indexed into RAG via `/api/ocr-image-index` (requires a vision-capable model).
- MCP flow: `/api/mcp/services` lists configured services and `/api/mcp/invoke` executes them. Services are fully managed via the UI and stored in the database.
- External LLM providers: OpenAI-compatible endpoints (Ollama, LM Studio, OpenAI) can be configured in preferences and used for Chat/RAG/History.
- Config UI: "Modelli LLM" is the first page and supports add/remove via a guided modal; default model remains fixed. "Percorsi Utente" now includes the models directory override.

## Build, Test, and Development Commands
- Setup (macOS): `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements_mac_311.txt`.
- Setup (Windows, Python 3.11): `py -3.11 -m venv .venv && .venv\Scripts\activate && pip install -r requirements_windows_311.txt`.
- Graphics rendering: includes CairoSVG in requirements; if PNG export is missing, reinstall dependencies.
- Run API: `uvicorn server:app --reload --host 127.0.0.1 --port 8001`.
- Run UI: open `app/index.html` or `python3 -m http.server 3000 -d app`.
- RAG refresh: `curl -X POST http://127.0.0.1:8001/api/reindex`.
- Coqui warm-up: `python tools/warmup_coqui_tts.py --accept-tos` (pre-scarica il modello TTS).

## Coding Style & Naming Conventions
- Python: 4-space indent, snake_case for functions/variables, PascalCase for classes; add type hints where useful.
- JavaScript: use `const`/`let`, camelCase, and keep UI state in `app/app.js` with helpers in `app/js/`.
- Prefer `python -m black` and `python -m isort` when touching Python modules.

## Testing Guidelines
- No formal test suite; smoke-test `/api/chat`, `/api/ask`, document upload + `/api/reindex`, and audio transcription/TTS.
- When updating graphics, smoke-test `/api/graphics` for SVG/Mermaid/PlantUML output and PNG rendering (if CairoSVG is available).
- When changing RAG parsing or indexing, add a lightweight check using files in `documents/` or `txt/`.
- When updating OCR: smoke-test Chat AI OCR (image upload) and Chat Documenti OCR indexing on a sample image in `documents/`.

## Commit & Pull Request Guidelines
- No Git history is available in this workspace; if you initialize one, use concise, conventional-style messages (e.g., `feat: add rag retry`).
- PRs should explain intent, include verification steps, and attach UI screenshots when the frontend changes.

## Configuration & Asset Notes
- `config.py` provides defaults; use env vars for deployment (CORS, ports, token limits) and keep `app/app.js` `API_BASE` aligned with host/port.
- TTS usa Coqui XTTS con speaker WAV in `models/voices/`; `ffmpeg` deve essere nel `PATH` per MP3.
- Faster-Whisper uses the local model in `models/faster-whisper-small` (`WHISPER_MODEL_PATH`) with device/compute type set in `config.py`.
- `models_dir_override` (Config → Percorsi Utente → Cartella Modelli) lets you move the `models/` directory; LLM file lists and model path resolution use the override.
- Coqui TTS runtime: `COQUI_TTS_MODEL` selects the model, `COQUI_TTS_USE_GPU` toggles GPU, `COQUI_TTS_SPEAKER`/`COQUI_TTS_SPEAKER_WAV` override speakers, and `COQUI_TOS_AGREED` enables non-interactive startup.
- TTS limits and formats: `TTS_MAX_TEXT_CHARS` + `TTS_TRUNCATE_AT_BREAK` guard long inputs; output formats are `wav`/`mp3`, with `TTS_DEFAULT_AUDIO_FORMAT` and `FFMPEG_BIN` controlling defaults/binary.
- Graphics PNG rendering uses CairoSVG (pure Python) when installed via requirements; user preferences include PNG rendering and preferred output kind.
- LLM model catalog includes Gemma 3 and Qwen variants; vision/OCR requires the matching `mmproj` file in `models/`.
- LLM catalog is now hybrid: the default model stays in `config.py`, while other models are stored in the DB as user customizations and can be added/removed from the UI without touching `config.py`.
- Troubleshooting LLM models: if a custom model shows "mancante" or is not listed in the dropdowns, verify the `.gguf` is present in the active models directory (Config → Percorsi Utente), reload Config (the UI fetches `/api/config/llm-models/files`), and ensure the file name has not changed.

## Development Log (Summary)
- Rebranded UI to Coworker: updated header/footer text, alt text, i18n title, and user agent string; refreshed color palette with red/blue theme and updated focus/hover states.
- Replaced PDF help with HTML help pages (IT/EN) in `app/docs/`, added search toolbar, and retargeted help links in the UI.
- Expanded help and README to include installation, MCP usage, graphics formats, Wikipedia mail requirement, Excel/CSV limits, and user preference behaviors.
- Added missing translation key for external API base URL (`providersBaseUrl`) to fix the `[missing: providersBaseUrl]` placeholder in Configuration → API Esterne.
