const API_BASE = "http://127.0.0.1:8001";

let currentMode = "chat"; // "chat" oppure "rag"
window.currentMode = currentMode;
let currentChatId = null; // id della chat salvata correntemente caricata (se esiste)
let currentChatMessages = []; // lista di {question, answer}
let currentChatTitle = "";   // titolo della chat attualmente attiva (se salvata)
let currentUserPreferences = null;

const el = (id) => document.getElementById(id);

const chatHistory = el("chat-history");
const chatHistorySearch = el("chat-history-search");
const btnModeHistory = el("btn-mode-history");
const currentChatTitleEl = el("current-chat-title");

// Elementi principali
const btnModeChat = el("btn-mode-chat");
const btnModeRag = el("btn-mode-rag");
const inputTitle = el("input-title");
const userInput = el("user-input");
const btnSend = el("btn-send");
const btnNoteMode = el("btn-note-mode");
const chkGraphicsMode = el("chk-graphics-mode");
let mcpSuggestBox = null;
let mcpSuggestState = { open: false, start: null, prefix: "", items: [], activeIndex: -1 };


const ragPanel = el("rag-panel");
const ragDocsList = el("rag-docs-list");
const btnReindex = el("btn-reindex");
const btnRefreshDocs = el("btn-refresh-docs");
const ragStatus = el("rag-status");
const ragIndexList = el("rag-index-list");
const audioFileInput = el("audio-file");
const audioPanel = el("audio-panel");
const liveTranscribeBtn = el("btn-live-transcribe");
const chkWebSearch = el("chk-web-search");
const chkMcp = el("chk-mcp");
const chkThinking = el("chk-thinking");
const graphicsToggleLabel = el("graphics-toggle-label");

const messagesContainer = el("messages-container");
const btnClearChat = el("btn-clear-chat");
const btnSaveChat = el("btn-save-chat");
const btnDeleteChat = el("btn-delete-chat");
const outputStatus = el("output-status");

function getUiClickGuardMs() {
  const raw = window.currentServerConfig?.ui_click_guard_ms;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 400;
}
window.getUiClickGuardMs = getUiClickGuardMs;

const appClickGuard = new Map();
function isRapidAppClick(key, thresholdMs) {
  const guardMs = typeof thresholdMs === "number" ? thresholdMs : getUiClickGuardMs();
  const now = Date.now();
  const last = appClickGuard.get(key) || 0;
  if (now - last < guardMs) {
    return true;
  }
  appClickGuard.set(key, now);
  return false;
}

function clearTranslationData(el) {
  if (!el || !el.dataset) return;
  delete el.dataset.translateKey;
  delete el.dataset.translateAttr;
  delete el.dataset.translateParams;
}

function applyTranslation(el, payload, params = {}, attr = "text") {
  if (!el) return;
  const attrName = attr === "text" ? undefined : attr;
  if (window.i18n && typeof window.i18n.applyToElement === "function") {
    if (typeof payload === "object" && payload !== null && payload.key) {
      const p = payload.params || params;
      window.i18n.applyToElement(el, payload.key, p, attrName);
      return;
    }
    if (
      typeof payload === "string" &&
      (!window.i18n.hasKey || window.i18n.hasKey(payload))
    ) {
      window.i18n.applyToElement(el, payload, params, attrName);
      return;
    }
    const literal =
      (window.i18n.resolveText && window.i18n.resolveText(payload, params)) ||
      (typeof payload === "string" ? payload : "");
    clearTranslationData(el);
    if (attr === "text") {
      el.textContent = literal;
    } else if (attr) {
      el.setAttribute(attr, literal);
    }
    return;
  }
  clearTranslationData(el);
  const key = (typeof payload === "object" && payload && payload.key) ? payload.key : payload;
  const value = typeof key === "string" ? key : "";
  if (attr === "text") {
    el.textContent = value;
  } else {
    el.setAttribute(attr, value);
  }
}

function translateText(key, params = {}) {
  if (window.i18n && window.i18n.translate) {
    return window.i18n.translate(key, params);
  }
  return typeof key === "string" ? key : "";
}

function resolveAppLanguage() {
  if (window.i18n) {
    if (window.i18n.currentLanguage) {
      return window.i18n.currentLanguage;
    }
    if (typeof window.i18n.getCurrentLanguage === "function") {
      return window.i18n.getCurrentLanguage() || "it";
    }
  }
  return document.documentElement.lang || "it";
}

function resolveWebSearchMail(cfg, prefs) {
  const prefMail = typeof prefs?.web_search_user_mail === "string" ? prefs.web_search_user_mail : "";
  const cfgMail = typeof cfg?.web_search_user_mail === "string" ? cfg.web_search_user_mail : "";
  return (prefMail || cfgMail || "").trim();
}

function syncWebSearchToggleState(cfg = window.currentServerConfig, prefs = window.currentUserPreferences) {
  if (!chkWebSearch) return;
  const mail = resolveWebSearchMail(cfg, prefs);
  const allowWebSearch = Boolean(mail);
  chkWebSearch.disabled = !allowWebSearch;
  if (!allowWebSearch) {
    chkWebSearch.checked = false;
  }
  const label = chkWebSearch.closest("label");
  if (label) {
    label.classList.toggle("web-search-disabled", !allowWebSearch);
  }
}

function syncHelpLink() {
  const link = document.getElementById("footer-help-link");
  if (!link) return;
  const lang = (window.i18n && window.i18n.currentLanguage) || document.documentElement.lang || "it";
  const normalized = String(lang).toLowerCase();
  const href = normalized === "en" ? "docs/help_EN.html" : "docs/help_IT.html";
  link.setAttribute("href", href);
}

function setOutputStatus(payload, params = {}) {
  if (!outputStatus) return;
  applyTranslation(outputStatus, payload, params);
}

// Barra di stato globale
const progressBar = el("global-progress");

// Config modal
const btnConfig = el("btn-config");
const configModal = el("config-modal");
const configBody = el("config-body");
const modalCloseTop = el("modal-close");
const modalCloseBottom = el("modal-close-bottom");

// Utili UI
function setCurrentChatTitle(title) {
  currentChatTitle = title || "";
  if (currentChatTitleEl) {
    currentChatTitleEl.textContent = currentChatTitle;
  }
}

function startGlobalLoading(message) {
  if (message) {
    setOutputStatus(message);
  }
  if (progressBar) {
    progressBar.classList.add("visible");
  }
}

function stopGlobalLoading(message) {
  if (message) {
    setOutputStatus(message);
  }
  if (progressBar) {
    progressBar.classList.remove("visible");
  }
}

function setMode(newMode) {
  const allowNotepad = newMode !== "history";
  const allowGraphics = newMode !== "history";
  if (btnNoteMode) {
    btnNoteMode.classList.toggle("hidden", !allowNotepad);
  }
  if (window.Notepad && !allowNotepad) {
    window.Notepad.deactivate();
  }
  if (window.graphicsUI && window.graphicsUI.isActive()) {
    window.graphicsUI.deactivate();
  }
  if (window.graphicsUI && !allowGraphics) {
    window.graphicsUI.deactivate();
  }
  if (chkGraphicsMode) {
    chkGraphicsMode.disabled = !allowGraphics;
    if (!allowGraphics) {
      chkGraphicsMode.checked = false;
    }
  }
  currentMode = newMode;
  window.currentMode = currentMode;
  if (window.Notepad && typeof window.Notepad.onModeChange === "function") {
    window.Notepad.onModeChange(newMode);
  }
  if (window.graphicsUI && typeof window.graphicsUI.onModeChange === "function") {
    window.graphicsUI.onModeChange(newMode);
  }

  // Nuova chat: azzero id e messaggi
  currentChatId = null;
  currentChatMessages = [];
  messagesContainer.innerHTML = "";
  setOutputStatus("");

  // Reset titolo chat attiva
  setCurrentChatTitle("");
  
  // Pulisce sempre la textarea quando cambio modalità
  userInput.value = "";
  hideMcpSuggest();
  if (window.audioUI && typeof window.audioUI.resetUploadPanel === "function") {
    window.audioUI.resetUploadPanel({ notifyServer: true });
  } else if (audioFileInput) {
    audioFileInput.value = "";
    if (window.ttsUI && typeof window.ttsUI.onFileCleared === "function") {
      window.ttsUI.onFileCleared();
    }
  }
  if (chkWebSearch) {
    chkWebSearch.checked = false;
    if (window.webSearchUI && typeof window.webSearchUI.bindToggle === "function") {
      // nothing extra needed, state read dynamically
    }
  }
  if (chkMcp) {
    chkMcp.checked = false;
    chkMcp.dispatchEvent(new Event("change"));
    if (window.mcpUI && window.mcpUI.onModeChange) {
      window.mcpUI.onModeChange(newMode);
    }
  }
  if (chkThinking) {
      chkThinking.checked = false;
  }

  // Reset dei pulsanti attivi
  btnModeChat.classList.remove("sidebar-btn-active");
  btnModeRag.classList.remove("sidebar-btn-active");
  btnModeHistory.classList.remove("sidebar-btn-active");

  const toggleLabels = document.querySelectorAll(".web-search-label");
  toggleLabels.forEach((label) => {
    label.style.display = newMode === "chat" ? "flex" : "none";
  });
  if (graphicsToggleLabel) {
    graphicsToggleLabel.style.display = allowGraphics ? "flex" : "none";
  }

  if (audioPanel) {
    if (newMode === "chat") {
      audioPanel.classList.remove("hidden");
    } else {
      audioPanel.classList.add("hidden");
    }
  }

  if (liveTranscribeBtn) {
    if (newMode === "chat") {
      liveTranscribeBtn.classList.remove("hidden");
    } else {
      liveTranscribeBtn.classList.add("hidden");
    }
  }

  if (window.mcpUI && typeof window.mcpUI.onModeChange === "function") {
    window.mcpUI.onModeChange(newMode);
  }

  if (newMode === "chat") {
    btnModeChat.classList.add("sidebar-btn-active");
    if (window.i18n) {
      window.i18n.applyToElement(inputTitle, "inputTitle");
    }
    ragPanel.classList.add("hidden");
    setOutputStatus("chatModeStatus");
  } else if (newMode === "rag") {
    btnModeRag.classList.add("sidebar-btn-active");
    if (window.i18n) {
      window.i18n.applyToElement(inputTitle, "ragInputTitle");
    }
    ragPanel.classList.remove("hidden");
    setOutputStatus("ragModeStatus");
    if (window.ragUI) {
      window.ragUI.loadDocsList();
      window.ragUI.checkRagStatus();
      window.ragUI.loadRagIndexList();
    }
  } else if (newMode === "history") {
    btnModeHistory.classList.add("sidebar-btn-active");
    if (window.i18n) {
      window.i18n.applyToElement(inputTitle, "historyInputTitle");
    }
    ragPanel.classList.add("hidden");
    setOutputStatus("historyModeStatus");
  }
  if (window.llmUI && typeof window.llmUI.refreshModelBadge === "function") {
    window.llmUI.refreshModelBadge();
  }
}

function ensureMcpSuggestBox() {
  if (mcpSuggestBox || !userInput) return mcpSuggestBox;
  const inputSection = userInput.closest(".input-section");
  if (!inputSection) return null;
  const box = document.createElement("div");
  box.className = "mcp-suggest-box hidden";
  inputSection.insertBefore(box, userInput.nextSibling);
  mcpSuggestBox = box;
  return box;
}

function hideMcpSuggest() {
  if (!mcpSuggestBox) return;
  mcpSuggestBox.classList.add("hidden");
  mcpSuggestBox.innerHTML = "";
  mcpSuggestState = { open: false, start: null, prefix: "", items: [], activeIndex: -1 };
}

function findMcpToken(value, caret) {
  const before = value.slice(0, caret);
  const match = before.match(/(^|\s)@([^\s:]*)$/);
  if (!match) return null;
  const start = match.index + match[1].length;
  return { start, prefix: match[2] || "" };
}

function applyMcpSuggestion(name) {
  if (!userInput || mcpSuggestState.start === null) return;
  const value = userInput.value || "";
  const caret = userInput.selectionStart ?? value.length;
  const before = value.slice(0, mcpSuggestState.start);
  const after = value.slice(caret);
  const nextValue = `${before}@${name} ${after}`;
  userInput.value = nextValue;
  const nextCaret = mcpSuggestState.start + name.length + 2;
  userInput.setSelectionRange(nextCaret, nextCaret);
  userInput.focus();
  hideMcpSuggest();
}

async function updateMcpSuggest() {
  if (!userInput || window.currentMode !== "chat") {
    hideMcpSuggest();
    return;
  }
  const value = userInput.value || "";
  const caret = userInput.selectionStart ?? value.length;
  const match = findMcpToken(value, caret);
  if (!match) {
    hideMcpSuggest();
    return;
  }
  const box = ensureMcpSuggestBox();
  if (!box || !window.mcpUI || typeof window.mcpUI.getServicesSnapshot !== "function") {
    hideMcpSuggest();
    return;
  }
  const services = await window.mcpUI.getServicesSnapshot();
  if (!services.length) {
    hideMcpSuggest();
    return;
  }
  const prefix = match.prefix.toLowerCase();
  const filtered = services.filter((svc) =>
    String(svc?.name || "").toLowerCase().startsWith(prefix)
  );
  if (!filtered.length) {
    hideMcpSuggest();
    return;
  }

  const items = filtered.map((svc) => {
    const name = String(svc?.name || "").trim();
    const label = svc?.label ? ` · ${svc.label}` : "";
    const type = svc?.type ? ` (${svc.type})` : "";
    return {
      name,
      text: `@${name}${label}${type}`,
    };
  });
  mcpSuggestState = {
    open: true,
    start: match.start,
    prefix: match.prefix,
    items,
    activeIndex: items.length ? 0 : -1,
  };
  box.innerHTML = "";
  items.forEach((entry, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "mcp-suggest-item";
    itemEl.textContent = entry.text;
    if (index === mcpSuggestState.activeIndex) {
      itemEl.classList.add("active");
    }
    itemEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      applyMcpSuggestion(entry.name);
    });
    box.appendChild(itemEl);
  });
  box.classList.remove("hidden");
}

