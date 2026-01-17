(function () {
  function translateProvidersText(payload, params = {}) {
    if (window.i18n && window.i18n.translate) {
      return window.i18n.translate(payload, params);
    }
    const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
    return typeof key === 'string' ? key : '';
  }

  function applyProvidersTranslation(element, payload, params = {}) {
    if (!element) return;
    if (window.i18n && window.i18n.applyToElement) {
      window.i18n.applyToElement(element, payload, params);
    } else if (typeof payload === "string") {
      element.textContent = payload;
    }
  }

  function renderApiConfigPage(pageEl, cfg, prefs = {}, updateUserPreferences) {
    const wrapper = document.createElement("div");
    wrapper.className = "config-preferences-wrapper";

    const card = document.createElement("div");
    card.className = "config-preferences-card";

    const intro = document.createElement("p");
    intro.className = "config-page-intro";
    applyProvidersTranslation(intro, "providersIntro");
    card.appendChild(intro);

    const statusEl = document.createElement("div");
    statusEl.className = "status-text";

    const controls = document.createElement("div");
    controls.className = "config-preferences-options";

    const providerDefaults = {
      ollama: "http://127.0.0.1:11434/v1",
      lmstudio: "http://127.0.0.1:1234/v1",
      openai_compatible: "https://api.openai.com/v1",
    };

    const enabledRow = document.createElement("label");
    enabledRow.className = "config-preference-option";

    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = Boolean(prefs?.api_provider_enabled);

    const enabledText = document.createElement("div");
    enabledText.className = "config-preference-text";
    const enabledTitle = document.createElement("span");
    enabledTitle.className = "config-preference-title";
    applyProvidersTranslation(enabledTitle, "providersEnableTitle");
    enabledText.appendChild(enabledTitle);

    enabledRow.appendChild(enabledInput);
    enabledRow.appendChild(enabledText);
    controls.appendChild(enabledRow);
    enabledInput.addEventListener("change", () => {
      if (typeof updateUserPreferences === "function") {
        updateUserPreferences({ api_provider_enabled: enabledInput.checked }, statusEl);
      }
    });

    const providerRow = document.createElement("label");
    providerRow.className = "config-preference-option config-preference-option-vertical";

    const providerTitle = document.createElement("div");
    providerTitle.className = "config-preference-title";
    applyProvidersTranslation(providerTitle, "providersSelectProvider");

    const providerSelect = document.createElement("select");
    providerSelect.className = "config-text-input";
    [
      { value: "ollama", labelKey: "providerLabelOllama" },
      { value: "lmstudio", labelKey: "providerLabelLmstudio" },
      { value: "openai_compatible", labelKey: "providerLabelOpenAICompatible" },
    ].forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      applyProvidersTranslation(option, opt.labelKey);
      providerSelect.appendChild(option);
    });
    providerSelect.value = prefs?.api_provider_type || "ollama";

    providerSelect.addEventListener("change", () => {
      if (!baseUrlInput.value.trim()) {
        baseUrlInput.value = providerDefaults[providerSelect.value] || "";
      }
      if (typeof updateUserPreferences === "function") {
        updateUserPreferences({ api_provider_type: providerSelect.value }, statusEl);
      }
    });

    providerRow.appendChild(providerTitle);
    providerRow.appendChild(providerSelect);
    controls.appendChild(providerRow);

    const baseUrlRow = document.createElement("label");
    baseUrlRow.className = "config-preference-option config-preference-option-vertical";
    const baseUrlTitle = document.createElement("div");
    baseUrlTitle.className = "config-preference-title";
    applyProvidersTranslation(baseUrlTitle, "providersBaseUrl");
    const baseUrlInput = document.createElement("input");
    baseUrlInput.type = "text";
    baseUrlInput.className = "config-text-input";
    baseUrlInput.placeholder = providerDefaults[providerSelect.value] || "";
    baseUrlInput.value = prefs?.api_base_url || "";
    baseUrlInput.addEventListener("change", () => {
      if (typeof updateUserPreferences === "function") {
        updateUserPreferences({ api_base_url: baseUrlInput.value.trim() }, statusEl);
      }
    });
    baseUrlRow.appendChild(baseUrlTitle);
    baseUrlRow.appendChild(baseUrlInput);
    controls.appendChild(baseUrlRow);

    const modelRow = document.createElement("label");
    modelRow.className = "config-preference-option config-preference-option-vertical";
    const modelTitle = document.createElement("div");
    modelTitle.className = "config-preference-title";
    applyProvidersTranslation(modelTitle, "providersModelTitle");
    const modelInput = document.createElement("input");
    modelInput.type = "text";
    modelInput.className = "config-text-input";
    modelInput.placeholder = translateProvidersText("providersModelPlaceholder");
    modelInput.value = prefs?.api_model || "";
    modelInput.addEventListener("change", () => {
      if (typeof updateUserPreferences === "function") {
        updateUserPreferences({ api_model: modelInput.value.trim() }, statusEl);
      }
    });
    modelRow.appendChild(modelTitle);
    modelRow.appendChild(modelInput);
    controls.appendChild(modelRow);

    const keyRow = document.createElement("label");
    keyRow.className = "config-preference-option config-preference-option-vertical";
    const keyTitle = document.createElement("div");
    keyTitle.className = "config-preference-title";
    applyProvidersTranslation(keyTitle, "providersApiKeyTitle");
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.className = "config-text-input";
    keyInput.placeholder = prefs?.api_api_key_set
      ? translateProvidersText("providersApiKeySavedPlaceholder")
      : translateProvidersText("providersApiKeyPlaceholder");
    keyInput.value = "";
    keyInput.addEventListener("change", () => {
      const keyValue = keyInput.value.trim();
      if (keyValue && typeof updateUserPreferences === "function") {
        updateUserPreferences({ api_api_key: keyValue }, statusEl);
      }
    });
    keyRow.appendChild(keyTitle);
    keyRow.appendChild(keyInput);
    controls.appendChild(keyRow);

    const keyStatus = document.createElement("div");
    keyStatus.className = "status-text";
    keyStatus.textContent = prefs?.api_api_key_set
      ? translateProvidersText("providersApiKeySaved")
      : translateProvidersText("providersApiKeyMissing");
    controls.appendChild(keyStatus);

    const modesTitle = document.createElement("div");
    modesTitle.className = "config-preference-title";
    applyProvidersTranslation(modesTitle, "providersModesTitle");
    controls.appendChild(modesTitle);

    const buildModeToggle = (labelKey, value, key) => {
      const row = document.createElement("label");
      row.className = "config-preference-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value;
      input.addEventListener("change", () => {
        if (typeof updateUserPreferences === "function") {
          updateUserPreferences({ [key]: input.checked }, statusEl);
        }
      });
      const text = document.createElement("div");
      text.className = "config-preference-text";
      const title = document.createElement("span");
      title.className = "config-preference-title";
      applyProvidersTranslation(title, labelKey);
      text.appendChild(title);
      row.appendChild(input);
      row.appendChild(text);
      row._prefKey = key;
      row._inputEl = input;
      return row;
    };

    const allowChat = buildModeToggle(
      "providersModeChat",
      Boolean(prefs?.api_allow_chat),
      "api_allow_chat"
    );
    const allowRag = buildModeToggle(
      "providersModeRag",
      Boolean(prefs?.api_allow_rag),
      "api_allow_rag"
    );
    const allowHistory = buildModeToggle(
      "providersModeHistory",
      Boolean(prefs?.api_allow_history),
      "api_allow_history"
    );
    controls.appendChild(allowChat);
    controls.appendChild(allowRag);
    controls.appendChild(allowHistory);

    const capsTitle = document.createElement("div");
    capsTitle.className = "config-preference-title";
    applyProvidersTranslation(capsTitle, "providersCapsTitle");
    controls.appendChild(capsTitle);

    const supportsVision = buildModeToggle(
      "providersVision",
      Boolean(prefs?.api_supports_vision),
      "api_supports_vision"
    );
    const supportsOcr = buildModeToggle(
      "providersOcr",
      Boolean(prefs?.api_supports_ocr),
      "api_supports_ocr"
    );
    const supportsThinking = buildModeToggle(
      "providersThinking",
      Boolean(prefs?.api_supports_thinking),
      "api_supports_thinking"
    );
    controls.appendChild(supportsVision);
    controls.appendChild(supportsOcr);
    controls.appendChild(supportsThinking);

    const hint = document.createElement("div");
    hint.className = "status-text";
    applyProvidersTranslation(hint, "providersHint");
    controls.appendChild(hint);

    const actions = document.createElement("div");
    actions.className = "config-preferences-options config-actions-stack";

    const clearKeyBtn = document.createElement("button");
    clearKeyBtn.type = "button";
    clearKeyBtn.className = "secondary-btn secondary-btn-compact";
    applyProvidersTranslation(clearKeyBtn, "providersClearKey");
    clearKeyBtn.addEventListener("click", () => {
      keyInput.value = "";
      if (typeof updateUserPreferences === "function") {
        updateUserPreferences({ api_api_key: "" }, statusEl);
      }
    });

    actions.appendChild(clearKeyBtn);

    card.appendChild(controls);
    card.appendChild(actions);
    card.appendChild(statusEl);
    wrapper.appendChild(card);
    pageEl.appendChild(wrapper);
    return true;
  }

  window.providersUI = {
    renderApiConfigPage,
  };
})();
