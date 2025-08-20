
"use strict";

// ✅ correct module imports
import { submitDrawing } from "./js/azure-api.js";
import { maskColoredBase } from "./js/color-map-advanced.js";

/* ---------------- Canvas setup ---------------- */
const bgCanvas = document.getElementById("bgCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const spriteCanvas = document.getElementById("spriteCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d");
const spriteCtx = spriteCanvas.getContext("2d");

// Transparent-outline sprites live here:
const OUTLINE_DIR = "images/outline";

// Area you can draw in (square bounding box)
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

/* ---------------- Character selection ---------------- */
const urlParams = new URLSearchParams(window.location.search);
const selectedChar = (urlParams.get("char") || "tortoise").toLowerCase();
window.selectedChar = selectedChar;
localStorage.setItem("selectedCharacter", window.selectedChar);

/* ---------------- Outline sprite ---------------- */
const spriteImage = new Image();
// same-origin assets – no crossOrigin needed unless you host elsewhere
spriteImage.src = `${OUTLINE_DIR}/${window.selectedChar}-transparent.png`;

const spriteCache = document.createElement("canvas");
const spriteCacheCtx = spriteCache.getContext("2d");
let spriteLoaded = false;

function getSpriteBox() {
  const size = 600;
  return {
    width: size,
    height: size,
    x: Math.round((bgCanvas.width - size) / 2),
    y: Math.round((bgCanvas.height - size) / 2),
  };
}

function drawWhiteBG() {
  bgCtx.fillStyle = "white";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

function cacheAndDrawSprite(img, box) {
  spriteCache.width = box.width;
  spriteCache.height = box.height;
  spriteCacheCtx.clearRect(0, 0, box.width, box.height);
  spriteCacheCtx.drawImage(img, 0, 0, box.width, box.height);

  spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
  spriteCtx.drawImage(spriteCache, box.x, box.y);
}

function layoutAndRedraw() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  [bgCanvas, drawCanvas, spriteCanvas].forEach((c) => {
    c.width = w;
    c.height = h;
  });
  drawWhiteBG();
  if (spriteLoaded) {
    const box = getSpriteBox();
    allowedArea = { ...box };
    cacheAndDrawSprite(spriteImage, box);
  }
}

spriteImage.onload = () => {
  spriteLoaded = true;
  allowedArea = { ...getSpriteBox() };
  layoutAndRedraw();
};
spriteImage.onerror = () => {
  console.error("Failed to load outline:", spriteImage.src);
  alert(`Could not load outline for "${window.selectedChar}". Check the file:\n${spriteImage.src}`);
};

layoutAndRedraw();
window.addEventListener("resize", layoutAndRedraw);

/* ---------------- Drawing tools ---------------- */
let drawing = false;
let currentTool = "draw";
let brushSize = 10;
let brushColor = "#000000";
let opacity = 1.0;
let prevX = null, prevY = null;
let zoomLevel = 1;

// UI refs
const brushSlider = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput = document.querySelector(".pick-color");
const brushTypeSelect = document.querySelector(".brush-type-select");

// Set tool handlers
function setTool(tool) { currentTool = tool; }
colorInput.addEventListener("change", () => { brushColor = colorInput.value; });
brushSlider.addEventListener("input", () => { brushSize = parseInt(brushSlider.value, 10); });
opacitySlider.addEventListener("input", () => { opacity = parseFloat(opacitySlider.value); });
brushTypeSelect.addEventListener("change", () => { /* hook for custom brushes */ });

function getPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
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

/* ---------------- Undo / Redo ---------------- */
let history = [];
let redoStack = [];

function saveHistory() {
  history.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  if (history.length > 50) history.shift();
  redoStack = [];
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

/* ---------------- Drawing ---------------- */
function draw(e) {
  if (!drawing) return;
  const [x, y] = getPos(e);
  if (!isInBounds(x, y)) return;

  ctx.lineWidth = brushSize;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = brushColor;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";

  ctx.beginPath();
  ctx.moveTo(prevX ?? x, prevY ?? y);
  ctx.lineTo(x, y);
  ctx.stroke();

  prevX = x;
  prevY = y;
}

drawCanvas.addEventListener("mousedown", (e) => {
  const [x, y] = getPos(e);
  if (isInBounds(x, y)) {
    saveHistory();
    drawing = true;
    [prevX, prevY] = [x, y];
  }
});
drawCanvas.addEventListener("mousemove", draw);
drawCanvas.addEventListener("mouseup", () => { drawing = false; prevX = prevY = null; });
drawCanvas.addEventListener("mouseout", () => { drawing = false; });

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
drawCanvas.addEventListener("touchend", () => { drawing = false; prevX = prevY = null; });

/* ---------------- Clear ---------------- */
function clearCanvas() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if (spriteLoaded) cacheAndDrawSprite(spriteImage, allowedArea);
}

/* ---------------- Save / Send ---------------- */
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

  document.getElementById("saveOptions").classList.add("hidden");
}