function setupMcpAutocomplete() {
  if (!userInput) return;
  ensureMcpSuggestBox();
  userInput.addEventListener("input", () => {
    updateMcpSuggest();
  });
  userInput.addEventListener("click", () => {
    updateMcpSuggest();
  });
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideMcpSuggest();
      return;
    }
    if (!mcpSuggestState.open || !mcpSuggestState.items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      mcpSuggestState.activeIndex =
        (mcpSuggestState.activeIndex + 1) % mcpSuggestState.items.length;
      updateMcpSuggestSelection();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      mcpSuggestState.activeIndex =
        (mcpSuggestState.activeIndex - 1 + mcpSuggestState.items.length) %
        mcpSuggestState.items.length;
      updateMcpSuggestSelection();
      return;
    }
    if (e.key === "Enter") {
      if (mcpSuggestState.activeIndex >= 0) {
        e.preventDefault();
        const entry = mcpSuggestState.items[mcpSuggestState.activeIndex];
        if (entry) {
          applyMcpSuggestion(entry.name);
        }
      }
    }
  });
  userInput.addEventListener("blur", () => {
    setTimeout(() => hideMcpSuggest(), 150);
  });
}

function updateMcpSuggestSelection() {
  if (!mcpSuggestBox) return;
  const items = mcpSuggestBox.querySelectorAll(".mcp-suggest-item");
  items.forEach((item, idx) => {
    item.classList.toggle("active", idx === mcpSuggestState.activeIndex);
  });
}

async function loadChatHistory() {
  if (window.historyUI && typeof window.historyUI.loadChatHistory === "function") {
    return window.historyUI.loadChatHistory();
  }
  return Promise.resolve();
}

function renderSourcesForBlock(block, sources, mode = currentMode, answerText = "") {
  if (!block) return;
  const existing = block.querySelector(".message-sources");
  if (existing) {
    existing.remove();
  }

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return;
  }

  let filteredSources = sources;

  if (mode === "rag" && typeof answerText === "string") {
    const answerLower = answerText.toLowerCase();
    const uniqueMatched = [];
    const seenFiles = new Set();

    for (const s of sources) {
      if (!s.file) continue;
      const fLower = s.file.toLowerCase();
      if (!answerLower.includes(fLower)) continue;
      if (seenFiles.has(fLower)) continue;
      seenFiles.add(fLower);
      uniqueMatched.push(s);
    }

    if (uniqueMatched.length > 0) {
      filteredSources = uniqueMatched;
    } else {
      const fallbackSeen = new Set();
      filteredSources = sources.filter((s) => {
        if (!s.file) return false;
        const name = s.file.toLowerCase();
        if (fallbackSeen.has(name)) return false;
        fallbackSeen.add(name);
        return true;
      });
    }
  }

  const sourcesBar = document.createElement("div");
  sourcesBar.className = "message-sources";

  const label = document.createElement("span");
  label.className = "message-sources-label";
  applyTranslation(label, "sourcesLabel");
  sourcesBar.appendChild(label);

  filteredSources.forEach((src, idx) => {
    const chip = document.createElement("button");
    chip.className = "source-chip";

    if (mode === "rag") {
      chip.textContent = src.file;
      chip.addEventListener("click", () => {
        const url = `${API_BASE}/api/doc-file/${encodeURIComponent(src.file)}`;
        window.open(url, "_blank");
      });
    } else if (mode === "history") {
      const title = src.title || `Chat ${src.chat_id}`;
      chip.textContent = `${title} (#${src.msg_index})`;
      chip.addEventListener("click", () => {
        loadChatFromHistory(src.chat_id, src.msg_index);
      });
    } else if (mode === "chat") {
      const sourceType = (src.source || "").toLowerCase();
      if (sourceType === "mcp") {
        chip.textContent = `[MCP] ${src.title || src.client || "Servizio"}`;
        chip.title = src.description || src.content || "";
        chip.classList.add("source-chip-static");
      } else {
        let prefix = "";
        if (sourceType === "wikipedia") prefix = "[W] ";
        else if (sourceType === "duckduckgo") prefix = "[D] ";

        const title = src.title || src.url || "link";
        chip.textContent = prefix + title;
        if (src.url) {
          chip.addEventListener("click", () => {
            window.open(src.url, "_blank");
          });
        }
      }
    }

    if (idx > 0) {
      const sep = document.createTextNode(" ");
      sourcesBar.appendChild(sep);
    }
    sourcesBar.appendChild(chip);
  });

  block.appendChild(sourcesBar);
}

function appendMessageBlock(
  question,
  answer,
  sources = [],
  mode = currentMode,
  msgIndex = null
) {
  const parseThoughtBlocks = (text) => {
    const raw = text || "";
    let cursor = 0;
    let thought = "";
    let finalText = "";
    let incomplete = false;
    while (true) {
      const start = raw.indexOf("<think>", cursor);
      if (start === -1) {
        finalText += raw.slice(cursor);
        break;
      }
      finalText += raw.slice(cursor, start);
      const end = raw.indexOf("</think>", start + 7);
      if (end === -1) {
        thought += raw.slice(start + 7);
        cursor = raw.length;
        incomplete = true;
        break;
      }
      thought += raw.slice(start + 7, end);
      cursor = end + 8;
    }
    return {
      thought: thought.trim(),
      final: finalText.trim(),
      incomplete,
    };
  };

  const parsed = parseThoughtBlocks(answer);

  if (window.graphicsUI && typeof window.graphicsUI.parseAnswer === "function") {
    const graphicsPayload = window.graphicsUI.parseAnswer(parsed.final);
    if (graphicsPayload && typeof window.graphicsUI.appendGraphicsBlock === "function") {
      return window.graphicsUI.appendGraphicsBlock({
        question,
        payload: graphicsPayload,
        sources,
        mode,
        msgIndex,
      });
    }
  }

  const block = document.createElement("div");
  block.className = "message-block";

  // Se non viene passato un indice, uso la lunghezza corrente dei messaggi
  const index =
    msgIndex !== null && msgIndex !== undefined
      ? msgIndex
      : currentChatMessages.length;

  block.dataset.msgIndex = String(index);

  const qHeader = document.createElement("div");
  qHeader.className = "message-header";
  applyTranslation(qHeader, "questionHeader");

  const qBody = document.createElement("div");
  qBody.className = "message-body";
  qBody.textContent = question;

  const aHeader = document.createElement("div");
  aHeader.className = "message-header";
  applyTranslation(aHeader, "answerHeader");

  const thoughtsDetails = document.createElement("details");
  thoughtsDetails.className = "message-thoughts hidden";
  const thoughtsSummary = document.createElement("summary");
  applyTranslation(thoughtsSummary, "thinkingHeader");
  const thoughtsBody = document.createElement("div");
  thoughtsBody.className = "message-thoughts-body";
  thoughtsDetails.appendChild(thoughtsSummary);
  thoughtsDetails.appendChild(thoughtsBody);
  const thoughtsWarning = document.createElement("div");
  thoughtsWarning.className = "message-warning hidden";
  applyTranslation(thoughtsWarning, "thinkingWarning");

  const aBody = document.createElement("div");
  aBody.className = "message-body";
  aBody.textContent = parsed.final;
  if (parsed.thought) {
    thoughtsBody.textContent = parsed.thought;
    thoughtsDetails.classList.remove("hidden");
  }
  if (parsed.incomplete) {
    thoughtsWarning.classList.remove("hidden");
  }

  block.appendChild(qHeader);
  block.appendChild(qBody);
  block.appendChild(aHeader);
  block.appendChild(thoughtsDetails);
  block.appendChild(thoughtsWarning);
  block.appendChild(aBody);

 
  // Fonti cliccabili (documenti / chat storiche / web)
  renderSourcesForBlock(block, sources, mode, parsed.final);

  messagesContainer.appendChild(block);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // struttura interna della chat (non salvo le fonti qui)
  currentChatMessages.push({ question, answer: parsed.final });
  return {
    block,
    index,
    answerElement: aBody,
    setAnswer(value, options = {}) {
      const parsedValue = parseThoughtBlocks(value || "");
      const finalText = parsedValue.final;
      aBody.textContent = finalText;
      if (parsedValue.thought) {
        thoughtsBody.textContent = parsedValue.thought;
        thoughtsDetails.classList.remove("hidden");
      } else {
        thoughtsBody.textContent = "";
        thoughtsDetails.classList.add("hidden");
      }
      const isFinal = options.isFinal !== false;
      if (isFinal && parsedValue.incomplete) {
        thoughtsWarning.classList.remove("hidden");
      } else {
        thoughtsWarning.classList.add("hidden");
      }
      if (currentChatMessages[index]) {
        currentChatMessages[index].answer = finalText;
      }
    },
    updateSources(newSources, forcedMode) {
      const actualMode = forcedMode || mode;
      renderSourcesForBlock(block, newSources, actualMode, aBody.textContent);
    },
  };
}

