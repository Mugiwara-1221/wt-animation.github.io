
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

/* === Mini preview + appearances-only nav (NEW) === */
const previewCanvas = document.getElementById("previewCanvas");
const pctx          = previewCanvas ? previewCanvas.getContext("2d") : null;
const slideLabelEl  = document.getElementById("slideLabel");
const prevAppBtn    = document.getElementById("prevAppBtn");
const nextAppBtn    = document.getElementById("nextAppBtn");

/* Your repo layout uses story folders + frameN folders (for masks) */
const STORY_FOLDER_MAP = new Map([
  ["tortoise-hare", "tortoise_and_the_hare"],
  ["lion-mouse",    "lion_and_the_mouse"],
]);

/* Full-window canvases; sprite sits in a centered box */
const SPRITE_BOX_SIZE = 600;
let allowedArea = { x: 0, y: 0, width: 0, height: 0 };

/* ---------- Selected character & flow ---------- */
const urlParams     = new URLSearchParams(location.search);
const selectedChar  = (urlParams.get("char")   || "tortoise").toLowerCase();
const spriteParam   =  urlParams.get("sprite") || "";      // colored sprite (fallback)
const outlineParam  =  urlParams.get("outline") || "";     // direct outline override (optional)
const sessionCode   =  urlParams.get("session") || localStorage.getItem("sessionCode")   || "";
const selectedStory = (urlParams.get("story")   || localStorage.getItem("selectedStory") || "").replace(/_/g, "-");
const selectedGrade =  urlParams.get("grade")   || localStorage.getItem("selectedGrade") || "";

localStorage.setItem("selectedCharacter", selectedChar);

/* ---------- Helpers ---------- */
function resolveStoryFolder(storyIdDash) {
  const id = (storyIdDash || "").replace(/_/g, "-");
  return STORY_FOLDER_MAP.get(id) || id; // fallback: identical id
}
async function urlExists(url) {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok; }
  catch { return false; }
}
async function loadSlidesManifest(storyIdDash){
  const url = `stories/${storyIdDash}/slides.json`;
  try { const r = await fetch(url, { cache:"no-store" }); if (!r.ok) throw 0; return await r.json(); }
  catch { return { slides: [] }; }
}
function buildAppearances(manifest, charId){
  const out = [];
  (manifest.slides || []).forEach((sl, idx) => {
    const has = Array.isArray(sl.characters) && sl.characters.some(c => (c.id||"").toLowerCase() === charId);
    if (has) out.push(idx);
  });
  return out;
}
function perSlidePaintKey(story, charId, slide1){
  return `perSlidePaint:${story}:${charId}:${slide1}`;
}

/** Prefer ?sprite=… if we must show colored art; used as final fallback. */
async function resolveSpriteURL() {
  if (spriteParam) return spriteParam;

  // Otherwise look up from the story manifest
  const storyId = selectedStory || "tortoise-hare";
  const manifestURL = `stories/${storyId}/characters.json`;
  try {
    const r = await fetch(manifestURL, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const manifest = await r.json();
    const hit = (manifest.characters || []).find(c => (c.id || "").toLowerCase() === selectedChar);
    if (hit?.sprite) return hit.sprite;
  } catch (e) {
    console.warn("[resolveSpriteURL] manifest load failed:", e);
  }
  return `images/outline/${selectedChar}-transparent.png`;
}

/** Choose the transparent outline to paint:
 *  1) per-slide frame1 if it exists
 *  2) ?outline=<url> (explicit override)
 *  3) images/outline/<story>/<char>-transparent.png
 *  4) images/outline/<char>-transparent.png
 *  5) FALLBACK to colored sprite URL
 */
async function resolveOutlineURLForSlide(slide1) {
  const storyFolder = resolveStoryFolder(selectedStory || "tortoise-hare");
  const frame1 = `images/frames/${storyFolder}/frame${slide1}/${selectedChar}/${selectedChar}1.png`;
  if (await urlExists(frame1)) return frame1;

  if (outlineParam) return outlineParam;

  const storyScoped = `images/outline/${selectedStory || "tortoise-hare"}/${selectedChar}-transparent.png`;
  if (await urlExists(storyScoped)) return storyScoped;

  const legacy = `images/outline/${selectedChar}-transparent.png`;
  if (await urlExists(legacy)) return legacy;

  return await resolveSpriteURL();
}

/* ---------- Sprite (outline) rendering ---------- */
let outlineLoaded = false;
const outlineImg = new Image();
outlineImg.onload  = () => { outlineLoaded = true; layoutAndRedraw(); };
outlineImg.onerror = () => alert(`Could not load character image: ${outlineImg.src}`);

/* ---------- Layout ---------- */
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
  bgCtx.fillStyle = "#ffffff";
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
    sctx.imageSmoothingEnabled = true;   // nicer scaling
    sctx.drawImage(outlineImg, box.x, box.y, box.width, box.height);
  }
  schedulePreview();
}
addEventListener("resize", layoutAndRedraw);

