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

// Store the character in localStorage for use in storyboard.html 8/1 10:36
localStorage.setItem("selectedCharacter", window.selectedChar);

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

// Clear Page

function clearCanvas() {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    cacheAndDrawSprite(spriteImage, allowedArea);
}

// Save Image Options

function toggleSaveOptions() {
    const saveDropdown = document.getElementById("saveOptions");
    saveDropdown.classList.toggle("hidden");
}

function downloadImage() {
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

    // Optional: Hide dropdown after action
    document.getElementById("saveOptions").classList.add("hidden");
}

function sendToStoryboard() {
    const spriteBounds = allowedArea;  // this was set when the sprite was loaded
    const trimmedCanvas = document.createElement("canvas");
    trimmedCanvas.width = spriteBounds.width;
    trimmedCanvas.height = spriteBounds.height;
    const tCtx = trimmedCanvas.getContext("2d");

    // Draw color layer (cropped to sprite bounds)
    tCtx.drawImage(drawCanvas, spriteBounds.x, spriteBounds.y, spriteBounds.width, spriteBounds.height, 0, 0, spriteBounds.width, spriteBounds.height);

    // Draw sprite outline layer (transparent parts preserved)
    tCtx.drawImage(spriteCache, 0, 0);

    // Export to PNG
    const dataURL = trimmedCanvas.toDataURL("image/png");
    localStorage.setItem("coloredCharacter", dataURL);
    window.location.href = "storyboard.html";
}

import { submitDrawing } from "./azure-api.js";

// ... inside sendToStoryboard()
const dataURL = trimmedCanvas.toDataURL("image/png");
localStorage.setItem("coloredCharacter", dataURL);  // keep local fallback

const sessionCode = new URLSearchParams(window.location.search).get("session") 
  || localStorage.getItem("sessionCode");
const uid = localStorage.getItem("deviceToken") || crypto.randomUUID();

try {
  await submitDrawing(sessionCode, window.selectedChar, dataURL, uid);
} catch (e) {
  console.warn("Server submit failed, showing local only:", e.message);
}

window.location.href = `storyboard.html?session=${sessionCode}`;


/* function saveImage() {
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
} */

// Zoom In + Out
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



// SLIDER STYLING



//added 7/30

// Dynamically update --percent for all sliders
function updateSliderFill(slider) {
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.setProperty('--percent', `${value}%`);
}

// Attach to all sliders on input
document.querySelectorAll('input[type="range"]').forEach(slider => {
    updateSliderFill(slider);
    slider.addEventListener('input', () => updateSliderFill(slider));
});

//added 7/30 ^

// Slider fill effect dynamically
function updateSliderFill(slider) {
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.setProperty('--percent', `${value}%`);
}

// Apply on load and input for brush and opacity
[brushSlider, opacitySlider].forEach(slider => {
    updateSliderFill(slider); // Initial
    slider.addEventListener("input", () => updateSliderFill(slider));
});

// Added 7/30 10:27am

document.querySelectorAll('input[type="range"]').forEach(slider => {
    const updateBackground = () => {
        const val = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.setProperty('--percent', `${val}%`);
    };
    slider.addEventListener('input', updateBackground);
    updateBackground(); // initialize on load
});
