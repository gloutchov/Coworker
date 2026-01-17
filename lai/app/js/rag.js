(function () {
  const btnReindex = document.getElementById("btn-reindex");
  const btnRefreshDocs = document.getElementById("btn-refresh-docs");
  const ragStatus = document.getElementById("rag-status");
  const ragDocsList = document.getElementById("rag-docs-list");
  const ragIndexList = document.getElementById("rag-index-list");
  const OCR_PREFIX = "OCR::";
  const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"]);
  const ragLangHelper = window.i18n || window.langHelper || null;
  let lastReindexClickAt = 0;

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

  function isRapidReindexClick() {
    const now = Date.now();
    const guardMs = getClickGuardMs();
    if (now - lastReindexClickAt < guardMs) {
      return true;
    }
    lastReindexClickAt = now;
    return false;
  }

  function translateRagText(payload, params = {}) {
    if (!payload) return "";
    if (typeof payload === "object" && payload.key) {
      return translateRagText(payload.key, payload.params || params);
    }
    if (ragLangHelper && typeof ragLangHelper.translate === "function" && typeof payload === "string") {
      if (!ragLangHelper.hasKey || ragLangHelper.hasKey(payload)) {
        return ragLangHelper.translate(payload, params);
      }
    }
    return typeof payload === "string" ? payload : "";
  }

  function applyRagTranslation(element, payload, params = {}, attr = "text") {
    if (!element) return;
    if (ragLangHelper && typeof ragLangHelper.applyToElement === "function") {
      if (payload && typeof payload === "object" && payload.key) {
        ragLangHelper.applyToElement(
          element,
          payload.key,
          payload.params || params,
          attr === "text" ? undefined : attr
        );
        return;
      }
      if (typeof payload === "string") {
        ragLangHelper.applyToElement(element, payload, params, attr === "text" ? undefined : attr);
        return;
      }
    }
    const text = translateRagText(payload, params);
    if (attr === "text") {
      element.textContent = text;
    } else {
      element.setAttribute(attr, text);
    }
  }

  function clearRagTranslation(element) {
    if (!element || !element.dataset) return;
    delete element.dataset.translateKey;
    delete element.dataset.translateAttr;
    delete element.dataset.translateParams;
  }

  function setRagStatus(payload, params = {}) {
    if (!ragStatus) return;
    applyRagTranslation(ragStatus, payload, params);
  }

  function translateForMessage(payload, params = {}) {
    return translateRagText(payload, params);
  }

  function getErrorDetail(err, fallback = "Unknown error") {
    if (!err) return fallback;
    if (typeof err === "string") return err;
    return err.message || fallback;
  }

  function isImageFileName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return Array.from(IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext));
  }

  async function loadRagIndexList() {
    if (!ragIndexList) return;

    applyRagTranslation(ragIndexList, "ragStatusLoadingIndex");

    try {
      const [fsRes, ragRes] = await Promise.all([
        fetch(`${API_BASE}/api/docs-list`),
        fetch(`${API_BASE}/api/rag-docs`)
      ]);

      const fsNames = new Set();
      if (fsRes.ok) {
        const fsDocs = await fsRes.json();
        if (Array.isArray(fsDocs)) {
          fsDocs.forEach((d) => {
            const base = (d.name || "").split(/[\\/]/).pop();
            if (base) {
              fsNames.add(base.toLowerCase());
            }
          });
        }
      }

      if (!ragRes.ok) {
        applyRagTranslation(ragIndexList, {
          key: "ragStatusLoadingIndexError",
          params: { error: `HTTP ${ragRes.status}` },
        });
        return;
      }

      const docs = await ragRes.json();
      clearRagTranslation(ragIndexList);
      ragIndexList.innerHTML = "";

      if (!Array.isArray(docs) || docs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "rag-index-empty";
        applyRagTranslation(empty, "ragEmptyIndex");
        ragIndexList.appendChild(empty);
        return;
      }

      docs.forEach((d) => {
        const row = document.createElement("div");
        row.className = "rag-index-item";

        const nameSpan = document.createElement("span");
        const isOcrDoc = (d.name || "").startsWith(OCR_PREFIX);
        const displayName = isOcrDoc ? d.name.slice(OCR_PREFIX.length) : d.name;
        nameSpan.textContent = displayName;
        row.appendChild(nameSpan);

        const base = (displayName || "").split(/[\\/]/).pop().toLowerCase();
        const existsOnFs = fsNames.has(base);

        if (isOcrDoc) {
          const badge = document.createElement("span");
          badge.className = "rag-index-badge-ocr";
          badge.textContent = "OCR";
          row.appendChild(badge);
        }

        if (!existsOnFs) {
          const badge = document.createElement("span");
          badge.className = "rag-index-badge-missing";
          applyRagTranslation(badge, "ragMissingOnDisk");
          row.appendChild(badge);
        }

        row.addEventListener("contextmenu", async (ev) => {
          ev.preventDefault();
          const ok = window.confirm(
            translateForMessage({ key: "ragConfirmRemove", params: { docName: d.name } })
          );
          if (!ok) return;

          try {
            startGlobalLoading(translateForMessage("ragStatusRemovingFromIndex"));
            const delRes = await fetch(`${API_BASE}/api/rag-docs-delete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: d.name })
            });

            if (!delRes.ok) {
              const txt = await delRes.text();
              console.error(
                "Errore /api/rag-docs-delete:",
                delRes.status,
                txt
              );
              const detail = (txt && txt.trim()) || `HTTP ${delRes.status}`;
              window.alert(
                translateForMessage({
                  key: "ragStatusRemovingFromIndexError",
                  params: { error: detail },
                })
              );
            }

            await loadRagIndexList();
            stopGlobalLoading(translateForMessage("ragStatusRemovingFromIndexSuccess"));
          } catch (err) {
            console.error("Errore cancellazione RAG:", err);
            const detail = getErrorDetail(err);
            const message = translateForMessage({
              key: "ragStatusRemovingFromIndexError",
              params: { error: detail },
            });
            stopGlobalLoading(message);
            window.alert(message);
          }
        });

        ragIndexList.appendChild(row);
      });
    } catch (err) {
      console.error("Errore caricamento indice RAG:", err);
      applyRagTranslation(ragIndexList, {
        key: "ragStatusLoadingIndexError",
        params: { error: getErrorDetail(err) },
      });
    }
  }

  async function loadDocsList() {
    if (!ragDocsList) return;

    applyRagTranslation(ragDocsList, "ragStatusLoadingDocs");

    try {
      const [docsRes, statusRes, cfgRes, prefsRes] = await Promise.all([
        fetch(`${API_BASE}/api/docs-list`),
        fetch(`${API_BASE}/api/rag-status`),
        fetch(`${API_BASE}/api/config`),
        fetch(`${API_BASE}/api/config/user`)
      ]);

      if (!docsRes.ok) {
        if (docsRes.status === 404) {
          applyRagTranslation(ragDocsList, {
            key: "ragEndpointUnavailable",
            params: { endpoint: "/api/docs-list" },
          });
          return;
        }
        throw new Error(`HTTP ${docsRes.status}`);
      }

      const docs = await docsRes.json();
      let supportsOcr = false;
      let prefs = null;
      if (prefsRes.ok) {
        prefs = await prefsRes.json();
      }

      const providerEnabled = Boolean(prefs?.api_provider_enabled) && Boolean(prefs?.api_allow_rag);
      if (providerEnabled) {
        supportsOcr = Boolean(prefs?.api_supports_ocr);
      } else if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        const models = Array.isArray(cfg?.llm_models) ? cfg.llm_models : [];
        let activeId = cfg?.llm_model_default_id;
        if (prefs?.llm_model_id) {
          activeId = prefs.llm_model_id;
        }
        const visionId = prefs?.llm_model_vision_id;
        const activeModel = models.find((model) => model.id === activeId);
        const visionModel = visionId
          ? models.find((model) => model.id === visionId)
          : null;
        const activeCaps = activeModel?.capabilities || {};
        const visionCaps = visionModel?.capabilities || {};
        supportsOcr = Boolean(
          (activeCaps.vision && activeCaps.ocr) ||
          (visionCaps.vision && visionCaps.ocr)
        );
      }

      if (!Array.isArray(docs) || docs.length === 0) {
        applyRagTranslation(ragDocsList, "ragDocsEmptyFolder");
        return;
      }

      const unindexedSet = new Set();
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const newFiles = Array.isArray(statusData.new_files)
          ? statusData.new_files
          : [];
        newFiles.forEach((name) => {
          if (typeof name === "string" && name.trim()) {
            unindexedSet.add(name.trim().toLowerCase());
          }
        });
      }

      const list = document.createElement("div");

      docs.forEach((d) => {
        const row = document.createElement("div");
        row.className = "rag-docs-item";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = d.name;
        row.appendChild(nameSpan);

        const base = (d.name || "").split(/[\\/]/).pop().toLowerCase();
        const isUnindexed = unindexedSet.has(base);
        const isImage = isImageFileName(d.name);

        if (isUnindexed) {
          const badge = document.createElement("span");
          badge.className = "rag-docs-badge-unindexed";
          applyRagTranslation(badge, "ragUnindexed");
          row.appendChild(badge);
        }
        if (isImage) {
          const badge = document.createElement("span");
          badge.className = "rag-docs-badge-ocr";
          applyRagTranslation(badge, supportsOcr ? "ragOcrAvailable" : "ragOcrRequiresVision");
          row.appendChild(badge);
        }

        row.addEventListener("contextmenu", async (ev) => {
          ev.preventDefault();
          if (isImage) {
            if (!supportsOcr) {
              window.alert(translateForMessage("ragOcrNotAvailable"));
              return;
            }
            const confirmMsg = translateForMessage({
              key: "ragConfirmOcr",
              params: { docName: d.name },
            });
            if (!window.confirm(confirmMsg)) return;
            try {
              const payload = { key: "ragOcrFile", params: { docName: d.name } };
              setRagStatus(payload);
              startGlobalLoading(translateForMessage(payload));
              const fileRes = await fetch(`${API_BASE}/api/doc-file/${encodeURIComponent(d.name)}`);
              if (!fileRes.ok) {
                const errText = await fileRes.text();
                throw new Error(errText || `HTTP ${fileRes.status}`);
              }
              const blob = await fileRes.blob();
              const formData = new FormData();
              formData.append("file", blob, d.name);
              const res = await fetch(`${API_BASE}/api/ocr-image-index`, {
                method: "POST",
                body: formData,
              });
              if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || `HTTP ${res.status}`);
              }
              const data = await res.json();
              setRagStatus({ key: "ragOcrFileSuccess", params: { docName: data.name, chunks: data.chunks } });
              await loadDocsList();
              checkRagStatus();
              loadRagIndexList();
            } catch (error) {
              console.error("Errore OCR immagine:", error);
              setRagStatus("ragOcrFileError");
            } finally {
              stopGlobalLoading(translateForMessage("ragDone"));
            }
            return;
          }

          const confirmMsg = translateForMessage({
            key: "ragConfirmIndexSingle",
            params: { docName: d.name },
          });
          if (!window.confirm(confirmMsg)) return;

          try {
            const payload = { key: "ragIndexingFile", params: { docName: d.name } };
            setRagStatus(payload);
            startGlobalLoading(translateForMessage(payload));
            const res = await fetch(`${API_BASE}/api/reindex-file`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: d.name }),
            });
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(errText || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setRagStatus({ key: "ragIndexedFile", params: { docName: data.file, chunks: data.chunks } });
            await loadDocsList();
            checkRagStatus();
            loadRagIndexList();
          } catch (error) {
            console.error("Errore indicizzazione singolo documento:", error);
            setRagStatus("ragIndexingFileError");
          } finally {
            stopGlobalLoading(translateForMessage("ragDone"));
          }
        });

        list.appendChild(row);
      });

      clearRagTranslation(ragDocsList);
      ragDocsList.innerHTML = "";
      ragDocsList.appendChild(list);
    } catch (err) {
      console.error("Errore caricamento documenti:", err);
      applyRagTranslation(ragDocsList, {
        key: "ragStatusLoadingDocsError",
        params: { error: getErrorDetail(err) },
      });
    }
  }

  async function checkRagStatus() {
    if (!ragStatus) return;
    try {
      const res = await fetch(`${API_BASE}/api/rag-status`);

      if (!res.ok) {
        if (res.status === 404) {
          setRagStatus({
            key: "ragEndpointUnavailable",
            params: { endpoint: "/api/rag-status" },
          });
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data.docs_dir_exists) {
        setRagStatus("ragFolderMissing");
        return;
      }

      const hasNew = !!data.has_new;
      const hasMod = !!data.has_modified;
      const hasRem = !!data.has_removed;

      if (!hasNew && !hasMod && !hasRem) {
        setRagStatus("ragIndexAligned");
        return;
      }

      setRagStatus("ragIndexChanges");
    } catch (err) {
      console.error("Errore controllo stato RAG:", err);
      setRagStatus({
        key: "ragStatusError",
        params: { error: getErrorDetail(err) },
      });
    }
  }

  if (btnReindex) {
    btnReindex.addEventListener("click", async () => {
      if (isRapidReindexClick()) {
        return;
      }
      setRagStatus("ragStatusIndexing");
      startGlobalLoading(translateForMessage("ragStatusIndexing"));

      try {
        const res = await fetch(`${API_BASE}/api/reindex`, {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const successPayload = {
          key: "ragStatusIndexingSuccess",
          params: { files: data.files, chunks: data.chunks },
        };
        setRagStatus(successPayload);
        loadDocsList();
        checkRagStatus();
        loadRagIndexList();
        stopGlobalLoading(translateForMessage(successPayload));
      } catch (err) {
        console.error("Errore indicizzazione RAG:", err);
        const errorPayload = {
          key: "ragStatusIndexingError",
          params: { error: getErrorDetail(err) },
        };
        setRagStatus(errorPayload);
        stopGlobalLoading(translateForMessage(errorPayload));
      }
    });
  }

  if (btnRefreshDocs) {
    btnRefreshDocs.addEventListener("click", () => {
      loadDocsList();
      checkRagStatus();
      loadRagIndexList();
    });
  }

  window.ragUI = {
    loadDocsList,
    checkRagStatus,
    loadRagIndexList,
  };
})();