/* ---------- Drawing (round, smooth brush) ---------- */
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
ctx.imageSmoothingEnabled = true;

/* History */
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
  persistCurrentAppearance();
  schedulePreview();
}
function redo() {
  if (!redoStack.length) return;
  saveHistory();
  ctx.putImageData(redoStack.pop(), 0, 0);
  persistCurrentAppearance();
  schedulePreview();
}

/* Stamp a perfect circle */
function dotAt(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = (currentTool === "erase") ? "#000" : brushColor;
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
  ctx.fill();
}

/* Fill gaps by stamping circles along the segment (prevents “barring”) */
function stampSegment(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) { dotAt(x0, y0); return; }
  const step = Math.max(1, (brushSize / 2) * 0.6); // tighter than radius to avoid gaps
  const count = Math.ceil(dist / step);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    dotAt(x0 + dx * t, y0 + dy * t);
  }
}

/* lightweight preview throttle */
let previewScheduled = false;
function schedulePreview(){
  if (previewScheduled) return;
  previewScheduled = true;
  requestAnimationFrame(() => { previewScheduled = false; drawPreview(); });
}

function drawStroke(e) {
  if (!drawing) return;
  const [x, y] = getPos(e);
  if (!isInBounds(x, y)) return;

  if (prevX == null || prevY == null) {
    dotAt(x, y); // first point
  } else {
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = (currentTool === "erase") ? "destination-out" : "source-over";
    ctx.strokeStyle = brushColor;
    ctx.lineWidth   = brushSize;

    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();

    stampSegment(prevX, prevY, x, y);
  }
  prevX = x; prevY = y;
  schedulePreview();
}

/* Mouse / touch */
drawCanvas.addEventListener("mousedown", (e) => {
  const [x, y] = getPos(e);
  if (isInBounds(x, y)) { saveHistory(); drawing = true; prevX = prevY = null; drawStroke(e); }
});
drawCanvas.addEventListener("mousemove", drawStroke);
addEventListener("mouseup",   () => { drawing = false; prevX = prevY = null; persistCurrentAppearance(); schedulePreview(); });
drawCanvas.addEventListener("mouseout",  () => { drawing = false; prevX = prevY = null; });

drawCanvas.addEventListener("touchstart", (e) => {
  const [x, y] = getPos(e);
  if (isInBounds(x, y)) { saveHistory(); drawing = true; prevX = prevY = null; drawStroke(e.touches[0]); }
}, { passive: true });
drawCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  drawStroke(e.touches[0]);
}, { passive: false });
drawCanvas.addEventListener("touchend", () => { drawing = false; prevX = prevY = null; persistCurrentAppearance(); schedulePreview(); });

/* Clear + zoom */
function clearCanvas() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  layoutAndRedraw();
  persistCurrentAppearance();
}
function zoomIn()  { zoomLevel *= 1.1; applyZoom(); }
function zoomOut() { zoomLevel /= 1.1; applyZoom(); }
function applyZoom() {
  for (const c of [bgCanvas, drawCanvas, spriteCanvas]) {
    c.style.transformOrigin = "center center";
    c.style.transform = `scale(${zoomLevel})`;
  }
  schedulePreview();
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

/* ---------- CSV → alpha mask helpers (unchanged) ---------- */
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

/* ---------- Frame discovery & export (unchanged) ---------- */
async function findMaskSets(storyIdDash, charId) {
  const storyFolder = resolveStoryFolder(storyIdDash);
  const base = `images/frames/${storyFolder}`;
  const out = [];

  let misses = 0;
  for (let n = 1; n <= 20; n++) {
    const prefix = `${base}/frame${n}/${charId}/${charId}_mask_`;
    if (await urlExists(`${prefix}1.csv`)) {
      out.push({ frame: n, prefix });
      misses = 0;
    } else {
      misses++;
      if (misses >= 2 && out.length) break;
    }
  }
  return out;
}

/* ------- Send to storyboard (kept as-is) ------- */
async function sendToStoryboard() {
  try {
    const { x, y, width, height } = allowedArea;

    // 1) crop paint layer to sprite box once
    const crop = document.createElement("canvas");
    crop.width = width; crop.height = height;
    crop.getContext("2d").drawImage(drawCanvas, x, y, width, height, 0, 0, width, height);

    // 2) discover all frame folders that actually have masks for this character
    const sets = await findMaskSets(selectedStory || "tortoise-hare", selectedChar);
    if (!sets.length) throw new Error(`No masks found for "${selectedChar}" in story "${selectedStory}".`);

    // 3) for each discovered frame folder, build up to 4 masked images
    const bySlide = {};
    for (const { frame, prefix } of sets) {
      const list = [];
      for (let i = 1; i <= 4; i++) {
        const csvURL = `${prefix}${i}.csv`;
        if (!(await urlExists(csvURL))) continue;
        const { mat, W, H } = await loadCSVMatrix(csvURL);
        const maskCanvas = await matrixToMaskCanvas(mat, W, H, width, height);

        const masked = document.createElement("canvas");
        masked.width = width; masked.height = height;
        const m
