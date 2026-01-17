import base64
import re
import secrets
import tempfile
import time
from pathlib import Path
from threading import Lock
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import (
    RAG_TOP_K_DEFAULT,
    RAG_CHUNK_MAX_CHARS,
    RAG_CHUNK_OVERLAP,
    RAG_MIN_KEYWORD_LEN,
)
from modules.config.preferences import get_docs_dir
from modules.db.rag import get_all_documents, delete_document_from_rag, insert_chunks, upsert_documents
from rag import (
    index_documents,
    index_single_document,
    get_relevant_chunks,
    extract_text_from_file,
    split_into_chunks,
    AUDIO_SUFFIXES,
    cosine_similarity,
)
from llm_client import get_embedding, chat_completion
from modules.llm.streaming import build_llm_response
from modules.llm.context_window import prepare_history_window, adjust_retrieval_top_k
from config import PROMPT_RAG_DOCS_SYSTEM, PROMPT_RAG_DOCS_USER_TEMPLATE
from modules.config.preferences import (
    apply_user_info_to_system_prompt,
    get_llm_model_info,
    get_llm_model_id,
    get_llm_model_vision_id,
    is_llm_thinking_enabled,
    get_api_provider_settings,
    is_api_provider_enabled_for_mode,
    is_llm_thoughts_visible,
)
from modules.utils.i18n import normalize_language, build_response_instruction, get_prompt_text


class DocumentInfo(BaseModel):
    name: str
    size: int
    modified: float


class RagDocDeleteRequest(BaseModel):
    name: str


class ReindexResponse(BaseModel):
    files: int
    chunks: int
    saved_to: str


class ReindexFileRequest(BaseModel):
    name: str


class AskRequest(BaseModel):
    question: str
    top_k: int = RAG_TOP_K_DEFAULT
    history: list[dict] | None = None
    language: str | None = None


class TempDocUploadResponse(BaseModel):
    temp_doc_id: str
    name: str
    size: int
    chunks: int


class TempDocAskRequest(BaseModel):
    temp_doc_id: str
    question: str
    top_k: int = RAG_TOP_K_DEFAULT
    history: list[dict] | None = None
    language: str | None = None


class OcrIndexResponse(BaseModel):
    name: str
    chunks: int


router = APIRouter()


def _apply_thinking_mode(system_prompt: str) -> tuple[str, bool]:
    if is_api_provider_enabled_for_mode("rag"):
        settings = get_api_provider_settings()
        thinking_enabled = bool(
            is_llm_thinking_enabled() and settings.get("api_supports_thinking")
        )
    else:
        model_info = get_llm_model_info()
        thinking_enabled = bool(is_llm_thinking_enabled() and model_info.get("capabilities", {}).get("thinking"))
    if not thinking_enabled:
        return system_prompt, False
    if is_llm_thoughts_visible():
        enriched = (
            f"{system_prompt}\n\nModalita thinking attiva: se utile, racchiudi il ragionamento tra <think>...</think> "
            "e poi fornisci una risposta finale completa e separata, senza tag."
        )
    else:
        enriched = (
            f"{system_prompt}\n\nModalita thinking attiva: ragiona internamente e fornisci solo la risposta finale, "
            "senza mostrare i passaggi."
        )
    return enriched, True


TEMP_DOC_TTL_SECONDS = 30 * 60  # 30 minuti
MAX_TEMP_DOCS = 5
MAX_OCR_IMAGE_BYTES = 4 * 1024 * 1024
_temp_docs: dict[str, dict] = {}
_temp_docs_lock = Lock()

OCR_PREFIX = "OCR::"

IMAGE_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".gif",
    ".tiff",
    ".tif",
}


def _is_image_filename(name: str) -> bool:
    suffix = Path(name).suffix.lower()
    return suffix in IMAGE_SUFFIXES


def _build_ocr_filename(original: str) -> str:
    base = (original or "").strip() or "immagine"
    return f"{OCR_PREFIX}{base}"


def _extract_ocr_text(image_url: str, model_id: str | None = None) -> str:
    system = "Sei un OCR accurato. Estrai esclusivamente il testo presente nell'immagine."
    prompt = (
        "Riporta solo il testo, senza commenti, senza formattazione aggiuntiva "
        "e senza inventare parti mancanti. Se non c'e testo, rispondi con stringa vuota."
    )
    text = chat_completion(system, prompt, image_urls=[image_url], request_mode="rag", model_id=model_id)
    return _strip_thought_blocks(text or "").strip()


