// Logica audio: upload file, live recording mic/sistema, merge segmenti dialogo

// Assumiamo che alcune utility siano già nel global scope da app.js:
// - API_BASE, startGlobalLoading, stopGlobalLoading, appendMessageBlock, currentMode, outputStatus, setLiveButtonState, setMode, etc.

// Stato per la trascrizione live
let liveSystemRecorder = null;
let liveMicRecorder = null;
let liveSystemChunks = [];
let liveMicChunks = [];
let liveInputStreams = [];
let liveLevelStops = [];
let liveIsRecording = false;
let liveSession = null;

const audioClickGuard = new Map();
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

function isRapidAudioClick(key, thresholdMs) {
  const guardMs = typeof thresholdMs === "number" ? thresholdMs : getClickGuardMs();
  const now = Date.now();
  const last = audioClickGuard.get(key) || 0;
  if (now - last < guardMs) {
    return true;
  }
  audioClickGuard.set(key, now);
  return false;
}

const AUDIO_FILE_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".webm",
  ".opus",
]);

window.AUDIO_FILE_EXTENSIONS = AUDIO_FILE_EXTENSIONS;

window.tempDocSession = window.tempDocSession || null;
let tempDocStatusEl = null;
let btnClearTempDocEl = null;
let audioFileInputEl = null;
let btnTranscribeEl = null;
let hasAudioSelection = false;
let imageOcrLabelEl = null;
let imageOcrToggleEl = null;
let chatSendBtnEl = null;
let chatInputEl = null;

function translateAudioText(payload, params = {}) {
  if (window.i18n && window.i18n.resolveText) {
    return window.i18n.resolveText(payload, params);
  }
  // Fallback
  const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
  return typeof key === 'string' ? key : '';
}

function applyTranslatedText(element, payload, params = {}) {
  if (!element) return;
  if (window.i18n && window.i18n.applyToElement) {
    const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
    const p = (typeof payload === 'object' && payload.params) ? payload.params : params;
    window.i18n.applyToElement(element, key, p);
  } else {
    // Fallback
    element.textContent = translateAudioText(payload, params);
  }
}

function updateOutputStatusText(payload, params = {}) {
  if (typeof window.setOutputStatus === "function") {
    window.setOutputStatus(payload, params);
    return;
  }
  if (typeof outputStatus !== "undefined" && outputStatus) {
    applyTranslatedText(outputStatus, payload, params);
  }
}

const IMAGE_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
  ".tiff",
  ".tif",
]);

window.imageUploadState = window.imageUploadState || {
  images: [],
  loading: false,
  clear: () => {},
};

function notifyTtsSelection(file, isAudio) {
  if (window.ttsUI && typeof window.ttsUI.onFileSelected === "function") {
    window.ttsUI.onFileSelected({ file, isAudio: !!isAudio });
  }
}

function notifyTtsCleared() {
  if (window.ttsUI && typeof window.ttsUI.onFileCleared === "function") {
    window.ttsUI.onFileCleared();
  }
}

let lastTempDocStatus = null;
window.addEventListener("languagechange", () => {
  if (lastTempDocStatus) {
    setTempDocStatus(lastTempDocStatus.payload, lastTempDocStatus.params);
  }
});

function setTempDocStatus(payload, params = {}) {
  if (!tempDocStatusEl) return;
  lastTempDocStatus = { payload, params };
  applyTranslatedText(tempDocStatusEl, payload, params);
}

function setImageLoadingUi(active, messagePayload) {
  if (chatSendBtnEl) {
    chatSendBtnEl.disabled = active;
  }
  if (chatInputEl) {
    chatInputEl.disabled = active;
  }
  if (active) {
    startGlobalLoading(messagePayload || "imageLoadingGeneric");
  } else {
    stopGlobalLoading("imageReadyStatus");
  }
}

function setImageOcrVisible(visible) {
  if (!imageOcrLabelEl) return;
  imageOcrLabelEl.classList.toggle("hidden", !visible);
}

