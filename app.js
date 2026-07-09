/**
 * Blur & Pixelate Utility App
 * Refactored modular JavaScript for canvas-based image masking.
 */

class DrawerApp {
    constructor() {
        this.elements = {
            fileInput: document.getElementById('fileInput'),
            dropZone: document.getElementById('dropZone'),
            canvas: document.getElementById('canvas'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            canvasPlaceholder: document.getElementById('canvasPlaceholder'),
            applyBtn: document.getElementById('applyBtn'),
            undoBtn: document.getElementById('undoBtn'),
            clearBtn: document.getElementById('clearBtn'),
            copyBtn: document.getElementById('copyBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            intensity: document.getElementById('intensity'),
            intensityVal: document.getElementById('intensityVal'),
            status: document.getElementById('status')
        };

        this.ctx = this.elements.canvas.getContext('2d');
        this.baseCanvas = document.createElement('canvas');
        this.baseCtx = this.baseCanvas.getContext('2d');

        this.MIN_SELECTION_SIZE = 5;
        this.MAX_HISTORY_STEPS = 20;

        this.state = {
            imageLoaded: false,
            isDragging: false,
            dragStartX: 0,
            dragStartY: 0,
            dragCurrentX: 0,
            dragCurrentY: 0,
            selectionRects: [],
            history: []
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.render();
    }

    bindEvents() {
        // File selection & drop events
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileChange(e));
        this.elements.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.elements.dropZone.addEventListener('drop', (e) => this.handleDrop(e));

        // Canvas mouse events
        this.elements.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.elements.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.elements.canvas.addEventListener('mouseup', () => this.finalizeSelection());
        this.elements.canvas.addEventListener('mouseleave', () => this.finalizeSelection());

        // Control action buttons
        this.elements.applyBtn.addEventListener('click', () => this.handleApplyClick());
        this.elements.undoBtn.addEventListener('click', () => this.handleUndoClick());
        this.elements.clearBtn.addEventListener('click', () => this.handleClearClick());
        this.elements.copyBtn.addEventListener('click', () => this.handleCopyClick());
        this.elements.downloadBtn.addEventListener('click', () => this.handleDownloadClick());

        // Slider intensity change
        this.elements.intensity.addEventListener('input', (e) => {
            this.elements.intensityVal.textContent = e.target.value;
        });

        // Global keys and paste handlers
        document.addEventListener('paste', (e) => this.handlePaste(e));
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    // --- Image Loading Handlers ---

    handleFileChange(event) {
        const file = event.target.files?.[0];
        if (file) {
            this.loadImageFromFile(file);
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        this.elements.dropZone.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        this.elements.dropZone.classList.remove('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        this.elements.dropZone.classList.remove('drag-over');
        
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            this.loadImageFromFile(file);
        } else {
            this.setStatus('Пожалуйста, перетащите файл изображения.', true);
        }
    }

    handlePaste(event) {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));

        if (!imageItem) {
            return;
        }

        const file = imageItem.getAsFile();
        if (!file) {
            this.setStatus('Не удалось прочитать изображение из буфера обмена.', true);
            return;
        }

        event.preventDefault();
        this.loadImageFromFile(file, 'Изображение вставлено из буфера обмена.');
    }

    loadImageFromFile(file, successMessage = 'Изображение загружено.') {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const image = new Image();
            image.onload = () => {
                this.initializeCanvasFromImage(image);
                this.elements.fileInput.value = '';
                this.setStatus(successMessage);
            };
            image.onerror = () => {
                this.setStatus('Не удалось открыть изображение.', true);
            };
            image.src = loadEvent.target?.result;
        };
        reader.onerror = () => {
            this.setStatus('Не удалось прочитать файл.', true);
        };
        reader.readAsDataURL(file);
    }

    initializeCanvasFromImage(image) {
        const width = image.width;
        const height = image.height;

        this.elements.canvas.width = width;
        this.elements.canvas.height = height;
        this.baseCanvas.width = width;
        this.baseCanvas.height = height;

        this.baseCtx.clearRect(0, 0, width, height);
        this.baseCtx.drawImage(image, 0, 0, width, height);

        this.state.imageLoaded = true;
        this.state.isDragging = false;
        this.state.selectionRects = [];
        this.state.history = [];

        // Toggle UI visibility
        this.elements.canvas.style.display = 'block';
        this.elements.canvasPlaceholder.style.display = 'none';

        this.render();
    }

    // --- Key Actions ---

    handleKeyDown(event) {
        const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';
        const isCopyShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c';
        const target = event.target;
        const isEditableTarget = target instanceof HTMLElement
            && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

        if (isEditableTarget) {
            return;
        }

        if (isUndoShortcut && this.state.history.length > 0) {
            event.preventDefault();
            this.handleUndoClick();
            return;
        }

        if (isCopyShortcut && this.state.imageLoaded) {
            event.preventDefault();
            this.handleCopyClick();
        }
    }

    // --- Selection Mouse Handlers ---

    handleMouseDown(event) {
        if (!this.state.imageLoaded) {
            return;
        }

        const point = this.getCanvasPoint(event);
        this.state.isDragging = true;
        this.state.dragStartX = point.x;
        this.state.dragStartY = point.y;
        this.state.dragCurrentX = point.x;
        this.state.dragCurrentY = point.y;
    }

    handleMouseMove(event) {
        if (!this.state.imageLoaded || !this.state.isDragging) {
            return;
        }

        const point = this.getCanvasPoint(event);
        this.state.dragCurrentX = point.x;
        this.state.dragCurrentY = point.y;

        this.render();
    }

    finalizeSelection() {
        if (!this.state.imageLoaded || !this.state.isDragging) {
            return;
        }

        this.state.isDragging = false;

        const rect = this.getNormalizedRect(
            this.state.dragStartX,
            this.state.dragStartY,
            this.state.dragCurrentX,
            this.state.dragCurrentY
        );

        if (rect.w >= this.MIN_SELECTION_SIZE && rect.h >= this.MIN_SELECTION_SIZE) {
            this.state.selectionRects.push(rect);
        }

        this.render();
    }

    // --- Action Implementations ---

    handleApplyClick() {
        if (!this.state.imageLoaded || this.state.selectionRects.length === 0) {
            return;
        }

        this.saveHistorySnapshot();
        this.redrawBaseImageToCanvas();

        const mode = document.querySelector('input[name="mode"]:checked').value;
        const intensity = Number.parseInt(this.elements.intensity.value, 10) || 8;

        for (const rect of this.state.selectionRects) {
            this.applyEffect(rect, mode, intensity);
        }

        this.commitCanvasToBase();
        this.state.selectionRects = [];
        this.render();
        this.setStatus('Эффекты применены к выделенным областям.');
    }

    handleUndoClick() {
        if (this.state.history.length === 0) {
            return;
        }

        const previousImage = this.state.history.pop();
        this.baseCanvas.width = previousImage.width;
        this.baseCanvas.height = previousImage.height;
        this.elements.canvas.width = previousImage.width;
        this.elements.canvas.height = previousImage.height;

        this.baseCtx.putImageData(previousImage, 0, 0);
        this.state.selectionRects = [];
        this.state.isDragging = false;
        this.render();
        this.setStatus('Последнее действие отменено.');
    }

    handleClearClick() {
        if (!this.state.imageLoaded) {
            return;
        }

        this.state.selectionRects = [];
        this.state.isDragging = false;
        this.render();
        this.setStatus('Выделения сброшены.');
    }

    async handleCopyClick() {
        if (!this.state.imageLoaded) {
            return;
        }

        this.redrawBaseImageToCanvas();

        const blob = await this.canvasToBlob(this.elements.canvas);
        if (!blob) {
            this.render();
            this.setStatus('Не удалось подготовить изображение для буфера обмена.', true);
            return;
        }

        try {
            await this.writeImageToClipboard(blob);
            this.setStatus('Изображение успешно скопировано в буфер обмена.');
        } catch (error) {
            this.setStatus(this.getClipboardErrorMessage(), true);
        } finally {
            this.render();
        }
    }

    async handleDownloadClick() {
        if (!this.state.imageLoaded) {
            return;
        }

        this.redrawBaseImageToCanvas();

        const blob = await this.canvasToBlob(this.elements.canvas);
        if (!blob) {
            this.render();
            this.setStatus('Не удалось подготовить изображение к скачиванию.', true);
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

        this.render();
        this.setStatus('Файл успешно сохранен.');
    }

    // --- Effect Calculations ---

    applyEffect(rect, mode, intensity) {
        if (mode === 'blur') {
            this.applyBlur(rect, intensity);
        } else {
            this.applyPixelate(rect, intensity);
        }
    }

    applyBlur(rect, intensity) {
        const inflate = intensity * 1.5;
        const x = Math.max(0, rect.x - inflate);
        const y = Math.max(0, rect.y - inflate);
        const w = Math.min(this.elements.canvas.width - x, rect.w + inflate * 2);
        const h = Math.min(this.elements.canvas.height - y, rect.h + inflate * 2);

        // Copy region to an offscreen canvas to avoid read-write feedback loop on GPU
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.elements.canvas, x, y, w, h, 0, 0, w, h);

        this.ctx.save();
        this.ctx.filter = `blur(${intensity}px)`;
        this.ctx.drawImage(tempCanvas, x, y);
        this.ctx.restore();
        this.ctx.filter = 'none';
    }

    applyPixelate(rect, intensity) {
        const pixelSize = Math.max(2, intensity);
        
        const smallWidth = Math.max(1, Math.floor(rect.w / pixelSize));
        const smallHeight = Math.max(1, Math.floor(rect.h / pixelSize));

        // Copy region to small offscreen canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = smallWidth;
        tempCanvas.height = smallHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(
            this.elements.canvas,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            0,
            0,
            smallWidth,
            smallHeight
        );

        // Blow it back up to the main canvas
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(
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
        this.ctx.restore();
    }

    // --- Rendering Helpers ---

    render() {
        this.redrawBaseImageToCanvas();

        for (const rect of this.state.selectionRects) {
            this.drawSelectionRect(rect);
        }

        if (this.state.imageLoaded && this.state.isDragging) {
            this.drawSelectionRect(
                this.getNormalizedRect(
                    this.state.dragStartX,
                    this.state.dragStartY,
                    this.state.dragCurrentX,
                    this.state.dragCurrentY
                )
            );
        }

        this.updateControls();
    }

    redrawBaseImageToCanvas() {
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);

        if (this.state.imageLoaded) {
            this.ctx.drawImage(this.baseCanvas, 0, 0);
        }
    }

    updateControls() {
        const hasImage = this.state.imageLoaded;
        const hasSelection = this.state.selectionRects.length > 0;
        const hasHistory = this.state.history.length > 0;

        this.elements.applyBtn.disabled = !hasImage || !hasSelection;
        this.elements.undoBtn.disabled = !hasImage || !hasHistory;
        this.elements.clearBtn.disabled = !hasImage || !hasSelection;
        this.elements.copyBtn.disabled = !hasImage;
        this.elements.downloadBtn.disabled = !hasImage;
    }

    drawSelectionRect(rect) {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        this.ctx.restore();
    }

    getCanvasPoint(event) {
        const rect = this.elements.canvas.getBoundingClientRect();
        const scaleX = rect.width === 0 ? 1 : this.elements.canvas.width / rect.width;
        const scaleY = rect.height === 0 ? 1 : this.elements.canvas.height / rect.height;

        return {
            x: this.clamp((event.clientX - rect.left) * scaleX, 0, this.elements.canvas.width),
            y: this.clamp((event.clientY - rect.top) * scaleY, 0, this.elements.canvas.height)
        };
    }

    getNormalizedRect(x1, y1, x2, y2) {
        return {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1)
        };
    }