def _strip_thought_blocks(text: str) -> str:
    if not text:
        return ""
    while True:
        start = text.find("<think>")
        if start == -1:
            break
        end = text.find("</think>", start + 7)
        if end == -1:
            text = text[:start]
            break
        text = text[:start] + text[end + 8 :]
    return text


def _cleanup_temp_docs_locked():
    now = time.time()
    expired = [doc_id for doc_id, data in _temp_docs.items() if now - data["created_at"] > TEMP_DOC_TTL_SECONDS]
    for doc_id in expired:
        _temp_docs.pop(doc_id, None)
    while len(_temp_docs) > MAX_TEMP_DOCS:
        oldest_id = min(_temp_docs.items(), key=lambda item: item[1]["created_at"])[0]
        _temp_docs.pop(oldest_id, None)


def _register_temp_doc(entry: dict) -> str:
    with _temp_docs_lock:
        _cleanup_temp_docs_locked()
        doc_id = secrets.token_hex(8)
        _temp_docs[doc_id] = entry
        return doc_id


def _get_temp_doc(doc_id: str) -> dict | None:
    with _temp_docs_lock:
        _cleanup_temp_docs_locked()
        return _temp_docs.get(doc_id)


def _remove_temp_doc(doc_id: str) -> bool:
    with _temp_docs_lock:
        return _temp_docs.pop(doc_id, None) is not None


def _keyword_tokens(text: str) -> list[str]:
    tokens = re.findall(r"\w+", text.lower())
    return [tok for tok in tokens if len(tok) >= RAG_MIN_KEYWORD_LEN]


def _rank_temp_chunks(question: str, chunk_records: list[dict], top_k: int) -> list[dict]:
    if not chunk_records:
        return []

    question_emb = get_embedding(question)
    if not question_emb:
        return []

    q_tokens = _keyword_tokens(question)
    q_token_set = set(q_tokens)
    question_lower = question.lower()

    candidate_hits: list[tuple[dict, int]] = []
    has_hits = False
    for rec in chunk_records:
        text_lower = rec["text"].lower()
        lex_hits = 0
        for tok in q_token_set:
            if tok in text_lower:
                lex_hits += 1

        file_lower = (rec.get("file") or "").lower()
        if file_lower and file_lower in question_lower:
            lex_hits += 3

        if lex_hits > 0:
            has_hits = True
        candidate_hits.append((rec, lex_hits))

    candidates = [pair for pair in candidate_hits if pair[1] > 0] if has_hits else candidate_hits
    scored: list[tuple[float, dict]] = []

    for rec, lex_hits in candidates:
        emb = rec.get("embedding") or []
        base_score = cosine_similarity(question_emb, emb)
        lex_bonus = min(0.3 * lex_hits, 0.9)
        combined_score = base_score + lex_bonus
        scored.append((combined_score, rec))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_k = max(1, top_k)
    return [rec for score, rec in scored[:top_k] if score > 0.0]


@router.get("/docs-list", response_model=List[DocumentInfo])
def list_documents():
    base = get_docs_dir()
    if not base.exists() or not base.is_dir():
        return []
    docs: List[DocumentInfo] = []
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        stat = path.stat()
        docs.append(
            DocumentInfo(
                name=str(path.relative_to(base)),
                size=stat.st_size,
                modified=stat.st_mtime,
            )
        )
    docs.sort(key=lambda d: d.name.lower())
    return docs


@router.get("/rag-docs", response_model=List[DocumentInfo])
def list_rag_documents():
    docs_meta = get_all_documents()
    docs: List[DocumentInfo] = []
    for d in docs_meta:
        docs.append(
            DocumentInfo(
                name=d["file"],
                size=d["size"],
                modified=d["mtime"],
            )
        )
    return docs


@router.post("/rag-docs-delete")
def delete_rag_document(req: RagDocDeleteRequest):
    if not req.name:
        raise HTTPException(status_code=400, detail="Nome documento mancante.")
    delete_document_from_rag(req.name)
    return {"status": "ok", "deleted": req.name}


@router.get("/doc-file/{filename:path}")
def get_doc_file(filename: str):
    base = get_docs_dir()
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=404, detail="Cartella documenti non disponibile.")
    direct_path = base / filename
    if direct_path.exists() and direct_path.is_file():
        return FileResponse(direct_path)
    for path in base.rglob("*"):
        if path.is_file() and path.name == filename:
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="File non trovato.")


