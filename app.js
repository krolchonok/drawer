const elements = {
    fileInput: document.getElementById('fileInput'),
    canvas: document.getElementById('canvas'),
    applyBtn: document.getElementById('applyBtn'),
    undoBtn: document.getElementById('undoBtn'),
    clearBtn: document.getElementById('clearBtn'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    intensity: document.getElementById('intensity'),
    status: document.getElementById('status')
};

const ctx = elements.canvas.getContext('2d');
const baseCanvas = document.createElement('canvas');
const baseCtx = baseCanvas.getContext('2d');

const MIN_SELECTION_SIZE = 5;
const MAX_HISTORY_STEPS = 20;

const state = {
    imageLoaded: false,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragCurrentX: 0,
    dragCurrentY: 0,
    selectionRects: [],
    history: []
};

bindEvents();
render();

function bindEvents() {
    elements.fileInput.addEventListener('change', handleFileChange);
    elements.canvas.addEventListener('mousedown', handleMouseDown);
    elements.canvas.addEventListener('mousemove', handleMouseMove);
    elements.canvas.addEventListener('mouseup', handleMouseUp);
    elements.canvas.addEventListener('mouseleave', handleMouseLeave);

    elements.applyBtn.addEventListener('click', handleApplyClick);
    elements.undoBtn.addEventListener('click', handleUndoClick);
    elements.clearBtn.addEventListener('click', handleClearClick);
    elements.copyBtn.addEventListener('click', handleCopyClick);
    elements.downloadBtn.addEventListener('click', handleDownloadClick);

    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
}

function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }

    loadImageFromFile(file);
}

function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));

    if (!imageItem) {
        return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
        setStatus('Не удалось прочитать изображение из буфера обмена.', true);
        return;
    }

    event.preventDefault();
    loadImageFromFile(file, 'Изображение вставлено из буфера обмена.');
}

function handleKeyDown(event) {
    const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';
    const isCopyShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c';
    const target = event.target;
    const isEditableTarget = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    if (isEditableTarget) {
        return;
    }

    if (isUndoShortcut && state.history.length > 0) {
        event.preventDefault();
        handleUndoClick();
        return;
    }

    if (isCopyShortcut && state.imageLoaded) {
        event.preventDefault();
        handleCopyClick();
    }
}

function handleMouseDown(event) {
    if (!state.imageLoaded) {
        return;
    }

    const point = getCanvasPoint(event);
    state.isDragging = true;
    state.dragStartX = point.x;
    state.dragStartY = point.y;
    state.dragCurrentX = point.x;
    state.dragCurrentY = point.y;
}

function handleMouseMove(event) {
    if (!state.imageLoaded || !state.isDragging) {
        return;
    }

    const point = getCanvasPoint(event);
    state.dragCurrentX = point.x;
    state.dragCurrentY = point.y;

    render();
}

function handleMouseUp() {
    finalizeSelection();
}

function handleMouseLeave() {
    finalizeSelection();
}

function finalizeSelection() {
    if (!state.imageLoaded || !state.isDragging) {
        return;
    }

    state.isDragging = false;

    const rect = getNormalizedRect(
        state.dragStartX,
        state.dragStartY,
        state.dragCurrentX,
        state.dragCurrentY
    );

    if (rect.w >= MIN_SELECTION_SIZE && rect.h >= MIN_SELECTION_SIZE) {
        state.selectionRects.push(rect);
    }

    render();
}

function handleApplyClick() {
    if (!state.imageLoaded || state.selectionRects.length === 0) {
        return;
    }

    saveHistorySnapshot();
    redrawBaseImageToCanvas();

    const mode = document.querySelector('input[name="mode"]:checked').value;
    const intensity = Number.parseInt(elements.intensity.value, 10) || 5;

    for (const rect of state.selectionRects) {
        applyEffect(rect, mode, intensity);
    }

    commitCanvasToBase();
    state.selectionRects = [];
    render();
    setStatus('Изменения применены.');
}

function handleUndoClick() {
    if (state.history.length === 0) {
        return;
    }

    const previousImage = state.history.pop();
    baseCanvas.width = previousImage.width;
    baseCanvas.height = previousImage.height;
    elements.canvas.width = previousImage.width;
    elements.canvas.height = previousImage.height;

    baseCtx.putImageData(previousImage, 0, 0);
    state.selectionRects = [];
    state.isDragging = false;
    render();
    setStatus('Последнее закрашивание отменено.');
}

function handleClearClick() {
    if (!state.imageLoaded) {
        return;
    }

    state.selectionRects = [];
    state.isDragging = false;
    render();
    setStatus('Выделения очищены.');
}

async function handleCopyClick() {
    if (!state.imageLoaded) {
        return;
    }

    redrawBaseImageToCanvas();

    const blob = await canvasToBlob(elements.canvas);
    if (!blob) {
        render();
        setStatus('Не удалось подготовить изображение для буфера обмена.', true);
        return;
    }

    try {
        await writeImageToClipboard(blob);
        setStatus('Изображение скопировано в буфер обмена.');
    } catch (error) {
        setStatus(getClipboardErrorMessage(), true);
    } finally {
        render();
    }
}

async function handleDownloadClick() {
    if (!state.imageLoaded) {
        return;
    }

    redrawBaseImageToCanvas();

    const blob = await canvasToBlob(elements.canvas);
    if (!blob) {
        render();
        setStatus('Не удалось подготовить изображение к скачиванию.', true);
        return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'edited-image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    render();
    setStatus('Файл подготовлен к скачиванию.');
}

function loadImageFromFile(file, successMessage = 'Изображение загружено.') {
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        const image = new Image();
        image.onload = () => {
            initializeCanvasFromImage(image);
            elements.fileInput.value = '';
            setStatus(successMessage);
        };
        image.onerror = () => {
            setStatus('Не удалось открыть изображение.', true);
        };
        image.src = loadEvent.target?.result;
    };
    reader.onerror = () => {
        setStatus('Не удалось прочитать файл.', true);
    };
    reader.readAsDataURL(file);
}

