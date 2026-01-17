(function() {
    // /app/js/notepad.js

    // --- State ---
    let isNoteMode = false;
    let lastMode = null;
    const noteByMode = {
        chat: "",
        rag: "",
    };

    function translateNotepadText(payload, params = {}, options = {}) {
      if (window.i18n && window.i18n.resolveText) {
        return window.i18n.resolveText(payload, params);
      }
      // Fallback
      const key = (typeof payload === 'object' && payload.key) ? payload.key : payload;
      return typeof key === 'string' ? key : '';
    }

    function getCurrentLanguage() {
        if (window.i18n && typeof window.i18n.getCurrentLanguage === "function") {
            return window.i18n.getCurrentLanguage();
        }
        return "it";
    }

    function sanitizeFilename(input, fallback = "file") {
        const base = typeof input === "string" && input.trim() ? input : fallback;
        const normalized = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return normalized.replace(/[^a-z0-9]/gi, "_").toLowerCase() || fallback;
    }

    // --- DOM Elements ---
    let noteModeBtn;
    let printChatBtn;
    let editorToolbar;
    let notepadEditor;
    let messagesContainer; // This is now local to this module's scope

    const PRINT_CONFIG = Object.freeze({
        maxCharsPerLine: 90,
        linesPerPage: 33
    });

    function normalizeParagraphs(text) {
        return (text || "")
            .replace(/\r\n/g, "\n")
            .split("\n");
    }

    function wrapLine(text) {
        const sanitized = (text || "").replace(/\s+/g, " ").trim();
        if (!sanitized) {
            return [""];
        }

        const lines = [];
        const words = sanitized.split(" ");
        let current = "";

        words.forEach((word) => {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > PRINT_CONFIG.maxCharsPerLine) {
                if (current) {
                    lines.push(current);
                    current = "";
                }

                if (word.length > PRINT_CONFIG.maxCharsPerLine) {
                    for (let i = 0; i < word.length; i += PRINT_CONFIG.maxCharsPerLine) {
                        lines.push(word.slice(i, i + PRINT_CONFIG.maxCharsPerLine));
                    }
                } else {
                    current = word;
                }
            } else {
                current = candidate;
            }
        });

        if (current) {
            lines.push(current);
        }

        return lines.length ? lines : [""];
    }

    function paragraphToLines(text) {
        const lines = [];
        normalizeParagraphs(text).forEach((segment) => {
            const trimmed = segment.trim();
            if (!trimmed) {
                lines.push("");
            } else {
                lines.push(...wrapLine(trimmed));
            }
        });
        return lines.length ? lines : [""];
    }

    function paginateLines(lines) {
        const pages = [];
        let current = [];

        lines.forEach((line) => {
            current.push(line);
            if (current.length >= PRINT_CONFIG.linesPerPage) {
                pages.push(current);
                current = [];
            }
        });

        if (current.length) {
            pages.push(current);
        }

        if (!pages.length) {
            pages.push([""]);
        }

        return pages;
    }

    function getChatPrintableLines() {
        const noChat = translateNotepadText("notepadNoChat");
        if (!messagesContainer) {
            return [noChat || "Nessuna chat disponibile."];
        }

        const blocks = messagesContainer.querySelectorAll(".message-block");
        if (!blocks.length) {
            return [noChat || "Nessuna chat disponibile."];
        }

        const lines = [];
        blocks.forEach((block, index) => {
            const bodies = block.querySelectorAll(".message-body");
            const question = bodies[0]?.textContent || "";
            const answer = bodies[1]?.textContent || "";

            lines.push(
                translateNotepadText("notepadPrintQuestion", { index: index + 1 }) ||
                    `DOMANDA ${index + 1}`
            );
            lines.push(...paragraphToLines(question));
            lines.push("");
            lines.push(translateNotepadText("notepadAnswerLabel") || "RISPOSTA");
            lines.push(...paragraphToLines(answer));
            lines.push("");
        });

        return lines;
    }

    function getNotePrintableLines() {
        const text = (notepadEditor?.innerText || "").trimEnd();
        if (!text) {
            return [translateNotepadText("notepadEmptyNote") || "Nota vuota."];
        }
        return paragraphToLines(text);
    }

    function extractNoteTitle() {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = notepadEditor?.innerHTML || "";
        const h1 = tempDiv.querySelector("h1");
        if (h1 && h1.textContent.trim() !== "") {
            return h1.textContent.trim();
        }

        for (const child of tempDiv.childNodes) {
            if (child.textContent && child.textContent.trim() !== "") {
                return child.textContent.trim();
            }
        }

        return "";
    }

    function resolveChatTitle() {
        const elem = document.getElementById("current-chat-title");
        const uiTitle = elem?.textContent?.trim();
        if (uiTitle) {
            return uiTitle;
        }

        const firstQuestion = messagesContainer?.querySelector(".message-body")?.textContent?.trim();
        if (firstQuestion) {
            return firstQuestion.length > 80 ? `${firstQuestion.slice(0, 77)}...` : firstQuestion;
        }

        return translateNotepadText("notepadChatFallback") || "Chat";
    }

    function createPrintContainer(title, subtitle, lines) {
        const container = document.createElement("div");
        container.id = "print-document";
        container.className = "print-document";

        const pages = paginateLines(lines);
        pages.forEach((pageLines, idx) => {
            const page = document.createElement("section");
            page.className = "print-page";

            const header = document.createElement("header");
            header.className = "print-header";

            const logo = document.createElement("img");
            logo.src = "logo.jpg";
            logo.alt = "Logo Coworker";
            logo.className = "print-logo";

            const headerText = document.createElement("div");
            headerText.className = "print-header-text";

            const titleEl = document.createElement("div");
            titleEl.className = "print-header-title";
            titleEl.textContent = title;

            const subtitleEl = document.createElement("div");
            subtitleEl.className = "print-header-subtitle";
            subtitleEl.textContent = subtitle;

            headerText.appendChild(titleEl);
            headerText.appendChild(subtitleEl);
            header.appendChild(logo);
            header.appendChild(headerText);

            const body = document.createElement("div");
            body.className = "print-body";
            pageLines.forEach((line) => {
                const paragraph = document.createElement("p");
                paragraph.textContent = line || "\u00A0";
                body.appendChild(paragraph);
            });

            const footer = document.createElement("footer");
            footer.className = "print-footer";

            const separator = document.createElement("div");
            separator.className = "print-footer-separator";

            const footerText = document.createElement("div");
            footerText.className = "print-footer-text";

            const left = document.createElement("span");
            const appTitle = translateNotepadText("appTitle") || "Coworker";
            const appVersion = translateNotepadText("appVersion") || "";
            const footerLabel = [appTitle, appVersion].filter(Boolean).join(" ");
            left.textContent = `${footerLabel} - \u00A9 2026 Coworker`;

            const right = document.createElement("span");
            right.textContent =
                translateNotepadText("notepadPageLabel", { current: idx + 1, total: pages.length }) ||
                `Pagina ${idx + 1} di ${pages.length}`;

            footerText.appendChild(left);
            footerText.appendChild(right);
            footer.appendChild(separator);
            footer.appendChild(footerText);

            page.appendChild(header);
            page.appendChild(body);
            page.appendChild(footer);

            container.appendChild(page);
        });

        return container;
    }

    // --- Initialization ---

    function updateToolbarState() {
        if (!editorToolbar) return;
        // Update state for simple command buttons
        const commandButtons = editorToolbar.querySelectorAll('.editor-btn[data-command]');
        commandButtons.forEach(btn => {
            const command = btn.dataset.command;
            try {
                if (document.queryCommandState(command)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            } catch (e) {
                // queryCommandState can throw errors on unsupported commands
            }
        });

        // Update state for the heading select
        const headingSelect = document.getElementById('editor-select-heading');
        if (headingSelect) {
            try {
                const blockType = document.queryCommandValue('formatBlock').toLowerCase();
                if (['p', 'h1', 'h2', 'h3', 'h4'].includes(blockType)) {
                    headingSelect.value = blockType;
                } else {
                    headingSelect.value = 'p';
                }
            } catch (e) {
                headingSelect.value = 'p';
            }
        }
    }

    function initializeNotepad(elements) {
        // Assign DOM elements
        noteModeBtn = document.getElementById('btn-note-mode');
        printChatBtn = document.getElementById('btn-print-chat');
        editorToolbar = document.getElementById('editor-toolbar');
        notepadEditor = document.getElementById('notepad-editor');
        messagesContainer = elements.messagesContainer; // Get reference from app.js

        if (!noteModeBtn || !printChatBtn || !editorToolbar || !notepadEditor || !messagesContainer) {
            console.error("Notepad initialization failed: One or more critical elements not found.");
            return;
        }

        // Attach event listeners
        noteModeBtn.addEventListener('click', toggleNoteMode);
        printChatBtn.addEventListener('click', handlePrint);
        
        editorToolbar.addEventListener('click', (event) => {
            const target = event.target.closest('.editor-btn');
            if (!target) return;

            const command = target.dataset.command;
            if (command) {
                document.execCommand(command, false, null);
                notepadEditor.focus();
                updateToolbarState();
            }
        });

        document.getElementById('editor-btn-uppercase').addEventListener('click', () => {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const selectedText = range.toString();
                if (selectedText) {
                    document.execCommand('insertText', false, selectedText.toUpperCase());
                }
            }
            notepadEditor.focus();
        });

        document.getElementById('editor-btn-lowercase').addEventListener('click', () => {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const selectedText = range.toString();
                if (selectedText) {
                    document.execCommand('insertText', false, selectedText.toLowerCase());
                }
            }
            notepadEditor.focus();
        });

        document.getElementById('editor-select-heading').addEventListener('change', (event) => {
            const heading = event.target.value;
            if (heading) {
                document.execCommand('formatBlock', false, heading);
            }
            notepadEditor.focus();
        });

        document.getElementById('btn-export').addEventListener('click', handleExport);

        notepadEditor.addEventListener('keyup', updateToolbarState);
        notepadEditor.addEventListener('mouseup', updateToolbarState);
        notepadEditor.addEventListener('focus', updateToolbarState);
        updateNotepadPlaceholder();
        window.addEventListener("languagechange", () => {
            setTimeout(updateNotepadPlaceholder, 0);
        });

        lastMode = getModeKey();
        restoreNoteForMode(lastMode);
    }

    // --- Core Logic ---
    function setNoteMode(active) {
        isNoteMode = active;
        noteModeBtn.classList.toggle('active', active);
        editorToolbar.classList.toggle('hidden', !active);
        notepadEditor.classList.toggle('hidden', !active);
        messagesContainer.classList.toggle('hidden', active);

        if (active) {
            if (window.graphicsUI && typeof window.graphicsUI.deactivate === "function") {
                window.graphicsUI.deactivate();
            }
            restoreNoteForMode(getModeKey());
            notepadEditor.focus();
        } else {
            persistNoteForMode(getModeKey());
        }
    }

    function toggleNoteMode() {
        setNoteMode(!isNoteMode);
    }

    function handlePrint() {
        const now = new Date();
        const langCode = getCurrentLanguage();
        const locale = langCode === "it" ? "it-IT" : "en-US";
        const timestamp = now.toLocaleString(locale);
        const modeLabelKey = isNoteMode ? "notepadModeNote" : "notepadModeChat";
        const modeLabel = translateNotepadText(modeLabelKey);
        const subtitle =
            translateNotepadText("notepadPrintSubtitle", { mode: modeLabel, timestamp }) ||
            `${modeLabel} · ${timestamp}`;
        const defaultTitle = translateNotepadText("notepadDefaultTitle") || "Nota";
        const title = isNoteMode ? (extractNoteTitle() || defaultTitle) : resolveChatTitle();
        const lines = isNoteMode ? getNotePrintableLines() : getChatPrintableLines();
        const container = createPrintContainer(title, subtitle, lines);

        document.body.appendChild(container);
        document.body.classList.add('print-mode-active');

        const cleanup = () => {
            document.body.classList.remove('print-mode-active');
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        };

        const afterPrintHandler = () => cleanup();
        window.addEventListener('afterprint', afterPrintHandler, { once: true });

        try {
            window.print();
        } catch (err) {
            window.removeEventListener('afterprint', afterPrintHandler);
            cleanup();
            throw err;
        }
    }

    // --- Export Logic ---

    function downloadFile(filename, content, mimeType) {
        const downloadName = filename || translateNotepadText("notepadDefaultFilename") || "documento";
        let blob = null;

        if (content instanceof Blob) {
            blob = content;
        } else if (content instanceof ArrayBuffer) {
            blob = new Blob([content], { type: mimeType || "application/octet-stream" });
        } else {
            blob = new Blob([content], { type: mimeType || "application/octet-stream" });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function createSelfContainedHtml(html, title) {
        const langCode = getCurrentLanguage();
        const docLang = langCode === "it" ? "it" : "en";
        try {
            const response = await fetch('styles.css');
            if (!response.ok) throw new Error('Failed to fetch stylesheet');
            const cssContent = await response.text();
            return `<!DOCTYPE html><html lang="${docLang}"><head><meta charset="UTF-8"><title>${title}</title><style>body { font-family: system-ui, sans-serif; margin: 2rem; } ${cssContent}</style></head><body>${html}</body></html>`;
        } catch (error) {
            console.error("Could not create self-contained HTML:", error);
            return `<!DOCTYPE html><html lang="${docLang}"><head><title>${title}</title></head><body>${html}</body></html>`;
        }
    }

    function convertHtmlToTxt(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || '';
    }

    function convertHtmlToJson(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const blocks = [];
        tempDiv.childNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                blocks.push({ type: node.tagName.toLowerCase(), content: node.textContent });
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                blocks.push({ type: 'p', content: node.textContent });
            }
        });
        return JSON.stringify(blocks, null, 2);
    }

    function convertHtmlToMarkdown(html) {
        let markdown = html;
        markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
        markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
        markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
        markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
        markdown = markdown.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
        markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**').replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
        markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*').replace(/<em>(.*?)<\/em>/gi, '*$1*');
        markdown = markdown.replace(/<u>(.*?)<\/u>/gi, '$1');
        markdown = markdown.replace(/<li>(.*?)<\/li>/gi, '* $1\n');
        markdown = markdown.replace(/<ul>/gi, '').replace(/<\/ul>/gi, '');
        markdown = markdown.replace(/<ol>/gi, '').replace(/<\/ol>/gi, '');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = markdown;
        return tempDiv.textContent || '';
    }

    async function exportNoteAudio(format, htmlContent, docTitle, safeTitle, date) {
        const plainText = convertHtmlToTxt(htmlContent).trim();
        if (!plainText) {
            alert(translateNotepadText("notepadAudioEmpty"));
            return;
        }

        const payload = {
            text: plainText,
            format,
            title: docTitle || translateNotepadText("notepadDefaultTitle") || "nota",
        };

        let finalStatusMessage = "";

        if (typeof startGlobalLoading === "function") {
            startGlobalLoading(translateNotepadText("notepadAudioGenerating"));
        }

        try {
            const response = await fetch(`${API_BASE}/api/tts/from-text`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const raw = await response.text();
                let message = raw;
                try {
                    const parsed = JSON.parse(raw);
                    message = parsed.detail || parsed.message || raw;
                } catch (_) {
                    // ignore parse errors
                }
                throw new Error(message || translateNotepadText("notepadAudioError"));
            }

            const blob = await response.blob();
            const outputFormat = (response.headers.get("x-output-format") || format || "wav").toLowerCase();
            const defaultSafeTitle = sanitizeFilename(translateNotepadText("notepadDefaultTitle") || "nota", "nota");
            const fallbackNameBase = safeTitle || defaultSafeTitle;
            const suggestedName =
                response.headers.get("x-suggested-filename") ||
                `${fallbackNameBase}_${date}.${outputFormat}`;
            const mimeType = response.headers.get("content-type") || "audio/wav";

            downloadFile(suggestedName, blob, mimeType);
            finalStatusMessage = translateNotepadText("notepadAudioSuccess");
        } catch (error) {
            console.error("Error during audio export:", error);
            const message = (error && error.message) ? error.message : translateNotepadText("notepadAudioError");
            finalStatusMessage = translateNotepadText("notepadAudioErrorShort");
            alert(message);
        } finally {
            if (typeof stopGlobalLoading === "function") {
                stopGlobalLoading(finalStatusMessage || translateNotepadText("notepadOperationDone"));
            }
        }
    }

    async function handleExport() {
        const format = document.getElementById('export-format-select').value;
        const htmlContent = notepadEditor.innerHTML;
        let fileContent, mimeType, fileExtension;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const defaultDocTitle = translateNotepadText("notepadDefaultTitle") || 'nota';
        const docTitle = (tempDiv.querySelector('h1')?.textContent || tempDiv.textContent.trim().split('\n')[0] || defaultDocTitle).trim();
        const safeTitleBase = sanitizeFilename(docTitle, sanitizeFilename(defaultDocTitle, "nota"));
        const safeTitle = safeTitleBase.substring(0, 50) || sanitizeFilename(defaultDocTitle, "nota");
        const date = new Date().toISOString().slice(0, 10);

        if (format === 'wav' || format === 'mp3') {
            await exportNoteAudio(format, htmlContent, docTitle, safeTitle, date);
            return;
        }
        
        switch (format) {
            case 'html':
                fileContent = await createSelfContainedHtml(htmlContent, docTitle);
                mimeType = 'text/html';
                fileExtension = 'html';
                break;
            case 'md':
                fileContent = convertHtmlToMarkdown(htmlContent);
                mimeType = 'text/markdown';
                fileExtension = 'md';
                break;
            case 'json':
                fileContent = convertHtmlToJson(htmlContent);
                mimeType = 'application/json';
                fileExtension = 'json';
                break;
            case 'txt':
            default:
                fileContent = convertHtmlToTxt(htmlContent);
                mimeType = 'text/plain';
                fileExtension = 'txt';
                break;
        }

        const filename = `${safeTitle}_${date}.${fileExtension}`;
        downloadFile(filename, fileContent, mimeType);
    }

    function getModeKey(mode) {
        const resolved = (mode || window.currentMode || "chat").toLowerCase();
        if (resolved === "rag") return "rag";
        return "chat";
    }

    function persistNoteForMode(mode) {
        if (!notepadEditor) return;
        const key = getModeKey(mode);
        noteByMode[key] = notepadEditor.innerHTML;
    }

    function restoreNoteForMode(mode) {
        if (!notepadEditor) return;
        const key = getModeKey(mode);
        notepadEditor.innerHTML = noteByMode[key] || "";
    }

    function updateNotepadPlaceholder() {
        if (!notepadEditor) return;
        
        let placeholder = "Write your note here..."; // Default to English
        if (window.i18n && typeof window.i18n.translate === 'function') {
            placeholder = window.i18n.translate("notepadPlaceholder");
        } else if (window.vocabulary) {
            // Fallback if i18n is not ready, try to access vocab directly
            const lang = document.documentElement.lang || 'it';
            placeholder = window.vocabulary[lang]?.notepadPlaceholder || window.vocabulary.it?.notepadPlaceholder || placeholder;
        }
        
        notepadEditor.setAttribute("data-placeholder", placeholder);
    }

    function handleModeChange(newMode) {
        const nextKey = getModeKey(newMode);
        if (lastMode === null) {
            lastMode = nextKey;
            return;
        }
        const currentKey = getModeKey(lastMode);
        if (currentKey !== nextKey) {
            persistNoteForMode(currentKey);
            restoreNoteForMode(nextKey);
        }
        lastMode = nextKey;
    }

    // --- Public API ---
    const Notepad = {
        init: initializeNotepad,
        isActive: () => isNoteMode,
        activate: () => setNoteMode(true),
        deactivate: () => setNoteMode(false),
        getContent: () => notepadEditor.innerHTML,
        setContent: (html) => {
            notepadEditor.innerHTML = html;
            persistNoteForMode(getModeKey());
        },
        appendContent: (html) => {
            notepadEditor.innerHTML += html;
            persistNoteForMode(getModeKey());
        },
        clearContent: () => {
            notepadEditor.innerHTML = '';
            persistNoteForMode(getModeKey());
        },
        onModeChange: (mode) => handleModeChange(mode),
    };

    window.Notepad = Notepad;
})();