@router.get("/rag-status")
def rag_status():
    base = get_docs_dir()
    if not base.exists() or not base.is_dir():
        return {
            "docs_dir_exists": False, "total_fs_files": 0, "total_indexed_files": 0,
            "new_files": [], "modified_files": [], "removed_files": [],
            "has_new": False, "has_modified": False, "has_removed": False,
            "note": "La cartella documenti non esiste o non è una directory.",
        }
    fs_files: dict[str, dict] = {}
    for path in base.rglob("*"):
        if path.is_file():
            stat = path.stat()
            fs_files[path.name] = {"file": path.name, "mtime": stat.st_mtime, "size": stat.st_size}
    
    db_docs = get_all_documents()
    
    # Crea una mappa dei file nel DB, gestendo anche quelli con prefisso OCR
    db_map = {}
    for d in db_docs:
        fname = str(d["file"])
        # Se è un file OCR, rimuovi il prefisso per il confronto con il file system
        if fname.startswith(OCR_PREFIX):
            original_name = fname[len(OCR_PREFIX):]
            db_map[original_name] = d
        else:
            db_map[fname] = d
            
    new_files, modified_files, removed_files = [], [], []
    for name, fs_meta in fs_files.items():
        if name not in db_map:
            new_files.append(name)
        else:
            db_meta = db_map[name]
            # Per i file OCR, ignoriamo il check di size/mtime perché il contenuto è il testo OCR, non il file binario
            is_ocr = str(db_meta["file"]).startswith(OCR_PREFIX)
            if not is_ocr:
                if (fs_meta["size"] != db_meta["size"] or abs(fs_meta["mtime"] - db_meta["mtime"]) > 1e-3):
                    modified_files.append(name)
                    
    for name in db_map.keys():
        if name not in fs_files:
            # Se è un file OCR e il file originale non esiste più, lo segniamo come rimosso
            removed_files.append(name)
            
    return {
        "docs_dir_exists": True, "total_fs_files": len(fs_files), "total_indexed_files": len(db_map),
        "new_files": sorted(new_files), "modified_files": sorted(modified_files), "removed_files": sorted(removed_files),
        "has_new": bool(new_files), "has_modified": bool(modified_files), "has_removed": bool(removed_files),
    }


@router.post("/reindex", response_model=ReindexResponse)
def reindex_documents():
    files, chunks = index_documents()
    return ReindexResponse(files=files, chunks=chunks, saved_to="SQLite DB (rag_index.db)")


@router.post("/reindex-file")
def reindex_single_document_endpoint(req: ReindexFileRequest):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome del file mancante.")

    docs_dir = get_docs_dir()
    base_dir = docs_dir.resolve()
    target_path = (docs_dir / name).resolve()
    try:
        target_path.relative_to(base_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Percorso non valido.")

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="File non trovato nella cartella documenti.")

    files, chunks = index_single_document(target_path)
    if files == 0 or chunks == 0:
        raise HTTPException(status_code=400, detail="Impossibile indicizzare il file selezionato.")

    return {"status": "ok", "file": target_path.name, "chunks": chunks}