function initializeCanvasFromImage(image) {
    const width = image.width;
    const height = image.height;

    elements.canvas.width = width;
    elements.canvas.height = height;
    baseCanvas.width = width;
    baseCanvas.height = height;

    baseCtx.clearRect(0, 0, width, height);
    baseCtx.drawImage(image, 0, 0, width, height);

    state.imageLoaded = true;
    state.isDragging = false;
    state.selectionRects = [];
    state.history = [];

    render();
}

function render() {
    redrawBaseImageToCanvas();

    for (const rect of state.selectionRects) {
        drawSelectionRect(rect);
    }

    if (state.imageLoaded && state.isDragging) {
        drawSelectionRect(
            getNormalizedRect(
                state.dragStartX,
                state.dragStartY,
                state.dragCurrentX,
                state.dragCurrentY
            )
        );
    }

    updateControls();
}

function redrawBaseImageToCanvas() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

    if (state.imageLoaded) {
        ctx.drawImage(baseCanvas, 0, 0);
    }
}

function updateControls() {
    const hasImage = state.imageLoaded;
    const hasSelection = state.selectionRects.length > 0;
    const hasHistory = state.history.length > 0;

    elements.applyBtn.disabled = !hasImage || !hasSelection;
    elements.undoBtn.disabled = !hasImage || !hasHistory;
    elements.clearBtn.disabled = !hasImage || !hasSelection;
    elements.copyBtn.disabled = !hasImage;
    elements.downloadBtn.disabled = !hasImage;
}

function drawSelectionRect(rect) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 120, 215, 0.2)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0, 120, 215, 0.9)';
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
}

function getCanvasPoint(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : elements.canvas.width / rect.width;
    const scaleY = rect.height === 0 ? 1 : elements.canvas.height / rect.height;

    return {
        x: clamp((event.clientX - rect.left) * scaleX, 0, elements.canvas.width),
        y: clamp((event.clientY - rect.top) * scaleY, 0, elements.canvas.height)
    };
}

function getNormalizedRect(x1, y1, x2, y2) {
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1)
    };
}

function saveHistorySnapshot() {
    const snapshot = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
    state.history.push(snapshot);

    if (state.history.length > MAX_HISTORY_STEPS) {
        state.history.shift();
    }
}

function commitCanvasToBase() {
    baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(elements.canvas, 0, 0);
}

function applyEffect(rect, mode, intensity) {
    if (mode === 'blur') {
        applyBlur(rect, intensity);
        return;
    }

    applyPixelate(rect, intensity);
}

function applyBlur(rect, intensity) {
    ctx.save();

    const inflate = intensity * 1.5;
    const x = Math.max(0, rect.x - inflate);
    const y = Math.max(0, rect.y - inflate);
    const w = Math.min(elements.canvas.width - x, rect.w + inflate * 2);
    const h = Math.min(elements.canvas.height - y, rect.h + inflate * 2);

    ctx.filter = `blur(${intensity}px)`;
    ctx.drawImage(elements.canvas, x, y, w, h, x, y, w, h);
    ctx.restore();
    ctx.filter = 'none';
}

function applyPixelate(rect, intensity) {
    const pixelSize = Math.max(2, intensity);
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    const smallWidth = Math.max(1, Math.floor(rect.w / pixelSize));
    const smallHeight = Math.max(1, Math.floor(rect.h / pixelSize));

    tempCanvas.width = smallWidth;
    tempCanvas.height = smallHeight;

    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(
        elements.canvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        smallWidth,
        smallHeight
    );

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        tempCanvas,
        0,
        0,
        smallWidth,
        smallHeight,
        rect.x,
        rect.y,
        rect.w,
        rect.h
    );
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
}

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', isError);
}

function canvasToBlob(canvas) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

async function writeImageToClipboard(blob) {
    if (canUseAsyncClipboardForImages()) {
        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob
            })
        ]);
        return;
    }

    const dataUrl = await blobToDataUrl(blob);
    const copied = copyImageWithExecCommand(dataUrl);

    if (!copied) {
        throw new Error('Clipboard image write is not supported.');
    }
}

function canUseAsyncClipboardForImages() {
    return Boolean(
        window.isSecureContext
        && navigator.clipboard
        && typeof navigator.clipboard.write === 'function'
        && typeof window.ClipboardItem !== 'undefined'
    );
}

function copyImageWithExecCommand(dataUrl) {
    const selection = window.getSelection();
    if (!selection || typeof document.execCommand !== 'function') {
        return false;
    }

    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '-9999px';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.overflow = 'hidden';

    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    container.appendChild(image);
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNode(container);
    selection.removeAllRanges();
    selection.addRange(range);

    let copied = false;

    try {
        copied = document.execCommand('copy');
    } finally {
        selection.removeAllRanges();
        document.body.removeChild(container);
    }

    return copied;
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to convert blob to data URL.'));
        reader.readAsDataURL(blob);
    });
}

function getClipboardErrorMessage() {
    if (isFirefox()) {
        return 'Firefox ограничивает запись изображений в буфер обмена для веб-страниц. Если копирование не сработало, используйте скачивание.';
    }

    if (!window.isSecureContext) {
        return 'Буфер обмена для изображений работает только в secure context: HTTPS или localhost.';
    }

    return 'Не удалось записать изображение в буфер обмена.';
}

function isFirefox() {
    return navigator.userAgent.includes('Firefox');
}
