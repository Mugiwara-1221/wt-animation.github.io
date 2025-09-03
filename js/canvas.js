
"use strict";

/* ---------- Optional Azure submit (safe if not present) ---------- */
let submitDrawing = async () => {};
try {
  const m = await import("./azure-api.js");
  submitDrawing = m.submitDrawing || submitDrawing;
} catch { /* ok if not present */ }

/* ---------- Canvas setup ---------- */
const bgCanvas     = document.getElementById("bgCanvas");
const drawCanvas   = document.getElementById("drawCanvas");
const spriteCanvas = document.getElementById("spriteCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx   = drawCanvas.getContext("2d");
const sctx  = spriteCanvas.getContext("2d");

/* Transparent-outline sprites live here (single outline per character) */
const OUTLINE_DIR = "images/outline";

/* Full-window canvases; sprite sits in a centered box */
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

/* ---------- Selected character & flow ---------- */
const urlParams     = new URLSearchParams(location.search);
const selectedChar  = (urlParams.get("char")   || "tortoise").toLowerCase();
const sessionCode   =  urlParams.get("session") || localStorage.getItem("sessionCode")   || "";
const selectedStory = (urlParams.get("story")   || localStorage.getItem("selectedStory") || "").replace(/_/g, "-"); // normalize
const selectedGrade =  urlParams.get("grade")   || localStorage.getItem("selectedGrade") || "";

localStorage.setItem("selectedCharacter", selectedChar);

/* ---------- Load outline for coloring layer ---------- */
const outlineImg = new Image();
outlineImg.src = `${OUTLINE_DIR}/${selectedChar}-transparent.png`;
let outlineLoaded = false;

function getSpriteBox() {
  const size = SPRITE_BOX_SIZE;
  return {
    width:  size,
    height: size,
    x: Math.round((bgCanvas.width  - size) / 2),
    y: Math.round((bgCanvas.height - size) / 2),
  };
}

function drawWhiteBG() {
  bgCtx.fillStyle = "white";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

function layoutAndRedraw() {
  const w = innerWidth;
  const h = innerHeight;
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.width  = w; c.height = h;
    c.style.width  = w + "px";
    c.style.height = h + "px";
  }
  drawWhiteBG();

  if (outlineLoaded) {
    const box = getSpriteBox();
    allowedArea = { ...box };
    sctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    sctx.drawImage(outlineImg, box.x, box.y, box.width, box.height);
  }
}

outlineImg.onload  = () => { outlineLoaded = true; layoutAndRedraw(); };
outlineImg.onerror = () => alert(`Could not load outline: ${outlineImg.src}`);
layoutAndRedraw();
addEventListener("resize", layoutAndRedraw);

/* ---------- Drawing (rounded stamping brush) ---------- */
let drawing = false;
let currentTool = "draw";
let brushSize   = 18;
let brushColor  = "#2ad0ff";
let opacity     = 1.0;
let prevX = null, prevY = null;
let zoomLevel = 1;

/* UI refs */
const brushSlider   = document.querySelector(".brush-size-slider");
const opacitySlider = document.querySelector(".opacity-slider");
const colorInput    = document.querySelector(".pick-color");

function setTool(tool) { currentTool = tool; }
colorInput?.addEventListener("change", () => { brushColor = colorInput.value; });
brushSlider?.addEventListener("input", () => { brushSize = parseInt(brushSlider.value, 10); });
opacitySlider?.addEventListener("input", () => { opacity = parseFloat(opacitySlider.value); });

function getPos(e) {
  const r = drawCanvas.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY;
  return [(clientX - r.left) / zoomLevel, (clientY - r.top) / zoomLevel];
}
function isInBounds(x, y) {
  return (
    x >= allowedArea.x && x <= allowedArea.x + allowedArea.width &&
    y >= allowedArea.y && y <= allowedArea.y + allowedArea.height
  );
}

ctx.lineJoin = "round";
ctx.lineCap  = "round";

let history = [], redoStack = [];
function saveHistory() {
  history.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  if (history.length > 40) history.shift();
  redoStack = [];
}
function undo() {
  if (!history.length) return;
  redoStack.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  ctx.putImageData(history.pop(), 0, 0);
}
function redo() {
  if (!redoStack.length) return;
  saveHistory();
  ctx.putImageData(redoStack.pop(), 0, 0);
}

/* stamp a round dab (used for both draw & erase) */
function stamp(x, y) {
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx.beginPath();
  ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = brushColor;
  ctx.fill();
}

/* interpolate stamps along the path to avoid “bar” artifacts */
function drawStroke(e) {
  if (!drawing) return;

  const [x, y] = getPos(e);
  if (!isInBounds(x, y)) return;

  if (prevX == null || prevY == null) {
    stamp(x, y);                 // first dab for tap or new stroke
    prevX = x; prevY = y;
    return;
  }

  const dx = x - prevX;
  const dy = y - prevY;
  const dist = Math.hypot(dx, dy);

  // spacing between stamps (smaller = smoother)
  const step = Math.max(1, brushSize * 0.4);
  const steps = Math.max(1, Math.ceil(dist / step));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    stamp(prevX + dx * t, prevY + dy * t);
  }

  prevX = x; prevY = y;
}