function highlightMessageBlock(targetIndex) {
  // Rimuove highlight precedenti
  const prev = messagesContainer.querySelectorAll(".message-highlight");
  prev.forEach((el) => el.classList.remove("message-highlight"));

  const selector = `.message-block[data-msg-index="${targetIndex}"]`;
  const block = messagesContainer.querySelector(selector);

  if (!block) {
    return;
  }

  block.classList.add("message-highlight");
  block.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

async function callChatAPI(question) {
  if (window.llmUI && typeof window.llmUI.callChatAPI === "function") {
    return window.llmUI.callChatAPI(question);
  }
  throw new Error("Chat API non disponibile.");
}

// Invio con Ctrl+Invio
if (window.llmUI && typeof window.llmUI.bindSend === "function") {
  window.llmUI.bindSend();
}

// Cambio modalità
btnModeChat.addEventListener("click", () => setMode("chat"));
btnModeRag.addEventListener("click", () => setMode("rag"));
btnModeHistory.addEventListener("click", () => setMode("history"));

// Pulisci chat
btnClearChat.addEventListener("click", () => {
  if (isRapidAppClick("clear-chat")) {
    return;
  }
  if (window.Notepad) window.Notepad.deactivate();
  if (window.graphicsUI) window.graphicsUI.deactivate();
  messagesContainer.innerHTML = "";
  userInput.value = "";
  setOutputStatus("statusChatCleaned");
  if (chkWebSearch) {
    chkWebSearch.checked = false;
  }
  if (chkMcp) {
    chkMcp.checked = false;
    chkMcp.dispatchEvent(new Event("change"));
    if (window.mcpUI && window.mcpUI.onModeChange) {
      window.mcpUI.onModeChange(currentMode);
    }
  }
  if (chkThinking) {
      chkThinking.checked = false;
  }

  currentChatMessages = [];
  currentChatId = null;
  setCurrentChatTitle("");
  
  // Reset del file audio selezionato
  if (window.audioUI && typeof window.audioUI.resetUploadPanel === "function") {
    window.audioUI.resetUploadPanel({ notifyServer: true });
  }
});

// Salvataggio chat o nota
btnSaveChat.addEventListener("click", async () => {
  if (isRapidAppClick("save-chat")) {
    return;
  }
  let payload;

  if (window.Notepad && window.Notepad.isActive()) {
    // --- Logica per salvare una NOTA ---
    const noteContent = window.Notepad.getContent();
    if (noteContent.trim() === "") {
      setOutputStatus("statusEmptyNote");
      return;
    }

    // Crea un div temporaneo per estrarre il testo puro per il titolo
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = noteContent;
    let title = tempDiv.textContent.trim().split('\n')[0]; // Prima riga come titolo

    if (!title) {
      title = `Nota ${new Date().toLocaleString()}`;
    } else if (title.length > 70) {
      title = title.slice(0, 70) + "...";
    }

    payload = {
      mode: 'notepad', // modo specifico per le note
      title: `Nota: ${title}`,
      content: noteContent, // Salva l'HTML puro dell'editor
    };

  } else {
    // --- Logica esistente per salvare una CHAT ---
    if (currentChatMessages.length === 0) {
      setOutputStatus("statusNoMessages");
      return;
    }

    const first = currentChatMessages[0];
    let title = first && first.question ? first.question.trim() : "";
    if (!title) {
      title = `Chat ${new Date().toLocaleString()}`;
    } else if (title.length > 80) {
      title = title.slice(0, 80) + "...";
    }

    payload = {
      mode: currentMode,
      title,
      content: JSON.stringify(currentChatMessages),
    };
  }

  setOutputStatus("statusSaving");

  try {
    const res = await fetch(`${API_BASE}/api/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Errore HTTP: " + res.status);
    }

    const data = await res.json();
    currentChatId = data.id;
    setCurrentChatTitle(data.title || payload.title);
    setOutputStatus("statusSaveSuccess");
    loadChatHistory();
  } catch (err) {
    console.error("Errore salvataggio:", err);
    setOutputStatus({ key: "statusSaveError", params: { error: err.message } });
  }
});

btnDeleteChat.addEventListener("click", async () => {
  if (isRapidAppClick("delete-chat")) {
    return;
  }
  if (!currentChatId) {
    setOutputStatus("statusNoChatAssociated");
    return;
  }

  setOutputStatus("statusDeleting");

  try {
    const res = await fetch(`${API_BASE}/api/chats/${currentChatId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error("Errore HTTP: " + res.status);
    }

    // Dopo la cancellazione azzero tutto
    currentChatId = null;
    currentChatMessages = [];
    messagesContainer.innerHTML = "";
    userInput.value = "";
	setCurrentChatTitle("");
    setOutputStatus("statusDeleteSuccess");
    loadChatHistory();
  } catch (err) {
    console.error("Errore cancellazione chat:", err);
    setOutputStatus({ key: "statusDeleteError", params: { error: err.message } });
  }
});


async function loadChatFromHistory(chatId, highlightIndex = null) {
  try {
    const res = await fetch(`${API_BASE}/api/chats/${chatId}`);
    if (!res.ok) throw new Error("Errore HTTP: " + res.status);
    
    const data = await res.json();

    // Azzera lo stato corrente
    messagesContainer.innerHTML = "";
    currentChatMessages = [];
    
    // --- Logica per caricare una NOTA ---
    if (data.mode === 'notepad' || (data.title && data.title.startsWith("Nota:"))) {
      if (window.Notepad) {
        window.Notepad.activate();
        window.Notepad.setContent(data.content);
      }
      // Imposta la modalità 'chat' per coerenza UI, anche se siamo in notepad
      setMode('chat'); 
      // Disattiva la modalità chat normale e attiva quella per le note
      if (window.Notepad) window.Notepad.activate();

    } else {
      // --- Logica esistente per caricare una CHAT ---
      if (window.Notepad) window.Notepad.deactivate();
      
      // Aggiorno la modalità in base alla chat salvata
      if (data.mode === "rag") setMode("rag");
      else if (data.mode === "history") setMode("history");
      else setMode("chat");

      let messages;
      try {
        messages = JSON.parse(data.content) || [];
      } catch (e) {
        messages = [];
      }

      messages.forEach((m, idx) => {
        appendMessageBlock(m.question || "", m.answer || "", [], data.mode, idx);
      });

      if (highlightIndex !== null) {
        highlightMessageBlock(highlightIndex);
      }
    }

    // Aggiorna stato comune
    currentChatId = data.id;
    setCurrentChatTitle(data.title || "");
    setOutputStatus("statusLoadSuccess");

  } catch (err) {
    console.error("Errore caricamento chat salvata:", err);
    setOutputStatus({ key: "statusLoadError", params: { error: err.message } });
  }
}

async function startRenameChatTitle(chat) {
  const chatId = chat && chat.id ? chat.id : currentChatId;
  if (!chatId) {
    setOutputStatus("statusNoChatAssociated");
    return;
  }

  const previousTitle = (chat && chat.title) || currentChatTitle || "";
  const newTitle = prompt("Inserisci il nuovo titolo per la chat:", previousTitle);
  if (newTitle === null) return; // Utente ha annullato

  const trimmed = newTitle.trim();
  if (!trimmed) {
    setOutputStatus("statusEmptyTitle");
    return;
  }

  if (trimmed === previousTitle) {
    setOutputStatus("statusUnchangedTitle");
    return;
  }

  setOutputStatus("statusRenaming");

  try {
    const res = await fetch(`${API_BASE}/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });

    if (!res.ok) {
      throw new Error("Errore HTTP: " + res.status);
    }

    const data = await res.json();
    if (chatId === currentChatId) {
      setCurrentChatTitle(data.title || trimmed);
    }

    await loadChatHistory();
    setOutputStatus("statusRenameSuccess");
  } catch (err) {
    console.error("Errore rinomina chat:", err);
    setOutputStatus({ key: "statusRenameError", params: { error: err.message } });
  }
}

// Modal configurazione
const configStepper = el("config-page-stepper");
const configPagesContainer = el("config-pages-container");
const configPagePrev = el("config-page-prev");
const configPageNext = el("config-page-next");
const configPageIndicator = el("config-page-indicator");

let renderedConfigPages = [];
let currentConfigPageIndex = 0;

function openConfigModal() {
  configModal.classList.remove("hidden");
  loadConfig();
}

function closeConfigModal() {
  configModal.classList.add("hidden");
}

async function loadConfig() {
  renderedConfigPages = [];
  currentConfigPageIndex = 0;
  configPagesContainer.innerHTML = '<div class="status-text">Caricamento...</div>';
  configStepper.innerHTML = "";
  updateConfigPagerState();

  try {
    const configUrl = `${API_BASE}/api/config?lang=${encodeURIComponent(resolveAppLanguage())}`;
    const [cfgRes, prefsRes] = await Promise.all([
      fetch(configUrl),
      fetch(`${API_BASE}/api/config/user`),
    ]);

    if (!cfgRes.ok) {
      const errorHtml = `<div class='status-text'>Endpoint /api/config non disponibile (HTTP ${cfgRes.status}). Aggiorna server.py.</div>`;
      configPagesContainer.innerHTML = errorHtml;
      return;
    }

    let prefs = null;
    if (prefsRes.ok) {
      prefs = await prefsRes.json();
    } else {
      console.warn("Preferenze utente non disponibili:", prefsRes.status);
    }
    currentUserPreferences = prefs;
    window.currentUserPreferences = prefs;
    syncWebSearchToggleState(window.currentServerConfig, prefs);

    const cfg = await cfgRes.json();
    window.currentServerConfig = cfg;
    renderConfigPages(cfg, currentUserPreferences);
    syncWebSearchToggleState(cfg, currentUserPreferences);
  } catch (err) {
    console.error("Errore caricamento configurazione:", err);
    const errorHtml = "<div class='status-text'>Errore nel recupero configurazione: " + err.message + "</div>";
    configPagesContainer.innerHTML = errorHtml;
  }
}

function snakeToPascal(str) {
  return str.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

const configValueFormatters = {
  tts_coqui_speaker_wavs: (value) => formatKeyValueLines(value),
};

const configPageDefinitions = [
  {
    id: "llm-models",
    titleKey: "configPageTitleLlmModels",
    descriptionKey: "configPageDescLlmModels",
    renderer: (pageEl, cfg, userPrefs) => renderLlmModelsPage(pageEl, cfg, userPrefs),
  },
  {
    id: "system",
    titleKey: "configPageTitleSystem",
    description: "Valori di base presenti in config.py. Le personalizzazioni utente sono in pagine dedicate.",
    renderer: (pageEl, cfg, userPrefs) => renderDefaultConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "llm",
    titleKey: "configPageTitleLlm",
    descriptionKey: "configPageDescLlm",
    renderer: (pageEl, cfg, userPrefs) => renderLlmConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "rag",
    titleKey: "configPageTitleRag",
    descriptionKey: "configPageDescRag",
    sections: [
      { titleKey: "configRagSectionRetrieval", type: "grid", keys: ["rag_top_k_default"] },
      { titleKey: "configRagSectionChunkingChars", type: "grid", keys: ["rag_chunk_max_chars", "rag_chunk_overlap"] },
      { titleKey: "configRagSectionChunkingLines", type: "grid", keys: ["rag_chunk_max_lines", "rag_chunk_overlap_lines"] },
      {
        titleKey: "configRagSectionParsing",
        type: "grid",
        keys: ["rag_excel_csv_max_rows", "rag_excel_csv_max_cols", "rag_min_keyword_len"],
      },
    ],
  },
  {
    id: "web",
    titleKey: "configPageTitleWeb",
    descriptionKey: "configPageDescWeb",
    renderer: (pageEl, cfg, userPrefs) => renderWebSearchConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "prompts",
    titleKey: "configPageTitlePrompts",
    descriptionKey: "configPageDescPrompts",
    sections: [
      { titleKey: "configPromptsSectionBase", type: "prompt", keys: ["prompt_chat_system"] },
      { titleKey: "configPromptsSectionRagDocs", type: "prompt", keys: ["prompt_rag_docs_system", "prompt_rag_docs_user_template"] },
      { titleKey: "configPromptsSectionRagChats", type: "prompt", keys: ["prompt_rag_chats_system", "prompt_rag_chats_user_template"] },
      {
        titleKey: "configPromptsSectionWeb",
        type: "prompt",
        keys: ["prompt_chat_web_system", "prompt_chat_web_user_template", "prompt_chat_web_fallback"],
      },
      { titleKey: "configPromptsSectionGraphics", type: "prompt", keys: ["prompt_graphics_system", "prompt_graphics_user_template"] },
    ],
  },
  {
    id: "graphics",
    titleKey: "configPageTitleGraphics",
    descriptionKey: "configPageDescGraphics",
    renderer: (pageEl, cfg, userPrefs) => renderGraphicsConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "audio",
    titleKey: "configPageTitleAudio",
    descriptionKey: "configPageDescAudio",
    sections: [{ titleKey: "configGraphicsSectionMain", type: "grid", keys: ["whisper_model_path", "whisper_device", "whisper_compute_type"] }],
  },
  {
    id: "tts",
    titleKey: "configPageTitleTts",
    descriptionKey: "configPageDescTts",
    sections: [
      {
        titleKey: "configTtsSectionModels",
        type: "grid",
        keys: [
          "tts_coqui_default_model",
          "tts_coqui_language_models",
          "tts_voices_dir",
          "tts_coqui_speaker",
          "tts_coqui_speaker_wav",
          "tts_coqui_speaker_wavs",
        ],
      },
      { titleKey: "configTtsSectionRuntime", type: "grid", keys: ["tts_coqui_use_gpu", "tts_coqui_tos_agreed", "tts_ffmpeg_binary"] },
      {
        titleKey: "configTtsSectionLimits",
        type: "grid",
        keys: ["tts_max_text_chars", "tts_truncate_at_break", "tts_allowed_formats", "tts_default_output_format"],
      },
    ],
  },
  {
    id: "mcp",
    titleKey: "configPageTitleMcp",
    descriptionKey: "configPageDescMcp",
    renderer: (pageEl, cfg, userPrefs) => renderMcpConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "api",
    titleKey: "configPageTitleApi",
    descriptionKey: "configPageDescApi",
    renderer: (pageEl, cfg, userPrefs) => {
      if (window.providersUI && typeof window.providersUI.renderApiConfigPage === "function") {
        return window.providersUI.renderApiConfigPage(pageEl, cfg, userPrefs, updateUserPreferences);
      }
      const fallback = document.createElement("div");
      fallback.className = "status-text";
      applyTranslation(fallback, "providerModuleMissing");
      pageEl.appendChild(fallback);
      return true;
    },
  },
  {
    id: "paths",
    titleKey: "configPageTitlePaths",
    description: "Percorsi personalizzati salvati nel database locale.",
    renderer: (pageEl, cfg, userPrefs) => renderPathsConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "user-info",
    titleKey: "configPageTitleUserInfo",
    description: "Dettagli opzionali da includere nei prompt di sistema.",
    renderer: (pageEl, cfg, userPrefs) => renderUserInfoConfigPage(pageEl, cfg, userPrefs),
  },
  {
    id: "preferences",
    titleKey: "configPageTitlePreferences",
    description: "Personalizzazioni salvate nel database locale.",
    renderer: (pageEl, cfg, userPrefs) => renderUserPreferencesPage(pageEl, cfg, userPrefs),
  },
];

function formatConfigValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "(vuoto)";
    if (value.every((item) => typeof item === "string")) {
      return value.join(", ");
    }
    if (value.every((item) => typeof item === "object")) {
      return value
        .map((item) => {
          const name = item.name ? `@${item.name}` : "";
          const title = item.label ? ` (${item.label})` : "";
          return name || title ? `${name}${title}` : JSON.stringify(item);
        })
        .join("; ");
    }
    return JSON.stringify(value);
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatKeyValueLines(value) {
  if (!value || typeof value !== "object") return String(value);
  const entries = Object.entries(value);
  if (!entries.length) return "(vuoto)";
  return entries.map(([key, val]) => `${key}: ${val}`).join("\n");
}

function formatMcpServices(value) {
  if (!Array.isArray(value)) return String(value);
  if (!value.length) return "(vuoto)";
  return value
    .map((svc) => {
      if (!svc || typeof svc !== "object") return String(svc);
      const name = svc.name ? `@${svc.name}` : "servizio";
      const label = svc.label ? ` ${svc.label}` : "";
      const type = svc.type ? ` (${svc.type})` : "";
      return `${name}${label}${type}`;
    })
    .join("\n");
}

function addRow(container, label, value) {
  const l = document.createElement("div");
  l.className = "config-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "config-value";
  v.textContent = formatConfigValue(value);
  container.appendChild(l);
  container.appendChild(v);
}

function createSectionHeader(title) {
  const header = document.createElement("div");
  header.className = "config-section-header";
  header.textContent = title;
  return header;
}

function buildGridSection(section, cfg) {
  const keys = section.keys || [];
  const availableKeys = keys.filter((key) => Object.prototype.hasOwnProperty.call(cfg, key));
  if (!availableKeys.length) return null;

  const wrapper = document.createElement("div");
  if (section.title || section.titleKey) {
    const header = createSectionHeader(section.title || "");
    if (section.titleKey) {
      applyTranslation(header, section.titleKey);
    }
    wrapper.appendChild(header);
  }

  const grid = document.createElement("div");
  grid.className = "config-grid";
  availableKeys.forEach((key) => {
    const label = translateText("configLabel" + snakeToPascal(key)) || key;
    const formatter = configValueFormatters[key] || null;
    addRow(grid, label, formatter ? formatter(cfg[key]) : cfg[key]);
  });
  wrapper.appendChild(grid);
  return wrapper;
}

function buildPromptSection(section, cfg) {
  const keys = section.keys || [];
  const availableKeys = keys.filter((key) => Object.prototype.hasOwnProperty.call(cfg, key));
  if (!availableKeys.length) return null;

  const wrapper = document.createElement("div");
  if (section.title || section.titleKey) {
    const header = createSectionHeader(section.title || "");
    if (section.titleKey) {
      applyTranslation(header, section.titleKey);
    }
    wrapper.appendChild(header);
  }
  const list = document.createElement("div");
  list.className = "config-prompt-list";

  availableKeys.forEach((key) => {
    const item = document.createElement("div");
    const labelEl = document.createElement("div");
    labelEl.className = "config-prompt-label";
    labelEl.textContent = translateText("configLabel" + snakeToPascal(key)) || key;
    const textEl = document.createElement("pre");
    textEl.className = "config-prompt-block";
    textEl.textContent = cfg[key];
    item.appendChild(labelEl);
    item.appendChild(textEl);
    list.appendChild(item);
  });

  wrapper.appendChild(list);
  return wrapper;
}

function buildSection(section, cfg) {
  if (!section) return null;
  if (section.type === "prompt") {
    return buildPromptSection(section, cfg);
  }
  return buildGridSection(section, cfg);
}

function buildKeyValueSection(title, rows) {
  const wrapper = document.createElement("div");
  if (title) {
    wrapper.appendChild(createSectionHeader(title));
  }
  const grid = document.createElement("div");
  grid.className = "config-grid";
  (rows || []).forEach((row) => {
    addRow(grid, row.label, row.value);
  });
  wrapper.appendChild(grid);
  return wrapper;
}

function buildTableSection(title, columns, rows, footerText) {
  const wrapper = document.createElement("div");
  if (title) {
    wrapper.appendChild(createSectionHeader(title));
  }
  const tableWrapper = document.createElement("div");
  tableWrapper.className = "config-table-wrapper";

  const table = document.createElement("table");
  table.className = "config-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  (columns || []).forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  (rows || []).forEach((row) => {
    const tr = document.createElement("tr");
    if (row.isActive) {
      tr.className = "config-table-active";
    }
    (row.values || []).forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  wrapper.appendChild(tableWrapper);

  if (footerText) {
    const footer = document.createElement("div");
    footer.className = "status-text";
    footer.textContent = footerText;
    wrapper.appendChild(footer);
  }
  return wrapper;
}

function buildLlmModelPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "llmModelsIntro");
  card.appendChild(intro);

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const models = Array.isArray(cfg?.llm_models) ? cfg.llm_models : [];
  if (!models.length) {
    applyTranslation(statusEl, "llmModelsUnavailable");
    card.appendChild(statusEl);
    return card;
  }

  const buildSelector = (labelKey, prefKey, defaultKey) => {
    const activeId = prefs?.[prefKey] || cfg?.[defaultKey] || (prefKey === 'llm_model_id' ? models[0].id : '');
    // Se non c'è una preferenza salvata per vision/thinking, activeId potrebbe essere vuoto o null.
    // Per il default model invece deve sempre esserci qualcosa.
    
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "15px";
    
    const header = document.createElement("div");
    header.className = "config-preference-title";
    applyTranslation(header, labelKey);
    wrapper.appendChild(header);

    const row = document.createElement("label");
    row.className = "config-preference-option config-preference-option-vertical";
    
    const select = document.createElement("select");
    select.className = "config-text-input";
    
    // Opzione vuota per i modelli opzionali (vision/thinking)
    if (prefKey !== 'llm_model_id') {
       const emptyOpt = document.createElement("option");
       emptyOpt.value = "";
       applyTranslation(emptyOpt, "llmModelsEmptyOption");
       select.appendChild(emptyOpt);
    }

    const sortedModels = [...models].sort((a, b) => {
      const aLabel = (a?.label || a?.id || "").toLowerCase();
      const bLabel = (b?.label || b?.id || "").toLowerCase();
      if (aLabel < bLabel) return -1;
      if (aLabel > bLabel) return 1;
      return 0;
    });

    sortedModels.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      let labelText = model.label;
      if (model.available === false) {
        const suffix = translateText("llmModelUnavailableSuffix");
        labelText += suffix ? ` ${suffix}` : "";
      }
      // Aggiungi marker capability
      const caps = [];
      if (model.capabilities?.vision) caps.push("Vision");
      if (model.capabilities?.thinking) caps.push("Thinking");
      if (caps.length) labelText += ` [${caps.join(", ")}]`;
      
      option.textContent = labelText;
      option.disabled = model.available === false;
      select.appendChild(option);
    });
    
    // Se l'ID salvato non esiste più, seleziona il default o vuoto
    if (activeId && models.some(m => m.id === activeId)) {
        select.value = activeId;
    } else if (prefKey === 'llm_model_id') {
        select.value = models[0].id;
    } else {
        select.value = "";
    }

    const descEl = document.createElement("div");
    descEl.className = "config-preference-description";
    descEl.style.marginTop = "5px";
    
    const updateDesc = () => {
        const selected = models.find((m) => m.id === select.value);
        if (selected) {
            if (selected.description) {
              clearTranslationData(descEl);
              descEl.textContent = selected.description;
            } else {
              applyTranslation(descEl, "llmModelNoDescription");
            }
        } else {
            applyTranslation(descEl, "llmModelNoneSelected");
        }
    };
    
    select.addEventListener("change", () => {
        updateDesc();
        updateUserPreferences({ [prefKey]: select.value || null }, statusEl);
    });
    
    updateDesc();
    
    row.appendChild(select);
    wrapper.appendChild(row);
    wrapper.appendChild(descEl);
    
    return wrapper;
  };

  card.appendChild(buildSelector("llmModelDefaultLabel", "llm_model_id", "llm_model_default_id"));
  card.appendChild(document.createElement("hr"));
  card.appendChild(buildSelector("llmModelVisionLabel", "llm_model_vision_id", null));
  card.appendChild(document.createElement("hr"));
  card.appendChild(buildSelector("llmModelGraphicsLabel", "llm_model_graphics_id", null));
  card.appendChild(document.createElement("hr"));
  card.appendChild(buildSelector("llmModelThinkingLabel", "llm_model_thinking_id", null));
  
  card.appendChild(statusEl);
  return card;
}



function buildStreamingPreferenceCard(prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configStreamingIntro");
  card.appendChild(intro);

  const list = document.createElement("div");
  list.className = "config-preferences-options";
  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  if (!prefs || !Array.isArray(prefs.streaming_modes) || prefs.streaming_modes.length === 0) {
    applyTranslation(statusEl, "configPreferencesUnavailable");
    card.appendChild(statusEl);
    return card;
  }

  const activeMode = prefs.llm_streaming_mode || "off";
  prefs.streaming_modes.forEach((mode) => {
    const option = document.createElement("label");
    option.className = "config-preference-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "llm-streaming-mode";
    input.value = mode.value;
    input.checked = mode.value === activeMode;
    input.addEventListener("change", () => {
      updateUserPreferences({ llm_streaming_mode: mode.value }, statusEl);
    });

    const textWrapper = document.createElement("div");
    textWrapper.className = "config-preference-text";
    const titleEl = document.createElement("span");
    titleEl.className = "config-preference-title";
    titleEl.textContent = mode.label;
    textWrapper.appendChild(titleEl);
    if (mode.description) {
      const descEl = document.createElement("span");
      descEl.className = "config-preference-description";
      descEl.textContent = mode.description;
      textWrapper.appendChild(descEl);
    }

    option.appendChild(input);
    option.appendChild(textWrapper);
    list.appendChild(option);
  });

  card.appendChild(list);
  card.appendChild(statusEl);
  return card;
}

function buildThoughtsVisibilityCard(prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configThoughtsIntro");
  card.appendChild(intro);

  const list = document.createElement("div");
  list.className = "config-preferences-options";
  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const option = document.createElement("label");
  option.className = "config-preference-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(prefs?.llm_show_thoughts);
  input.addEventListener("change", () => {
    updateUserPreferences({ llm_show_thoughts: input.checked }, statusEl);
  });

  const textWrapper = document.createElement("div");
  textWrapper.className = "config-preference-text";
  const titleEl = document.createElement("span");
  titleEl.className = "config-preference-title";
  applyTranslation(titleEl, "configThoughtsTitle");
  textWrapper.appendChild(titleEl);
  const descEl = document.createElement("span");
  descEl.className = "config-preference-description";
  applyTranslation(descEl, "configThoughtsDescription");
  textWrapper.appendChild(descEl);

  option.appendChild(input);
  option.appendChild(textWrapper);
  list.appendChild(option);

  card.appendChild(list);
  card.appendChild(statusEl);
  return card;
}

function buildContextPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configContextIntro");
  card.appendChild(intro);

  const summary = document.createElement("div");
  summary.className = "status-text";
  const fixedCtx = cfg && typeof cfg.llm_n_ctx !== "undefined" ? cfg.llm_n_ctx : "?";
  const dynamicCtx = cfg && typeof cfg.llm_dynamic_max_n_ctx !== "undefined" ? cfg.llm_dynamic_max_n_ctx : "?";
  applyTranslation(summary, { key: "configContextSummary", params: { fixed: fixedCtx, dynamic: dynamicCtx } });
  card.appendChild(summary);

  const list = document.createElement("div");
  list.className = "config-preferences-options";
  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const active = prefs.llm_dynamic_context ? "dynamic" : "fixed";
  const options = [
    {
      value: "fixed",
      labelKey: "configContextFixedLabel",
      descriptionKey: "configContextFixedDescription",
    },
    {
      value: "dynamic",
      labelKey: "configContextDynamicLabel",
      descriptionKey: "configContextDynamicDescription",
    },
  ];

  options.forEach((opt) => {
    const option = document.createElement("label");
    option.className = "config-preference-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "llm-dynamic-context";
    input.value = opt.value;
    input.checked = opt.value === active;
    input.addEventListener("change", () => {
      updateUserPreferences({ llm_dynamic_context: opt.value === "dynamic" }, statusEl);
    });

    const textWrapper = document.createElement("div");
    textWrapper.className = "config-preference-text";
    const titleEl = document.createElement("span");
    titleEl.className = "config-preference-title";
    applyTranslation(titleEl, opt.labelKey);
    textWrapper.appendChild(titleEl);
    if (opt.descriptionKey) {
      const descEl = document.createElement("span");
      descEl.className = "config-preference-description";
      applyTranslation(descEl, opt.descriptionKey);
      textWrapper.appendChild(descEl);
    }

    option.appendChild(input);
    option.appendChild(textWrapper);
    list.appendChild(option);
  });

  card.appendChild(list);
  card.appendChild(statusEl);
  return card;
}

function buildMaxTokensPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configMaxTokensIntro");
  card.appendChild(intro);

  const status = document.createElement("div");
  status.className = "status-text";
  const defaultMax = cfg?.llm_max_tokens ?? "?";
  const dynMax = cfg?.llm_response_tokens_max ?? defaultMax;
  const dynMin = cfg?.llm_response_tokens_min ?? "";
  applyTranslation(status, {
    key: "configMaxTokensSummary",
    params: { default: defaultMax, min: dynMin || "?", max: dynMax || "?" },
  });
  card.appendChild(status);

  const list = document.createElement("div");
  list.className = "config-preferences-options";
  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const active = prefs.llm_dynamic_max_tokens ? "dynamic" : "fixed";
  const options = [
    {
      value: "fixed",
      labelKey: "configMaxTokensFixedLabel",
      descriptionKey: "configMaxTokensFixedDescription",
    },
    {
      value: "dynamic",
      labelKey: "configMaxTokensDynamicLabel",
      descriptionKey: "configMaxTokensDynamicDescription",
    },
  ];

  options.forEach((opt) => {
    const option = document.createElement("label");
    option.className = "config-preference-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "llm-dynamic-max-tokens";
    input.value = opt.value;
    input.checked = opt.value === active;
    input.addEventListener("change", () => {
      updateUserPreferences({ llm_dynamic_max_tokens: opt.value === "dynamic" }, statusEl);
    });

    const textWrapper = document.createElement("div");
    textWrapper.className = "config-preference-text";
    const titleEl = document.createElement("span");
    titleEl.className = "config-preference-title";
    applyTranslation(titleEl, opt.labelKey);
    textWrapper.appendChild(titleEl);
    if (opt.descriptionKey) {
      const descEl = document.createElement("span");
      descEl.className = "config-preference-description";
      applyTranslation(descEl, opt.descriptionKey);
      textWrapper.appendChild(descEl);
    }

    option.appendChild(input);
    option.appendChild(textWrapper);
    list.appendChild(option);
  });

  card.appendChild(list);
  card.appendChild(statusEl);
  return card;
}

function buildExcelPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configExcelIntro");
  card.appendChild(intro);

  const defaults = document.createElement("div");
  defaults.className = "status-text";
  applyTranslation(defaults, {
    key: "configExcelDefaults",
    params: { rows: cfg.rag_excel_csv_max_rows, cols: cfg.rag_excel_csv_max_cols },
  });
  card.appendChild(defaults);

  const effectiveRows = typeof prefs.rag_excel_csv_max_rows === "number"
    ? prefs.rag_excel_csv_max_rows
    : cfg.rag_excel_csv_max_rows;
  const effectiveCols = typeof prefs.rag_excel_csv_max_cols === "number"
    ? prefs.rag_excel_csv_max_cols
    : cfg.rag_excel_csv_max_cols;

  const effective = document.createElement("div");
  effective.className = "status-text";
  applyTranslation(effective, {
    key: "configExcelEffective",
    params: { rows: effectiveRows, cols: effectiveCols },
  });
  card.appendChild(effective);

  const controls = document.createElement("div");
  controls.className = "config-preferences-options";

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const buildInputRow = (labelKey, placeholderValue, currentValue, payloadKey) => {
    const row = document.createElement("label");
    row.className = "config-preference-option";

    const textWrapper = document.createElement("div");
    textWrapper.className = "config-preference-text";
    const titleEl = document.createElement("span");
    titleEl.className = "config-preference-title";
    applyTranslation(titleEl, labelKey);
    textWrapper.appendChild(titleEl);

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.placeholder = String(placeholderValue);
    const hasValue = typeof currentValue === "number" && Number.isFinite(currentValue);
    input.value = hasValue ? String(currentValue) : "";
    input.addEventListener("change", () => {
      const raw = input.value.trim();
      let payloadValue;
      if (!raw) {
        payloadValue = 0; // reset to default
      } else {
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) {
          applyTranslation(statusEl, "configInvalidNumber");
          return;
        }
        payloadValue = parsed;
      }
      updateUserPreferences({ [payloadKey]: payloadValue }, statusEl);
    });

    row.appendChild(input);
    row.appendChild(textWrapper);
    return row;
  };

  controls.appendChild(
    buildInputRow(
      "configExcelRowsLabel",
      cfg.rag_excel_csv_max_rows,
      prefs.rag_excel_csv_max_rows_override,
      "rag_excel_csv_max_rows"
    )
  );
  controls.appendChild(
    buildInputRow(
      "configExcelColsLabel",
      cfg.rag_excel_csv_max_cols,
      prefs.rag_excel_csv_max_cols_override,
      "rag_excel_csv_max_cols"
    )
  );

  card.appendChild(controls);
  card.appendChild(statusEl);
  return card;
}

function buildGraphicsPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configGraphicsIntro");
  card.appendChild(intro);

  const list = document.createElement("div");
  list.className = "config-preferences-options";
  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const options = [
    {
      value: "svg",
      label: "SVG",
      descriptionKey: "configGraphicsSvgDesc",
    },
    {
      value: "mermaid",
      label: "Mermaid",
      descriptionKey: "configGraphicsMermaidDesc",
    },
    {
      value: "plantuml",
      label: "PlantUML",
      descriptionKey: "configGraphicsPlantumlDesc",
    },
  ];

  const activeKind =
    (prefs.graphics_preferred_kind || cfg.graphics_default_kind || "svg").toLowerCase();

  options.forEach((opt) => {
    const option = document.createElement("label");
    option.className = "config-preference-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "graphics-preferred-kind";
    input.value = opt.value;
    input.checked = opt.value === activeKind;
    input.addEventListener("change", () => {
      updateUserPreferences({ graphics_preferred_kind: opt.value }, statusEl);
    });

    const textWrapper = document.createElement("div");
    textWrapper.className = "config-preference-text";
    const titleEl = document.createElement("span");
    titleEl.className = "config-preference-title";
    titleEl.textContent = opt.label;
    textWrapper.appendChild(titleEl);
    if (opt.descriptionKey) {
      const descEl = document.createElement("span");
      descEl.className = "config-preference-description";
      applyTranslation(descEl, opt.descriptionKey);
      textWrapper.appendChild(descEl);
    }

    option.appendChild(input);
    option.appendChild(textWrapper);
    list.appendChild(option);
  });

  card.appendChild(list);
  card.appendChild(statusEl);
  return card;
}

function buildDocsDirPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configDocsDirIntro");
  card.appendChild(intro);

  const defaultDir = cfg?.docs_dir || "";
  const activeDir = prefs?.docs_dir || defaultDir || "Non disponibile";
  const defaultLabel =
    defaultDir || translateText("configPathUndefined") || "—";
  const activeLabel =
    activeDir || translateText("configPathUndefined") || "—";

  const defaults = document.createElement("div");
  defaults.className = "status-text";
  applyTranslation(defaults, { key: "configDocsDirDefault", params: { path: defaultLabel } });
  card.appendChild(defaults);

  const effective = document.createElement("div");
  effective.className = "status-text";
  applyTranslation(effective, { key: "configDocsDirActive", params: { path: activeLabel } });
  card.appendChild(effective);

  const controls = document.createElement("div");
  controls.className = "config-preferences-options";

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const row = document.createElement("div");
  row.className = "config-preference-option";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "config-text-input";
  input.placeholder = defaultDir;
  input.value = prefs?.docs_dir_override || "";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(saveBtn, "commonSave");
  saveBtn.addEventListener("click", () => {
    updateUserPreferences({ docs_dir: input.value.trim() }, statusEl);
  });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(resetBtn, "commonReset");
  resetBtn.addEventListener("click", () => {
    input.value = "";
    updateUserPreferences({ docs_dir: "" }, statusEl);
  });

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(resetBtn);
  controls.appendChild(row);

  card.appendChild(controls);
  card.appendChild(statusEl);
  return card;
}


function buildModelsDirPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configModelsDirIntro");
  card.appendChild(intro);

  const defaultDir = cfg?.models_dir || "";
  const activeDir = prefs?.models_dir || defaultDir || "Non disponibile";
  const defaultLabel =
    defaultDir || translateText("configPathUndefined") || "—";
  const activeLabel =
    activeDir || translateText("configPathUndefined") || "—";

  const defaults = document.createElement("div");
  defaults.className = "status-text";
  applyTranslation(defaults, { key: "configModelsDirDefault", params: { path: defaultLabel } });
  card.appendChild(defaults);

  const effective = document.createElement("div");
  effective.className = "status-text";
  applyTranslation(effective, { key: "configModelsDirActive", params: { path: activeLabel } });
  card.appendChild(effective);

  const controls = document.createElement("div");
  controls.className = "config-preferences-options";

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const row = document.createElement("div");
  row.className = "config-preference-option";
  const allowModelDirEdit = String(cfg?.edit_model_position || "OFF").toUpperCase() === "ON";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "config-text-input";
  input.placeholder = defaultDir;
  input.value = prefs?.models_dir_override || "";
  input.disabled = !allowModelDirEdit;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(saveBtn, "commonSave");
  saveBtn.disabled = !allowModelDirEdit;
  if (allowModelDirEdit) {
    saveBtn.addEventListener("click", () => {
      updateUserPreferences({ models_dir: input.value.trim() }, statusEl);
    });
  }

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(resetBtn, "commonReset");
  resetBtn.disabled = !allowModelDirEdit;
  if (allowModelDirEdit) {
    resetBtn.addEventListener("click", () => {
      input.value = "";
      updateUserPreferences({ models_dir: "" }, statusEl);
    });
  }

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(resetBtn);
  controls.appendChild(row);

  card.appendChild(controls);
  card.appendChild(statusEl);
  return card;
}


function buildUserInfoPreferenceCard(prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configUserInfoIntro");
  card.appendChild(intro);

  const controls = document.createElement("div");
  controls.className = "config-preferences-options";

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const enabledRow = document.createElement("label");
  enabledRow.className = "config-preference-option";

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = Boolean(prefs?.user_info_enabled);
  enabledInput.addEventListener("change", () => {
    updateUserPreferences({ user_info_enabled: enabledInput.checked }, statusEl);
  });

  const enabledText = document.createElement("div");
  enabledText.className = "config-preference-text";
  const enabledTitle = document.createElement("span");
  enabledTitle.className = "config-preference-title";
  applyTranslation(enabledTitle, "configUserInfoToggle");
  enabledText.appendChild(enabledTitle);
  enabledRow.appendChild(enabledInput);
  enabledRow.appendChild(enabledText);
  controls.appendChild(enabledRow);

  const buildInputRow = (labelKey, value, placeholderKey, isMultiline, fieldKey) => {
    const row = document.createElement("label");
    row.className = "config-preference-option config-preference-option-vertical";

    const textWrapper = document.createElement("div");
    textWrapper.className = "config-preference-text";

    const titleEl = document.createElement("span");
    titleEl.className = "config-preference-title";
    applyTranslation(titleEl, labelKey);
    textWrapper.appendChild(titleEl);

    let inputEl;
    if (isMultiline) {
      inputEl = document.createElement("textarea");
      inputEl.rows = 3;
      inputEl.className = "config-textarea";
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.className = "config-text-input";
    }
    const placeholderValue = placeholderKey ? translateText(placeholderKey) : "";
    inputEl.placeholder = placeholderValue || "";
    inputEl.value = value || "";

    row.appendChild(textWrapper);
    row.appendChild(inputEl);
    row.dataset.userInfoKey = fieldKey;
    row._inputEl = inputEl;
    controls.appendChild(row);
  };

  buildInputRow("configUserInfoName", prefs?.user_info_name, "configUserInfoNamePlaceholder", false, "user_info_name");
  buildInputRow("configUserInfoRole", prefs?.user_info_role, "configUserInfoRolePlaceholder", false, "user_info_role");
  buildInputRow(
    "configUserInfoPersonal",
    prefs?.user_info_personal,
    "configUserInfoPersonalPlaceholder",
    true,
    "user_info_personal"
  );
  buildInputRow(
    "configUserInfoProfessional",
    prefs?.user_info_professional,
    "configUserInfoProfessionalPlaceholder",
    true,
    "user_info_professional"
  );
  buildInputRow(
    "configUserInfoTone",
    prefs?.user_info_tone,
    "configUserInfoTonePlaceholder",
    true,
    "user_info_tone"
  );

  const actions = document.createElement("div");
  actions.className = "config-preferences-options config-actions-stack";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(saveBtn, "commonSave");
  saveBtn.addEventListener("click", () => {
    const payload = {};
    const rows = controls.querySelectorAll(".config-preference-option[data-user-info-key]");
    rows.forEach((row) => {
      const key = row.dataset.userInfoKey;
      const inputEl = row._inputEl;
      if (key && inputEl) {
        payload[key] = inputEl.value.trim();
      }
    });
    updateUserPreferences(payload, statusEl);
  });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(resetBtn, "commonClear");
  resetBtn.addEventListener("click", () => {
    const payload = {};
    const rows = controls.querySelectorAll(".config-preference-option[data-user-info-key]");
    rows.forEach((row) => {
      const key = row.dataset.userInfoKey;
      const inputEl = row._inputEl;
      if (key && inputEl) {
        inputEl.value = "";
        payload[key] = "";
      }
    });
    updateUserPreferences(payload, statusEl);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(resetBtn);

  card.appendChild(controls);
  card.appendChild(actions);
  card.appendChild(statusEl);
  return card;
}

function renderGraphicsConfigPage(pageEl, cfg, prefs = {}) {
  const gridSection = buildGridSection(
    {
      titleKey: "configGraphicsSectionMain",
      type: "grid",
      keys: [
        "graphics_default_kind",
        "graphics_allowed_kinds",
        "graphics_render_png_default",
        "graphics_top_k_default",
        "graphics_max_markup_chars",
        "graphics_brand_colors",
      ],
    },
    cfg
  );
  if (gridSection) {
    pageEl.appendChild(gridSection);
  }
  return true;
}

function buildWebSearchPreferenceCard(cfg, prefs) {
  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "configWebSearchIntro");
  card.appendChild(intro);

  const defaultMail = cfg?.web_search_user_mail || "";
  const effectiveMail = prefs?.web_search_user_mail || defaultMail || "";
  const defaultAgent = cfg?.web_search_user_agent || "";
  const effectiveAgent = prefs?.web_search_user_agent || defaultAgent || "";
  const defaultMailLabel = defaultMail || translateText("configPathUndefined") || "";
  const activeMailLabel = effectiveMail || translateText("configPathUndefined") || "";

  const defaultText = document.createElement("div");
  defaultText.className = "status-text";
  applyTranslation(defaultText, { key: "configWebSearchDefault", params: { value: defaultMailLabel } });
  card.appendChild(defaultText);

  const activeText = document.createElement("div");
  activeText.className = "status-text";
  applyTranslation(activeText, { key: "configWebSearchActive", params: { value: activeMailLabel } });
  card.appendChild(activeText);

  const controls = document.createElement("div");
  controls.className = "config-preferences-options";

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "config-text-input";
  input.placeholder = defaultMail;
  input.value = effectiveMail;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(saveBtn, "commonSave");
  saveBtn.addEventListener("click", () => {
    updateUserPreferences({ web_search_user_mail: input.value.trim() }, statusEl).then((updated) => {
      if (!updated) return;
      const nextMail = updated.web_search_user_mail || defaultMail || "";
      input.value = nextMail;
      applyTranslation(activeText, {
        key: "configWebSearchActive",
        params: { value: nextMail || translateText("configPathUndefined") || "" },
      });
      agentText.value = updated.web_search_user_agent || "";
    });
  });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(resetBtn, "commonReset");
  resetBtn.addEventListener("click", () => {
    input.value = "";
    updateUserPreferences({ web_search_user_mail: "" }, statusEl).then((updated) => {
      if (!updated) return;
      const nextMail = updated.web_search_user_mail || defaultMail || "";
      input.value = nextMail;
      applyTranslation(activeText, {
        key: "configWebSearchActive",
        params: { value: nextMail || translateText("configPathUndefined") || "" },
      });
      agentText.value = updated.web_search_user_agent || "";
    });
  });

  const mailRow = document.createElement("label");
  mailRow.className = "config-preference-option config-preference-option-vertical";

  const mailTextWrapper = document.createElement("div");
  mailTextWrapper.className = "config-preference-text";

  const mailTitle = document.createElement("span");
  mailTitle.className = "config-preference-title";
  applyTranslation(mailTitle, "configWebSearchMailLabel");
  mailTextWrapper.appendChild(mailTitle);

  mailRow.appendChild(mailTextWrapper);
  mailRow.appendChild(input);
  controls.appendChild(mailRow);

  const actionRow = document.createElement("div");
  actionRow.className = "config-preference-option";
  actionRow.appendChild(saveBtn);
  actionRow.appendChild(resetBtn);
  controls.appendChild(actionRow);

  const agentRow = document.createElement("label");
  agentRow.className = "config-preference-option config-preference-option-vertical";

  const agentTextWrapper = document.createElement("div");
  agentTextWrapper.className = "config-preference-text";

  const agentTitle = document.createElement("span");
  agentTitle.className = "config-preference-title";
  applyTranslation(agentTitle, "configWebSearchAgentLabel");
  agentTextWrapper.appendChild(agentTitle);

  const agentText = document.createElement("textarea");
  agentText.className = "config-textarea";
  agentText.rows = 2;
  agentText.readOnly = true;
  agentText.value = effectiveAgent;

  agentRow.appendChild(agentTextWrapper);
  agentRow.appendChild(agentText);
  controls.appendChild(agentRow);

  card.appendChild(controls);
  card.appendChild(statusEl);
  return card;
}

function renderWebSearchConfigPage(pageEl, cfg, prefs = {}) {
  const defaultSection = buildGridSection(
    {
      titleKey: "configLlmSectionDefaults",
      type: "grid",
      keys: [
        "web_search_enabled",
        "web_search_max_results",
        "web_search_cache_ttl",
        "wikipedia_api_endpoint",
        "web_search_timeout",
        "web_search_verify_ssl",
      ],
    },
    cfg
  );
  if (defaultSection) {
    pageEl.appendChild(defaultSection);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "config-preferences-wrapper";
  wrapper.appendChild(buildWebSearchPreferenceCard(cfg, prefs));
  pageEl.appendChild(wrapper);
  return true;
}

let mcpServiceModalState = null;

function ensureMcpServiceModal() {
  if (mcpServiceModalState) return mcpServiceModalState;

  const modal = document.createElement("div");
  modal.id = "mcp-service-modal";
  modal.className = "modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  modal.appendChild(backdrop);

  const content = document.createElement("div");
  content.className = "modal-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("span");
  title.className = "modal-title";
  applyTranslation(title, "mcpModalTitle");
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close-btn";
  closeBtn.textContent = "×";
  header.appendChild(title);
  header.appendChild(closeBtn);
  content.appendChild(header);

  const body = document.createElement("div");
  body.className = "modal-body";

  const helper = document.createElement("div");
  helper.className = "status-text";
  applyTranslation(helper, "mcpModalHelper");
  body.appendChild(helper);

  const textarea = document.createElement("textarea");
  textarea.className = "config-textarea";
  textarea.rows = 10;
  body.appendChild(textarea);

  const status = document.createElement("div");
  status.className = "status-text";
  body.appendChild(status);

  content.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "secondary-btn secondary-btn-compact";
  cancelBtn.type = "button";
  applyTranslation(cancelBtn, "commonCancel");

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary-btn";
  saveBtn.type = "button";
  applyTranslation(saveBtn, "commonSave");

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  content.appendChild(footer);

  modal.appendChild(content);
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
  };
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target === backdrop) {
      close();
    }
  });

  mcpServiceModalState = {
    modal,
    textarea,
    status,
    saveBtn,
    close,
    onSave: null,
  };

  saveBtn.addEventListener("click", async () => {
    const state = mcpServiceModalState;
    if (!state || typeof state.onSave !== "function") return;
    state.status.textContent = "";
    let parsed = null;
    try {
      parsed = JSON.parse(state.textarea.value);
    } catch (err) {
      applyTranslation(state.status, { key: "commonJsonParseError", params: { error: err.message } });
      return;
    }
    const ok = await state.onSave(parsed, state.status);
    if (ok) {
      state.close();
    }
  });

  return mcpServiceModalState;
}

function openMcpServiceModal(onSave, initialPayload = null) {
  const state = ensureMcpServiceModal();
  state.onSave = onSave;
  state.status.textContent = "";
  if (initialPayload && typeof initialPayload === "object") {
    state.textarea.value = `${JSON.stringify(initialPayload, null, 2)}\n`;
  } else {
    state.textarea.value = `{\n  "name": "demo_mcp",\n  "label": "Nuovo Servizio",\n  "description": "Descrizione del servizio.",\n  "type": "http",\n  "endpoint": "http://127.0.0.1:5000/mcp",\n  "method": "POST",\n  "instructions": "Istruzioni per l'uso."\n}\n`;
  }
  state.modal.classList.remove("hidden");
}

let llmModelModalState = null;

function ensureLlmModelModal() {
  if (llmModelModalState) return llmModelModalState;

  const modal = document.createElement("div");
  modal.id = "llm-model-modal";
  modal.className = "modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  modal.appendChild(backdrop);

  const content = document.createElement("div");
  content.className = "modal-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("span");
  title.className = "modal-title";
  applyTranslation(title, "llmModalAddTitle");
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close-btn";
  closeBtn.textContent = "×";
  header.appendChild(title);
  header.appendChild(closeBtn);
  content.appendChild(header);

  const body = document.createElement("div");
  body.className = "modal-body";

  const form = document.createElement("div");
  form.className = "config-modal-form";

  const makeRow = (labelKey, inputEl, helperKey = null) => {
    const row = document.createElement("div");
    row.className = "config-preference-option config-preference-option-vertical";
    const label = document.createElement("div");
    label.className = "config-preference-title";
    applyTranslation(label, labelKey);
    row.appendChild(label);
    if (helperKey) {
      const helper = document.createElement("div");
      helper.className = "config-preference-description";
      applyTranslation(helper, helperKey);
      row.appendChild(helper);
    }
    row.appendChild(inputEl);
    return row;
  };

  const typeSelect = document.createElement("select");
  typeSelect.className = "config-text-input";
  [
    { value: "text", labelKey: "llmTypeText" },
    { value: "vision", labelKey: "llmTypeVision" },
    { value: "audio", labelKey: "llmTypeAudio" },
    { value: "coding", labelKey: "llmTypeCoding" },
    { value: "thinking", labelKey: "llmTypeThinking" },
    { value: "analysis", labelKey: "llmTypeAnalysis" },
  ].forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    applyTranslation(option, opt.labelKey);
    typeSelect.appendChild(option);
  });

  const fileSelect = document.createElement("select");
  fileSelect.className = "config-text-input";

  const idInput = document.createElement("input");
  idInput.className = "config-text-input";
  idInput.type = "text";
  idInput.readOnly = true;

  const labelInput = document.createElement("input");
  labelInput.className = "config-text-input";
  labelInput.type = "text";

  const descriptionInput = document.createElement("textarea");
  descriptionInput.className = "config-textarea";
  descriptionInput.rows = 3;

  const mmprojSelect = document.createElement("select");
  mmprojSelect.className = "config-text-input";

  const ocrToggle = document.createElement("input");
  ocrToggle.type = "checkbox";
  ocrToggle.className = "config-checkbox";

  const ocrRow = document.createElement("label");
  ocrRow.className = "config-preference-option";
  const ocrText = document.createElement("div");
  ocrText.className = "config-preference-text";
  const ocrTitle = document.createElement("span");
  ocrTitle.className = "config-preference-title";
  applyTranslation(ocrTitle, "llmModalOcrLabel");
  ocrText.appendChild(ocrTitle);
  ocrRow.appendChild(ocrToggle);
  ocrRow.appendChild(ocrText);

  const contextInput = document.createElement("input");
  contextInput.className = "config-text-input";
  contextInput.type = "number";
  contextInput.min = "0";
  contextInput.placeholder = translateText("commonOptional") || "";

  const maxTokensInput = document.createElement("input");
  maxTokensInput.className = "config-text-input";
  maxTokensInput.type = "number";
  maxTokensInput.min = "0";
  maxTokensInput.placeholder = translateText("commonOptional") || "";

  form.appendChild(makeRow("llmModalTypeLabel", typeSelect));
  form.appendChild(
    makeRow("llmModalFileLabel", fileSelect, "llmModalFileHelper")
  );
  form.appendChild(makeRow("llmModalIdLabel", idInput, "llmModalIdHelper"));
  form.appendChild(makeRow("llmModalLabelLabel", labelInput, "llmModalLabelHelper"));
  form.appendChild(makeRow("llmModalDescriptionLabel", descriptionInput, "llmModalDescriptionHelper"));
  const mmprojRow = makeRow(
    "llmModalMmprojLabel",
    mmprojSelect,
    "llmModalMmprojHelper"
  );
  form.appendChild(mmprojRow);
  form.appendChild(ocrRow);
  form.appendChild(makeRow("llmModalContextLabel", contextInput));
  form.appendChild(makeRow("llmModalMaxTokensLabel", maxTokensInput));

  body.appendChild(form);

  const status = document.createElement("div");
  status.className = "status-text";
  body.appendChild(status);

  content.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "secondary-btn secondary-btn-compact";
  cancelBtn.type = "button";
  applyTranslation(cancelBtn, "commonCancel");

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary-btn";
  saveBtn.type = "button";
  applyTranslation(saveBtn, "commonAdd");

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  content.appendChild(footer);

  modal.appendChild(content);
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
  };
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target === backdrop) {
      close();
    }
  });

  const state = {
    modal,
    title,
    status,
    typeSelect,
    fileSelect,
    idInput,
    labelInput,
    descriptionInput,
    mmprojSelect,
    ocrToggle,
    mmprojRow,
    ocrRow,
    contextInput,
    maxTokensInput,
    saveBtn,
    close,
    resetLabelTouched: () => {},
    setLabelTouched: () => {},
    mode: "add",
    originalId: null,
  };

  llmModelModalState = state;

  let labelTouched = false;
  state.resetLabelTouched = () => {
    labelTouched = false;
  };
  state.setLabelTouched = (value) => {
    labelTouched = Boolean(value);
  };
  labelInput.addEventListener("input", () => {
    labelTouched = true;
  });

  const deriveIdFromPath = (pathValue) => {
    if (!pathValue) return "";
    const base = pathValue.split(/[\\/]/).pop() || "";
    return base.replace(/\.[^/.]+$/, "");
  };

  const refreshModelId = () => {
    if (state.mode !== "add") {
      return;
    }
    const fileVal = fileSelect.value || "";
    const derived = deriveIdFromPath(fileVal);
    idInput.value = derived;
    if (!labelTouched) {
      labelInput.value = derived;
    }
  };

  fileSelect.addEventListener("change", () => {
    refreshModelId();
  });

  const refreshVisionFields = () => {
    const isVision = typeSelect.value === "vision";
    mmprojRow.classList.toggle("hidden", !isVision);
    ocrRow.classList.toggle("hidden", !isVision);
    if (!isVision) {
      ocrToggle.checked = false;
      mmprojSelect.value = "";
    }
  };

  typeSelect.addEventListener("change", refreshVisionFields);

  saveBtn.addEventListener("click", async () => {
    const modelPath = fileSelect.value || "";
    if (!modelPath) {
      applyTranslation(status, "llmModelSelectFile");
      return;
    }
    const modelId = idInput.value.trim();
    if (!modelId) {
      applyTranslation(status, "llmModelInvalidId");
      return;
    }
    const label = labelInput.value.trim() || modelId;
    const description = descriptionInput.value.trim() || null;
    const contextMaxVal = Number(contextInput.value);
    const maxTokensVal = Number(maxTokensInput.value);
    const payload = {
      id: modelId,
      label,
      description,
      path: modelPath,
      mmproj_path: mmprojSelect.value || null,
      capabilities: {
        vision: typeSelect.value === "vision",
        coding: typeSelect.value === "coding",
        thinking: typeSelect.value === "thinking",
        ocr: typeSelect.value === "vision" && ocrToggle.checked,
        audio: typeSelect.value === "audio",
        analysis: typeSelect.value === "analysis",
      },
      context_max: Number.isFinite(contextMaxVal) ? contextMaxVal : null,
      max_tokens: Number.isFinite(maxTokensVal) ? maxTokensVal : null,
    };

    try {
      const isEdit = state.mode === "edit";
      const endpoint = isEdit
        ? `${API_BASE}/api/config/llm-models/${encodeURIComponent(state.originalId || "")}`
        : `${API_BASE}/api/config/llm-models`;
      if (isEdit && !state.originalId) {
        applyTranslation(status, "llmModelMissingOriginal");
        return;
      }
      const actionKey = isEdit ? "llmModelUpdating" : "llmModelSaving";
      const actionLabel = translateText(actionKey);
      applyTranslation(status, actionKey);
      startGlobalLoading(actionLabel || actionKey);
      const res = await fetch(endpoint, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Errore HTTP: ${res.status}`);
      }
      await loadConfig();
      close();
    } catch (err) {
      console.error("Errore aggiunta modello LLM:", err);
      applyTranslation(status, "llmModelSaveError");
    } finally {
      stopGlobalLoading("commonOperationDone");
    }
  });

  llmModelModalState = state;
  return state;
}

