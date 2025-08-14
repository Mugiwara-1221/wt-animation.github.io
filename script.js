
"use strict";

import { submitDrawing } from ".js/azure-api.js";

// ------- Canvas setup -------
const bgCanvas = document.getElementById("bgCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const spriteCanvas = document.getElementById("spriteCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = drawCanvas.getContext("2d");
const spriteCtx = spriteCanvas.getContext("2d");

// Transparent-outline sprites live here:
const OUTLINE_DIR = "images/outline";

function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  [bgCanvas, drawCanvas, spriteCanvas].forEach((c) => {
    c.width = w;
    c.height = h;
  });
  // Optional: if you want the sprite to stay centered after resize, re-draw it:
  if (spriteImage.complete && allowedArea.width) {
    const box = getSpriteBox();
    allowedArea = { ...box };
    drawWhiteBG();
    cacheAndDrawSprite(spriteImage, box);
  }
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ------- Selected character -------
const urlParams = new URLSearchParams(window.location.search);
const selectedChar = (urlParams.get("char") || "tortoise").toLowerCase();
window.selectedChar = selectedChar; // used elsewhere
localStorage.setItem("selectedCharacter", window.selectedChar);

// ------- Sprite (outline) caching -------
const spriteImage = new Image();
// IMPORTANT: load the transparent outline, not the white-filled artwork
spriteImage.src = `${OUTLINE_DIR}/${window.selectedChar}-transparent.png`;

const spriteCache = document.createElement("canvas");
const spriteCacheCtx = spriteCache.getContext("2d");

// Area you can draw in (square bounding box)
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

// Where the sprite sits (centered 600x600 box)
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

spriteImage.onload = () => {
  const box = getSpriteBox();
  allowedArea = { ...box };
  drawWhiteBG();
  cacheAndDrawSprite(spriteImage, box);
};

// ------- Drawing state & tools -------
let drawing = false;
let currentTool = "draw";
let brushSize = 10;
let brushColor = "#000000";
let opacity = 1.0;
let prevX = null,
  prevY = null;
let zoomLevel = 1;

// UI refs
const brushSlider = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput = document.querySelector(".pick-color");
const brushTypeSelect = document.querySelector(".brush-type-select");

// Set tool handlers
function setTool(tool) {
  currentTool = tool;
}
colorInput.addEventListener("change", () => {
  brushColor = colorInput.value;
});
brushSlider.addEventListener("input", () => {
  brushSize = parseInt(brushSlider.value, 10);
});
opacitySlider.addEventListener("input", () => {
  opacity = parseFloat(opacitySlider.value);
});
brushTypeSelect.addEventListener("change", () => {
  // hook for custom brush behaviors later
});

// Helpers
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

// ------- Undo / Redo -------
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

// ------- Drawing -------
function draw(e) {
  if (!drawing) return;
  const [x, y] = getPos(e);
  if (!isInBounds(x, y)) return;

  ctx.lineWidth = brushSize;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = brushColor;
  ctx.globalCompositeOperation =
    currentTool === "erase" ? "destination-out" : "source-over";

  ctx.beginPath();
  ctx.moveTo(prevX ?? x, prevY ?? y);
  ctx.lineTo(x, y);
  ctx.stroke();

  prevX = x;
  prevY = y;
}

// Listeners
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
drawCanvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    draw(e.touches[0]);
  },
  { passive: false }
);
drawCanvas.addEventListener("touchend", () => {
  drawing = false;
  prevX = prevY = null;
});

// ------- Clear -------
function clearCanvas() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  cacheAndDrawSprite(spriteImage, allowedArea);
}

// ------- Save / Send -------
function toggleSaveOptions() {
  const saveDropdown = document.getElementById("saveOptions");
  saveDropdown.classList.toggle("hidden");
}

function downloadImage() {
  const merged = document.createElement("canvas");
  merged.width = drawCanvas.width;
  merged.height = drawCanvas.height;
  const mCtx = merged.getContext("2d");

  // white background, then color layer, then outline layer
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
  // export only the sprite’s box: color layer + outline
  const spriteBounds = allowedArea;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = spriteBounds.width;
  trimmedCanvas.height = spriteBounds.height;
  const tCtx = trimmedCanvas.getContext("2d");

  // color, cropped to the box
  tCtx.drawImage(
    drawCanvas,
    spriteBounds.x,
    spriteBounds.y,
    spriteBounds.width,
    spriteBounds.height,
    0,
    0,
    spriteBounds.width,
    spriteBounds.height
  );
  // then draw the outline (from cache) on top
  tCtx.drawImage(spriteCache, 0, 0);

  const dataURL = trimmedCanvas.toDataURL("image/png");
  localStorage.setItem("coloredCharacter", dataURL);

  const sessionCode =
    new URLSearchParams(window.location.search).get("session") ||
    localStorage.getItem("sessionCode");
  const uid = localStorage.getItem("deviceToken") || crypto.randomUUID();

  try {
    await submitDrawing(sessionCode, window.selectedChar, dataURL, uid);
  } catch (e) {
    console.warn("Server submit failed, showing local only:", e.message);
  }

  window.location.href = `storyboard.html?session=${sessionCode}`;
}

// ------- Zoom -------
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

// ------- Left Sidebar Toggle -------
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

// ------- Slider fill styling -------
function updateSliderFill(slider) {
  const value =
    ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--percent", `${value}%`);
}
[brushSlider, opacitySlider].forEach((slider) => {
  updateSliderFill(slider);
  slider.addEventListener("input", () => updateSliderFill(slider));
});

// Expose handlers for inline onclicks in canvas.html (since this is a module)
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