/* Mouse / touch */
drawCanvas.addEventListener("mousedown", (e) => {
  const [x, y] = getPos(e);
  if (isInBounds(x, y)) { saveHistory(); drawing = true; prevX = prevY = null; drawStroke(e); }
});
drawCanvas.addEventListener("mousemove", drawStroke);
drawCanvas.addEventListener("mouseup",   () => { drawing = false; prevX = prevY = null; });
drawCanvas.addEventListener("mouseout",  () => { drawing = false; prevX = prevY = null; });

drawCanvas.addEventListener("touchstart", (e) => {
  const [x, y] = getPos(e);
  if (isInBounds(x, y)) { saveHistory(); drawing = true; prevX = prevY = null; drawStroke(e.touches[0]); }
}, { passive: true });
drawCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  drawStroke(e.touches[0]);
}, { passive: false });
drawCanvas.addEventListener("touchend", () => { drawing = false; prevX = prevY = null; });

/* Clear + zoom */
function clearCanvas() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  layoutAndRedraw();
}
function zoomIn()  { zoomLevel *= 1.1; applyZoom(); }
function zoomOut() { zoomLevel /= 1.1; applyZoom(); }
function applyZoom() {
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.style.transformOrigin = "center center";
    c.style.transform = `scale(${zoomLevel})`;
  }
}

/* Save dropdown */
function toggleSaveOptions() {
  document.getElementById("saveOptions").classList.toggle("hidden");
}
function downloadImage() {
  const merged = document.createElement("canvas");
  merged.width  = drawCanvas.width;
  merged.height = drawCanvas.height;
  const m = merged.getContext("2d");
  m.fillStyle = "white";
  m.fillRect(0, 0, merged.width, merged.height);
  m.drawImage(drawCanvas, 0, 0);
  m.drawImage(spriteCanvas, 0, 0);
  const a = document.createElement("a");
  a.download = "my_drawing.png";
  a.href = merged.toDataURL();
  a.click();
  document.getElementById("saveOptions").classList.add("hidden");
}

/* ---------- CSV → alpha mask helpers ---------- */
async function loadCSVMatrix(url) {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text = await resp.text();
  const rows = text.trim().split(/\r?\n/);
  const mat  = rows.map(r => r.split(",").map(v => +v));
  const H = mat.length, W = mat[0]?.length || 0;
  if (!W || !H) throw new Error(`Empty/invalid CSV: ${url}`);
  return { mat, W, H };
}

// Build a mask at CSV native size, then scale to (targetW, targetH)
async function matrixToMaskCanvas(mat, srcW, srcH, targetW, targetH) {
  const src = document.createElement("canvas");
  src.width = srcW; src.height = srcH;
  const cSrc = src.getContext("2d");
  const imgData = cSrc.createImageData(srcW, srcH);
  let k = 0;
  for (let y = 0; y < srcH; y++) {
    const row = mat[y];
    for (let x = 0; x < srcW; x++) {
      const id = row?.[x] || 0;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = 255;
      imgData.data[k++] = id > 0 ? 255 : 0; // alpha
    }
  }
  cSrc.putImageData(imgData, 0, 0);

  const scaled = document.createElement("canvas");
  scaled.width = targetW; scaled.height = targetH;
  const cTgt = scaled.getContext("2d");
  cTgt.imageSmoothingEnabled = false;
  cTgt.drawImage(src, 0, 0, targetW, targetH);
  return scaled;
}

