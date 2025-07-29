"use strict";

// Canvas setup
const bgCanvas = document.getElementById("bgCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const spriteCanvas = document.getElementById("spriteCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d");
const spriteCtx = spriteCanvas.getContext("2d");

function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    [bgCanvas, drawCanvas, spriteCanvas].forEach(c => {
        c.width = w;
        c.height = h;
    });
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// Selected character from query
const urlParams = new URLSearchParams(window.location.search);
const selectedChar = urlParams.get("char") || "tortoise";
window.selectedChar = selectedChar.toLowerCase();

// Sprite caching
const spriteImage = new Image();
spriteImage.src = `images/${window.selectedChar}.png`;
const spriteCache = document.createElement("canvas");
const spriteCacheCtx = spriteCache.getContext("2d");

let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

function cacheAndDrawSprite(img, box) {
    spriteCache.width = box.width;
    spriteCache.height = box.height;
    spriteCacheCtx.clearRect(0, 0, box.width, box.height);
    spriteCacheCtx.drawImage(img, 0, 0, box.width, box.height);
    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    spriteCtx.drawImage(spriteCache, box.x, box.y);
}

spriteImage.onload = () => {
    const box = {
        width: 600,
        height: 600,
        x: (bgCanvas.width - 600) / 2,
        y: (bgCanvas.height - 600) / 2
    };
    allowedArea = { ...box };
    bgCtx.fillStyle = "white";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    cacheAndDrawSprite(spriteImage, box);
};

// Drawing state
let drawing = false;
let currentTool = "draw";
let brushSize = 10;
let brushColor = "#000000";
let opacity = 1.0;
let prevX = null, prevY = null;
let zoomLevel = 1;

// Tool references
const brushSlider = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput = document.querySelector(".pick-color");
const brushTypeSelect = document.querySelector(".brush-type-select");

// Tool controls
function setTool(tool) {
    currentTool = tool;
}
colorInput.addEventListener("change", () => {
    brushColor = colorInput.value;
});
brushSlider.addEventListener("input", () => {
    brushSize = parseInt(brushSlider.value);
});
opacitySlider.addEventListener("input", () => {
    opacity = parseFloat(opacitySlider.value);
});
brushTypeSelect.addEventListener("change", () => {
    // Optional: Set specific settings for brush type later
});

// Drawing
function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    return [x / zoomLevel, y / zoomLevel];
}
function isInBounds(x, y) {
    return (
        x >= allowedArea.x &&
        x <= allowedArea.x + allowedArea.width &&
        y >= allowedArea.y &&
        y <= allowedArea.y + allowedArea.height
    );
}

ctx.lineJoin = "round";
ctx.lineCap = "round";

// History stack for undo/redo
let history = [];
let redoStack = [];

function saveHistory() {
    history.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    if (history.length > 50) history.shift(); // Prevent memory overload
    redoStack = []; // Clear redo stack
}
function undo() {
    if (history.length === 0) return;
    redoStack.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    const last = history.pop();
    ctx.putImageData(last, 0, 0);
}
function redo() {
    if (redoStack.length === 0) return;
    saveHistory();
    const next = redoStack.pop();
    ctx.putImageData(next, 0, 0);
}

function draw(e) {
    if (!drawing) return;
    const [x, y] = getPos(e);
    if (!isInBounds(x, y)) return;

    ctx.lineWidth = brushSize;
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = brushColor;
    ctx.globalCompositeOperation = currentTool === "erase" ? "destination-out" : "source-over";

    ctx.beginPath();
    ctx.moveTo(prevX ?? x, prevY ?? y);
    ctx.lineTo(x, y);
    ctx.stroke();

    prevX = x;
    prevY = y;
}

// Draw listeners
drawCanvas.addEventListener("mousedown", (e) => {
    const [x, y] = getPos(e);
    if (isInBounds(x, y)) {
        saveHistory();
        drawing = true;
        [prevX, prevY] = [x, y];
    }
});
drawCanvas.addEventListener("mousemove", draw);
drawCanvas.addEventListener("mouseup", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("mouseout", () => {
    drawing = false;
});

drawCanvas.addEventListener("touchstart", (e) => {
    const [x, y] = getPos(e);
    if (isInBounds(x, y)) {
        saveHistory();
        drawing = true;
        [prevX, prevY] = [x, y];
    }
});
drawCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    draw(e.touches[0]);
}, { passive: false });
drawCanvas.addEventListener("touchend", () => {
    drawing = false;
    prevX = prevY = null;
});