function clearImageSelection(options = {}) {
  const { keepFileInput = false } = options;
  if (window.imageUploadState) {
    window.imageUploadState.images = [];
    window.imageUploadState.loading = false;
  }
  setImageLoadingUi(false);
  if (imageOcrToggleEl) {
    imageOcrToggleEl.checked = false;
  }
  if (audioFileInputEl && !keepFileInput) {
    audioFileInputEl.value = "";
  }
  setImageOcrVisible(false);
  if (window.llmUI && typeof window.llmUI.refreshModelBadge === "function") {
    window.llmUI.refreshModelBadge();
  }
}

async function clearTempDocSession(options = {}) {
  const {
    notifyServer = true,
    silent = false,
    keepFileInput = false,
    preserveButton = false,
  } = options;
  const session = window.tempDocSession;
  window.tempDocSession = null;
  if (session && notifyServer && session.id) {
    try {
      await fetch(`${API_BASE}/api/temp-doc/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("Errore cancellazione documento temporaneo:", err);
    }
  }
  if (!silent) {
    setTempDocStatus("tempDocStatusNone");
  }
  if (btnClearTempDocEl && !preserveButton) {
    btnClearTempDocEl.classList.add("hidden");
  }
  if (!keepFileInput && audioFileInputEl) {
    audioFileInputEl.value = "";
  }
  if (!keepFileInput) {
    hasAudioSelection = false;
    if (btnTranscribeEl) {
      btnTranscribeEl.disabled = true;
      btnTranscribeEl.classList.add("hidden");
    }
    notifyTtsCleared();
    clearImageSelection();
  }
}

function isAudioFile(file) {
  if (!file) return false;
  const ext = (file.name || "").split(".").pop();
  if (ext && AUDIO_FILE_EXTENSIONS.has(`.${ext.toLowerCase()}`)) {
    return true;
  }
  return (file.type || "").toLowerCase().startsWith("audio/");
}

function isImageFile(file) {
  if (!file) return false;
  const ext = (file.name || "").split(".").pop();
  if (ext && IMAGE_FILE_EXTENSIONS.has(`.${ext.toLowerCase()}`)) {
    return true;
  }
  return (file.type || "").toLowerCase().startsWith("image/");
}

async function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Errore lettura immagine."));
    reader.readAsDataURL(file);
  });
}

async function uploadTemporaryDocument(file) {
  if (!file) return;
  await clearTempDocSession({ silent: true, keepFileInput: true });
  const formData = new FormData();
  formData.append("file", file);
  setTempDocStatus("tempDocUploadingStatus", { name: file.name });
  const loadingLabel = { key: "tempDocUploadingLabel", params: { name: file.name } };
  let finalLoadingMessage = "tempDocUploadComplete";
  startGlobalLoading(loadingLabel);
  try {
    const response = await fetch(`${API_BASE}/api/temp-doc/upload`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Errore HTTP ${response.status}`);
    }
    const data = await response.json();
    window.tempDocSession = {
      id: data.temp_doc_id,
      name: data.name,
      chunks: data.chunks,
      size: data.size,
      uploadedAt: Date.now(),
    };
    hasAudioSelection = false;
    setTempDocStatus("tempDocReady", { name: data.name, chunks: data.chunks });
    if (btnClearTempDocEl) {
      btnClearTempDocEl.classList.remove("hidden");
    }
    finalLoadingMessage = { key: "tempDocUploadCompleteWithName", params: { name: data.name } };
  } catch (err) {
    console.error("Errore caricamento documento temporaneo:", err);
    setTempDocStatus("tempDocUploadErrorRetry");
    notifyTtsCleared();
    finalLoadingMessage = "tempDocUploadError";
  } finally {
    stopGlobalLoading(finalLoadingMessage);
  }
}

