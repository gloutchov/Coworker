
(function () {
  const chkMcp = document.getElementById("chk-mcp");
  const panel = document.getElementById("mcp-panel");
  const listEl = document.getElementById("mcp-services-list");
  const statusEl = document.getElementById("mcp-panel-status");
  const refreshBtn = document.getElementById("btn-refresh-mcp");

  let services = [];
  let serverEnabled = true;
  let hasLoadedOnce = false;
  let lastStatusPayload = null;

  function translateMcpText(payload, params = {}) {
    if (window.i18n && window.i18n.translate) {
      return window.i18n.translate(payload, params);
    }
    const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
    return `[${key}]`;
  }

  function applyMcpTranslation(element, payload, params = {}, attr = "text") {
    if (!element) return;
    if (window.i18n && window.i18n.applyToElement) {
      const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
      const p = (typeof payload === 'object' && payload.params) ? payload.params : params;
      window.i18n.applyToElement(element, key, p, attr === "text" ? undefined : attr);
    } else {
      const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
      if (attr === "text") {
        element.textContent = `[${key}]`;
      }
    }
  }

  function setStatus(message, params = {}) {
    if (!message) {
      lastStatusPayload = null;
      if (statusEl) {
        statusEl.textContent = "";
      }
      return;
    }
    let payload = message;
    if (typeof message === "string") {
      payload = { key: message, params };
    } else if (message && typeof message === "object" && !message.params && params && Object.keys(params).length) {
      payload = { ...message, params };
    }
    lastStatusPayload = payload;
    if (statusEl) {
      applyMcpTranslation(statusEl, payload);
    }
  }

  function refreshStatus() {
    if (!statusEl || !lastStatusPayload) return;
    applyMcpTranslation(statusEl, lastStatusPayload);
  }

  function hidePanel() {
    if (panel) {
      panel.classList.add("hidden");
    }
  }

  function showPanel() {
    if (panel) {
      panel.classList.remove("hidden");
    }
  }

  function renderServices() {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!services.length) {
      const empty = document.createElement("div");
      empty.className = "mcp-panel-empty";
      const key = serverEnabled ? "mcpPanelNoServices" : "mcpPanelClientDisabled";
      applyMcpTranslation(empty, key);
      listEl.appendChild(empty);
      return;
    }

    services.forEach((svc) => {
      const card = document.createElement("div");
      card.className = "mcp-service-card";

      const header = document.createElement("div");
      header.className = "mcp-service-header";
      header.textContent = svc.label || svc.name;

      const tag = document.createElement("div");
      tag.className = "mcp-service-tag";
      tag.textContent = `@${svc.name}`;
      header.appendChild(tag);

      const description = document.createElement("div");
      description.className = "mcp-service-description";
      description.textContent = svc.description || translateMcpText("mcpServiceNoDescription");

      const details = document.createElement("div");
      details.className = "mcp-service-details";
      details.textContent = svc.instructions || "";

      const meta = document.createElement("div");
      meta.className = "mcp-service-meta";
      const typeValue = svc.type || translateMcpText("mcpServiceTypeUnknown");
      meta.textContent = translateMcpText("mcpServiceTypeLabel", { type: typeValue });

      card.appendChild(header);
      card.appendChild(description);
      if (details.textContent.trim()) {
        card.appendChild(details);
      }
      card.appendChild(meta);
      listEl.appendChild(card);
    });
  }

  async function fetchServices(showLoading = true) {
    if (!panel) return;
    if (!serverEnabled) {
      services = [];
      renderServices();
      setStatus("mcpPanelClientDisabled");
      return;
    }

    if (showLoading) {
      setStatus("mcpPanelLoading");
    }
    try {
      const res = await fetch(`${API_BASE}/api/mcp/services`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      serverEnabled = data.enabled !== false;
      services = Array.isArray(data.services) ? data.services : [];
      hasLoadedOnce = true;
      if (!serverEnabled) {
        services = [];
        if (chkMcp) {
          chkMcp.checked = false;
          chkMcp.disabled = true;
        }
        hidePanel();
        setStatus("mcpPanelServerDisabled");
        renderServices();
        return;
      }
      if (chkMcp && chkMcp.disabled) {
        chkMcp.disabled = false;
      }
      renderServices();
      if (services.length) {
        setStatus("mcpPanelReady");
      } else {
        setStatus("mcpPanelNoServices");
      }
    } catch (err) {
      console.error("Error loading MCP services:", err);
      setStatus("mcpPanelError");
    }
  }

  function isToggleActive() {
    return !!(chkMcp && chkMcp.checked && serverEnabled);
  }

  function isEnabled() {
    return isToggleActive();
  }

  async function ensureServicesLoaded() {
    if (!hasLoadedOnce) {
      await fetchServices(false);
    }
  }

  function getServices() {
    return services.slice();
  }

  async function getServicesSnapshot() {
    await ensureServicesLoaded();
    return getServices();
  }

  function extractInvocation(question) {
    if (!question) return null;
    const trimmed = question.trim();
    if (!trimmed.startsWith("@")) return null;
    const match = trimmed.match(/^@([^\s:]+)[:\s]+([\s\S]+)$/);
    if (!match) {
      return null;
    }
    const client = match[1].trim().toLowerCase();
    const payload = (match[2] || "").trim();
    if (!client || !payload) return null;
    return {
      client,
      payload,
      cleanPrompt: payload,
    };
  }

  async function invokeService(client, query, options = {}) {
    const { signal = null } = options || {};
    const res = await fetch(`${API_BASE}/api/mcp/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client, query }),
      signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data.detail || "";
      } catch (_) {
        detail = "";
      }
      throw new Error(detail || `HTTP ${res.status}`);
    }

    return res.json();
  }

  async function invokeCommand(question, options = {}) {
    if (!isToggleActive()) {
      throw new Error(translateMcpText("mcpInvokeDisabled"));
    }

    await ensureServicesLoaded();

    const invocation = extractInvocation(question);
    if (!invocation) {
      throw new Error(translateMcpText("mcpInvokeFormatError"));
    }

    const exists = services.some((svc) => svc.name === invocation.client);
    if (!exists) {
      throw new Error(
        translateMcpText("mcpInvokeUnavailable", { name: invocation.client })
      );
    }

    const response = await invokeService(invocation.client, invocation.payload, options);
    return response.content || translateMcpText("mcpInvokeEmptyResult");
  }

  function togglePanel() {
    if (!panel || !chkMcp) return;
    if (!serverEnabled) {
      hidePanel();
      return;
    }
    if (chkMcp.checked) {
      showPanel();
      fetchServices();
    } else {
      hidePanel();
    }
  }

  if (chkMcp) {
    chkMcp.addEventListener("change", togglePanel);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", (e) => {
      e.preventDefault();
      fetchServices();
    });
  }

  window.addEventListener("languagechange", () => {
    renderServices();
    refreshStatus();
  });

  window.mcpUI = {
    isEnabled,
    invokeCommand,
    loadServices: fetchServices,
    getServices,
    getServicesSnapshot,
    onModeChange: (mode) => {
      if (mode !== "chat") {
        hidePanel();
      } else if (chkMcp && chkMcp.checked && serverEnabled) {
        showPanel();
      }
    },
  };

  hidePanel();
})();
