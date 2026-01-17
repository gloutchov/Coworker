(function () {
  const chatHistory = document.getElementById("chat-history");
  const chatHistorySearch = document.getElementById("chat-history-search");

  let chatHistoryData = [];

  function translateHistoryText(payload, params = {}) {
    if (window.i18n && window.i18n.resolveText) {
      return window.i18n.resolveText(payload, params);
    }
    // Fallback for when i18n is not available
    const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
    const value = typeof key === 'string' ? key : '';

    if (!value || !params) return value;
    return value.replace(/\{([^}]+)\}/g, (_, token) => {
      const paramValue = params[token.trim()];
      return typeof paramValue === "undefined" ? `{${token}}` : paramValue;
    });
  }

  function applyHistoryTranslation(element, payload, params = {}, attr = "text") {
    if (!element) return;
    
    const text = translateHistoryText(payload, params);
    if (attr === "text") {
      element.textContent = text;
    } else {
      element.setAttribute(attr, text);
    }
  }

  function getErrorDetail(err, fallback = "Unknown error") {
    if (!err) return fallback;
    if (typeof err === "string") return err;
    return err.message || fallback;
  }

  function setHistoryMessage(payload, params = {}) {
    if (!chatHistory) return;
    chatHistory.innerHTML = "";
    const message = document.createElement("div");
    message.className = "history-empty";
    applyHistoryTranslation(message, payload, params);
    chatHistory.appendChild(message);
  }

  function formatModeLabel(mode) {
    if (mode === "rag") return translateHistoryText("ragMode");
    if (mode === "history") return translateHistoryText("historyMode");
    return translateHistoryText("chatMode");
  }

  function renderChatHistory(filterTerm = "") {
    if (!chatHistory) return;

    const term = (filterTerm || "").toLowerCase().trim();
    const filtered =
      term.length > 0
        ? chatHistoryData.filter((c) => {
            const title = (c.title || "").toLowerCase();
            const mode = (c.mode || "").toLowerCase();
            return title.includes(term) || mode.includes(term);
          })
        : chatHistoryData;

    if (!filtered.length) {
      setHistoryMessage("historyEmpty");
      return;
    }

    const container = document.createElement("div");
    filtered.forEach((c) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.dataset.chatId = c.id;

      const title = document.createElement("div");
      title.className = "history-item-title";
      const hasTitle = typeof c.title === "string" && c.title.trim().length > 0;
      title.textContent = hasTitle ? c.title : translateHistoryText("historyUntitled");

      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      const modeLabel = formatModeLabel(c.mode);
      const createdAt = c.created_at || "";
      meta.textContent = createdAt ? `${modeLabel} - ${createdAt}` : modeLabel;

      item.addEventListener("click", () => {
        if (window.historyUI && window.historyUI.loadChatFromHistory) {
          window.historyUI.loadChatFromHistory(c.id);
        }
      });

      title.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        if (window.historyUI && window.historyUI.startRenameChatTitle) {
          window.historyUI.startRenameChatTitle(c);
        }
      });

      item.appendChild(title);
      item.appendChild(meta);
      container.appendChild(item);
    });

    chatHistory.innerHTML = "";
    chatHistory.appendChild(container);
  }

  async function loadChatHistory() {
    if (!chatHistory) return;
    try {
      const res = await fetch(`${API_BASE}/api/chats`);

      if (!res.ok) {
        if (res.status === 404) {
          chatHistoryData = [];
          setHistoryMessage({
            key: "historyEndpointUnavailable",
            params: { endpoint: "/api/chats" },
          });
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const chats = await res.json();

      if (!Array.isArray(chats) || chats.length === 0) {
        chatHistoryData = [];
        setHistoryMessage("historyEmpty");
        return;
      }

      chatHistoryData = chats;
      const currentFilter = chatHistorySearch ? chatHistorySearch.value : "";
      renderChatHistory(currentFilter);
    } catch (err) {
      console.error("Errore caricamento storico chat:", err);
      chatHistoryData = [];
      setHistoryMessage({
        key: "historyLoadError",
        params: { error: getErrorDetail(err) },
      });
    }
  }

  function bindSearch() {
    if (!chatHistorySearch) return;
    chatHistorySearch.addEventListener("input", () => {
      const term = chatHistorySearch.value;
      renderChatHistory(term);
    });
  }

  window.addEventListener("languagechange", () => {
    const currentFilter = chatHistorySearch ? chatHistorySearch.value : "";
    renderChatHistory(currentFilter);
  });

  window.historyUI = {
    renderChatHistory,
    loadChatHistory,
    bindSearch,
    loadChatFromHistory: null,
    startRenameChatTitle: null,
  };

  bindSearch();
})();