@router.post("/ocr-image-index", response_model=OcrIndexResponse)
async def ocr_image_index(file: UploadFile = File(...)):
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="Nome del file mancante.")
    if not _is_image_filename(filename):
        raise HTTPException(status_code=400, detail="Il file selezionato non e' un'immagine supportata.")
    target_model_id = None
    if is_api_provider_enabled_for_mode("rag"):
        settings = get_api_provider_settings()
        if not settings.get("api_base_url") or not settings.get("api_model"):
            raise HTTPException(
                status_code=400,
                detail="Configura base URL e modello nel pannello API per usare il provider esterno.",
            )
        if not settings.get("api_supports_vision"):
            raise HTTPException(status_code=400, detail="Il provider selezionato non supporta immagini.")
        if not settings.get("api_supports_ocr"):
            raise HTTPException(status_code=400, detail="Il provider selezionato non supporta OCR.")
        target_model_id = settings.get("api_model")
    else:
        default_id = get_llm_model_id()
        vision_id = get_llm_model_vision_id()

        default_info = get_llm_model_info(default_id)
        default_caps = default_info.get("capabilities", {})
        if default_caps.get("vision") and default_caps.get("ocr"):
            target_model_id = default_id
        else:
            if vision_id:
                vision_info = get_llm_model_info(vision_id)
                vision_caps = vision_info.get("capabilities", {})
                if vision_caps.get("vision") and vision_caps.get("ocr"):
                    target_model_id = vision_id
                else:
                    if not vision_caps.get("vision"):
                        raise HTTPException(status_code=400, detail="Il modello selezionato non supporta immagini.")
                    if not vision_caps.get("ocr"):
                        raise HTTPException(status_code=400, detail="Il modello selezionato non supporta OCR.")
            else:
                if not default_caps.get("vision"):
                    raise HTTPException(status_code=400, detail="Il modello selezionato non supporta immagini.")
                if not default_caps.get("ocr"):
                    raise HTTPException(status_code=400, detail="Il modello selezionato non supporta OCR.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Immagine vuota.")
    if len(content) > MAX_OCR_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Immagine troppo grande.")

    mime = (file.content_type or "").strip() or "image/png"
    encoded = base64.b64encode(content).decode("ascii")
    data_url = f"data:{mime};base64,{encoded}"

    text = _extract_ocr_text(data_url, model_id=target_model_id)
    if not text:
        raise HTTPException(status_code=400, detail="Nessun testo rilevato nell'immagine.")

    header = f"[OCR IMMAGINE] File: {filename}"
    full_text = f"{header}\n\n{text}"
    chunks = split_into_chunks(full_text, RAG_CHUNK_MAX_CHARS, RAG_CHUNK_OVERLAP)
    if not chunks:
        raise HTTPException(status_code=400, detail="Impossibile dividere il testo OCR in chunk.")

    file_label = _build_ocr_filename(filename)
    delete_document_from_rag(file_label)

    chunk_records = []
    for idx, chunk in enumerate(chunks):
        emb = get_embedding(chunk)
        if not emb:
            continue
        chunk_records.append(
            {
                "file": file_label,
                "chunk_index": idx,
                "text": chunk,
                "embedding": emb,
            }
        )
    if not chunk_records:
        raise HTTPException(status_code=400, detail="Embedding non disponibili per il testo OCR.")

    insert_chunks(chunk_records)
    upsert_documents(
        [
            {
                "file": file_label,
                "mtime": time.time(),
                "size": len(full_text),
            }
        ]
    )
    return OcrIndexResponse(name=file_label, chunks=len(chunk_records))


@router.post("/ask")
def ask_documents(req: AskRequest):
    if is_api_provider_enabled_for_mode("rag"):
        settings = get_api_provider_settings()
        if not settings.get("api_base_url") or not settings.get("api_model"):
            raise HTTPException(
                status_code=400,
                detail="Configura base URL e modello nel pannello API per usare il provider esterno.",
            )
    effective_top_k = adjust_retrieval_top_k(req.top_k, RAG_TOP_K_DEFAULT)
    top_chunks = get_relevant_chunks(req.question, effective_top_k)
    if not top_chunks:
        return {"error": "Indice documenti vuoto o nessun chunk rilevante. Chiama prima /api/reindex."}

    parts, sources = [], []
    for rec in top_chunks:
        parts.append(
            f"=== FILE: {rec['file']} (chunk {rec['chunk_index']}) ===\n{rec['text']}"
        )
        sources.append({"file": rec["file"], "chunk_index": rec["chunk_index"]})

    context_text = "\n\n".join(parts)

    effective_language = normalize_language(req.language)
    user_prompt = get_prompt_text(PROMPT_RAG_DOCS_USER_TEMPLATE, effective_language).format(
        context_text=context_text,
        question=req.question,
    )
    user_prompt = f"{user_prompt}\n\n{build_response_instruction(effective_language)}"
    system = apply_user_info_to_system_prompt(
        get_prompt_text(PROMPT_RAG_DOCS_SYSTEM, effective_language)
    )
    system, strip_thoughts = _apply_thinking_mode(system)
    if strip_thoughts and is_llm_thoughts_visible():
        strip_thoughts = False

    history_messages: list[dict] = []
    if req.history:
        for m in req.history:
            q = (m.get("question") or "").strip()
            a = (m.get("answer") or "").strip()
            if q:
                history_messages.append({"role": "user", "content": q})
            if a:
                history_messages.append({"role": "assistant", "content": a})

    trimmed_history, context_plan = prepare_history_window(
        req.question,
        history_messages,
        [context_text],
    )

    return build_llm_response(
        system,
        user_prompt,
        trimmed_history,
        response_field="answer",
        extra_sources=sources,
        extra_payload={"context_plan": context_plan},
        max_tokens_override=context_plan.get("response_tokens_budget"),
        strip_thoughts=strip_thoughts,
        request_mode="rag",
    )