const deriveLlmModelType = (model) => {
  const caps = model?.capabilities || {};
  if (caps.vision) return "vision";
  if (caps.audio) return "audio";
  if (caps.coding) return "coding";
  if (caps.analysis) return "analysis";
  if (caps.thinking) return "thinking";
  return "text";
};

async function populateLlmModelFileSelects(state, selectedPaths = {}) {
  try {
    const res = await fetch(`${API_BASE}/api/config/llm-models/files`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Errore HTTP: ${res.status}`);
    }
    const payload = await res.json();
    const files = Array.isArray(payload?.files) ? payload.files : [];

    const buildOptions = (selectEl, selectedValue) => {
      selectEl.innerHTML = "";
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      applyTranslation(emptyOpt, "llmModelSelectFileOption");
      selectEl.appendChild(emptyOpt);
      let foundSelected = false;
      files.forEach((file) => {
        const opt = document.createElement("option");
        opt.value = file;
        opt.textContent = file;
        if (selectedValue && selectedValue === file) {
          foundSelected = true;
        }
        selectEl.appendChild(opt);
      });
      if (selectedValue && !foundSelected) {
        const missingOpt = document.createElement("option");
        missingOpt.value = selectedValue;
        const suffix = translateText("llmModelFileMissingSuffix") || "";
        missingOpt.textContent = suffix ? `${selectedValue} ${suffix}` : selectedValue;
        selectEl.appendChild(missingOpt);
      }
      selectEl.value = selectedValue || "";
    };

    buildOptions(state.fileSelect, selectedPaths.modelPath || "");
    buildOptions(state.mmprojSelect, selectedPaths.mmprojPath || "");
  } catch (err) {
    console.error("Errore caricamento file modelli:", err);
    applyTranslation(state.status, "llmModelFilesLoadError");
  }
}

async function openLlmModelModal(typeKey = "text") {
  const state = ensureLlmModelModal();
  state.status.textContent = "";
  state.resetLabelTouched();
  state.mode = "add";
  state.originalId = null;
  applyTranslation(state.title, "llmModalAddTitle");
  applyTranslation(state.saveBtn, "commonAdd");
  state.idInput.readOnly = true;
  state.typeSelect.value = typeKey;
  state.idInput.value = "";
  state.labelInput.value = "";
  state.descriptionInput.value = "";
  state.contextInput.value = "";
  state.maxTokensInput.value = "";
  state.ocrToggle.checked = false;
  state.mmprojSelect.value = "";

  await populateLlmModelFileSelects(state);

  const deriveIdFromPath = (pathValue) => {
    if (!pathValue) return "";
    const base = pathValue.split(/[\\/]/).pop() || "";
    return base.replace(/\.[^/.]+$/, "");
  };

  const selected = state.fileSelect.value || "";
  state.idInput.value = deriveIdFromPath(selected);
  state.labelInput.value = state.idInput.value;

  const isVision = typeKey === "vision";
  state.mmprojRow.classList.toggle("hidden", !isVision);
  state.ocrRow.classList.toggle("hidden", !isVision);

  state.modal.classList.remove("hidden");
}

async function openLlmModelEditModal(model) {
  const state = ensureLlmModelModal();
  state.status.textContent = "";
  state.mode = "edit";
  state.originalId = model?.id || "";
  applyTranslation(state.title, "llmModalEditTitle");
  applyTranslation(state.saveBtn, "commonSave");
  state.idInput.readOnly = model?.removable === false;

  const typeKey = deriveLlmModelType(model);
  state.typeSelect.value = typeKey;
  state.idInput.value = model?.id || "";
  state.labelInput.value = model?.label || model?.id || "";
  state.setLabelTouched(true);
  state.descriptionInput.value = model?.description || "";
  state.contextInput.value =
    typeof model?.context_max_raw === "number" ? String(model.context_max_raw) : "";
  state.maxTokensInput.value =
    typeof model?.max_tokens_raw === "number" ? String(model.max_tokens_raw) : "";
  state.ocrToggle.checked = Boolean(model?.capabilities?.ocr);

  await populateLlmModelFileSelects(state, {
    modelPath: model?.path || "",
    mmprojPath: model?.mmproj_path || "",
  });

  const isVision = typeKey === "vision";
  state.mmprojRow.classList.toggle("hidden", !isVision);
  state.ocrRow.classList.toggle("hidden", !isVision);

  state.modal.classList.remove("hidden");
}

function renderMcpConfigPage(pageEl, cfg, prefs = {}) {
  const defaultSection = buildGridSection(
    {
      titleKey: "configLlmSectionDefaults",
      type: "grid",
      keys: ["mcp_enabled", "mcp_default_timeout"],
    },
    cfg
  );
  if (defaultSection) {
    pageEl.appendChild(defaultSection);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "config-preferences-wrapper";

  const defaultCard = document.createElement("div");
  defaultCard.className = "config-preferences-card";

  const defaultIntro = document.createElement("p");
  defaultIntro.className = "config-page-intro";
  applyTranslation(defaultIntro, "mcpDefaultIntro");
  defaultCard.appendChild(defaultIntro);

  const defaultList = document.createElement("div");
  defaultList.className = "config-preferences-options";

  const defaults = Array.isArray(cfg?.mcp_services) ? cfg.mcp_services : [];
  if (!defaults.length) {
    const empty = document.createElement("div");
    empty.className = "status-text";
    applyTranslation(empty, "mcpDefaultEmpty");
    defaultList.appendChild(empty);
  } else {
    defaults.forEach((service) => {
      defaultList.appendChild(buildMcpServiceRow(service, false));
    });
  }

  defaultCard.appendChild(defaultList);
  wrapper.appendChild(defaultCard);

  const card = document.createElement("div");
  card.className = "config-preferences-card";

  const intro = document.createElement("p");
  intro.className = "config-page-intro";
  applyTranslation(intro, "mcpCustomIntro");
  card.appendChild(intro);

  const controls = document.createElement("div");
  controls.className = "config-preferences-options";

  const extra = Array.isArray(prefs?.mcp_services_extra) ? prefs.mcp_services_extra : [];
  if (!extra.length) {
    const empty = document.createElement("div");
    empty.className = "status-text";
    applyTranslation(empty, "mcpCustomEmpty");
    controls.appendChild(empty);
  } else {
    extra.forEach((service) => {
      controls.appendChild(
        buildMcpServiceRow(service, true, {
          onEdit: () => {
            openMcpServiceModal(async (servicePayload, modalStatus) => {
              if (!servicePayload || typeof servicePayload !== "object" || Array.isArray(servicePayload)) {
                applyTranslation(modalStatus, "commonJsonRequired");
                return false;
              }
              const name = String(servicePayload.name || "").trim();
              if (!name) {
                applyTranslation(modalStatus, "commonNameRequired");
                return false;
              }
              const defaultsList = Array.isArray(cfg?.mcp_services) ? cfg.mcp_services : [];
              const hasDuplicate = defaultsList.some(
                (svc) => String(svc?.name || "").trim().toLowerCase() === name.toLowerCase()
              );
              if (hasDuplicate) {
                modalStatus.textContent = translateText("mcpDuplicateDefault", { name });
                return false;
              }
              const extraDuplicate = extra.some((item) => {
                const itemName = String(item?.name || "").trim().toLowerCase();
                const currentName = String(service?.name || "").trim().toLowerCase();
                return itemName === name.toLowerCase() && itemName !== currentName;
              });
              if (extraDuplicate) {
                modalStatus.textContent = translateText("mcpDuplicateCustom", { name });
                return false;
              }
              const nextExtra = extra.map((item) =>
                String(item?.name || "").trim().toLowerCase() ===
                String(service?.name || "").trim().toLowerCase()
                  ? servicePayload
                  : item
              );
              applyTranslation(modalStatus, "mcpServiceUpdating");
              const updated = await updateUserPreferences({ mcp_services_extra: nextExtra }, null);
              if (!updated) {
                applyTranslation(modalStatus, "mcpSaveError");
                return false;
              }
              const targetIndex = currentConfigPageIndex;
              await loadConfig();
              setActiveConfigPage(targetIndex);
              return true;
            }, service);
          },
          onDelete: async () => {
            const name = String(service?.name || "").trim() || translateText("mcpServiceFallbackName") || "";
            const prompt = translateText("mcpDeleteConfirm", { name });
            if (!confirm(prompt)) return;
            const nextExtra = extra.filter(
              (item) =>
                String(item?.name || "").trim().toLowerCase() !==
                String(service?.name || "").trim().toLowerCase()
            );
            const updated = await updateUserPreferences({ mcp_services_extra: nextExtra }, null);
            if (updated) {
              const targetIndex = currentConfigPageIndex;
              await loadConfig();
              setActiveConfigPage(targetIndex);
            }
          },
        })
      );
    });
  }

  card.appendChild(controls);

  const addRow = document.createElement("div");
  addRow.className = "config-preference-option";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "secondary-btn secondary-btn-compact";
  applyTranslation(addBtn, "mcpAddButton");

  const statusEl = document.createElement("div");
  statusEl.className = "status-text";

  addBtn.addEventListener("click", () => {
    openMcpServiceModal(async (servicePayload, modalStatus) => {
      if (!servicePayload || typeof servicePayload !== "object" || Array.isArray(servicePayload)) {
        applyTranslation(modalStatus, "commonJsonRequired");
        return false;
      }
      const name = String(servicePayload.name || "").trim();
      if (!name) {
        applyTranslation(modalStatus, "commonNameRequired");
        return false;
      }
      const existing = Array.isArray(cfg?.mcp_services) ? cfg.mcp_services : [];
      const hasDuplicate = [...existing, ...extra].some(
        (svc) => String(svc?.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (hasDuplicate) {
        modalStatus.textContent = translateText("mcpDuplicateAny", { name });
        return false;
      }
      const nextExtra = [...extra, servicePayload];
      applyTranslation(modalStatus, "mcpServiceSaving");
      applyTranslation(statusEl, "mcpServiceSaving");
      const updated = await updateUserPreferences({ mcp_services_extra: nextExtra }, statusEl);
      if (!updated) {
        applyTranslation(modalStatus, "mcpSaveError");
        return false;
      }
      applyTranslation(modalStatus, "mcpSaveSuccess");
      applyTranslation(statusEl, "mcpSaveSuccess");
      const targetIndex = currentConfigPageIndex;
      await loadConfig();
      setActiveConfigPage(targetIndex);
      return true;
    });
  });

  addRow.appendChild(addBtn);
  card.appendChild(addRow);
  card.appendChild(statusEl);

  wrapper.appendChild(card);
  pageEl.appendChild(wrapper);
  return true;
}

function buildMcpServiceRow(service, allowActions, handlers = {}) {
  const row = document.createElement("div");
  row.className = "config-preference-option mcp-service-row";

  const textWrapper = document.createElement("div");
  textWrapper.className = "config-preference-text";

  const title = document.createElement("span");
  title.className = "config-preference-title";
  const fallbackName = translateText("mcpServiceFallbackName") || "Service";
  const name = service?.name ? `@${service.name}` : fallbackName;
  const label = service?.label ? ` ${service.label}` : "";
  const type = service?.type ? ` (${service.type})` : "";
  title.textContent = `${name}${label}${type}`;
  textWrapper.appendChild(title);

  const desc = service?.description || service?.instructions;
  if (desc) {
    const descEl = document.createElement("div");
    descEl.className = "config-preference-description";
    descEl.textContent = desc;
    textWrapper.appendChild(descEl);
  }

  row.appendChild(textWrapper);

  if (allowActions) {
    const actions = document.createElement("div");
    actions.className = "mcp-service-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-btn secondary-btn-compact";
    applyTranslation(editBtn, "commonEdit");
    if (handlers.onEdit) {
      editBtn.addEventListener("click", handlers.onEdit);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "secondary-btn secondary-btn-compact";
    applyTranslation(delBtn, "commonDelete");
    if (handlers.onDelete) {
      delBtn.addEventListener("click", handlers.onDelete);
    }

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
  }

  return row;
}

function renderLlmModelsPage(pageEl, cfg) {
  const models = Array.isArray(cfg?.llm_models) ? cfg.llm_models : [];
  const allowModelEdit = String(cfg?.edit_models || "OFF").toUpperCase() === "ON";
  if (!models.length) {
    const empty = document.createElement("div");
    empty.className = "status-text";
    applyTranslation(empty, "llmModelsUnavailable");
    pageEl.appendChild(empty);
    return true;
  }

  const removeLlmModel = async (modelId, label) => {
    if (!modelId) return;
    const message = translateText("llmModelRemoveConfirm", { name: label || modelId });
    const ok = window.confirm(message);
    if (!ok) return;
    try {
      const loadingLabel = translateText("llmModelUnlinking") || "Unlinking...";
      startGlobalLoading(loadingLabel);
      const res = await fetch(
        `${API_BASE}/api/config/llm-models/${encodeURIComponent(modelId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Errore HTTP: ${res.status}`);
      }
      await loadConfig();
    } catch (err) {
      console.error("Errore rimozione modello LLM:", err);
      alert(translateText("llmModelRemoveError"));
    } finally {
      stopGlobalLoading("commonOperationDone");
    }
  };

  const buckets = {
    textCoding: [],
    vision: [],
    thinking: [],
    analysis: [],
  };

  const sortedModels = [...models].sort((a, b) => {
    const aLabel = (a?.label || a?.id || "").toLowerCase();
    const bLabel = (b?.label || b?.id || "").toLowerCase();
    if (aLabel < bLabel) return -1;
    if (aLabel > bLabel) return 1;
    return 0;
  });

  sortedModels.forEach((model) => {
    const caps = model?.capabilities || {};
    const isVision = Boolean(caps.vision);
    const isThinking = Boolean(caps.thinking);
    const isCoding = Boolean(caps.coding);
    const isAnalysis = Boolean(caps.analysis);

    if (isVision) buckets.vision.push(model);
    if (isThinking) buckets.thinking.push(model);
    if (isAnalysis) buckets.analysis.push(model);
    if (isCoding || (!isVision && !isThinking && !isAnalysis)) {
      buckets.textCoding.push(model);
    }
  });

  const formatVal = (value) => (value === null || typeof value === "undefined" ? "N/D" : String(value));

  const buildModelsTableSection = (title, list, typeKey) => {
    const wrapper = document.createElement("div");
    wrapper.appendChild(createSectionHeader(title));

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "status-text";
      applyTranslation(empty, "llmModelsEmptyCategory");
      wrapper.appendChild(empty);
    } else {
      const tableWrapper = document.createElement("div");
      tableWrapper.className = "config-table-wrapper";

      const table = document.createElement("table");
      table.className = "config-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      [
        "llmTableHeaderModel",
        "llmTableHeaderAvailable",
        "llmTableHeaderContextMax",
        "llmTableHeaderTokensMax",
        "llmTableHeaderActions",
      ].forEach((labelKey) => {
        const th = document.createElement("th");
        applyTranslation(th, labelKey);
        if (labelKey === "llmTableHeaderActions") {
          th.classList.add("config-table-actions-col");
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      list.forEach((model) => {
        const caps = model?.capabilities || {};
        const row = document.createElement("tr");
        if (model?.description) {
          row.title = model.description;
        }
        const label = model?.label ? `${model.label} (${model.id || "id"})` : (model?.id || "N/D");
        const contextMax = model?.context_max || cfg?.llm_dynamic_max_n_ctx;
        const maxTokens = model?.max_tokens || cfg?.llm_max_tokens;
        [
          label,
          model?.available ? "commonYes" : "commonNo",
          formatVal(contextMax),
          formatVal(maxTokens),
        ].forEach((valKeyOrValue) => {
          const td = document.createElement("td");
          if (valKeyOrValue === "commonYes" || valKeyOrValue === "commonNo") {
            applyTranslation(td, valKeyOrValue);
          } else {
            td.textContent = valKeyOrValue;
          }
          row.appendChild(td);
        });

        const actionTd = document.createElement("td");
        actionTd.className = "config-table-actions-col";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "secondary-btn secondary-btn-compact";
        applyTranslation(editBtn, "commonEdit");
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "secondary-btn secondary-btn-compact danger-btn";
        applyTranslation(removeBtn, "commonRemove");
        const isRemovable = model?.removable !== false;
        editBtn.disabled = !allowModelEdit;
        removeBtn.disabled = !allowModelEdit || !isRemovable;
        if (!isRemovable) {
          editBtn.title = translateText("llmModelDefaultEditHint");
          removeBtn.title = translateText("llmModelDefaultRemoveHint");
        }
        if (allowModelEdit) {
          editBtn.addEventListener("click", () => {
            openLlmModelEditModal(model);
          });
          if (isRemovable) {
            removeBtn.addEventListener("click", () => {
              removeLlmModel(model?.id, model?.label);
            });
          }
        }
        actionTd.appendChild(editBtn);
        actionTd.appendChild(removeBtn);
        if (model?.available === false) {
          const missingBadge = document.createElement("div");
          missingBadge.className = "rag-index-badge-missing config-model-badge";
          applyTranslation(missingBadge, "llmModelMissingFile");
          actionTd.appendChild(missingBadge);
        }
        row.appendChild(actionTd);

        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      tableWrapper.appendChild(table);
      wrapper.appendChild(tableWrapper);
    }

    const actions = document.createElement("div");
    actions.className = "config-table-actions";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary-btn secondary-btn-compact";
    applyTranslation(addBtn, "llmAddButton");
    addBtn.disabled = !allowModelEdit;
    if (allowModelEdit) {
      addBtn.addEventListener("click", () => openLlmModelModal(typeKey));
    }
    actions.appendChild(addBtn);
    wrapper.appendChild(actions);

    return wrapper;
  };

  pageEl.appendChild(
    buildModelsTableSection(translateText("llmSectionTextCoding") || "Testo / Coding", buckets.textCoding, "text")
  );
  pageEl.appendChild(
    buildModelsTableSection(translateText("llmSectionVision") || "Vision", buckets.vision, "vision")
  );
  pageEl.appendChild(
    buildModelsTableSection(translateText("llmSectionAnalysis") || "Analisi, Matematica, Logica", buckets.analysis, "analysis")
  );
  pageEl.appendChild(
    buildModelsTableSection(translateText("llmSectionThinking") || "Thinking", buckets.thinking, "thinking")
  );
  return true;
}

function renderLlmConfigPage(pageEl, cfg, prefs = {}) {
  const defaultSection = buildGridSection(
    {
      title: translateText("configLlmSectionDefaults"),
      type: "grid",
      keys: [
        "llm_min_n_ctx",
        "llm_n_ctx",
        "llm_dynamic_max_n_ctx",
        "llm_temperature",
        "llm_top_p",
        "llm_max_tokens",
        "llm_response_tokens_min",
        "llm_response_tokens_max",
        "llm_response_tokens_margin",
        "llm_context_char_per_token",
        "llm_dynamic_trigger_ratio",
        "llm_streaming_mode",
        "llm_streaming_chunk_size",
        "llm_verbose",
        "embedding_normalize",
      ],
    },
    cfg
  );
  if (defaultSection) {
    pageEl.appendChild(defaultSection);
  }

  const effectiveStreaming = prefs?.llm_streaming_mode || cfg?.llm_streaming_mode || "off";
  const customRows = [
    { label: translateText("configLlmModelDefaultServer"), value: cfg?.llm_model_default_id || "N/D" },
    { label: translateText("configLlmModelActiveUser"), value: prefs?.llm_model_id || cfg?.llm_model_default_id || "N/D" },
    { label: translateText("configLlmModelVision"), value: prefs?.llm_model_vision_id || translateText("commonDefault") },
    { label: translateText("configLlmModelThinking"), value: prefs?.llm_model_thinking_id || translateText("commonDefault") },
    { label: translateText("configLlmModelGraphics"), value: prefs?.llm_model_graphics_id || translateText("commonDefault") },
    { label: translateText("configLlmThinkingActive"), value: prefs?.llm_thinking_mode ? translateText("commonYes") : translateText("commonNo") },
    { label: translateText("configLlmStreamingActive"), value: effectiveStreaming },
    { label: translateText("configLlmDynamicContext"), value: prefs?.llm_dynamic_context ? translateText("commonYes") : translateText("commonNo") },
    { label: translateText("configLlmDynamicMaxTokens"), value: prefs?.llm_dynamic_max_tokens ? translateText("commonYes") : translateText("commonNo") },
    { label: translateText("configLlmShowThoughts"), value: prefs?.llm_show_thoughts ? translateText("commonYes") : translateText("commonNo") },
  ];
  pageEl.appendChild(buildKeyValueSection(translateText("configLlmSectionCustom"), customRows));

  const specs = cfg?.llm_system_specs || {};
  const ram = typeof specs.ram_gb === "number" ? `${specs.ram_gb} GB` : "N/D";
  const device = specs.device || "N/D";
  const arch = specs.arch || "N/D";
  const formatVal = (value) => (value === null || typeof value === "undefined" ? "N/D" : String(value));

  const contextMin = typeof cfg?.llm_min_n_ctx === "number" ? cfg.llm_min_n_ctx : 1024;
  const contextRows = [
    {
      values: [
        translateText("configLlmRowRecommended"),
        formatVal(contextMin),
        formatVal(cfg?.llm_suggested_base_ctx),
        formatVal(cfg?.llm_suggested_max_ctx),
        "-",
        "-",
        "-",
      ],
    },
    {
      values: [
        translateText("configLlmRowActiveConfig"),
        formatVal(contextMin),
        formatVal(cfg?.llm_n_ctx),
        formatVal(cfg?.llm_dynamic_max_n_ctx),
        formatVal(cfg?.llm_response_tokens_min),
        formatVal(cfg?.llm_response_tokens_max),
        formatVal(cfg?.llm_response_tokens_margin),
      ],
      isActive: true,
    },
  ];
  pageEl.appendChild(
    buildTableSection(
      translateText("configLlmSectionContext"),
      [
        translateText("configLlmTableHeaderReference"),
        translateText("configLlmTableHeaderMinContext"),
        translateText("configLlmTableHeaderBaseContext"),
        translateText("configLlmTableHeaderMaxContext"),
        translateText("configLlmTableHeaderMinResponse"),
        translateText("configLlmTableHeaderMaxResponse"),
        translateText("configLlmTableHeaderMargin"),
      ],
      contextRows,
      translateText("configLlmDetectedSpecs", { ram, device, arch })
    )
  );

  const ramTiers = [
    { ram: "<= 8 GB", base: 2048, max: 4096 },
    { ram: "9-16 GB", base: 4096, max: 16384 },
    { ram: "17-32 GB", base: 8192, max: 32768 },
    { ram: ">= 33 GB", base: 16384, max: 65536 },
  ];
  const ramRows = ramTiers.map((tier) => ({
    values: [tier.ram, String(contextMin), String(tier.base), String(tier.max)],
  }));
  pageEl.appendChild(
    buildTableSection(
      translateText("configLlmSectionRamTiers"),
      [
        translateText("configLlmTableHeaderRam"),
        translateText("configLlmTableHeaderMinContext"),
        translateText("configLlmTableHeaderBaseContext"),
        translateText("configLlmTableHeaderMaxContext"),
      ],
      ramRows,
      translateText("configLlmTableFooterRamTiers")
    )
  );

  const modelsSection = document.createElement("div");
  modelsSection.appendChild(createSectionHeader(translateText("configLlmIncludedModels")));

  const models = Array.isArray(cfg?.llm_models) ? cfg.llm_models : [];
  if (!models.length) {
    const empty = document.createElement("div");
    empty.className = "status-text";
    applyTranslation(empty, "llmModelsUnavailable");
    modelsSection.appendChild(empty);
    pageEl.appendChild(modelsSection);
    return true;
  }

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "config-table-wrapper";

  const table = document.createElement("table");
  table.className = "config-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  [
    "llmTableHeaderModel",
    "llmTableHeaderAvailable",
    "llmTableHeaderVisionFlag",
    "llmTableHeaderThinkingFlag",
    "llmTableHeaderOcr",
    "llmTableHeaderContextMax",
    "llmTableHeaderTokensMax",
  ].forEach((labelKey) => {
    const th = document.createElement("th");
    applyTranslation(th, labelKey);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  models.forEach((model) => {
    const caps = model?.capabilities || {};
    const row = document.createElement("tr");
    if (model?.description) {
      row.title = model.description;
    }
    const label = model?.label ? `${model.label} (${model.id || "id"})` : (model?.id || "N/D");
    const contextMax = model?.context_max || cfg?.llm_dynamic_max_n_ctx;
    const maxTokens = model?.max_tokens || cfg?.llm_max_tokens;
    [
      label,
      model?.available ? "commonYes" : "commonNo",
      caps.vision ? "commonYes" : "commonNo",
      caps.thinking ? "commonYes" : "commonNo",
      caps.ocr ? "commonYes" : "commonNo",
      formatVal(contextMax),
      formatVal(maxTokens),
    ].forEach((valKeyOrValue) => {
      const td = document.createElement("td");
      if (valKeyOrValue === "commonYes" || valKeyOrValue === "commonNo") {
        applyTranslation(td, valKeyOrValue);
      } else {
        td.textContent = valKeyOrValue;
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  modelsSection.appendChild(tableWrapper);

  const modelsNote = document.createElement("div");
  modelsNote.className = "status-text";
  applyTranslation(modelsNote, "llmModelsNote");
  modelsSection.appendChild(modelsNote);

  pageEl.appendChild(modelsSection);
  return true;
}

function renderDefaultConfigPage(pageEl, cfg) {
  const sections = [
    {
      title: translateText("configSectionTitleLocalPaths"),
      type: "grid",
      keys: ["model_path", "models_dir", "docs_dir", "db_path"],
    },
    {
      title: translateText("configSectionTitleFastApi"),
      type: "grid",
      keys: ["server_host", "server_port", "cors_allowed_origins"],
    },
  ];

  sections.forEach((section) => {
    const block = buildSection(section, cfg);
    if (block) {
      pageEl.appendChild(block);
    }
  });

  return true;
}

function renderPathsConfigPage(pageEl, cfg, prefs = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "config-preferences-wrapper";

  wrapper.appendChild(buildDocsDirPreferenceCard(cfg, prefs));
  wrapper.appendChild(buildModelsDirPreferenceCard(cfg, prefs));

  pageEl.appendChild(wrapper);
  return true;
}

function renderUserInfoConfigPage(pageEl, cfg, prefs = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "config-preferences-wrapper";
  wrapper.appendChild(buildUserInfoPreferenceCard(prefs));
  pageEl.appendChild(wrapper);
  return true;
}

function renderUserPreferencesPage(pageEl, cfg, prefs = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "config-preferences-wrapper";

  wrapper.appendChild(buildLlmModelPreferenceCard(cfg, prefs));
  // Thinking toggle removed from here, moved to main UI.
  wrapper.appendChild(buildStreamingPreferenceCard(prefs));
  wrapper.appendChild(buildThoughtsVisibilityCard(prefs));
  wrapper.appendChild(buildContextPreferenceCard(cfg, prefs));
  wrapper.appendChild(buildMaxTokensPreferenceCard(cfg, prefs));
  wrapper.appendChild(buildExcelPreferenceCard(cfg, prefs));
  wrapper.appendChild(buildGraphicsPreferenceCard(cfg, prefs));

  pageEl.appendChild(wrapper);
  return true;
}

async function updateUserPreferences(payload, statusEl) {
  if (!payload || typeof payload !== "object") return;
  if (statusEl) {
    applyTranslation(statusEl, "preferencesSaving");
  }
  try {
    const res = await fetch(`${API_BASE}/api/config/user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const errPayload = await res.json();
        if (errPayload && errPayload.detail) {
          detail = errPayload.detail;
        }
      } catch {
        // ignore
      }
      const message = detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`;
      throw new Error(message);
    }
    const prefs = await res.json();
    currentUserPreferences = prefs;
    window.currentUserPreferences = prefs;
    if (window.llmUI && typeof window.llmUI.refreshModelBadge === "function") {
      window.llmUI.refreshModelBadge();
    }
    if (statusEl) {
      applyTranslation(statusEl, "preferencesSaved");
    }
    return prefs;
  } catch (err) {
    console.error("Errore salvataggio preferenze:", err);
    if (statusEl) {
      applyTranslation(statusEl, { key: "preferencesSaveError", params: { error: err.message } });
    }
  }
  return null;
}

async function loadUserPreferencesOnStartup() {
  try {
    const res = await fetch(`${API_BASE}/api/config/user`);
    if (res.ok) {
      const prefs = await res.json();
      currentUserPreferences = prefs;
      window.currentUserPreferences = prefs;
    }
  } catch (err) {
    console.warn("Preferenze utente non caricate all'avvio:", err);
  }

  if (!window.currentServerConfig) {
    try {
      const cfgRes = await fetch(
        `${API_BASE}/api/config?lang=${encodeURIComponent(resolveAppLanguage())}`
      );
      if (cfgRes.ok) {
        window.currentServerConfig = await cfgRes.json();
      }
    } catch (err) {
      console.warn("Configurazione server non caricata all'avvio:", err);
    }
  }

  if (window.llmUI && typeof window.llmUI.refreshModelBadge === "function") {
    window.llmUI.refreshModelBadge();
  }
  syncWebSearchToggleState(window.currentServerConfig, currentUserPreferences);
}

function renderConfigPages(cfg, userPrefs) {
  renderedConfigPages = [];
  configPagesContainer.innerHTML = "";
  configStepper.innerHTML = "";

  configPageDefinitions.forEach((pageDef, index) => {
    const pageEl = document.createElement("div");
    pageEl.className = "config-page";

    if (pageDef.descriptionKey) {
      const intro = document.createElement("p");
      intro.className = "config-page-intro";
      applyTranslation(intro, pageDef.descriptionKey);
      pageEl.appendChild(intro);
    }

    let hasContent = false;
    if (typeof pageDef.renderer === "function") {
      const rendered = pageDef.renderer(pageEl, cfg, userPrefs);
      hasContent = rendered !== false;
    } else {
      const sections = pageDef.sections || [];
      sections.forEach((section) => {
        const sectionEl = buildSection(section, cfg);
        if (sectionEl) {
          pageEl.appendChild(sectionEl);
          hasContent = true;
        }
      });

      if (pageDef.id === "llm" && typeof cfg.llm_dynamic_max_n_ctx !== "undefined") {
        const ctxNote = document.createElement("div");
        ctxNote.className = "status-text";
        ctxNote.textContent = `Finestra massima inizializzata: ${cfg.llm_dynamic_max_n_ctx} token.`;
        pageEl.appendChild(ctxNote);
        hasContent = true;
      }
    }

    if (!hasContent) {
      const empty = document.createElement("div");
      empty.className = "status-text";
      applyTranslation(empty, "configNoParams");
      pageEl.appendChild(empty);
    }

    configPagesContainer.appendChild(pageEl);

    const stepBtn = document.createElement("button");
    stepBtn.className = "config-step-btn";
    stepBtn.type = "button";
    applyTranslation(stepBtn, pageDef.titleKey);
    stepBtn.addEventListener("click", () => setActiveConfigPage(index));
    configStepper.appendChild(stepBtn);

    renderedConfigPages.push({ pageDef, pageEl, stepButton: stepBtn });
  });

  setActiveConfigPage(0);
}

function setActiveConfigPage(newIndex) {
  if (!renderedConfigPages.length) {
    updateConfigPagerState();
    return;
  }
  currentConfigPageIndex = Math.max(0, Math.min(newIndex, renderedConfigPages.length - 1));

  renderedConfigPages.forEach((page, index) => {
    page.pageEl.classList.toggle("active", index === currentConfigPageIndex);
    page.stepButton.classList.toggle("active", index === currentConfigPageIndex);
  });

  if (configBody) {
    configBody.scrollTop = 0;
  }

  updateConfigPagerState();
}

function updateConfigPagerState() {
  if (!configPageIndicator || !configPagePrev || !configPageNext) return;
  if (!renderedConfigPages.length) {
    configPageIndicator.textContent = "";
    configPagePrev.disabled = true;
    configPageNext.disabled = true;
    return;
  }
  const total = renderedConfigPages.length;
  const title = translateText(renderedConfigPages[currentConfigPageIndex].pageDef.titleKey);
  applyTranslation(configPageIndicator, {
    key: "configPageIndicatorTemplate",
    params: { current: currentConfigPageIndex + 1, total, title },
  });
  configPagePrev.disabled = currentConfigPageIndex === 0;
  configPageNext.disabled = currentConfigPageIndex === total - 1;
}

btnConfig.addEventListener("click", openConfigModal);
modalCloseTop.addEventListener("click", closeConfigModal);
modalCloseBottom.addEventListener("click", closeConfigModal);

configPagePrev.addEventListener("click", () => setActiveConfigPage(currentConfigPageIndex - 1));
configPageNext.addEventListener("click", () => setActiveConfigPage(currentConfigPageIndex + 1));

// Chiudi modal cliccando fuori
configModal.addEventListener("click", (e) => {
  if (e.target === configModal || e.target.classList.contains("modal-backdrop")) {
    closeConfigModal();
  }
});

// Inizializza i18n prima di tutto
if (window.i18n && typeof window.i18n.init === "function") {
  window.i18n.init();
}
window.addEventListener("languagechange", syncHelpLink);
window.addEventListener("languagechange", () => {
  if (configModal && !configModal.classList.contains("hidden")) {
    loadConfig();
  }
});
syncHelpLink();

// Inizializza audio
if (typeof initAudioUI === "function") initAudioUI();
if (window.ttsUI && typeof window.ttsUI.init === "function") {
  window.ttsUI.init();
}
// Inizializza Notepad
if (window.Notepad && typeof window.Notepad.init === "function") {
  window.Notepad.init({ messagesContainer });
}
// Inizializza storico chat
if (window.historyUI) {
  window.historyUI.loadChatFromHistory = loadChatFromHistory;
  window.historyUI.startRenameChatTitle = startRenameChatTitle;
  // Aggiungi un piccolo ritardo per dare tempo al server di essere pronto
  setTimeout(() => {
    window.historyUI.loadChatHistory();
  }, 500);
}
setupMcpAutocomplete();
// Modalità iniziale
setMode("chat");
syncWebSearchToggleState();
loadUserPreferencesOnStartup();