/* ---------- Find mask prefix from the story manifest ---------- */
async function getMaskPrefixFromManifest(storyId, charId) {
  // try both dashed and underscored story ids
  const candidates = [
    `stories/${storyId}/slides.json`,
    `stories/${storyId.replace(/-/g, "_")}/slides.json`
  ];
  let manifest = null;
  for (const u of candidates) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) { manifest = await r.json(); break; }
    } catch { /* keep trying */ }
  }
  if (!manifest?.slides) return null;

  for (const slide of manifest.slides) {
    for (const c of (slide.characters || [])) {
      if (String(c.id).toLowerCase() === charId && c.maskCsvPrefix) {
        return c.maskCsvPrefix; // exact prefix from your file
      }
    }
  }
  return null; // no mask for this character anywhere in the story
}

/* ------- Send to storyboard (use mask if present; otherwise single image) ------- */
async function sendToStoryboard() {
  try {
    const { x, y, width, height } = allowedArea;

    // 1) crop paint layer to sprite box once
    const crop = document.createElement("canvas");
    crop.width = width; crop.height = height;
    crop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

    // 2) find mask prefix directly from your story's manifest
    const maskPrefix = await getMaskPrefixFromManifest(selectedStory || "tortoise-hare", selectedChar);

    const frameDataURLs = [];

    if (maskPrefix) {
      // 3) Build 4 masked frames using the manifest prefix
      for (let i = 1; i <= 4; i++) {
        const { mat, W, H } = await loadCSVMatrix(`${maskPrefix}${i}.csv`);
        const maskCanvas = await matrixToMaskCanvas(mat, W, H, width, height);

        const masked = document.createElement("canvas");
        masked.width = width; masked.height = height;
        const mctx   = masked.getContext("2d");
        mctx.drawImage(crop, 0, 0);
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(maskCanvas, 0, 0);
        mctx.globalCompositeOperation = "source-over";

        frameDataURLs.push(masked.toDataURL("image/png"));
      }
      localStorage.setItem("coloredCharacterFrames", JSON.stringify(frameDataURLs));
      localStorage.setItem("coloredCharacter", frameDataURLs[0]);
    } else {
      // 4) No masks found anywhere for this character → just send single colored image
      const single = crop.toDataURL("image/png");
      localStorage.setItem("coloredCharacterFrames", JSON.stringify([]));
      localStorage.setItem("coloredCharacter", single);
    }

    localStorage.setItem("selectedCharacter", selectedChar);

    // 5) (optional) submit first frame/single to backend
    const firstFrame = frameDataURLs[0] || localStorage.getItem("coloredCharacter");
    const uid = localStorage.getItem("deviceToken") || (crypto.randomUUID?.() || String(Date.now()));
    try { await submitDrawing(sessionCode, selectedChar, firstFrame, uid); } catch (err) {
      console.warn("[submitDrawing] non-blocking error:", err);
    }

    // 6) go to storyboard with context intact
    const q = new URLSearchParams({ char: selectedChar });
    if (sessionCode)   q.set("session", sessionCode);
    if (selectedStory) q.set("story",   selectedStory);
    if (selectedGrade) q.set("grade",   selectedGrade);
    location.href = `storyboard.html?${q.toString()}`;
  } catch (err) {
    console.error("[sendToStoryboard] failed:", err);
    alert("Send to Storyboard failed. See console for details.");
  }
}

/* ---------- Expose for buttons ---------- */
Object.assign(window, {
  setTool, undo, redo, clearCanvas, toggleSaveOptions,
  downloadImage, sendToStoryboard, zoomIn, zoomOut,
});

/* ---------- Slider fill cosmetics ---------- */
function updateSliderFill(slider) {
  if (!slider) return;
  const value = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--percent", `${value}%`);
}
[document.querySelector(".brush-size-slider"), document.querySelector(".opacity-slider")]
  .forEach(sl => {
    if (!sl) return;
    updateSliderFill(sl);
    sl.addEventListener("input", () => updateSliderFill(sl));
  });