@router.post("/temp-doc/upload", response_model=TempDocUploadResponse)
async def upload_temp_document(file: UploadFile = File(...)):
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="Nome del file mancante.")

    suffix = Path(filename).suffix.lower()
    if suffix in AUDIO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Per la trascrizione audio usa il pulsante dedicato.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".tmp") as tmp:
        tmp.write(await file.read())
        temp_path = Path(tmp.name)

    try:
        extracted_text = extract_text_from_file(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

    if not extracted_text or not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Impossibile estrarre testo utile dal documento caricato.")

    chunk_texts = split_into_chunks(
        extracted_text,
        max_chars=RAG_CHUNK_MAX_CHARS,
        overlap=RAG_CHUNK_OVERLAP,
    )
    chunk_records: list[dict] = []
    for idx, chunk_text in enumerate(chunk_texts):
        emb = get_embedding(chunk_text)
        if not emb:
            continue
        chunk_records.append(
            {
                "file": filename,
                "chunk_index": idx,
                "text": chunk_text,
                "embedding": emb,
            }
        )

    if not chunk_records:
        raise HTTPException(status_code=400, detail="Nessun contenuto indicizzabile trovato nel file.")

    doc_id = _register_temp_doc(
        {
            "name": filename,
            "chunks": chunk_records,
            "size": len(extracted_text),
            "created_at": time.time(),
        }
    )

    return TempDocUploadResponse(
        temp_doc_id=doc_id,
        name=filename,
        size=len(extracted_text),
        chunks=len(chunk_records),
    )


@router.post("/temp-doc/ask")
def ask_temp_document(req: TempDocAskRequest):
    if is_api_provider_enabled_for_mode("rag"):
        settings = get_api_provider_settings()
        if not settings.get("api_base_url") or not settings.get("api_model"):
            raise HTTPException(
                status_code=400,
                detail="Configura base URL e modello nel pannello API per usare il provider esterno.",
            )
    doc = _get_temp_doc(req.temp_doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento temporaneo non trovato o scaduto.")

    effective_top_k = adjust_retrieval_top_k(req.top_k, RAG_TOP_K_DEFAULT)
    top_chunks = _rank_temp_chunks(req.question, doc.get("chunks") or [], effective_top_k)
    if not top_chunks:
        return {"error": "Nessun contenuto rilevante trovato nel documento caricato."}

    parts, sources = [], []
    for rec in top_chunks:
        header = f"=== FILE TEMPORANEO: {doc['name']} (chunk {rec['chunk_index']}) ==="
        parts.append(f"{header}\n{rec['text']}")
        sources.append(
            {
                "file": doc["name"],
                "chunk_index": rec["chunk_index"],
                "temp_doc_id": req.temp_doc_id,
            }
        )

    context_text = "\n\n".join(parts)
    effective_language = normalize_language(req.language)
    user_prompt = get_prompt_text(PROMPT_RAG_DOCS_USER_TEMPLATE, effective_language).format(
        context_text=context_text,
        question=req.question,
    )
    user_prompt = f"{user_prompt}\n\n{build_response_instruction(effective_language)}"
    system = apply_user_info_to_system_prompt(
        get_prompt_text(PROMPT_RAG_DOCS_SYSTEM, effective_language)
    )
    system, strip_thoughts = _apply_thinking_mode(system)
    if strip_thoughts and is_llm_thoughts_visible():
        strip_thoughts = False

    history_messages: list[dict] = []
    if req.history:
        for m in req.history:
            q = (m.get("question") or "").strip()
            a = (m.get("answer") or "").strip()
            if q:
                history_messages.append({"role": "user", "content": q})
            if a:
                history_messages.append({"role": "assistant", "content": a})

    trimmed_history, context_plan = prepare_history_window(
        req.question,
        history_messages,
        [context_text],
    )

    return build_llm_response(
        system,
        user_prompt,
        trimmed_history,
        response_field="answer",
        extra_sources=sources,
        extra_payload={"doc_name": doc["name"], "context_plan": context_plan},
        max_tokens_override=context_plan.get("response_tokens_budget"),
        strip_thoughts=strip_thoughts,
        request_mode="rag",
    )


@router.delete("/temp-doc/{temp_doc_id}")
def delete_temp_document(temp_doc_id: str):
    removed = _remove_temp_doc(temp_doc_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Documento temporaneo non trovato.")
    return {"status": "deleted", "temp_doc_id": temp_doc_id}