    saveHistorySnapshot() {
        const snapshot = this.baseCtx.getImageData(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        this.state.history.push(snapshot);

        if (this.state.history.length > this.MAX_HISTORY_STEPS) {
            this.state.history.shift();
        }
    }

    commitCanvasToBase() {
        this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        this.baseCtx.drawImage(this.elements.canvas, 0, 0);
    }

    setStatus(message, isError = false) {
        this.elements.status.textContent = message;
        this.elements.status.classList.toggle('is-error', isError);
    }

    canvasToBlob(canvas) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    }

    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // --- Clipboard Access Helpers ---

    async writeImageToClipboard(blob) {
        if (this.canUseAsyncClipboardForImages()) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
            return;
        }

        const dataUrl = await this.blobToDataUrl(blob);
        const copied = this.copyImageWithExecCommand(dataUrl);

        if (!copied) {
            throw new Error('Clipboard image write is not supported.');
        }
    }

    canUseAsyncClipboardForImages() {
        return Boolean(
            window.isSecureContext
            && navigator.clipboard
            && typeof navigator.clipboard.write === 'function'
            && typeof window.ClipboardItem !== 'undefined'
        );
    }

    copyImageWithExecCommand(dataUrl) {
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

    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to convert blob to data URL.'));
            reader.readAsDataURL(blob);
        });
    }

    getClipboardErrorMessage() {
        if (navigator.userAgent.includes('Firefox')) {
            return 'Firefox ограничивает запись изображений в буфер обмена для веб-страниц. Если копирование не сработало, используйте скачивание.';
        }

        if (!window.isSecureContext) {
            return 'Буфер обмена для изображений работает только в secure context: HTTPS или localhost.';
        }

        return 'Не удалось записать изображение в буфер обмена.';
    }
}

// Instantiate App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DrawerApp();
});