async function handleSelectedFile() {
  if (!audioFileInputEl) return;
  const file = audioFileInputEl.files && audioFileInputEl.files[0];
  if (!file) {
    await clearTempDocSession({ silent: true });
    setTempDocStatus("noFileSelected");
    if (btnTranscribeEl) {
      btnTranscribeEl.disabled = true;
      btnTranscribeEl.classList.add("hidden");
    }
    hasAudioSelection = false;
    notifyTtsCleared();
    return;
  }

  hasAudioSelection = false;
  const audio = isAudioFile(file);
  const image = isImageFile(file);
  if (audio) {
    clearImageSelection({ keepFileInput: true });
    await clearTempDocSession({
      silent: true,
      notifyServer: true,
      keepFileInput: true,
      preserveButton: true,
    });
    if (btnTranscribeEl) {
      btnTranscribeEl.disabled = false;
      btnTranscribeEl.classList.remove("hidden");
    }
    hasAudioSelection = true;
    setTempDocStatus("audioFileSelectedStatus", { name: file.name });
    if (btnClearTempDocEl) {
      btnClearTempDocEl.classList.remove("hidden");
    }
    notifyTtsSelection(file, true);
    return;
  }

  if (image) {
    if (window.currentMode !== "chat") {
      setTempDocStatus("imageOnlyChatMode");
      if (audioFileInputEl) {
        audioFileInputEl.value = "";
      }
      clearImageSelection({ keepFileInput: true });
      return;
    }
    await clearTempDocSession({
      silent: true,
      notifyServer: true,
      keepFileInput: true,
      preserveButton: true,
    });
    if (window.imageUploadState) {
      window.imageUploadState.loading = true;
    }
    setImageLoadingUi(true, { key: "imageLoadingNamed", params: { name: file.name } });
    if (btnTranscribeEl) {
      btnTranscribeEl.disabled = true;
      btnTranscribeEl.classList.add("hidden");
    }
    try {
      setTempDocStatus("imageLoadingNamed", { name: file.name });
      const dataUrl = await readImageFile(file);
      if (window.imageUploadState) {
        window.imageUploadState.images = [dataUrl];
        window.imageUploadState.loading = false;
      }
      setImageLoadingUi(false);
      setTempDocStatus("imageSelectedStatus", { name: file.name });
      setImageOcrVisible(true);
      if (window.llmUI && typeof window.llmUI.refreshModelBadge === "function") {
        window.llmUI.refreshModelBadge();
      }
      if (btnClearTempDocEl) {
        btnClearTempDocEl.classList.remove("hidden");
      }
    } catch (err) {
      console.error("Errore lettura immagine:", err);
      if (window.imageUploadState) {
        window.imageUploadState.loading = false;
      }
      setImageLoadingUi(false);
      setTempDocStatus("imageReadError");
      clearImageSelection();
    }
    notifyTtsCleared();
    return;
  }

  if (btnTranscribeEl) {
    btnTranscribeEl.disabled = true;
    btnTranscribeEl.classList.add("hidden");
  }

  clearImageSelection({ keepFileInput: true });
  await uploadTemporaryDocument(file);
  notifyTtsSelection(file, false);
}

function handleTempDocExpired(message) {
  clearTempDocSession({ notifyServer: false, silent: true, keepFileInput: true }).finally(() => {
    setTempDocStatus(message || "tempDocExpired");
    if (btnClearTempDocEl) {
      btnClearTempDocEl.classList.add("hidden");
    }
    if (btnTranscribeEl) {
      btnTranscribeEl.classList.add("hidden");
      btnTranscribeEl.disabled = true;
    }
    hasAudioSelection = false;
    if (audioFileInputEl) {
      audioFileInputEl.value = "";
    }
    notifyTtsCleared();
  });
}

window.handleTempDocExpired = handleTempDocExpired;

function setLiveButtonState(isRecording) {
  const btnLiveTranscribe = document.getElementById("btn-live-transcribe");
  if (!btnLiveTranscribe) return;
  if (isRecording) {
    btnLiveTranscribe.classList.add("live-recording");
    applyTranslatedText(btnLiveTranscribe, "liveTranscribeStopButton");
  } else {
    btnLiveTranscribe.classList.remove("live-recording");
    applyTranslatedText(btnLiveTranscribe, "liveTranscribeButton");
  }
}

function stopLiveStreams() {
  liveInputStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => track.stop());
  });
  liveInputStreams = [];
  liveLevelStops.forEach((fn) => {
    try { fn(); } catch (e) { /* ignore */ }
  });
  liveLevelStops = [];
}

