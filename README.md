# Coworker

**EN**  
Coworker is an experimental local-first AI workspace for desktop use. It combines a FastAPI backend, a browser-based UI, local GGUF models via `llama_cpp_python`, document retrieval, audio transcription, text-to-speech, simple graphics generation, and optional MCP or OpenAI-compatible integrations.

**IT**  
Coworker e' uno spazio di lavoro AI sperimentale, pensato per un uso desktop e local-first. Combina un backend FastAPI, una UI nel browser, modelli GGUF locali tramite `llama_cpp_python`, recupero documentale, trascrizione audio, sintesi vocale, generazione grafica semplice e integrazioni opzionali MCP o compatibili OpenAI.

**EN**  
The project is designed around a simple premise: keep the default workflow local, practical, and usable on normal office laptops.

**IT**  
Il progetto nasce da un principio semplice: mantenere il flusso di lavoro predefinito locale, pratico e utilizzabile su normali portatili da ufficio.

## Highlights / Punti Chiave

- **EN:** Local chat with GGUF models.  
  **IT:** Chat locale con modelli GGUF.
- **EN:** Document Q&A with RAG over local files.  
  **IT:** Domande e risposte sui documenti con RAG su file locali.
- **EN:** Historical chat retrieval based on saved conversations.  
  **IT:** Recupero di chat storiche basato sulle conversazioni salvate.
- **EN:** Audio transcription from uploaded files.  
  **IT:** Trascrizione audio da file caricati.
- **EN:** Text-to-speech with local voices.  
  **IT:** Sintesi vocale con voci locali.
- **EN:** Graphics generation for diagrams and lightweight visual outputs.  
  **IT:** Generazione grafica per diagrammi e output visivi leggeri.
- **EN:** Optional MCP client support over HTTP or STDIO.  
  **IT:** Supporto opzionale a client MCP via HTTP o STDIO.
- **EN:** Optional OpenAI-compatible API provider support.  
  **IT:** Supporto opzionale a provider API compatibili OpenAI.
- **EN:** Browser UI with Italian and English prompts/docs.  
  **IT:** Interfaccia browser con prompt e documentazione in italiano e inglese.

## Project Status / Stato Del Progetto

**EN**  
This repository is experimental and optimized for local/private usage rather than packaged distribution. Some defaults, scripts, and bundled assets assume a developer-managed environment.

**IT**  
Questa repository e' sperimentale ed e' ottimizzata per un uso locale/privato piu' che per una distribuzione gia' pacchettizzata. Alcuni default, script e asset inclusi assumono un ambiente gestito direttamente dallo sviluppatore.

## Architecture / Architettura

**EN**  
`Coworker` is split into two main parts:

**IT**  
`Coworker` e' diviso in due parti principali:

- `lai/server.py`: FastAPI application exposing the local API.
- `lai/app/`: static frontend served by the backend.

**EN**  
Main backend modules:

**IT**  
Moduli principali del backend:

- `lai/modules/llm`: local chat and streaming.
- `lai/modules/rag`: document indexing and retrieval.
- `lai/modules/audio`: transcription.
- `lai/modules/tts`: speech synthesis.
- `lai/modules/graphics`: diagram/graphics generation.
- `lai/modules/mcp`: MCP service discovery and invocation.
- `lai/modules/config`: runtime configuration and user preferences.
- `lai/modules/db`: SQLite-backed persistence for chats, config, cache, and RAG metadata.

## Features / Funzionalita'

### 1. Local AI Chat / Chat AI Locale

**EN**  
The default mode runs against local GGUF models configured in `lai/config.py` and user preferences. The app supports conversation history, configurable context size, token limits, streaming modes, and model switching.

**IT**  
La modalita' predefinita usa modelli GGUF locali configurati in `lai/config.py` e nelle preferenze utente. L'app supporta cronologia conversazioni, dimensione del contesto configurabile, limiti di token, modalita' di streaming e cambio modello.

### 2. Document Chat (RAG) / Chat Documentale (RAG)

**EN**  
Coworker can index local documents and answer questions using only indexed content. The codebase includes chunking and retrieval settings for textual files and structured files such as spreadsheets.

**IT**  
Coworker puo' indicizzare documenti locali e rispondere usando solo il contenuto indicizzato. Il codice include impostazioni di chunking e retrieval per file testuali e file strutturati come i fogli di calcolo.

### 3. Historical Chat Search / Ricerca Nelle Chat Storiche

**EN**  
Saved conversations can be indexed and queried as a separate retrieval mode.

**IT**  
Le conversazioni salvate possono essere indicizzate e interrogate come modalita' di retrieval separata.

### 4. Audio Tools / Strumenti Audio

**EN**  
The backend exposes transcription through Faster-Whisper and speech synthesis through Coqui TTS.

**IT**  
Il backend espone la trascrizione tramite Faster-Whisper e la sintesi vocale tramite Coqui TTS.

### 5. Graphics / Grafica

**EN**  
The UI can generate visual outputs in formats such as SVG, Mermaid, and PlantUML, with optional PNG rendering.

**IT**  
La UI puo' generare output visivi in formati come SVG, Mermaid e PlantUML, con rendering PNG opzionale.

### 6. Integrations / Integrazioni

- **EN:** Wikipedia search can be enabled as the built-in web source.  
  **IT:** La ricerca Wikipedia puo' essere abilitata come fonte web integrata.
- **EN:** MCP services can be configured and invoked from the chat UI.  
  **IT:** I servizi MCP possono essere configurati e invocati dalla UI di chat.