// Clear + Save
function clearCanvas() {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    cacheAndDrawSprite(spriteImage, allowedArea);
}
function saveImage() {
    const merged = document.createElement("canvas");
    merged.width = drawCanvas.width;
    merged.height = drawCanvas.height;
    const mCtx = merged.getContext("2d");

    mCtx.fillStyle = "white";
    mCtx.fillRect(0, 0, merged.width, merged.height);
    mCtx.drawImage(drawCanvas, 0, 0);
    mCtx.drawImage(spriteCanvas, 0, 0);

    const link = document.createElement("a");
    link.download = "my_drawing.png";
    link.href = merged.toDataURL();
    link.click();
}

// Zoom
function zoomIn() {
    zoomLevel *= 1.1;
    applyZoom();
}
function zoomOut() {
    zoomLevel /= 1.1;
    applyZoom();
}
function applyZoom() {
    drawCanvas.style.transform = `scale(${zoomLevel})`;
    spriteCanvas.style.transform = `scale(${zoomLevel})`;
    bgCanvas.style.transform = `scale(${zoomLevel})`;
}

// Left Sidebar Toggle
const toggleLeft = document.querySelector(".toggleNavLeft");
const navLeft = document.querySelector("#navLeft");
let toggleStatus = 1;
function toggleMenu() {
    if (toggleStatus === 1) {
        navLeft.style.left = "-251px";
        toggleLeft.style.backgroundImage = "url('images/navigateRight.png')";
        toggleStatus = 0;
    } else {
        navLeft.style.left = "0";
        toggleLeft.style.backgroundImage = "url('images/navigateLeft.png')";
        toggleStatus = 1;
    }
}
toggleLeft.addEventListener("click", toggleMenu);