function mergeDialogueSegments(micSegments = [], sysSegments = []) {
  const micLabel = translateAudioText("liveTranscriptSpeakerMic");
  const systemLabel = translateAudioText("liveTranscriptSpeakerSystem");
  const entries = [];
  micSegments.forEach((s) => {
    if (!s || !s.text) return;
    entries.push({
      speaker: "A",
      label: micLabel,
      start: typeof s.start === "number" ? s.start : 0,
      text: s.text.trim()
    });
  });
  sysSegments.forEach((s) => {
    if (!s || !s.text) return;
    entries.push({
      speaker: "B",
      label: systemLabel,
      start: typeof s.start === "number" ? s.start : 0,
      text: s.text.trim()
    });
  });

  entries.sort((a, b) => a.start - b.start);
  return entries
    .map((e) => `${e.label}:\n${e.text}`)
    .join("\n\n");
}

function isLikelySilenceText(rawText) {
  const trimmed = (rawText || "").trim();
  if (!trimmed) return true;
  const hasLatin = /[A-Za-z0-9\u00C0-\u017F]/.test(trimmed);
  if (hasLatin) return false;
  return trimmed.length <= 2;
}

function getLiveTranscriptText(rawText) {
  if (isLikelySilenceText(rawText)) {
    return translateAudioText("liveTranscriptSilence");
  }
  return (rawText || "").trim();
}

function formatLiveTranscriptBlock(labelKey, rawText) {
  const label = translateAudioText(labelKey);
  const content = getLiveTranscriptText(rawText);
  return `${label}:\n${content}`;
}

function startLevelMonitor(stream, channel, recOffsetsRef) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !stream) return () => {};

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  let stopped = false;

  const check = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] - 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    // Soglia empirica: sopra ~12 consideriamo parlato
    if (!recOffsetsRef[channel] && rms > 12) {
      recOffsetsRef[channel] = (performance.now() - recOffsetsRef._globalStart) / 1000;
    }
    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);

  return () => {
    stopped = true;
    try { source.disconnect(); } catch (e) { /* ignore */ }
    try { ctx.close(); } catch (e) { /* ignore */ }
  };
}

function mergeTranscriptsIfReady(session) {
  const micDone = !session.expectMic || (session.transcriptsReady && session.transcriptsReady.mic);
  const sysDone = !session.expectSystem || (session.transcriptsReady && session.transcriptsReady.system);
  if (!(micDone && sysDone)) return;

  const micText = session.transcriptsRaw ? session.transcriptsRaw.mic : session.transcripts.mic;
  const sysText = session.transcriptsRaw ? session.transcriptsRaw.system : session.transcripts.system;

  const combined = [
    formatLiveTranscriptBlock("liveTranscriptSpeakerMic", micText),
    formatLiveTranscriptBlock("liveTranscriptSpeakerSystem", sysText)
  ].join("\n\n");

  appendMessageBlock(
    translateAudioText("liveTranscriptionDialogTitle"),
    combined,
    [],
    currentMode === "rag" ? "rag" : "chat"
  );
  updateOutputStatusText("liveTranscriptionDialogDone");
  stopGlobalLoading(translateAudioText("liveTranscriptionDialogDone"));
  liveSession = null;
}