- **EN:** OpenAI-compatible providers can be configured as optional external backends.  
  **IT:** I provider compatibili OpenAI possono essere configurati come backend esterni opzionali.

## Privacy Model / Modello Di Privacy

**EN**  
Coworker is local-first:

**IT**  
Coworker e' local-first:

- **EN:** chat, indexing, preferences, and history are stored locally;  
  **IT:** chat, indicizzazione, preferenze e cronologia sono memorizzate localmente;
- **EN:** local models are used by default;  
  **IT:** i modelli locali sono usati per default;
- **EN:** network access is optional and feature-specific.  
  **IT:** l'accesso alla rete e' opzionale e dipende dalla funzionalita' usata.

**EN**  
Out of the box, the only built-in web lookup path is Wikipedia search. External API providers and MCP services are optional and must be configured explicitly by the user.

**IT**  
Di base, l'unico percorso integrato di consultazione web e' la ricerca su Wikipedia. Provider API esterni e servizi MCP sono opzionali e devono essere configurati esplicitamente dall'utente.

## Requirements / Requisiti

### Runtime

- Python `3.11`
- macOS or Windows
- enough RAM for the selected local models

### Runtime / Requisiti Di Esecuzione

- Python `3.11`
- macOS o Windows
- RAM sufficiente per i modelli locali selezionati

### Recommended System Tools / Strumenti Di Sistema Consigliati

- `ffmpeg` for audio-related workflows
- `ffmpeg` per i flussi di lavoro legati all'audio

## Quick Start / Avvio Rapido

### macOS

1. Run `setup_mac.command`
2. Wait for the virtual environment and dependencies to be installed
3. Run `coworker.command`

1. Esegui `setup_mac.command`
2. Attendi l'installazione del virtual environment e delle dipendenze
3. Esegui `coworker.command`

**EN**  
The macOS setup script installs the Python dependencies from `lai/requirements_mac_311.txt` and then installs `llama_cpp_python` with Metal acceleration.

**IT**  
Lo script di setup macOS installa le dipendenze Python da `lai/requirements_mac_311.txt` e poi installa `llama_cpp_python` con accelerazione Metal.

### Windows

1. Run `setup_windows.bat`
2. Wait for the virtual environment and dependencies to be installed
3. Run `coworker.bat`

1. Esegui `setup_windows.bat`
2. Attendi l'installazione del virtual environment e delle dipendenze
3. Esegui `coworker.bat`

**EN**  
The Windows setup script installs the dependencies from `lai/requirements_windows_311.txt`.

**IT**  
Lo script di setup Windows installa le dipendenze da `lai/requirements_windows_311.txt`.

## Manual Run / Avvio Manuale

**EN**  
If you prefer starting the app manually:

**IT**  
Se preferisci avviare l'app manualmente:

```bash
cd lai
python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

**EN**  
Then open:

**IT**  
Poi apri:

```text
http://127.0.0.1:8001
```

## Configuration / Configurazione

**EN**  
Core defaults live in `lai/config.py`, including:

**IT**  
I default principali si trovano in `lai/config.py`, inclusi:

- server host and port / host e porta del server
- model paths / percorsi dei modelli
- context/token limits / limiti di contesto e token
- RAG chunking and retrieval defaults / default di chunking e retrieval RAG
- Wikipedia search settings / impostazioni della ricerca Wikipedia
- MCP defaults / default MCP
- TTS and graphics defaults / default TTS e grafica

**EN**  
User-adjustable preferences are persisted locally through the config and database modules.

**IT**  
Le preferenze modificabili dall'utente vengono salvate localmente tramite i moduli di configurazione e database.

## Repository Layout / Struttura Della Repository

```text
.
├── coworker.bat
├── coworker.command
├── setup_mac.command
├── setup_windows.bat
├── LICENSE
├── NOTICE
└── lai
    ├── app
    ├── config.py
    ├── models
    ├── modules
    ├── rag.py
    ├── requirements_mac_311.txt
    ├── requirements_windows_311.txt
    └── server.py
```

## Notes For GitHub Distribution / Note Per La Distribuzione Su GitHub

**EN**  
If this repository is published on GitHub, these points should be kept in mind:

**IT**  
Se questa repository viene pubblicata su GitHub, conviene tenere presenti questi punti:

- **EN:** the project currently includes local assets and model-related files that may be too large or too environment-specific for a clean public distribution;  
  **IT:** il progetto include attualmente asset locali e file collegati ai modelli che potrebbero essere troppo grandi o troppo specifici per una distribuzione pubblica pulita;
- **EN:** setup scripts are convenient for local use, but not yet a full installer experience;  
  **IT:** gli script di setup sono comodi per l'uso locale, ma non costituiscono ancora una vera esperienza di installazione completa;
- **EN:** some defaults are tuned for a local demo/private deployment rather than multi-user production use;  
  **IT:** alcuni default sono tarati per demo locali o deploy privati piu' che per un uso multiutente in produzione;
- **EN:** external integrations should be documented as optional because the main value of the project is local-first operation.  
  **IT:** le integrazioni esterne dovrebbero essere documentate come opzionali, perche' il valore principale del progetto e' il funzionamento local-first.

## License / Licenza

**EN**  
This repository includes [LICENSE](LICENSE) and [NOTICE](NOTICE). Keep both files when redistributing the project.

**IT**  
Questa repository include [LICENSE](LICENSE) e [NOTICE](NOTICE). Mantieni entrambi i file in caso di redistribuzione del progetto.