/*"use strict";

// Navigation toggle
const toggleLeft = document.querySelector(".toggleNavLeft");
const navLeft = document.querySelector("#navLeft");
let toggleStatus = 1;
function toggleMenu() {
    if (toggleStatus === 1) {
        navLeft.style.left = "-251px";
        toggleLeft.style.backgroundImage = "url('images/navigateRight.png')";
        toggleStatus = 0;
    } else {
        navLeft.style.left = "0px";
        toggleLeft.style.backgroundImage = "url('images/navigateLeft.png')";
        toggleStatus = 1;
    }
}
toggleLeft.addEventListener("click", toggleMenu);

// Canvas setup
const bgCanvas = document.getElementById("bgCanvas");       // white background
const drawCanvas = document.getElementById("drawCanvas");   // drawing
const spriteCanvas = document.getElementById("spriteCanvas"); // sprite outline (top)
const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d");
const spriteCtx = spriteCanvas.getContext("2d");

bgCanvas.width = drawCanvas.width = spriteCanvas.width = window.innerWidth;
bgCanvas.height = drawCanvas.height = spriteCanvas.height = window.innerHeight;

// Get selected character
const urlParams = new URLSearchParams(window.location.search);
const selectedChar = urlParams.get("char") || "tortoise";
window.selectedChar = selectedChar.toLowerCase();
console.log("Selected character:", window.selectedChar);

// Bounding box
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

// Sprite caching
const spriteImage = new Image();
spriteImage.src = `images/${window.selectedChar}.png`;
const spriteCache = document.createElement("canvas");
const spriteCacheCtx = spriteCache.getContext("2d");

function cacheAndDrawSprite(img, box) {
    spriteCache.width = box.width;
    spriteCache.height = box.height;
    spriteCacheCtx.clearRect(0, 0, box.width, box.height);
    spriteCacheCtx.drawImage(img, 0, 0, box.width, box.height);

    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    spriteCtx.drawImage(spriteCache, box.x, box.y);
}

spriteImage.onload = () => {
    const box = {
        width: 600,
        height: 600,
        x: (bgCanvas.width - 600) / 2,
        y: (bgCanvas.height - 600) / 2
    };
    allowedArea = { ...box };

    // Draw solid white bg
    bgCtx.fillStyle = "white";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    // Cache and draw the sprite outline on top
    cacheAndDrawSprite(spriteImage, box);
};

// Tool UI
const colorInput = document.querySelector(".pick-color");
const lineWidthInput = document.querySelector(".line-width-input");
const colorBtn = document.querySelector(".color-btn");
const lineWidthBtn = document.querySelector(".line-width-btn");
const lineJoinBtn = document.querySelector(".line-join-btn");

let drawing = false;
let currentTool = "draw";
let brushSize = parseInt(lineWidthInput.value);
let brushColor = colorInput.value;
let prevX = null;
let prevY = null;

ctx.lineJoin = document.querySelector(".line-join-select").value;
ctx.lineCap = "round";
ctx.lineWidth = brushSize;
ctx.strokeStyle = brushColor;

function setTool(tool) {
    currentTool = tool;
}

function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    return [x, y];
}

function isInBounds(x, y) {
    return (
        x >= allowedArea.x &&
        x <= allowedArea.x + allowedArea.width &&
        y >= allowedArea.y &&
        y <= allowedArea.y + allowedArea.height
    );
}

function draw(e) {
    if (!drawing) return;
    const [x, y] = getPos(e);
    if (!isInBounds(x, y)) return;

    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = currentTool === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = brushColor;

    ctx.beginPath();
    ctx.moveTo(prevX ?? x, prevY ?? y);
    ctx.lineTo(x, y);
    ctx.stroke();

    prevX = x;
    prevY = y;
}

// Draggable tools panel
const toolsPanel = document.querySelector(".tools");
let isDragging = false;
let offsetX, offsetY;

function startDrag(e) {
    isDragging = true;
    toolsPanel.style.cursor = "grabbing";
    const rect = toolsPanel.getBoundingClientRect();
    offsetX = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    offsetY = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
}
function duringDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.clientX || e.touches?.[0]?.clientX;
    const y = e.clientY || e.touches?.[0]?.clientY;
    toolsPanel.style.left = `${x - offsetX}px`;
    toolsPanel.style.top = `${y - offsetY}px`;
}
function endDrag() {
    isDragging = false;
    toolsPanel.style.cursor = "grab";
}
toolsPanel.addEventListener("mousedown", startDrag);
toolsPanel.addEventListener("touchstart", startDrag);
window.addEventListener("mousemove", duringDrag);
window.addEventListener("touchmove", duringDrag, { passive: false });
window.addEventListener("mouseup", endDrag);
window.addEventListener("touchend", endDrag);

function clearCanvas() {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    cacheAndDrawSprite(spriteImage, allowedArea); // Redraw sprite on top
}

function saveImage() {
    const merged = document.createElement("canvas");
    merged.width = drawCanvas.width;
    merged.height = drawCanvas.height;
    const mCtx = merged.getContext("2d");

    // Background
    mCtx.fillStyle = "white";
    mCtx.fillRect(0, 0, merged.width, merged.height);
    mCtx.drawImage(drawCanvas, 0, 0);
    mCtx.drawImage(spriteCanvas, 0, 0); // draw outline last

    const link = document.createElement("a");
    link.download = "my_drawing.png";
    link.href = merged.toDataURL();
    link.click();
}

// Tool button listeners
colorBtn.addEventListener("click", () => {
    brushColor = colorInput.value;
    document.querySelector(".color-info").textContent = brushColor;
});
lineWidthBtn.addEventListener("click", () => {
    brushSize = parseInt(lineWidthInput.value);
    document.querySelector(".line-width-info").textContent = brushSize;
});
lineJoinBtn.addEventListener("click", () => {
    ctx.lineJoin = document.querySelector(".line-join-select").value;
    document.querySelector(".line-join-info").textContent = ctx.lineJoin;
});

// Init UI
document.querySelector(".line-join-info").textContent = ctx.lineJoin;
document.querySelector(".line-width-info").textContent = brushSize;
document.querySelector(".color-info").textContent = brushColor;

// Mouse/touch drawing
drawCanvas.addEventListener("mousedown", (e) => {
    const [x, y] = getPos(e);
    if (isInBounds(x, y)) {
        drawing = true;
        [prevX, prevY] = [x, y];
    }
});
drawCanvas.addEventListener("mouseup", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("mouseout", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("mousemove", draw);

// Touch support
drawCanvas.addEventListener("touchstart", (e) => {
    const [x, y] = getPos(e);
    if (isInBounds(x, y)) {
        drawing = true;
        [prevX, prevY] = [x, y];
    }
});
drawCanvas.addEventListener("touchend", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("touchcancel", () => {
    drawing = false;
    prevX = prevY = null;
});
drawCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    draw(e.touches[0]);
}, { passive: false }); */
