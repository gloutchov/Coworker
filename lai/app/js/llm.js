(function () {
  const statusDisplay = document.getElementById("output-status");
  const btnSend = document.getElementById("btn-send");
  let activeAbortController = null;
  let sendInProgress = false;
  let lastStatusPayload = null;
  let lastSendClickAt = 0;

  function getClickGuardMs() {
    if (typeof window.getUiClickGuardMs === "function") {
      const val = window.getUiClickGuardMs();
      if (Number.isFinite(val) && val >= 0) {
        return val;
      }
    }
    const raw = window.currentServerConfig?.ui_click_guard_ms;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 400;
  }

  function isRapidSendClick() {
    const now = Date.now();
    const guardMs = getClickGuardMs();
    if (now - lastSendClickAt < guardMs) {
      return true;
    }
    lastSendClickAt = now;
    return false;
  }

  function translateLlmText(payload, params = {}) {
    if (window.i18n && window.i18n.resolveText) {
      return window.i18n.resolveText(payload, params);
    }
    const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
    return typeof key === 'string' ? key : '';
  }

  function applyStatus(message, params = {}) {
    if (!statusDisplay) return;
    if (window.i18n && window.i18n.applyToElement) {
      const key = (typeof message === 'object' && message.key) ? message.key : message;
      const p = (typeof message === 'object' && message.params) ? message.params : params;
      window.i18n.applyToElement(statusDisplay, key, p);
    } else {
      statusDisplay.textContent = translateLlmText(message, params);
    }
  }

  function setStatus(message, params = {}) {
    lastStatusPayload = { message, params };
    applyStatus(message, params);
  }

  window.addEventListener("languagechange", () => {
    if (lastStatusPayload) {
      applyStatus(lastStatusPayload.message, lastStatusPayload.params);
    }
    refreshModelBadge();
    if (btnSend) {
      setSendButtonState(btnSend.classList.contains("is-stop"));
    }
  });

  function setSendButtonState(isSending) {
    if (!btnSend) return;
    if (window.i18n && typeof window.i18n.applyToElement === "function") {
      window.i18n.applyToElement(btnSend, isSending ? "stopButton" : "sendButton");
    } else {
      btnSend.textContent = isSending ? "Stop" : "Invia";
    }
    btnSend.classList.toggle("is-stop", isSending);
    if (isSending) {
      btnSend.setAttribute("aria-pressed", "true");
    } else {
      btnSend.removeAttribute("aria-pressed");
    }
  }

  function cancelActiveRequest() {
    if (!sendInProgress || !activeAbortController) return false;
    activeAbortController.abort();
    return true;
  }

  const imageOcrToggle = document.getElementById("chk-image-ocr");
  const thinkingToggle = document.getElementById("chk-thinking");
  const graphicsToggle = document.getElementById("chk-graphics-mode");

  function isExternalEnabledForMode(prefs, mode) {
    if (!prefs || !prefs.api_provider_enabled) return false;
    if (mode === "chat") return Boolean(prefs.api_allow_chat);
    if (mode === "rag") return Boolean(prefs.api_allow_rag);
    if (mode === "history") return Boolean(prefs.api_allow_history);
    return false;
  }

  function providerLabel(prefs) {
    const type = (prefs?.api_provider_type || "").toLowerCase();
    if (type === "ollama") return translateLlmText("providerLabelOllama");
    if (type === "lmstudio") return translateLlmText("providerLabelLmstudio");
    return translateLlmText("providerLabelOpenAI");
  }

  function getServerConfig() {
    return window.currentServerConfig || null;
  }

  function getModelLabelById(modelId) {
    if (!modelId) return "";
    const catalog = getServerConfig()?.llm_models;
    if (Array.isArray(catalog)) {
      const match = catalog.find((model) => model.id === modelId);
      if (match) {
        return match.label || modelId;
      }
    }
    return modelId;
  }

  function appendModelName(labelKey, modelId) {
    const base = translateLlmText(labelKey);
    const name = getModelLabelById(modelId);
    if (name) {
      return `${base} ${name}`.trim();
    }
    return base;
  }

  function buildModelStatusLabel({ mode, hasImages, thinkingRequested, graphicsActive }) {
    const prefs = window.currentUserPreferences || null;
    const joinParts = (...parts) =>
      parts
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(" ")
        .trim();

    if (isExternalEnabledForMode(prefs, mode)) {
      const provider = providerLabel(prefs);
      const modelName = (prefs?.api_model || "").trim();
      return joinParts(translateLlmText("modelExternalLabel"), provider, modelName);
    }
    if (graphicsActive && prefs?.llm_model_graphics_id) {
      return appendModelName("modelGraphicsLabel", prefs.llm_model_graphics_id);
    }
    if (hasImages && prefs?.llm_model_vision_id) {
      return appendModelName("modelVisionLabel", prefs.llm_model_vision_id);
    }
    if (thinkingRequested && prefs?.llm_model_thinking_id) {
      return appendModelName("modelThinkingLabel", prefs.llm_model_thinking_id);
    }
    const defaultModelId =
      prefs?.llm_model_id || getServerConfig()?.llm_model_default_id || "";
    if (defaultModelId) {
      return appendModelName("modelDefaultLabel", defaultModelId);
    }
    return translateLlmText("modelLocalLabel");
  }

  const modelBadge = document.getElementById("model-badge");
  function setModelBadge(text) {
    if (!modelBadge) return;
    if (text) {
      const prefix = translateLlmText("modelBadgeLabel");
      modelBadge.textContent = `${prefix} ${text}`.trim();
      modelBadge.classList.remove("hidden");
    } else {
      modelBadge.textContent = "";
      modelBadge.classList.add("hidden");
    }
  }

  function refreshModelBadge() {
    const mode = typeof currentMode !== "undefined" ? currentMode : window.currentMode;
    const hasImages =
      mode === "chat" &&
      window.imageUploadState &&
      Array.isArray(window.imageUploadState.images) &&
      window.imageUploadState.images.length > 0;
    const thinkingRequested = Boolean(thinkingToggle && thinkingToggle.checked);
    const graphicsActive = Boolean(window.graphicsUI && window.graphicsUI.isActive());
    const label = buildModelStatusLabel({ mode, hasImages, thinkingRequested, graphicsActive });
    setModelBadge(label);
  }

  if (thinkingToggle) {
    thinkingToggle.addEventListener("change", () => {
      refreshModelBadge();
    });
  }
  if (graphicsToggle) {
    graphicsToggle.addEventListener("change", () => {
      refreshModelBadge();
    });
  }

  function toPlainText(html) {
    if (!html) return "";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
  }

  function highlightMessageBlock(targetIndex) {
    const prev = messagesContainer.querySelectorAll(".message-highlight");
    prev.forEach((el) => el.classList.remove("message-highlight"));

    const selector = `.message-block[data-msg-index="${targetIndex}"]`;
    const block = messagesContainer.querySelector(selector);
    if (!block) return;

    block.classList.add("message-highlight");
    block.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function consumeEventStream(response, onStreamStart, onStreamEvent) {
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error(translateLlmText("llmStreamUnsupported"));
    }

    if (typeof onStreamStart === "function") {
      onStreamStart();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalPayload = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex;
      while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const payloadLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.replace(/^data:\s*/, ""));

        if (!payloadLines.length) continue;

        const payloadText = payloadLines.join("\n");
        let payload;
        try {
          payload = JSON.parse(payloadText);
        } catch {
          continue;
        }

        if (typeof onStreamEvent === "function") {
          onStreamEvent(payload);
        }

        if (payload.type === "end") {
          finalPayload = payload;
        } else if (payload.type === "error") {
          throw new Error(payload.error || translateLlmText("llmStreamError"));
        }
      }
    }

    if (!finalPayload) {
      const trimmed = buffer.trim();
      if (trimmed) {
        try {
          finalPayload = JSON.parse(trimmed);
        } catch {
          finalPayload = null;
        }
      }
    }

    if (!finalPayload) {
      throw new Error(translateLlmText("llmStreamNoFinal"));
    }

    return {
      text: finalPayload.content || "",
      sources: Array.isArray(finalPayload.sources) ? finalPayload.sources : [],
      extra: finalPayload,
    };
  }

  async function callChatAPI(question, options = {}) {
    const {
      mcpContext = null,
      history: historyOverride = null,
      onStreamEvent = null,
      onStreamStart = null,
      noteContext = null,
      signal = null,
    } = options || {};
    const resolvedNoteContext = (options && options.noteContext) || noteContext;
    let url;
    let payload;

    // Use history override if provided (for notepad), otherwise use global chat history
    const historySource = historyOverride !== null 
        ? historyOverride
        : (typeof currentChatMessages !== "undefined" ? currentChatMessages : window.currentChatMessages || []);
    
    const history = historySource.slice(); // defensive copy

    const notepadActive = window.Notepad && window.Notepad.isActive();
    const mode =
      typeof currentMode !== "undefined" ? currentMode : window.currentMode;
    const activeTempDoc =
      mode === "chat" &&
      !notepadActive &&
      window.tempDocSession &&
      window.tempDocSession.id
        ? window.tempDocSession
        : null;
    const usingTempDoc = Boolean(activeTempDoc);

    let currentLanguage = "it";
    if (window.i18n) {
      if (typeof window.i18n.getCurrentLanguage === "function") {
        currentLanguage = window.i18n.getCurrentLanguage() || currentLanguage;
      } else if (window.i18n.currentLanguage) {
        currentLanguage = window.i18n.currentLanguage;
      }
    }
    currentLanguage = currentLanguage || document.documentElement.lang || "it";

    if (mode === "chat") {
      if (usingTempDoc) {
        url = `${API_BASE}/api/temp-doc/ask`;
        payload = {
          temp_doc_id: activeTempDoc.id,
          question,
          top_k: 5,
          history,
          language: currentLanguage,
        };
      } else {
        const useWeb = window.webSearchUI && window.webSearchUI.isEnabled();
        url = useWeb ? `${API_BASE}/api/chat-web` : `${API_BASE}/api/chat`;
        payload = { prompt: question, history, language: currentLanguage };
        
        if (thinkingToggle) {
            payload.thinking_mode = thinkingToggle.checked;
        }

        if (Array.isArray(mcpContext) && mcpContext.length > 0) {
          payload.mcp_context = mcpContext;
        }
        if (resolvedNoteContext) {
          payload.note_context = resolvedNoteContext;
        }
        const imageState = window.imageUploadState;
        if (imageState && Array.isArray(imageState.images) && imageState.images.length > 0) {
          payload.images = imageState.images.slice();
          payload.image_mode = imageOcrToggle && imageOcrToggle.checked ? "ocr" : "describe";
        }
      }
    } else if (mode === "rag") {
      url = `${API_BASE}/api/ask`;
      payload = { question, top_k: 5, history, language: currentLanguage };
    } else if (mode === "history") {
      url = `${API_BASE}/api/ask-chats`;
      payload = { question, top_k: 5, history, language: currentLanguage };
    } else {
      throw new Error(translateLlmText("llmModeUnsupported", { mode }));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      let errorMessage = translateLlmText("commonHttpError", { status: res.status });
      try {
        const errPayload = await res.json();
        if (errPayload && errPayload.detail) {
          errorMessage = errPayload.detail;
        }
      } catch {
        try {
          const fallback = await res.text();
          if (fallback) errorMessage = fallback;
        } catch {
          // ignore
        }
      }
      if (
        usingTempDoc &&
        res.status === 404 &&
        typeof window.handleTempDocExpired === "function"
      ) {
        window.handleTempDocExpired(errorMessage);
      }
      throw new Error(errorMessage);
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/event-stream")) {
      return consumeEventStream(res, onStreamStart, onStreamEvent);
    }

    const data = await res.json();

    if (usingTempDoc) {
      if (data.error) throw new Error(data.error);
      return {
        text: data.answer || translateLlmText("llmEmptyResponse"),
        sources: Array.isArray(data.sources) ? data.sources : [],
        extra: data,
      };
    } else if (mode === "chat") {
      return {
        text: data.response || translateLlmText("llmEmptyResponse"),
        sources: Array.isArray(data.sources) ? data.sources : [],
        extra: data,
      };
    } else {
      if (data.error) throw new Error(data.error);
      return {
        text: data.answer || translateLlmText("llmEmptyResponse"),
        sources: Array.isArray(data.sources) ? data.sources : [],
        extra: data,
      };
    }
  }

  function bindSend() {
    if (!btnSend || !userInput) return;

    async function handleSend() {
      if (isRapidSendClick()) {
        return;
      }
      if (sendInProgress) {
        if (cancelActiveRequest()) {
          setStatus("llmStatusRequestAborted");
                    stopGlobalLoading("llmStatusRequestAborted");
        }
        return;
      }

      const question = userInput.value.trim();
      if (!question) {
        setStatus("llmStatusEnterQuestion");
        return;
      }
      if (window.imageUploadState && window.imageUploadState.loading) {
        setStatus("llmStatusWaitImage");
        return;
      }
      if (imageOcrToggle && imageOcrToggle.checked) {
        if (!window.imageUploadState || !window.imageUploadState.images.length) {
          setStatus("llmStatusSelectImageOcr");
          return;
        }
      }

      // Clear the central input textarea immediately
      userInput.value = "";

      // --- Check for MCP command first ---
      if (
        window.currentMode === "chat" &&
        window.mcpUI &&
        window.mcpUI.isEnabled() &&
        question.startsWith("@")
      ) {
        setStatus("llmStatusMcpCommand");
        startGlobalLoading("llmStatusMcpCommand");
        sendInProgress = true;
        activeAbortController = new AbortController();
        setSendButtonState(true);
        try {
          const result = await window.mcpUI.invokeCommand(question, {
            signal: activeAbortController.signal,
          });
          // In note mode, append to editor, otherwise create a message block
          if (window.Notepad && window.Notepad.isActive()) {
            const executedLabel = translateLlmText("notepadCommandExecutedLabel");
            const resultLabel = translateLlmText("notepadCommandResultLabel");
            window.Notepad.appendContent(
              `\n\n<hr>\n\n<b>${executedLabel}:</b> ${question}\n<b>${resultLabel}:</b>\n${result}`
            );
          } else {
            appendMessageBlock(question, result, [], "mcp");
          }
          setStatus("llmStatusMcpSuccess");
          stopGlobalLoading("llmStatusMcpSuccess");
        } catch (err) {
          if (err && err.name === "AbortError") {
            setStatus("llmStatusRequestAborted");
                      stopGlobalLoading("llmStatusRequestAborted");
            return;
          }
          console.error("Errore durante l'esecuzione del comando MCP:", err);
          const errorPayload = { key: "llmStatusMcpError", params: { error: err.message } };
          const errorMessage = translateLlmText(errorPayload);
          if (window.Notepad && window.Notepad.isActive()) {
            const errorLabel = translateLlmText("notepadCommandErrorLabel");
            const detailsLabel = translateLlmText("notepadCommandDetailsLabel");
            window.Notepad.appendContent(
              `\n\n<hr>\n\n<b>${errorLabel}:</b> ${question}\n<b>${detailsLabel}:</b>\n${errorMessage}`
            );
          } else {
            appendMessageBlock(question, errorMessage, [], "error");
          }
          setStatus(errorPayload);
          stopGlobalLoading(errorPayload);
        } finally {
          sendInProgress = false;
          activeAbortController = null;
          setSendButtonState(false);
        }
        return; 
      }

      // --- Regular Chat/RAG/History/Notepad Logic ---
      const notepadActive = window.Notepad && window.Notepad.isActive();
      const graphicsActive = window.graphicsUI && window.graphicsUI.isActive();
      const tempDocActive =
        window.currentMode === "chat" &&
        !notepadActive &&
        window.tempDocSession &&
        window.tempDocSession.id;

      if (graphicsActive) {
        if (window.currentMode === "history") {
          setStatus("graphicsUnavailableHistory");
          stopGlobalLoading("graphicsUnavailableHistory");
          return;
        }

        const graphicsStatusKey =
          window.currentMode === "rag" ? "graphicsGeneratingRag" : "graphicsGenerating";
        setStatus(graphicsStatusKey);
        startGlobalLoading(graphicsStatusKey);
        sendInProgress = true;
        activeAbortController = new AbortController();
        setSendButtonState(true);

        try {
          const result = await window.graphicsUI.requestGraphics(question, {
            signal: activeAbortController.signal,
          });
          window.graphicsUI.appendGraphicsBlock({
            question,
            payload: result,
            sources: Array.isArray(result.sources) ? result.sources : [],
            mode: window.currentMode,
          });
          setStatus("graphicsGenerated");
          stopGlobalLoading("graphicsGenerated");
        } catch (err) {
          if (err && err.name === "AbortError") {
            setStatus("llmStatusRequestAborted");
                      stopGlobalLoading("llmStatusRequestAborted");
            return;
          }
          console.error("Errore richiesta grafica:", err);
          const errorPayload = { key: "llmStatusError", params: { error: err.message } };
          setStatus(errorPayload);
          stopGlobalLoading(errorPayload);
        } finally {
          sendInProgress = false;
          activeAbortController = null;
          setSendButtonState(false);
        }
        return;
      }

      let statusKey = "llmStatusAsking";
      if (notepadActive && window.currentMode === "rag") {
        statusKey = "llmStatusNoteRAG";
      } else if (notepadActive) {
        statusKey = "llmStatusNoteProcess";
      } else if (window.currentMode === "rag") {
        statusKey = "llmStatusRAG";
      } else if (window.currentMode === "history") {
        statusKey = "llmStatusHistory";
      } else if (tempDocActive) {
        statusKey = "llmStatusTempDoc";
      }
      refreshModelBadge();
      setStatus(statusKey);
      startGlobalLoading(statusKey);

      sendInProgress = true;
      activeAbortController = new AbortController();
      setSendButtonState(true);

      let streamingStarted = false;
      let pendingBlock = null;
      let partialAnswer = "";

      try {
        // If in notepad mode, get the note content and pass it as history
        const options = {};
        const currentAbortController = activeAbortController;

        if (notepadActive) {
            const noteHtml = window.Notepad.getContent();
            const notePlain = toPlainText(noteHtml).trim();
            if (notePlain) {
              if (window.currentMode === "rag") {
                options.history = [
                  {
                    question: translateLlmText("notepadContextQuestion"),
                    answer: notePlain,
                  },
                ];
              } else {
                options.noteContext = notePlain;
              }
            }
        } else {
            options.onStreamStart = () => {
              streamingStarted = true;
              pendingBlock = appendMessageBlock(question, "", [], window.currentMode);
              partialAnswer = "";
              if (pendingBlock && typeof pendingBlock.setAnswer === "function") {
                pendingBlock.setAnswer(translateLlmText("llmAnswerIncoming"), { isFinal: false });
              }
            };
            options.onStreamEvent = (evt) => {
              if (!pendingBlock || !evt || typeof evt.content !== "string") return;
              if (evt.type !== "token" && evt.type !== "chunk") return;
              partialAnswer += evt.content;
              if (typeof pendingBlock.setAnswer === "function") {
                pendingBlock.setAnswer(partialAnswer, { isFinal: false });
              }
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            };
        }

        options.signal = currentAbortController.signal;
        const { text, sources } = await callChatAPI(question, options);

        // If in notepad mode, append response to the editor. Otherwise, create a new message block.
        if (notepadActive) {
            const questionLabel = translateLlmText("notepadQuestionLabel");
            const answerLabel = translateLlmText("notepadAnswerLabel");
            window.Notepad.appendContent(
              `\n\n<hr>\n\n<b>${questionLabel}:</b> ${question}<br><b>${answerLabel}:</b><br>${text}`
            );
            setStatus("llmStatusNoteAdded");
            stopGlobalLoading("llmStatusNoteAdded");
        } else {
            if (streamingStarted && pendingBlock) {
              if (typeof pendingBlock.setAnswer === "function") {
                pendingBlock.setAnswer(text, { isFinal: true });
              }
              if (typeof pendingBlock.updateSources === "function") {
                pendingBlock.updateSources(sources, window.currentMode);
              }
            } else {
              appendMessageBlock(question, text, sources, window.currentMode);
            }
            setStatus("llmStatusReceived");
            stopGlobalLoading("llmStatusReceived");
        }

      } catch (err) {
        if (err && err.name === "AbortError") {
          if (streamingStarted && pendingBlock && typeof pendingBlock.setAnswer === "function") {
            const finalText = partialAnswer || translateLlmText("llmStatusRequestAborted");
            pendingBlock.setAnswer(finalText, { isFinal: true });
          }
          setStatus("llmStatusRequestAborted");
                    stopGlobalLoading("llmStatusRequestAborted");
          return;
        }
        console.error("Errore richiesta chat:", err);
        const errorPayload = { key: "llmStatusError", params: { error: err.message } };
        setStatus(errorPayload);
        stopGlobalLoading(errorPayload);
      } finally {
        sendInProgress = false;
        activeAbortController = null;
        setSendButtonState(false);
        // lascia la selezione immagine finché l'utente non la rimuove manualmente
      }
    }

    btnSend.addEventListener("click", handleSend);

    userInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    });
  }

  window.llmUI = {
    highlightMessageBlock,
    callChatAPI,
    bindSend,
    refreshModelBadge,
  };
})();