async function sendLiveRecording(blob, label, channel, sessionId) {
  const formData = new FormData();
  formData.append("file", blob, "live-transcription.webm");

  const labelText = translateAudioText(label || "");
  const inProgress = translateAudioText("liveTranscriptionStreamInProgress", { label: labelText });
  startGlobalLoading(inProgress);
  updateOutputStatusText("liveTranscriptionStreamInProgress", { label: labelText });

  try {
    const response = await fetch(`${API_BASE}/api/transcribe`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Errore /api/transcribe live:", response.status, errText);
      updateOutputStatusText("liveTranscriptionError");
      stopGlobalLoading(translateAudioText("liveTranscriptionError"));
      return;
    }

    const data = await response.json();
    const question = translateAudioText("liveTranscriptionQuestionLabel", { label: labelText });
    const rawText = typeof data.text === "string" ? data.text : "";
    const answer = getLiveTranscriptText(rawText);

    const session = liveSession;
    if (session && session.id === sessionId) {
      session.transcripts = session.transcripts || {};
      session.transcriptsRaw = session.transcriptsRaw || {};
      session.transcriptsReady = session.transcriptsReady || {};
      session.transcriptsSegments = session.transcriptsSegments || {};
      if (channel) {
        session.transcripts[channel] = answer;
        session.transcriptsRaw[channel] = rawText;
        session.transcriptsReady[channel] = true;
        const speechOffset = session.speechOffsets && session.speechOffsets[channel];
        const offset = typeof speechOffset === "number"
          ? speechOffset
          : (session.recOffsets && session.recOffsets[channel]) || 0;
        const segs = Array.isArray(data.segments) ? data.segments : [];
        session.transcriptsSegments[channel] = segs.map((s) => ({
          ...s,
          start: (typeof s.start === "number" ? s.start : 0) + offset,
          end: typeof s.end === "number" ? s.end + offset : undefined
        }));
      }

      mergeTranscriptsIfReady(session);
    } else {
      appendMessageBlock(
        question,
        answer,
        [],
        currentMode === "rag" ? "rag" : "chat"
      );
      updateOutputStatusText("liveTranscriptionStreamCompleted", { label: labelText });
      stopGlobalLoading(translateAudioText("liveTranscriptionStreamCompleted", { label: labelText }));
    }
  } catch (err) {
    console.error("Eccezione durante la trascrizione live:", err);
    updateOutputStatusText("liveTranscriptionError");
    stopGlobalLoading(translateAudioText("liveTranscriptionError"));
  }
}

async function startLiveRecording() {
  if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
    alert(translateAudioText("liveRecordingUnsupported"));
    return;
  }
  if (liveIsRecording) return;

  liveMicChunks = [];
  liveSystemChunks = [];
  updateOutputStatusText("liveRecordingRequestAudio");

  try {
    let systemStream = null;
    let micStream = null;
    let usedSystemAudio = false;
    let usedMic = false;

    try {
      const sys = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 2
        },
        video: true
      });
      sys.getVideoTracks().forEach((t) => t.stop());
      if (sys && sys.getAudioTracks().length) {
        systemStream = sys;
        usedSystemAudio = true;
      } else {
        sys.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      // Ignoriamo la mancanza di audio di sistema: continueremo solo col microfono se disponibile.
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      usedMic = !!micStream;
    } catch (err) {
      if (!usedSystemAudio) {
        updateOutputStatusText("liveRecordingMicDenied");
      }
    }

    const audioTracks = []
      .concat(systemStream ? systemStream.getAudioTracks() : [])
      .concat(micStream ? micStream.getAudioTracks() : [])
      .filter(Boolean);

    if (!audioTracks.length) {
      stopLiveStreams();
      updateOutputStatusText("liveRecordingNoSource");
      return;
    }

    liveInputStreams = [systemStream, micStream].filter(Boolean);

    const recorderOptions = {};
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      recorderOptions.mimeType = "audio/webm;codecs=opus";
    }

    let activeRecorders = 0;
    const sessionId = Date.now();
    const globalStart = performance.now();

    if (systemStream) {
      liveSystemChunks = [];
      liveSystemRecorder = new MediaRecorder(systemStream, recorderOptions);
    } else {
      liveSystemRecorder = null;
      liveSystemChunks = [];
    }

    if (micStream) {
      liveMicChunks = [];
      liveMicRecorder = new MediaRecorder(micStream, recorderOptions);
    } else {
      liveMicRecorder = null;
      liveMicChunks = [];
    }

    if (!liveSystemRecorder && !liveMicRecorder) {
      stopLiveStreams();
      liveSession = null;
      updateOutputStatusText("liveRecordingNoSource");
      return;
    }

    liveSession = {
      id: sessionId,
      expectSystem: !!systemStream,
      expectMic: !!micStream,
      transcripts: {},
      transcriptsRaw: {},
      transcriptsReady: {},
      transcriptsSegments: {},
      recOffsets: { _globalStart: globalStart },
      speechOffsets: {},
      hasData: false
    };

    const attachRecorder = (recorder, chunksRef, channel, label, streamForMonitor) => {
      if (!recorder) return;
      activeRecorders += 1;
      const recStart = performance.now();
      const offsetSec = (recStart - globalStart) / 1000;
      if (liveSession && liveSession.id === sessionId) {
        liveSession.recOffsets[channel] = offsetSec;
      }
      const stopMonitor = startLevelMonitor(streamForMonitor, channel, liveSession.recOffsets);
      liveLevelStops.push(stopMonitor);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.push(ev.data);
        }
      };
      recorder.onstop = () => {
        if (!--activeRecorders) {
          liveIsRecording = false;
          setLiveButtonState(false);
          stopLiveStreams();
          liveSystemRecorder = null;
          liveMicRecorder = null;
        }

        const localChunks = chunksRef.slice();
        if (!localChunks.length) {
          if (activeRecorders === 0) {
            const session = liveSession;
            if (session && session.id === sessionId && !session.hasData) {
              const noAudio = translateAudioText("liveRecordingNoAudio");
              stopGlobalLoading(noAudio);
              updateOutputStatusText("liveRecordingNoAudio");
              liveSession = null;
            }
          }
          return;
        }
        const blob = new Blob(localChunks, { type: "audio/webm" });
        const session = liveSession;
        if (session && session.id === sessionId) {
          session.hasData = true;
        }
        sendLiveRecording(blob, label, channel, sessionId);
      };
      recorder.start();
    };

    attachRecorder(
      liveSystemRecorder,
      liveSystemChunks,
      "system",
      "liveTranscriptSpeakerSystem",
      systemStream
    );
    attachRecorder(
      liveMicRecorder,
      liveMicChunks,
      "mic",
      "liveTranscriptSpeakerMic",
      micStream
    );

    liveIsRecording = true;
    setLiveButtonState(true);
    if (usedSystemAudio && usedMic) {
      updateOutputStatusText("liveRecordingSystemMic");
    } else if (usedSystemAudio) {
      updateOutputStatusText("liveRecordingSystemOnly");
    } else {
      updateOutputStatusText("liveRecordingMicOnly");
    }
  } catch (err) {
    console.error("Errore nell'avvio della registrazione live:", err);
    stopLiveStreams();
    liveSystemRecorder = null;
    liveMicRecorder = null;
    liveIsRecording = false;
    setLiveButtonState(false);
    updateOutputStatusText("liveRecordingStartError");
  }
}