async function sendToStoryboard() {
  // 1) Crop to the sprite’s box (student color + outline on top for reference)
  const box = allowedArea;
  const trimmed = document.createElement("canvas");
  trimmed.width = box.width;
  trimmed.height = box.height;
  const tCtx = trimmed.getContext("2d");

  // just the student's color (cropped)
  tCtx.drawImage(
    drawCanvas,
    box.x, box.y, box.width, box.height,
    0, 0, box.width, box.height
  );
  // NOTE: do NOT draw the outline into the masked base — we only want color.
  const unmaskedPNG = trimmed.toDataURL("image/png");

  // 2) Mask with map_1.csv so only inside-the-lines color remains
  const MAP_DIR = `images/frames/${window.selectedChar}`;
  let maskedPNG;
  try {
    maskedPNG = await maskColoredBase(unmaskedPNG, `${MAP_DIR}/mask_1.csv`, {
      erode: 1, // 1px pull-back from the linework
      // keepIDs: (bid) => bid > 0, // default
    });
  } catch (err) {
    console.warn("Masking failed; falling back to unmasked:", err);
    maskedPNG = unmaskedPNG;
  }

  // 3) Persist locally and (optionally) submit to backend
  localStorage.setItem("coloredCharacter", maskedPNG);

  const sessionCode =
    new URLSearchParams(window.location.search).get("session") ||
    localStorage.getItem("sessionCode");
  const uid = localStorage.getItem("deviceToken") || crypto.randomUUID();

  try {
    await submitDrawing(sessionCode, window.selectedChar, maskedPNG, uid);
  } catch (e) {
    console.warn("Server submit failed, showing local only:", e.message);
  }

  // 4) Go to the storyboard
  window.location.href = `storyboard.html?session=${sessionCode}`;
}

/* ---------------- Zoom ---------------- */
function zoomIn() { zoomLevel *= 1.1; applyZoom(); }
function zoomOut() { zoomLevel /= 1.1; applyZoom(); }
function applyZoom() {
  drawCanvas.style.transform = `scale(${zoomLevel})`;
  spriteCanvas.style.transform = `scale(${zoomLevel})`;
  bgCanvas.style.transform = `scale(${zoomLevel})`;
}

/* ---------------- Left Sidebar Toggle ---------------- */
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

/* ---------------- Slider fill styling ---------------- */
function updateSliderFill(slider) {
  const value = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--percent", `${value}%`);
}
[brushSlider, opacitySlider].forEach((slider) => {
  updateSliderFill(slider);
  slider.addEventListener("input", () => updateSliderFill(slider));
});

/* Expose handlers for inline onclicks (module-safe) */
Object.assign(window, {
  setTool,
  undo,
  redo,
  clearCanvas,
  toggleSaveOptions,
  downloadImage,
  sendToStoryboard,
  zoomIn,
  zoomOut,
});
