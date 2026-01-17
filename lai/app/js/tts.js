(function () {
  function translateTtsText(payload, params = {}, options = {}) {
    if (window.i18n && window.i18n.resolveText) {
      return window.i18n.resolveText(payload, params);
    }
    // Fallback
    const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
    return typeof key === 'string' ? key : '';
  }

  function applyTtsTranslation(element, payload, params = {}) {
    if (!element) return;
    if (window.i18n && window.i18n.applyToElement) {
      const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
      const p = (typeof payload === 'object' && payload.params) ? payload.params : params;
      window.i18n.applyToElement(element, key, p);
    } else {
      // Fallback
      element.textContent = translateTtsText(payload, params);
    }
  }

  const state = {
    currentFile: null,
    objectUrl: null,
    requestedFormat: "wav",
  };

  let lastCreateClickAt = 0;

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

  function isRapidCreateClick() {
    const now = Date.now();
    const guardMs = getClickGuardMs();
    if (now - lastCreateClickAt < guardMs) {
      return true;
    }
    lastCreateClickAt = now;
    return false;
  }

  let btnCreateAudio = null;
  let statusEl = null;
  let previewEl = null;
  let downloadEl = null;
  let resultPanelEl = null;
  let formatSelectEl = null;
  let lastStatusPayload = null;

  function init() {
    btnCreateAudio = document.getElementById("btn-create-audio");
    statusEl = document.getElementById("tts-status");
    previewEl = document.getElementById("tts-audio-preview");
    downloadEl = document.getElementById("tts-download-link");
    resultPanelEl = document.getElementById("tts-result-panel");
    formatSelectEl = document.getElementById("tts-format-select");

    if (!btnCreateAudio) return;

    btnCreateAudio.addEventListener("click", handleCreateAudio);
    hideActionButton();
    clearPreview();
    setStatus("ttsStatusSelectDocument");
  }

  function applyStatus(payload, params = {}) {
    if (!statusEl) return;
    if (payload && typeof payload === "object" && payload.key) {
      applyTtsTranslation(statusEl, payload, params);
      return;
    }
    statusEl.textContent = translateTtsText(payload, params, { allowFallback: true }) || "";
  }

  function setStatus(payload, params = {}) {
    lastStatusPayload = { payload, params };
    applyStatus(payload, params);
  }

  window.addEventListener("languagechange", () => {
    if (lastStatusPayload) {
      applyStatus(lastStatusPayload.payload, lastStatusPayload.params);
    }
  });

  function hideActionButton() {
    if (btnCreateAudio) {
      btnCreateAudio.classList.add("hidden");
      btnCreateAudio.disabled = true;
    }
    if (formatSelectEl) {
      formatSelectEl.classList.add("hidden");
    }
  }

  function showActionButton() {
    if (btnCreateAudio) {
      btnCreateAudio.classList.remove("hidden");
      btnCreateAudio.disabled = false;
    }
    if (formatSelectEl) {
      formatSelectEl.classList.remove("hidden");
    }
  }

  function clearPreview() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    if (previewEl) {
      previewEl.pause();
      previewEl.removeAttribute("src");
      previewEl.load();
      previewEl.classList.add("hidden");
    }
    if (downloadEl) {
      downloadEl.href = "#";
      downloadEl.classList.add("hidden");
    }
    if (resultPanelEl) {
      resultPanelEl.classList.add("hidden");
    }
  }

  function deriveDownloadName(file, format) {
    const fallback = translateTtsText("ttsDefaultFilename") || "documento";
    if (!file || !file.name) return `${fallback}.${format || "wav"}`;
    const base = file.name.replace(/\.[^.]+$/, "");
    return `${base || fallback}.${format || "wav"}`;
  }

  function getSelectedFormat() {
    return (formatSelectEl && formatSelectEl.value) ? formatSelectEl.value : "wav";
  }

  function onFileSelected(payload = {}) {
    clearPreview();
    const { file, isAudio } = payload;
    if (!file) {
      state.currentFile = null;
      hideActionButton();
      setStatus("ttsStatusNoDocument");
      return;
    }
    if (isAudio) {
      state.currentFile = null;
      hideActionButton();
      setStatus("ttsStatusRequiresText");
      return;
    }
    state.currentFile = file;
    showActionButton();
    setStatus("ttsStatusReady");
  }

  function onFileCleared() {
    state.currentFile = null;
    hideActionButton();
    clearPreview();
    setStatus("ttsStatusNoDocument");
  }

  async function handleCreateAudio() {
    if (isRapidCreateClick()) {
      return;
    }
    if (!state.currentFile) {
      alert(translateTtsText("ttsAlertNoDocument"));
      return;
    }

    const targetFormat = getSelectedFormat();
    state.requestedFormat = targetFormat;

    const formData = new FormData();
    formData.append("file", state.currentFile);
    formData.append("format", targetFormat);

    btnCreateAudio.disabled = true;
    setStatus("ttsStatusGenerating");
    if (typeof startGlobalLoading === "function") {
      startGlobalLoading(translateTtsText("ttsLoadingMessage"));
    }

    try {
      const response = await fetch(`${API_BASE}/api/tts/from-file`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const raw = await response.text();
        let message = raw;
        try {
          const parsed = JSON.parse(raw);
          message = parsed.detail || parsed.message || raw;
        } catch (_) {
          // ignore JSON parse errors
        }
        throw new Error(message || translateTtsText("ttsErrorCreating"));
      }

      const blob = await response.blob();
      const truncated = response.headers.get("x-text-truncated") === "1";
      const outputFormat = (response.headers.get("x-output-format") || targetFormat || "wav").toLowerCase();
      const suggestedName =
        response.headers.get("x-suggested-filename") ||
        deriveDownloadName(state.currentFile, outputFormat);
      const detectedLanguage = (response.headers.get("x-detected-language") || "").trim();
      const voiceUsed = (response.headers.get("x-voice-used") || "").trim();

      updatePreview(blob, suggestedName);

      const baseMessage = truncated
        ? translateTtsText("ttsStatusCreatedTruncated")
        : translateTtsText("ttsStatusCreated");

      const details = [];
      details.push(translateTtsText("ttsDetailFormat", { format: outputFormat.toUpperCase() }));
      if (detectedLanguage) {
        details.push(translateTtsText("ttsDetailLanguage", { language: detectedLanguage }));
      }
      if (voiceUsed) {
        details.push(translateTtsText("ttsDetailVoice", { voice: voiceUsed }));
      }

      const finalMessage = details.length ? `${baseMessage} ${details.join(" ")}` : baseMessage;
      setStatus(finalMessage);
    } catch (err) {
      console.error("Errore durante la generazione audio:", err);
      const msg = err && err.message ? err.message : translateTtsText("ttsErrorCreating");
      setStatus(msg);
      alert(msg);
    } finally {
      if (btnCreateAudio) {
        btnCreateAudio.disabled = false;
      }
      if (typeof stopGlobalLoading === "function") {
        stopGlobalLoading(translateTtsText("ttsOperationDone"));
      }
    }
  }

  function updatePreview(blob, downloadName) {
    clearPreview();
    state.objectUrl = URL.createObjectURL(blob);
    if (previewEl) {
      previewEl.src = state.objectUrl;
      previewEl.classList.remove("hidden");
    }
    if (downloadEl) {
      downloadEl.href = state.objectUrl;
      downloadEl.download = downloadName;
      downloadEl.classList.remove("hidden");
    }
    if (resultPanelEl) {
      resultPanelEl.classList.remove("hidden");
    }
  }

  window.ttsUI = {
    init,
    onFileSelected,
    onFileCleared,
  };
})();