function stopLiveRecording() {
  const recs = [liveSystemRecorder, liveMicRecorder].filter(Boolean);
  liveIsRecording = false;
  setLiveButtonState(false);
  updateOutputStatusText("liveTranscriptionProcessing");
  startGlobalLoading(translateAudioText("liveTranscriptionProcessing"));

  if (!recs.length) {
    stopLiveStreams();
    return;
  }

  const sessionId = liveSession ? liveSession.id : null;

  recs.forEach((rec) => {
    if (rec.state !== "inactive") {
      rec.stop();
      return;
    }
    const isSystem = rec === liveSystemRecorder;
    const chunks = isSystem ? liveSystemChunks : liveMicChunks;
    if (chunks && chunks.length) {
      const blob = new Blob(chunks, { type: "audio/webm" });
      sendLiveRecording(
        blob,
        isSystem ? "liveTranscriptSpeakerSystem" : "liveTranscriptSpeakerMic",
        isSystem ? "system" : "mic",
        sessionId
      );
    }
  });
}

// Hook UI per i pulsanti audio
function initAudioUI() {
  const btnLiveTranscribe = document.getElementById("btn-live-transcribe");
  btnTranscribeEl = document.getElementById("btn-transcribe");
  audioFileInputEl = document.getElementById("audio-file");
  tempDocStatusEl = document.getElementById("temp-doc-status");
  btnClearTempDocEl = document.getElementById("btn-clear-temp-doc");
  imageOcrLabelEl = document.getElementById("image-ocr-label");
  imageOcrToggleEl = document.getElementById("chk-image-ocr");
  chatSendBtnEl = document.getElementById("btn-send");
  chatInputEl = document.getElementById("user-input");

  if (window.imageUploadState) {
    window.imageUploadState.clear = clearImageSelection;
  }
  setImageOcrVisible(false);
  setImageLoadingUi(false);

  if (btnTranscribeEl) {
    btnTranscribeEl.disabled = true;
    btnTranscribeEl.classList.add("hidden");
  }

  if (audioFileInputEl) {
    audioFileInputEl.addEventListener("change", () => {
      handleSelectedFile();
    });
  }

  if (btnClearTempDocEl) {
    btnClearTempDocEl.addEventListener("click", async () => {
      const hasImageSelection =
        window.imageUploadState &&
        Array.isArray(window.imageUploadState.images) &&
        window.imageUploadState.images.length > 0;
      if (hasAudioSelection) {
        hasAudioSelection = false;
        if (audioFileInputEl) {
          audioFileInputEl.value = "";
        }
        if (btnTranscribeEl) {
      btnTranscribeEl.disabled = true;
      btnTranscribeEl.classList.add("hidden");
    }
    btnClearTempDocEl.classList.add("hidden");
    setTempDocStatus("audioFileRemoved");
    notifyTtsCleared();
    return;
  }
  if (hasImageSelection) {
    clearImageSelection();
    btnClearTempDocEl.classList.add("hidden");
    setTempDocStatus("imageRemoved");
    return;
  }
  clearImageSelection();
  await clearTempDocSession();
  setTempDocStatus("tempDocRemoved");
      if (btnTranscribeEl) {
        btnTranscribeEl.classList.add("hidden");
        btnTranscribeEl.disabled = true;
      }
    });
  }

  if (btnLiveTranscribe) {
    btnLiveTranscribe.addEventListener("click", () => {
      if (isRapidAudioClick("live-transcribe")) {
        return;
      }
      if (liveIsRecording) {
        stopLiveRecording();
      } else {
        startLiveRecording();
      }
    });
  }

  if (btnTranscribeEl && audioFileInputEl) {
    btnTranscribeEl.addEventListener("click", async () => {
      if (isRapidAudioClick("transcribe-file")) {
        return;
      }
      const file = audioFileInputEl.files[0];
      if (!file) {
        alert(translateAudioText("transcriptionSelectFile"));
        return;
      }
      if (!isAudioFile(file)) {
        alert(translateAudioText("transcriptionInvalidAudio"));
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      startGlobalLoading(translateAudioText("audioTranscriptionInProgress"));
      updateOutputStatusText("audioTranscriptionWorking");

      try {
        const response = await fetch(`${API_BASE}/api/transcribe`, {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Errore /api/transcribe:", response.status, errText);
          updateOutputStatusText("transcriptionError");
          stopGlobalLoading(translateAudioText("transcriptionError"));
          return;
        }

        const data = await response.json();

        const question = translateAudioText("audioTranscriptionQuestion");
        const answer = data.text || translateAudioText("transcriptionEmpty");

        appendMessageBlock(
          question,
          answer,
          [],
          currentMode === "rag" ? "rag" : "chat"
        );

        updateOutputStatusText("transcriptionCompleted");
        stopGlobalLoading(translateAudioText("transcriptionCompleted"));
      } catch (err) {
        console.error("Eccezione durante la trascrizione:", err);
        updateOutputStatusText("transcriptionError");
        stopGlobalLoading(translateAudioText("transcriptionError"));
      }
    });
  }


  if (audioFileInputEl) {
    handleSelectedFile();
  } else {
    setTempDocStatus("fileInputUnavailable");
  }
}

async function resetUploadPanel(options = {}) {
  const { notifyServer = true } = options;
  hasAudioSelection = false;
  if (audioFileInputEl) {
    audioFileInputEl.value = "";
  }
  if (btnTranscribeEl) {
    btnTranscribeEl.disabled = true;
    btnTranscribeEl.classList.add("hidden");
  }
  clearImageSelection();
  await clearTempDocSession({
    notifyServer,
    silent: false,
    keepFileInput: true,
  });
  if (btnClearTempDocEl) {
    btnClearTempDocEl.classList.add("hidden");
  }
  setTempDocStatus("noFileSelected");
  notifyTtsCleared();
}

window.audioUI = {
  resetUploadPanel,
};
