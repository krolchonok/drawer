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
        this.handleModeChange();
        this.render();
    }

    bindEvents() {
        // Prevent default browser behavior for file drops globally
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('drag-over');
        });

        window.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (e.clientX === 0 && e.clientY === 0) {
                this.elements.dropZone.classList.remove('drag-over');
            }
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('drag-over');
            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith('image/')) {
                this.loadImageFromFile(file);
            } else if (file) {
                this.setStatus('Пожалуйста, перетащите файл изображения.', true);
            }
        });

        // File selection
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileChange(e));

        // Canvas mouse events
        this.elements.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.finalizeSelection());

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

        // Mode change handler
        document.querySelectorAll('input[name="mode"]').forEach((radio) => {
            radio.addEventListener('change', () => this.handleModeChange());
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
        const isUndoShortcut = (event.ctrlKey || event.metaKey) && (event.code === 'KeyZ' || event.key.toLowerCase() === 'z');
        const isCopyShortcut = (event.ctrlKey || event.metaKey) && (event.code === 'KeyC' || event.key.toLowerCase() === 'c');
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

    handleModeChange() {
        const modeEl = document.querySelector('input[name="mode"]:checked');
        const mode = modeEl ? modeEl.value : 'blur';

        // Show/hide Intensity Block
        const intensityBlock = document.getElementById('intensityBlock');
        if (intensityBlock) {
            intensityBlock.style.display = (mode === 'blur' || mode === 'pixelate') ? 'block' : 'none';
        }

        // Show/hide Glue options Block
        const glueBlock = document.getElementById('glueBlock');
        if (glueBlock) {
            glueBlock.style.display = (mode === 'glue') ? 'block' : 'none';
        }

        // Update apply button text
        if (mode === 'crop') {
            this.elements.applyBtn.textContent = 'Кадрировать';
        } else if (mode === 'glue') {
            this.elements.applyBtn.textContent = 'Склеить области';
        } else {
            this.elements.applyBtn.textContent = 'Применить эффект';
        }

        // Adjust selections based on new mode requirements
        if (mode === 'crop' && this.state.selectionRects.length > 1) {
            this.state.selectionRects = [this.state.selectionRects[this.state.selectionRects.length - 1]];
        } else if (mode === 'glue' && this.state.selectionRects.length > 2) {
            this.state.selectionRects = this.state.selectionRects.slice(-2);
        }

        this.render();
    }

    // --- Selection Mouse Handlers ---

    handleMouseDown(event) {
        if (!this.state.imageLoaded) {
            return;
        }
        
        event.preventDefault();

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
            const modeEl = document.querySelector('input[name="mode"]:checked');
            const mode = modeEl ? modeEl.value : 'blur';
            if (mode === 'crop') {
                this.state.selectionRects = [rect];
            } else if (mode === 'glue') {
                if (this.state.selectionRects.length >= 2) {
                    this.state.selectionRects.shift();
                }
                this.state.selectionRects.push(rect);
            } else {
                this.state.selectionRects.push(rect);
            }
        }

        this.render();
    }

    // --- Action Implementations ---

    handleApplyClick() {
        if (!this.state.imageLoaded) {
            return;
        }

        const modeEl = document.querySelector('input[name="mode"]:checked');
        const mode = modeEl ? modeEl.value : 'blur';

        if (mode === 'crop') {
            if (this.state.selectionRects.length === 0) {
                this.setStatus('Пожалуйста, выделите область для кадрирования.', true);
                return;
            }
            this.applyCrop(this.state.selectionRects[0]);
        } else if (mode === 'glue') {
            if (this.state.selectionRects.length !== 2) {
                this.setStatus('Для склеивания необходимо выделить ровно две области.', true);
                return;
            }
            this.applyGlue(this.state.selectionRects[0], this.state.selectionRects[1]);
        } else {
            if (this.state.selectionRects.length === 0) {
                return;
            }

            this.saveHistorySnapshot();
            this.redrawBaseImageToCanvas();

            const intensity = Number.parseInt(this.elements.intensity.value, 10) || 8;

            for (const rect of this.state.selectionRects) {
                this.applyEffect(rect, mode, intensity);
            }

            this.commitCanvasToBase();
            this.state.selectionRects = [];
            this.render();
            this.setStatus('Эффекты применены к выделенным областям.');
        }
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

    applyCrop(rect) {
        this.saveHistorySnapshot();

        // Create temporary canvas to hold the cropped image data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rect.w;
        tempCanvas.height = rect.h;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw cropped area from baseCanvas
        tempCtx.drawImage(
            this.baseCanvas,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            0,
            0,
            rect.w,
            rect.h
        );

        // Resize baseCanvas and main canvas
        this.baseCanvas.width = rect.w;
        this.baseCanvas.height = rect.h;
        this.elements.canvas.width = rect.w;
        this.elements.canvas.height = rect.h;

        // Draw cropped image back
        this.baseCtx.drawImage(tempCanvas, 0, 0);
        this.ctx.drawImage(tempCanvas, 0, 0);

        this.state.selectionRects = [];
        this.render();
        this.setStatus('Изображение успешно кадрировано.');
    }

    applyGlue(r1, r2) {
        this.saveHistorySnapshot();

        const direction = this.getGlueDirection(r1, r2);
        let newWidth, newHeight;
        let drawCoords1, drawCoords2;

        if (direction === 'vertical') {
            // Sort by Y-coordinate
            const [first, second] = r1.y <= r2.y ? [r1, r2] : [r2, r1];
            newWidth = Math.max(first.w, second.w);
            newHeight = first.h + second.h;

            drawCoords1 = { sx: first.x, sy: first.y, sw: first.w, sh: first.h, dx: 0, dy: 0, dw: first.w, dh: first.h };
            drawCoords2 = { sx: second.x, sy: second.y, sw: second.w, sh: second.h, dx: 0, dy: first.h, dw: second.w, dh: second.h };
        } else {
            // Sort by X-coordinate
            const [first, second] = r1.x <= r2.x ? [r1, r2] : [r2, r1];
            newWidth = first.w + second.w;
            newHeight = Math.max(first.h, second.h);

            drawCoords1 = { sx: first.x, sy: first.y, sw: first.w, sh: first.h, dx: 0, dy: 0, dw: first.w, dh: first.h };
            drawCoords2 = { sx: second.x, sy: second.y, sw: second.w, sh: second.h, dx: first.w, dy: 0, dw: second.w, dh: second.h };
        }

        // Create temporary canvas to hold the glued image data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw first area
        tempCtx.drawImage(
            this.baseCanvas,
            drawCoords1.sx, drawCoords1.sy, drawCoords1.sw, drawCoords1.sh,
            drawCoords1.dx, drawCoords1.dy, drawCoords1.dw, drawCoords1.dh
        );

        // Draw second area
        tempCtx.drawImage(
            this.baseCanvas,
            drawCoords2.sx, drawCoords2.sy, drawCoords2.sw, drawCoords2.sh,
            drawCoords2.dx, drawCoords2.dy, drawCoords2.dw, drawCoords2.dh
        );

        // Resize baseCanvas and main canvas
        this.baseCanvas.width = newWidth;
        this.baseCanvas.height = newHeight;
        this.elements.canvas.width = newWidth;
        this.elements.canvas.height = newHeight;

        // Draw glued image back
        this.baseCtx.drawImage(tempCanvas, 0, 0);
        this.ctx.drawImage(tempCanvas, 0, 0);

        this.state.selectionRects = [];
        this.render();
        this.setStatus(`Области успешно склеены (${direction === 'vertical' ? 'вертикально' : 'горизонтально'}).`);
    }

    getGlueDirection(r1, r2) {
        const directionMode = document.querySelector('input[name="glueDirection"]:checked')?.value || 'auto';
        if (directionMode !== 'auto') {
            return directionMode;
        }

        // Auto-detect based on overlap and center distances
        const xOverlap = Math.max(0, Math.min(r1.x + r1.w, r2.x + r2.w) - Math.max(r1.x, r2.x));
        const yOverlap = Math.max(0, Math.min(r1.y + r1.h, r2.y + r2.h) - Math.max(r1.y, r2.y));

        if (xOverlap > 0 && yOverlap === 0) {
            return 'vertical';
        }
        if (yOverlap > 0 && xOverlap === 0) {
            return 'horizontal';
        }

        // Fallback to center distances
        const cx1 = r1.x + r1.w / 2;
        const cy1 = r1.y + r1.h / 2;
        const cx2 = r2.x + r2.w / 2;
        const cy2 = r2.y + r2.h / 2;

        return Math.abs(cy1 - cy2) >= Math.abs(cx1 - cx2) ? 'vertical' : 'horizontal';
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

        const modeEl = document.querySelector('input[name="mode"]:checked');
        const mode = modeEl ? modeEl.value : 'blur';

        this.state.selectionRects.forEach((rect, index) => {
            this.drawSelectionRect(rect, mode === 'glue' ? index + 1 : null);
        });

        if (this.state.imageLoaded && this.state.isDragging) {
            const currentTempRect = this.getNormalizedRect(
                this.state.dragStartX,
                this.state.dragStartY,
                this.state.dragCurrentX,
                this.state.dragCurrentY
            );

            let tempIndex = null;
            if (mode === 'glue') {
                tempIndex = this.state.selectionRects.length < 2 ? this.state.selectionRects.length + 1 : 2;
            }
            this.drawSelectionRect(currentTempRect, tempIndex);
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

        let canApply = false;
        if (hasImage) {
            const modeEl = document.querySelector('input[name="mode"]:checked');
            const mode = modeEl ? modeEl.value : 'blur';
            if (mode === 'crop') {
                canApply = this.state.selectionRects.length === 1;
            } else if (mode === 'glue') {
                canApply = this.state.selectionRects.length === 2;
            } else {
                canApply = hasSelection;
            }
        }

        this.elements.applyBtn.disabled = !canApply;
        this.elements.undoBtn.disabled = !hasImage || !hasHistory;
        this.elements.clearBtn.disabled = !hasImage || !hasSelection;
        this.elements.copyBtn.disabled = !hasImage;
        this.elements.downloadBtn.disabled = !hasImage;
    }

    drawSelectionRect(rect, label = null) {
        this.ctx.save();

        const isGlue = label !== null;
        this.ctx.fillStyle = isGlue ? 'rgba(249, 115, 22, 0.15)' : 'rgba(59, 130, 246, 0.2)';
        this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = isGlue ? '#f97316' : '#3b82f6';
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

        if (label !== null) {
            this.ctx.fillStyle = '#f97316';
            this.ctx.fillRect(rect.x, rect.y, 16, 16);

            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px Tahoma, Arial, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label.toString(), rect.x + 8, rect.y + 8);
        }

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

        if (!this.isFirefox()) {
            // Chromium's execCommand('copy') fallback reports success without
            // actually placing image bytes on the clipboard, so don't trust it.
            throw new Error('Async Clipboard API for images is unavailable in this context.');
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
        if (this.isFirefox()) {
            return 'Firefox ограничивает запись изображений в буфер обмена для веб-страниц. Если копирование не сработало, используйте скачивание.';
        }

        if (!window.isSecureContext) {
            return 'Буфер обмена для изображений работает только в secure context: HTTPS или localhost. Откройте страницу по HTTPS (или через localhost), либо используйте «Скачать результат».';
        }

        return 'Не удалось записать изображение в буфер обмена.';
    }

    isFirefox() {
        return navigator.userAgent.includes('Firefox');
    }
}

// Instantiate App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DrawerApp();
});
