(function () {
  let isGraphicsMode = false;
  let graphicsToggle;
  let inputTitle;
  let userInput;
  let savedTitle = "";
  let savedPlaceholder = "";

  function tGraphics(key, params = {}) {
    if (window.i18n && window.i18n.translate) {
      return window.i18n.translate(key, params);
    }
    return `[${key}]`;
  }

  function applyGraphicsTranslation(element, payload, params = {}) {
    if (!element) return;
    if (window.i18n && window.i18n.applyToElement) {
      const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
      const p = (typeof payload === 'object' && payload.params) ? payload.params : params;
      window.i18n.applyToElement(element, key, p);
    } else {
      const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
      element.textContent = `[${key}]`;
    }
  }

  function sanitizeFilename(name) {
    const fallback = tGraphics("graphicsFilenameFallback") || "grafica";
    const trimmed = (name || fallback).trim();
    return trimmed.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || fallback;
  }

  function parseAnswer(answer) {
    if (!answer || typeof answer !== "string") return null;
    const trimmed = answer.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      const payload = JSON.parse(trimmed);
      if (payload && payload.type === "graphics" && payload.kind && payload.markup) {
        return payload;
      }
    } catch {
      return null;
    }
    return null;
  }

  function buildHistoryForGraphics() {
    const source =
      typeof currentChatMessages !== "undefined"
        ? currentChatMessages
        : window.currentChatMessages || [];
    return source.map((item) => {
      const question = (item.question || "").toString();
      let answer = (item.answer || "").toString();
      const parsed = parseAnswer(answer);
      if (parsed) {
        answer = tGraphics("graphicsHistoryEntry", {
          title: parsed.title || tGraphics("graphicsDefaultTitle"),
        });
      }
      return { question, answer };
    });
  }

  async function ensureGraphicsPreferences() {
    if (window.currentUserPreferences) {
      return window.currentUserPreferences;
    }
    try {
      const res = await fetch(`${API_BASE}/api/config/user`);
      if (res.ok) {
        const prefs = await res.json();
        window.currentUserPreferences = prefs;
        return prefs;
      }
    } catch {
      // Preferenze non disponibili: fallback a valori di default.
    }
    return {};
  }

  function resolveTitleText(mode) {
    if (mode === "rag") {
      return tGraphics("graphicsTitleRag");
    }
    return tGraphics("graphicsTitleChat");
  }

  function resolvePlaceholder(mode) {
    if (mode === "rag") {
      return tGraphics("graphicsPlaceholderRag");
    }
    return tGraphics("graphicsPlaceholderChat");
  }

  function setGraphicsMode(active) {
    isGraphicsMode = active;
    if (graphicsToggle) {
      graphicsToggle.checked = !!active;
    }

    if (!inputTitle || !userInput) return;

    if (active) {
      if (window.Notepad && typeof window.Notepad.deactivate === "function") {
        window.Notepad.deactivate();
      }
      savedTitle = inputTitle.textContent;
      savedPlaceholder = userInput.placeholder;
      const mode = typeof currentMode !== "undefined" ? currentMode : window.currentMode;
      inputTitle.textContent = resolveTitleText(mode);
      userInput.placeholder = resolvePlaceholder(mode);
    } else {
      if (savedTitle) inputTitle.textContent = savedTitle;
      if (savedPlaceholder) userInput.placeholder = savedPlaceholder;
    }

    if (window.llmUI && typeof window.llmUI.refreshModelBadge === "function") {
      window.llmUI.refreshModelBadge();
    }
  }

  function toggleGraphicsMode() {
    setGraphicsMode(!isGraphicsMode);
  }

  function onModeChange(newMode) {
    if (newMode === "history") {
      setGraphicsMode(false);
      return;
    }
    if (isGraphicsMode && inputTitle && userInput) {
      savedTitle = inputTitle.textContent;
      savedPlaceholder = userInput.placeholder;
      inputTitle.textContent = resolveTitleText(newMode);
      userInput.placeholder = resolvePlaceholder(newMode);
    }
  }
  window.addEventListener("languagechange", () => {
    if (isGraphicsMode && inputTitle && userInput) {
      const mode = typeof currentMode !== "undefined" ? currentMode : window.currentMode;
      inputTitle.textContent = resolveTitleText(mode);
      userInput.placeholder = resolvePlaceholder(mode);
    }
  });

  function createPreviewElement(payload) {
    const preview = document.createElement("div");
    preview.className = "graphics-preview";

    if (payload.kind === "svg" && payload.markup) {
      const img = document.createElement("img");
      img.className = "graphics-preview-img";
      const encoded = encodeURIComponent(payload.markup);
      img.src = `data:image/svg+xml;utf8,${encoded}`;
      img.alt = payload.title || tGraphics("graphicsDefaultTitle");
      preview.appendChild(img);
      return preview;
    }

    if (payload.png_base64) {
      const img = document.createElement("img");
      img.className = "graphics-preview-img";
      img.src = `data:image/png;base64,${payload.png_base64}`;
      img.alt = payload.title || tGraphics("graphicsDefaultTitle");
      preview.appendChild(img);
      return preview;
    }

    const fallback = document.createElement("div");
    fallback.className = "graphics-preview-empty";
    applyGraphicsTranslation(fallback, "graphicsPreviewUnavailable");
    preview.appendChild(fallback);
    return preview;
  }

  function createActions(payload, markupEl) {
    const actions = document.createElement("div");
    actions.className = "graphics-actions";

    const safeTitle = sanitizeFilename(payload.title || "grafica");

    const toggleMarkupBtn = document.createElement("button");
    toggleMarkupBtn.className = "secondary-btn secondary-btn-compact";
    applyGraphicsTranslation(toggleMarkupBtn, "graphicsButtonShowMarkup");
    toggleMarkupBtn.addEventListener("click", () => {
      const isHidden = markupEl.classList.toggle("hidden");
      applyGraphicsTranslation(
        toggleMarkupBtn,
        isHidden ? "graphicsButtonShowMarkup" : "graphicsButtonHideMarkup"
      );
    });
    actions.appendChild(toggleMarkupBtn);

    if (payload.kind === "svg") {
      const svgBtn = document.createElement("button");
      svgBtn.className = "secondary-btn secondary-btn-compact";
      applyGraphicsTranslation(svgBtn, "graphicsButtonDownloadSvg");
      svgBtn.addEventListener("click", () => {
        const blob = new Blob([payload.markup || ""], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeTitle}.svg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
      actions.appendChild(svgBtn);

      if (payload.png_base64) {
        const pngBtn = document.createElement("button");
        pngBtn.className = "secondary-btn secondary-btn-compact";
        applyGraphicsTranslation(pngBtn, "graphicsButtonDownloadPng");
        pngBtn.addEventListener("click", () => {
          const link = document.createElement("a");
          link.href = `data:image/png;base64,${payload.png_base64}`;
          link.download = `${safeTitle}.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
        });
        actions.appendChild(pngBtn);
      }
    } else {
      const ext = payload.kind === "plantuml" ? "puml" : "mmd";
      const srcBtn = document.createElement("button");
      srcBtn.className = "secondary-btn secondary-btn-compact";
      applyGraphicsTranslation(srcBtn, {
        key: "graphicsButtonDownloadSource",
        params: { ext: ext.toUpperCase() },
      });
      srcBtn.addEventListener("click", () => {
        const blob = new Blob([payload.markup || ""], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeTitle}.${ext}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
      actions.appendChild(srcBtn);
    }

    return actions;
  }

  function createEditorLinks(kind) {
    const wrapper = document.createElement("div");
    wrapper.className = "graphics-links";

    const label = document.createElement("div");
    label.className = "graphics-links-label";
    applyGraphicsTranslation(label, "graphicsEditorLabel");

    const links = document.createElement("div");
    links.className = "graphics-links-row";

    if (kind === "mermaid") {
      const mermaidLink = document.createElement("a");
      mermaidLink.href = "https://mermaid.live/";
      mermaidLink.target = "_blank";
      mermaidLink.rel = "noopener";
      applyGraphicsTranslation(mermaidLink, "graphicsEditorMermaid");
      links.appendChild(mermaidLink);
    } else if (kind === "plantuml") {
      const plantumlLink = document.createElement("a");
      plantumlLink.href = "https://www.plantuml.com/plantuml";
      plantumlLink.target = "_blank";
      plantumlLink.rel = "noopener";
      applyGraphicsTranslation(plantumlLink, "graphicsEditorPlantuml");
      links.appendChild(plantumlLink);
    }

    wrapper.appendChild(label);
    wrapper.appendChild(links);
    return wrapper;
  }

  function appendGraphicsBlock({ question, payload, sources = [], mode, msgIndex }) {
    const block = document.createElement("div");
    block.className = "message-block graphics-block";

    const index =
      msgIndex !== null && msgIndex !== undefined
        ? msgIndex
        : currentChatMessages.length;
    block.dataset.msgIndex = String(index);

    const qHeader = document.createElement("div");
    qHeader.className = "message-header";
    applyGraphicsTranslation(qHeader, "graphicsQuestionLabel");

    const qBody = document.createElement("div");
    qBody.className = "message-body";
    qBody.textContent = question;

    const aHeader = document.createElement("div");
    aHeader.className = "message-header";
    applyGraphicsTranslation(aHeader, "graphicsAnswerLabel");

    const aBody = document.createElement("div");
    aBody.className = "message-body graphics-body";

    const meta = document.createElement("div");
    meta.className = "graphics-meta";

    const title = document.createElement("div");
    title.className = "graphics-title";
    title.textContent = payload.title || tGraphics("graphicsDefaultTitle");

    const format = document.createElement("div");
    format.className = "graphics-format";
    format.textContent = (payload.kind || "svg").toUpperCase();

    meta.appendChild(title);
    meta.appendChild(format);
    aBody.appendChild(meta);

    const kind = (payload.kind || "svg").toLowerCase();
    if (kind === "svg" || payload.png_base64) {
      aBody.appendChild(createPreviewElement(payload));
    }
    if (kind === "mermaid" || kind === "plantuml") {
      aBody.appendChild(createEditorLinks(kind));
    }

    const markup = document.createElement("pre");
    markup.className = "graphics-markup hidden";
    markup.textContent = payload.markup || "";
    aBody.appendChild(markup);

    aBody.appendChild(createActions(payload, markup));

    if (Array.isArray(payload.warnings) && payload.warnings.length) {
      const warning = document.createElement("div");
      warning.className = "graphics-warning";
      warning.textContent = payload.warnings.join(" • ");
      aBody.appendChild(warning);
    }

    block.appendChild(qHeader);
    block.appendChild(qBody);
    block.appendChild(aHeader);
    block.appendChild(aBody);

    if (typeof renderSourcesForBlock === "function") {
      renderSourcesForBlock(block, sources, mode, "");
    }

    messagesContainer.appendChild(block);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const storedPayload = {
      type: "graphics",
      title: payload.title || tGraphics("graphicsDefaultTitle"),
      kind: payload.kind || "svg",
      markup: payload.markup || "",
    };
    currentChatMessages.push({ question, answer: JSON.stringify(storedPayload) });

    return {
      block,
      index,
      answerElement: aBody,
      setAnswer(_value, _options) {},
      updateSources(newSources, forcedMode) {
        const actualMode = forcedMode || mode;
        renderSourcesForBlock(block, newSources, actualMode, "");
      },
    };
  }

  async function requestGraphics(prompt, options = {}) {
    const { signal = null } = options || {};
    const mode =
      typeof currentMode !== "undefined" ? currentMode : window.currentMode;
    const activeTempDoc =
      mode === "chat" &&
      window.tempDocSession &&
      window.tempDocSession.id
        ? window.tempDocSession
        : null;
    const usingTempDoc = Boolean(activeTempDoc);
    const history = options.history || buildHistoryForGraphics();
    const userPrefs = await ensureGraphicsPreferences();
    const renderPref =
      typeof userPrefs.graphics_render_png === "boolean"
        ? userPrefs.graphics_render_png
        : true;
    const preferredKind =
      typeof userPrefs.graphics_preferred_kind === "string" && userPrefs.graphics_preferred_kind.trim()
        ? userPrefs.graphics_preferred_kind.trim()
        : "svg";
    const preferredModelId =
      typeof userPrefs.llm_model_graphics_id === "string" && userPrefs.llm_model_graphics_id.trim()
        ? userPrefs.llm_model_graphics_id.trim()
        : "";
    const currentLanguage =
      (window.i18n && window.i18n.currentLanguage) || document.documentElement.lang || "it";
    const payload = {
      prompt,
      mode,
      top_k: 5,
      history,
      render_png: renderPref,
      preferred_kind: preferredKind,
      language: currentLanguage,
    };
    if (usingTempDoc) {
      payload.temp_doc_id = activeTempDoc.id;
    }
    if (preferredModelId) {
      payload.model_id = preferredModelId;
    }

    const res = await fetch(`${API_BASE}/api/graphics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      let errorMessage = tGraphics("graphicsHttpError", { status: res.status });
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

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function init() {
    graphicsToggle = document.getElementById("chk-graphics-mode");
    inputTitle = document.getElementById("input-title");
    userInput = document.getElementById("user-input");

    if (!graphicsToggle || !inputTitle || !userInput) {
      return;
    }
    graphicsToggle.addEventListener("change", () => {
      setGraphicsMode(graphicsToggle.checked);
    });
  }

  window.graphicsUI = {
    init,
    isActive: () => isGraphicsMode,
    activate: () => setGraphicsMode(true),
    deactivate: () => setGraphicsMode(false),
    toggle: toggleGraphicsMode,
    onModeChange,
    requestGraphics,
    appendGraphicsBlock,
    parseAnswer,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
